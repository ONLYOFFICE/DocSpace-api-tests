import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { AiSettings, TextToDocxBody } from "@/src/helpers/ai-settings";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import {
  filesApiTitleFor,
  listFolderFiles,
  readExportedDocxText,
  waitForExportToSettle,
  waitForExportedFile,
  waitForStableFolderFiles,
} from "@/src/helpers/text-to-docx";

// `POST /api/2.0/ai/messages/{messageId}/export` and
// `POST /api/2.0/ai/chats/{chatId}/messages/export` are both 404 — message
// export was replaced by `POST /api/2.0/ai/text-to-docx`, which takes the text
// itself instead of a message id:
//
//   { title, content, folderId } -> 202 {"success":true}
//
// Contract as verified against a live portal on 2026-07-31:
//
//   * 202 only means the job was queued. The document is built in the
//     background and appears in the target folder as `<title>.docx` a few
//     seconds later, so every claim about it has to be polled — and a claim
//     that nothing was created has to wait just as long before it counts.
//   * the export never reaches the AI gateway: it works on a portal that has
//     not paid for the AI Tools wallet service, which is why nothing here
//     provisions one. It IS gated by the portal AI switch — see
//     messages.ai-disabled.spec.ts.
//   * it is NOT Owner-only. The only thing that decides 202 vs 403 is whether
//     the caller may create files in the target folder — see
//     messages.permission.spec.ts.
//   * errors are `{"error":"..."}` — no `statusCode`, no `error.message`.

test.describe("AI Messages - text-to-docx export", () => {
  test("POST /api/2.0/ai/text-to-docx - Owner exports text into My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const before = await waitForStableFolderFiles(ownerApi, folderId);

    const title = `Exported ${apiSdk.faker.generateString(8)}`;
    const content = "The assistant said hello.";

    const { data, status } = await aiSettings.textToDocx("owner", {
      title,
      content,
      folderId,
    });
    expect(status).toBe(202);
    expect(data?.success).toBe(true);

    // The endpoint is called text-to-docx, so "a file whose name starts with
    // the title" is not enough: it has to be one new .docx, non-empty, and it
    // has to contain the text that was sent.
    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(
      exported,
      `no "${title}.docx" in My Documents after the export`,
    ).toBeDefined();
    expect(exported!.fileExst).toBe(".docx");
    expect(exported!.pureContentLength).toBeGreaterThan(0);

    const after = await listFolderFiles(ownerApi, folderId);
    expect(after.length).toBe(before.length + 1);

    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);
    expect(text).toContain(content);
  });

  test("POST /api/2.0/ai/text-to-docx - exporting the same title twice keeps both documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const before = await waitForStableFolderFiles(ownerApi, folderId);

    const title = `Exported ${apiSdk.faker.generateString(8)}`;

    const first = await aiSettings.textToDocx("owner", {
      title,
      content: "First export.",
      folderId,
    });
    expect(first.status).toBe(202);
    expect(
      await waitForExportedFile(ownerApi, folderId, `${title}.docx`),
    ).toBeDefined();

    const second = await aiSettings.textToDocx("owner", {
      title,
      content: "Second export.",
      folderId,
    });
    expect(second.status).toBe(202);

    // Nothing is overwritten: the second document is renamed the way an upload
    // of a duplicate name would be.
    const duplicate = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title} (1).docx`,
    );
    expect(
      duplicate,
      `expected "${title} (1).docx" next to "${title}.docx"`,
    ).toBeDefined();

    const after = await listFolderFiles(ownerApi, folderId);
    expect(after.length).toBe(before.length + 2);

    const text = await readExportedDocxText(apiSdk, "owner", duplicate!.id);
    expect(text).toContain("Second export.");
  });

  test("POST /api/2.0/ai/text-to-docx - a title longer than the file name limit is truncated", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const { status } = await aiSettings.textToDocx("owner", {
      title: "L".repeat(300),
      content: "hello",
      folderId,
    });
    expect(status).toBe(202);

    // 170 characters is the portal's file name limit, extension included.
    const expectedTitle = `${"L".repeat(165)}.docx`;
    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      expectedTitle,
    );
    expect(
      exported,
      "the over-long title was not truncated to 165 chars + .docx",
    ).toBeDefined();
    expect(exported!.title.length).toBe(170);
  });

  // A title becomes a file name, and the portal already has a rule for turning a
  // requested title into one: `POST /files/{folderId}/file`. The two tests below
  // use that as the oracle (`filesApiTitleFor`) rather than hard-coding whatever
  // the export currently produces — which is how the second one turned out to be
  // a bug report instead of a contract.

  test("POST /api/2.0/ai/text-to-docx - forbidden characters in a title are replaced the way the Files API replaces them", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    // The control files go into their own folder so a name that matches cannot
    // be renamed to "… (1)" by the duplicate handling.
    const { data: controlFolder } = await ownerApi.folders.createFolder({
      folderId,
      createFolder: { title: "Autotest TextToDocx Control" },
    });
    const controlFolderId = controlFolder.response!.id!;

    for (const title of ["Q1 report: draft", 'a:*?"<>|b']) {
      const expected = await filesApiTitleFor(ownerApi, controlFolderId, title);

      const { status } = await aiSettings.textToDocx("owner", {
        title,
        content: "hello",
        folderId,
      });
      expect(status, `title ${JSON.stringify(title)}`).toBe(202);

      const exported = await waitForExportedFile(ownerApi, folderId, expected);
      expect(
        exported,
        `title ${JSON.stringify(title)} should have become ${expected}, as it does through the Files API`,
      ).toBeDefined();
    }
  });

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a title containing a slash loses everything before it", async ({
    apiSdk,
  }) => {
    // The export treats "/" and "\" in the title as path separators and keeps
    // only the last segment, so `Notes 12/31` is saved as `31.docx` and the rest
    // of what the user typed is gone. The Files API, given the same title,
    // replaces the separator like any other forbidden character and keeps the
    // whole name — that is the behaviour asserted here.
    //
    // The traversal-shaped case is in the list for a second reason: dropping the
    // segments is also what makes `../../x` land in the requested folder, so
    // whatever fixes this has to keep the export inside `folderId`.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const { data: controlFolder } = await ownerApi.folders.createFolder({
      folderId,
      createFolder: { title: "Autotest TextToDocx Control" },
    });
    const controlFolderId = controlFolder.response!.id!;

    const titles = [
      "Notes 12/31",
      "../../Autotest Traversal",
      'a\\/:*?"<>|b',
      "<b>bold</b>",
    ];

    const expected: Record<string, string> = {};
    for (const title of titles) {
      expected[title] = await filesApiTitleFor(
        ownerApi,
        controlFolderId,
        title,
      );

      const { status } = await aiSettings.textToDocx("owner", {
        title,
        content: "hello",
        folderId,
      });
      expect(status, `title ${JSON.stringify(title)}`).toBe(202);
    }

    const landed = (await waitForStableFolderFiles(ownerApi, folderId)).map(
      (file) => file.title,
    );

    test.fail();
    expect(landed).toEqual(expect.arrayContaining(Object.values(expected)));
  });

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - whitespace-only content is accepted instead of rejected", async ({
    apiSdk,
  }) => {
    // A whitespace-only *title* is refused with the same 400 as an empty one, so
    // the endpoint does trim before validating — it just does not do it for the
    // content, and builds a blank document instead. Asserting the 202 would
    // freeze that as the contract, so the expectation here is the 400 the title
    // already gets, and the test is marked as failing until it arrives.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const title = `Exported ${apiSdk.faker.generateString(8)}`;

    const { status, error } = await aiSettings.textToDocx("owner", {
      title,
      content: "   ",
      folderId,
    });

    test.fail();
    // Currently a blank .docx really is produced — waited for in full and
    // asserted first, so the document, not just the status code, is what this
    // records.
    expect(
      await waitForExportedFile(ownerApi, folderId, `${title}.docx`),
    ).toBeUndefined();
    expect(error).toBe("title and content are required");
    expect(status).toBe(400);
  });

  test("POST /api/2.0/ai/text-to-docx - Owner exports into a room and into a room subfolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TextToDocx Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: subData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest TextToDocx Subfolder" },
    });
    const subFolderId = subData.response!.id!;

    for (const { label, folderId } of [
      { label: "room", folderId: roomId },
      { label: "subfolder", folderId: subFolderId },
    ]) {
      const title = `Exported ${label} ${apiSdk.faker.generateString(6)}`;

      const { status } = await aiSettings.textToDocx("owner", {
        title,
        content: `The assistant said hello in the ${label}.`,
        folderId,
      });
      expect(status, label).toBe(202);

      const exported = await waitForExportedFile(
        ownerApi,
        folderId,
        `${title}.docx`,
      );
      expect(exported, `no export landed in the ${label}`).toBeDefined();
    }
  });

  test("POST /api/2.0/ai/text-to-docx - exporting into an archived room is forbidden", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TextToDocx Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    // A control file, so that "the export created nothing" is a folder that
    // still holds exactly this one file rather than an empty list — an empty
    // list is also what a listing nobody could read would look like.
    const { data: control } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Control" },
    });
    const controlId = control.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const title = `Exported ${apiSdk.faker.generateString(8)}`;
    const { status, error } = await aiSettings.textToDocx("owner", {
      title,
      content: "hello",
      folderId: roomId,
    });

    // An archived room is read-only for everyone, its owner included.
    await waitForExportToSettle();
    expect((await listFolderFiles(ownerApi, roomId)).map((f) => f.id)).toEqual([
      controlId,
    ]);
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - exporting into Trash is forbidden", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: trash } = await ownerApi.folders.getTrashFolder({});
    const trashId = trash.response!.current!.id!;

    // Same reason as above: something has to be in Trash already, or "nothing
    // was created" cannot be told apart from "the listing came back empty".
    const { data: control } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Control" },
    });
    const controlId = control.response!.id!;
    await ownerApi.files.deleteFile({
      fileId: controlId,
      _delete: { deleteAfter: false, immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status, error } = await aiSettings.textToDocx("owner", {
      title: `Exported ${apiSdk.faker.generateString(8)}`,
      content: "hello",
      folderId: trashId,
    });

    await waitForExportToSettle();
    expect((await listFolderFiles(ownerApi, trashId)).map((f) => f.id)).toEqual(
      [controlId],
    );
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });
});

// Only `title`/`content` vary here, and a negative test has to be able to send
// a null or a missing field, so the shape is spelled out instead of being
// inferred from the case list.
type InvalidTextBody = Pick<TextToDocxBody, "title" | "content">;

const INVALID_TEXT_BODIES: Array<{ name: string; body: InvalidTextBody }> = [
  { name: "an empty title", body: { title: "", content: "hello" } },
  { name: "a whitespace-only title", body: { title: "   ", content: "hello" } },
  { name: "a null title", body: { title: null, content: "hello" } },
  { name: "a missing title", body: { content: "hello" } },
  { name: "empty content", body: { title: "T", content: "" } },
  { name: "null content", body: { title: "T", content: null } },
  { name: "missing content", body: { title: "T" } },
  { name: "an empty body", body: {} },
];

test.describe("AI Messages - text-to-docx validation", () => {
  for (const { name, body } of INVALID_TEXT_BODIES) {
    test(`POST /api/2.0/ai/text-to-docx - rejects ${name}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { data: myFolder } = await ownerApi.folders.getMyFolder({});
      const folderId = myFolder.response!.current!.id!;

      const { status, error } = await aiSettings.textToDocx("owner", {
        ...body,
        folderId,
      });

      expect(error).toBe("title and content are required");
      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/text-to-docx - a rejected body creates no document", async ({
    apiSdk,
  }) => {
    // The 400s above only prove what came back. This proves the queue was never
    // touched: a title that would have been perfectly usable, refused because
    // the content is empty, must leave the folder exactly as it was.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const before = (await waitForStableFolderFiles(ownerApi, folderId)).map(
      (f) => f.id,
    );

    const title = `Exported ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content: "",
      folderId,
    });
    expect(status).toBe(400);

    await waitForExportToSettle();
    const after = (await listFolderFiles(ownerApi, folderId)).map((f) => f.id);
    expect(after.sort()).toEqual(before.sort());
  });

  for (const { name, folderId } of [
    { name: "a missing folderId", folderId: undefined },
    { name: "a null folderId", folderId: null },
  ]) {
    test(`POST /api/2.0/ai/text-to-docx - rejects ${name}`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { status, error } = await aiSettings.textToDocx("owner", {
        title: "T",
        content: "hello",
        folderId,
      });

      expect(error).toBe("folderId is required");
      expect(status).toBe(400);
    });
  }

  // A folderId that is present but unusable is a client error in every one of
  // these shapes, and every one of them crashes the request instead. Grouped so
  // that the fix for one does not silently leave the others red.
  for (const { name, folderId } of [
    { name: "folderId 0", folderId: 0 },
    { name: "folderId -1", folderId: -1 },
  ]) {
    test(`BUG XXXXX: POST /api/2.0/ai/text-to-docx - ${name} returns 500 instead of 400`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { status } = await aiSettings.textToDocx("owner", {
        title: "T",
        content: "hello",
        folderId,
      });

      test.fail();
      expect(status).toBe(400);
    });
  }

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a folderId sent as a string returns 500 instead of 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // A perfectly valid folder, only sent as a string: the type mismatch alone
    // is what crashes the request.
    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = String(myFolder.response!.current!.id!);

    const { status } = await aiSettings.textToDocx("owner", {
      title: "T",
      content: "hello",
      folderId,
    });

    test.fail();
    expect(status).toBe(400);
  });

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a non-existent folderId returns 500 instead of 404", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status } = await aiSettings.textToDocx("owner", {
      title: "T",
      content: "hello",
      folderId: 999999999,
    });

    // An unreachable target folder is a client error, not a server crash.
    test.fail();
    expect(status).toBe(404);
  });

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a deleted folderId returns 500 instead of 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolder.response!.current!.id!;

    const { data: subData } = await ownerApi.folders.createFolder({
      folderId: myFolderId,
      createFolder: { title: "Autotest TextToDocx Deleted Folder" },
    });
    const subFolderId = subData.response!.id!;

    // The folder is reachable first, so the 500 below is about it being gone
    // rather than about it never having existed.
    const before = await aiSettings.textToDocx("owner", {
      title: `Exported ${apiSdk.faker.generateString(6)}`,
      content: "hello",
      folderId: subFolderId,
    });
    expect(before.status).toBe(202);

    await ownerApi.folders.deleteFolder({
      folderId: subFolderId,
      deleteFolder: { deleteAfter: false, immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await aiSettings.textToDocx("owner", {
      title: "T",
      content: "hello",
      folderId: subFolderId,
    });

    test.fail();
    expect(status).toBe(404);
  });

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a file id as folderId returns 500 instead of 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest TextToDocx Target.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await aiSettings.textToDocx("owner", {
      title: "T",
      content: "hello",
      folderId: fileId,
    });

    test.fail();
    expect(status).toBe(404);
  });

  test("POST /api/2.0/ai/text-to-docx - content is accepted up to ~100 KB and refused at 128 KB", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const title = `Exported ${apiSdk.faker.generateString(8)}`;

    const accepted = await aiSettings.textToDocx("owner", {
      title,
      content: "x".repeat(100000),
      folderId,
    });
    expect(accepted.status).toBe(202);
    expect(
      await waitForExportedFile(ownerApi, folderId, `${title}.docx`),
    ).toBeDefined();

    // 413 comes back without a JSON body, so there is no `error` to assert on.
    const refused = await aiSettings.textToDocx("owner", {
      title: `${title} big`,
      content: "x".repeat(131072),
      folderId,
    });

    await waitForExportToSettle();
    expect(
      await waitForExportedFile(ownerApi, folderId, `${title} big.docx`, 0),
    ).toBeUndefined();
    expect(refused.status).toBe(413);
  });
});
