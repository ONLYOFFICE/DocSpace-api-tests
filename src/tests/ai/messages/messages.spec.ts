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
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiAgentChat,
  inviteToAgent,
  expectHealthyAssistantReply,
  twoTextProfiles,
} from "@/src/helpers/ai-agent-chat";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { ApiSDK } from "@/src/services/api-sdk";

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
//     not paid for the AI Tools wallet service, which is why the export tests
//     do not provision one. (The two transcript tests do, for the conversation
//     they export — not for the export.) It IS gated by the portal AI switch —
//     see messages.ai-disabled.spec.ts.
//   * it is NOT Owner-only. The only thing that decides 202 vs 403 is whether
//     the caller may create files in the target folder — see
//     messages.permission.spec.ts.
//   * errors are `{"error":"..."}` — no `statusCode`, no `error.message`.

// The answer a user copies or saves, as markdown. Shared by the export test at
// the bottom of this block and by the copy block at the end of the file, so
// both surfaces are measured against the same payload: what lands in the
// clipboard and what lands in the document come from one and the same reply.
//
// Every construct carries a word of its own — asserting on `**BOLDWORD**` only
// works where the markdown is expected to survive verbatim, while a document
// that renders the markdown keeps the word and drops the asterisks.
const COPY_MARKER = "COPYCHECK";

const MARKDOWN_ANSWER = [
  `# ${COPY_MARKER}`,
  "",
  "**BOLDWORD** and *ITALICWORD*",
  "",
  "- LISTONE",
  "- LISTTWO",
  "",
  "```js",
  "const answer = 42;",
  "```",
  "",
  "| CELLA | CELLB |",
  "| --- | --- |",
  "| 1 | 2 |",
].join("\n");

// The same answer outside ASCII. Cyrillic and CJK for the alphabets the portal
// actually ships in, and a diacritic, an ß, an em dash and a non-BMP emoji for
// the characters an exporter working on bytes rather than code points loses.
const UNICODE_ANSWER = [
  "## Отчёт ассистента",
  "",
  "**Жирный** и *курсив* — файл сохранён.",
  "",
  "- Пункт один",
  "- 第二项",
  "",
  "café naïve, größer, 🚀",
].join("\n");

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

  test("BUG 82711: POST /api/2.0/ai/text-to-docx - a title containing a slash loses everything before it", async ({
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

  test("BUG 82712: POST /api/2.0/ai/text-to-docx - whitespace-only content is rejected", async ({
    apiSdk,
  }) => {
    // A whitespace-only *title* is refused with the same 400 as an empty one.
    // The content used not to be trimmed before validating, and a blank document
    // was built instead.
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

    // The document, not just the status code, is what this records: a blank
    // .docx used to be produced.
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

  test("POST /api/2.0/ai/text-to-docx - a markdown answer keeps all of its content in the document", async ({
    apiSdk,
  }) => {
    // "Save this answer as .docx" sends the answer exactly as the client holds
    // it — markdown — and the exporter parses it: the document carries the
    // words and not the syntax around them. Both halves of that are worth
    // pinning. A converter that swallowed the table or the fenced code would be
    // invisible otherwise — the file appears, opens, and is quietly missing
    // half the reply — and one that stopped parsing would put a wall of
    // asterisks and pipes in front of the reader.
    //
    // Deliberately no conversation and no gateway: the payload is fixed, so the
    // only variable left is the exporter.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const title = `Exported markdown ${apiSdk.faker.generateString(8)}`;
    const { data, status } = await aiSettings.textToDocx("owner", {
      title,
      content: MARKDOWN_ANSWER,
      folderId,
    });
    expect(status).toBe(202);
    expect(data?.success).toBe(true);

    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(exported, `no "${title}.docx" in My Documents`).toBeDefined();
    expect(exported!.fileExst).toBe(".docx");
    expect(exported!.pureContentLength).toBeGreaterThan(0);

    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);

    // The heading, both inline styles, both list items, the code line and both
    // table cells — every construct is represented by a word that survives
    // whichever way the exporter treats the syntax around it.
    for (const fragment of [
      COPY_MARKER,
      "BOLDWORD",
      "ITALICWORD",
      "LISTONE",
      "LISTTWO",
      "const answer = 42;",
      "CELLA",
      "CELLB",
    ]) {
      expect(text, `"${fragment}" is missing from the document`).toContain(
        fragment,
      );
    }

    // Top to bottom, the way it was written.
    expect(text.indexOf(COPY_MARKER)).toBeLessThan(text.indexOf("LISTONE"));
    expect(text.indexOf("LISTONE")).toBeLessThan(text.indexOf("LISTTWO"));
    expect(text.indexOf("LISTTWO")).toBeLessThan(text.indexOf("CELLA"));

    // The markdown was read, not transcribed: no reader should be looking at
    // the asterisks, hashes, pipes or the fence's language tag.
    for (const syntax of ["**", `# ${COPY_MARKER}`, "| ---", "```"]) {
      expect(
        text,
        `the document shows the markdown source: ${JSON.stringify(syntax)}`,
      ).not.toContain(syntax);
    }
  });

  test("POST /api/2.0/ai/text-to-docx - an answer in Cyrillic and CJK survives the export, title included", async ({
    apiSdk,
  }) => {
    // Every other export test is written in ASCII marker words, and a document
    // builder that mangled the rest of Unicode — the wrong encoding in the
    // .docx XML, a byte-wise truncation, a normalisation pass over the file
    // name — would pass all of them while the portal's own users, who do not
    // chat with the assistant in English, get an unreadable file.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    // The file name is half of this test, and it is normalised by the same rule
    // as a Files API title — so the expected name comes from that endpoint
    // instead of being spelled out here. The control file goes into a folder of
    // its own so it cannot turn the export into "… (1).docx".
    const { data: controlFolder } = await ownerApi.folders.createFolder({
      folderId,
      createFolder: { title: "Autotest TextToDocx Unicode Control" },
    });
    const title = `Отчёт ассистента ${apiSdk.faker.generateString(8)}`;
    const expectedTitle = await filesApiTitleFor(
      ownerApi,
      controlFolder.response!.id!,
      title,
    );

    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content: UNICODE_ANSWER,
      folderId,
    });
    expect(status).toBe(202);

    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      expectedTitle,
    );
    expect(
      exported,
      `no "${expectedTitle}" in My Documents — the Files API keeps that name for the same title`,
    ).toBeDefined();

    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);

    // One word per alphabet, plus the ones that only break when the exporter
    // works on bytes: a diacritic, an ß, an em dash and a non-BMP emoji.
    for (const fragment of [
      "Отчёт ассистента",
      "Жирный",
      "курсив",
      "Пункт один",
      "第二项",
      "café naïve",
      "größer",
      "—",
      "🚀",
    ]) {
      expect(text, `"${fragment}" is missing from the document`).toContain(
        fragment,
      );
    }

    expect(text.indexOf("Пункт один")).toBeLessThan(text.indexOf("第二项"));

    // Rendered, not transcribed — the same claim as the ASCII test, in case the
    // exporter falls back to a plain-text path for anything it cannot classify.
    for (const syntax of ["## ", "**", "- Пункт один"]) {
      expect(
        text,
        `the document shows the markdown source: ${JSON.stringify(syntax)}`,
      ).not.toContain(syntax);
    }
  });

  test("POST /api/2.0/ai/text-to-docx - the 202 carries no id, so the saved document can only be found by listing the folder", async ({
    apiSdk,
  }) => {
    // "The answer was saved" needs something to point at: a link to the new
    // file, or at least its id. The response has neither — it is exactly
    // `{"success":true}`, and the document does not exist yet when it arrives —
    // so every client has to poll the target folder and match on a name it
    // derived itself, which is also why every test here does.
    //
    // Pinned as the current contract, on purpose: an id appearing in this body
    // is the fix, and it should show up as a failing test rather than pass
    // unnoticed.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const title = `Exported handle ${apiSdk.faker.generateString(8)}`;
    const { data, status } = await aiSettings.textToDocx("owner", {
      title,
      content: "The assistant said hello.",
      folderId,
    });

    expect(status).toBe(202);
    expect(data).toEqual({ success: true });

    // And the only handle there is really does lead to the document.
    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(exported, `no "${title}.docx" in My Documents`).toBeDefined();
  });
});

// The rooms an answer can be saved into.
//
// Room types are not interchangeable as export targets — a VDR indexes
// everything that lands in it, a form-filling room's root takes PDF forms and
// nothing else — and `POST /files/{folderId}/file` is what already knows the
// rule for each of them. It decides the export's permissions
// (messages.permission.spec.ts), so it is used here as the oracle for its
// destinations too, rather than a hard-coded expectation per room type.
//
// The two rooms below take documents; the form-filling room does not, and it
// gets a test of its own further down because the two surfaces disagree there.
// The agent room, whose export lands in Result Storage rather than in the root,
// is covered by the transcript block above.

const EXPORT_ROOM_TYPES: Array<{ label: string; roomType: RoomType }> = [
  { label: "Public room", roomType: RoomType.PublicRoom },
  { label: "Virtual Data Room", roomType: RoomType.VirtualDataRoom },
];

test.describe("AI Messages - text-to-docx into every room type", () => {
  for (const { label, roomType } of EXPORT_ROOM_TYPES) {
    test(`POST /api/2.0/ai/text-to-docx - exporting into a ${label} agrees with POST /files/{folderId}/file`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { data: roomData, status: roomStatus } =
        await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Export ${label}`,
            roomType,
          },
        });
      expect(roomStatus).toBe(200);
      const roomId = roomData.response!.id!;

      // The premise: this room's root takes a document at all. Without it a
      // successful export would be the only evidence for both claims at once.
      const control = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: `Control ${apiSdk.faker.generateString(8)}`,
        },
      });
      expect(
        control.status,
        `the Files API has to accept a document in a ${label} root for the export to be compared against it`,
      ).toBe(200);

      const title = `Exported ${apiSdk.faker.generateString(8)}`;
      const { status } = await aiSettings.textToDocx("owner", {
        title,
        content: "The assistant said hello.",
        folderId: roomId,
      });
      expect(status).toBe(202);

      const exported = await waitForExportedFile(
        ownerApi,
        roomId,
        `${title}.docx`,
      );
      expect(exported, `no "${title}.docx" in the ${label}`).toBeDefined();
      expect(exported!.fileExst).toBe(".docx");

      const text = await readExportedDocxText(apiSdk, "owner", exported!.id);
      expect(text).toContain("The assistant said hello.");
    });
  }

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a form filling room refuses the document, but the export reports success and drops it", async ({
    apiSdk,
  }) => {
    // A form filling room's root holds PDF forms: the Files API turns a
    // document away with "The file cannot be uploaded to this room. Please try
    // to upload the ONLYOFFICE PDF form." The export is aimed at the same
    // folder, is subject to the same rule — and answers 202 `{"success":true}`.
    // Nothing is ever written: not in the root, not in a subfolder, and there is
    // no second response to carry the failure. The user is told their answer was
    // saved and it is gone.
    //
    // (The Files API delivers that refusal as a 500 with a stack trace, which is
    // a defect of its own and not this suite's to assert — hence the check on
    // the message rather than on the status.)
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Export Form filling room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const control = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: `Control ${apiSdk.faker.generateString(8)}`,
      },
    });
    expect(control.status).not.toBe(200);
    expect(
      JSON.stringify(control.data),
      "the premise: this room type refuses a document, and says so",
    ).toContain("PDF form");

    const title = `Exported ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content: "The assistant said hello.",
      folderId: roomId,
    });

    // The document really is nowhere — root and every subfolder, after an
    // accepted export would have landed. This half stays true once the endpoint
    // starts refusing properly, so it is asserted before the claim that fails.
    await waitForExportToSettle();
    const { data: room } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    const landed = [...(await listFolderFiles(ownerApi, roomId))];
    for (const folder of (room.response?.folders ?? []) as Array<{
      id?: number;
    }>) {
      landed.push(...(await listFolderFiles(ownerApi, folder.id!)));
    }
    expect(landed.map((file) => file.title)).not.toContain(`${title}.docx`);

    test.fail();
    // 403 is what this endpoint answers for every other target it may not write
    // to; if the fix lands as a 400 instead, this line is the one to update.
    expect(
      status,
      "the export must refuse what the room refuses instead of reporting success and losing the answer",
    ).toBe(403);
  });
});

test.describe("AI Messages - .docx is the only format an answer can be saved as", () => {
  test("POST /api/2.0/ai/text-to-* - there is no pdf, txt or markdown export, and a requested format is ignored", async ({
    apiSdk,
  }) => {
    // "Save the answer as a file" is one format wide. Worth pinning both ways:
    // the sibling routes a client might reasonably try do not exist, and the
    // one route there is does not take a format — it accepts the field and
    // still writes a .docx, so a client that thinks it asked for a PDF gets a
    // document with the wrong extension and no error to show for it.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const base = apiSdk.tokenStore.portalBaseUrl;
    const headers = {
      Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
      Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      "Content-Type": "application/json",
    };
    for (const route of [
      "/api/2.0/ai/text-to-pdf",
      "/api/2.0/ai/text-to-txt",
      "/api/2.0/ai/text-to-md",
      "/api/2.0/ai/text-to-file",
      "/api/2.0/ai/export-text",
    ]) {
      const response = await apiSdk.request.post(`${base}${route}`, {
        headers,
        data: { title: "T", content: "hello", folderId },
      });
      expect(response.status(), `POST ${route}`).toBe(404);
    }

    const title = `Exported format ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content: "The assistant said hello.",
      format: "pdf",
      extension: ".txt",
      folderId,
    });
    expect(status).toBe(202);

    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(
      exported,
      `no "${title}.docx" — a requested format should be ignored, not honoured`,
    ).toBeDefined();
    expect(exported!.fileExst).toBe(".docx");

    const titles = (await listFolderFiles(ownerApi, folderId)).map(
      (file) => file.title,
    );
    expect(titles).not.toContain(`${title}.pdf`);
    expect(titles).not.toContain(`${title}.txt`);
  });
});

test.describe("AI Messages - text-to-docx and the room storage quota", () => {
  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - an export into a room that is out of quota reports success and drops the document", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The export writes a real ~10 KB document into real storage, and it is the
    // one write path in the portal that does not go through the Files API. A
    // room whose quota is exhausted answers `402 "Room space quota exceeded"`
    // there — and 202 `{"success":true}` here, with nothing written. Same
    // failure as the form filling room above: the queue accepts work it cannot
    // do and no one ever hears about it.
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status: quotaSettingsStatus } =
      await ownerApi.settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1024 },
      });
    expect(quotaSettingsStatus).toBe(200);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Export Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: quotaData, status: quotaStatus } =
      await ownerApi.roomQuota.updateRoomsQuota({
        updateRoomsQuotaRequestDtoInteger: {
          roomIds: [roomId] as unknown as number[],
          quota: 1024,
        },
      });
    expect(quotaStatus).toBe(200);
    expect(
      (quotaData.response as unknown as Array<{ quotaLimit?: number }>)[0]
        .quotaLimit,
    ).toBe(1024);

    // 1 KB is under the size of an empty document, so the room is out of quota
    // from the start and the very first create is refused. That refusal is the
    // premise of the test — without it a dropped export would prove nothing —
    // and it is also the answer the export is measured against.
    const oracle = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: `Oracle ${apiSdk.faker.generateString(8)}`,
      },
    });
    expect(
      oracle.status,
      "the room has to be out of quota for the Files API before the export can be compared against it",
    ).toBe(402);
    expect(JSON.stringify(oracle.data)).toContain("quota exceeded");

    const title = `Exported quota ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content: "The assistant said hello.",
      folderId: roomId,
    });

    // The quota does hold — nothing is written past it, which is the half that
    // stays true after the fix. What is missing is the caller ever finding out.
    await waitForExportToSettle();
    expect(
      (await listFolderFiles(ownerApi, roomId)).map((file) => file.title),
      "a room that is out of quota must not gain a document",
    ).not.toContain(`${title}.docx`);

    test.fail();
    expect(
      status,
      "the export has to answer the way the Files API answers for the same room, instead of accepting a job it silently abandons",
    ).toBe(oracle.status);
  });
});

// Exporting a conversation.
//
// There is no thread-export route — `/ai/threads/export`, `/ai/export/thread`
// and `/ai/threads/export-to-docx` are all 404. "Export this chat" is assembled
// by the client: read the thread, render the turns as markdown, and post the
// result to the generic exporter.
//
//   GET  /ai/threads/read-messages?threadId=
//   POST /ai/text-to-docx { title, content, folderId }
//
// The block above covers that endpoint on its own — one line of text, titles,
// folders, forbidden targets — and the one below covers its validation. What
// these two tests add is the flow end to end: a real two-turn conversation, the
// multi-line markdown transcript it produces, and the document it lands in, read
// back to prove the whole exchange survived and kept its order.
//
// These are the only export tests that need a funded gateway, and they need it
// for the conversation, not for the export.

const SHORT_ANSWERS =
  "You are a test assistant. Answer with one short sentence.";

/** The client-side half: a chat transcript as markdown. */
function renderTranscript(messages: Array<{ role: string; text: string }>) {
  return messages
    .map(
      (message) =>
        `**${message.role === "user" ? "You" : "Assistant"}:**\n\n${message.text}`,
    )
    .join("\n\n");
}

test.describe("AI Messages - exporting a thread", () => {
  test("GET read-messages + POST /api/2.0/ai/text-to-docx - a two-turn conversation exports into My Documents in order", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Export Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest export thread",
      profileId,
      agentId,
    });

    // Two turns, each with an answer that can be recognised in the document
    // without depending on how the model phrases anything.
    const firstQuestion = "Reply with exactly the word MERCURY.";
    const secondQuestion = "Now reply with exactly the word VENUS.";

    const first = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: firstQuestion,
      instructions: SHORT_ANSWERS,
    });
    expect(first.status).toBe(200);
    expect(first.streamError).toBeUndefined();
    await aiChat.waitForAssistantReply("owner", threadId);

    const second = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: secondQuestion,
      instructions: SHORT_ANSWERS,
    });
    expect(second.status).toBe(200);
    expect(second.streamError).toBeUndefined();
    const messages = await aiChat.waitForAssistantReplies("owner", threadId, 2);

    // A transcript is only worth exporting if the conversation really happened:
    // two questions, two answers the model actually finished.
    expectHealthyAssistantReply(messages, 2);
    expect(AiAgentChat.userMessages(messages)).toHaveLength(2);

    const transcript = renderTranscript(
      messages.map((message) => ({
        role: message.role,
        text: AiAgentChat.messageText(message),
      })),
    );
    expect(transcript).toContain(firstQuestion);
    expect(transcript).toContain(secondQuestion);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const title = `Autotest Chat Export ${apiSdk.faker.generateString(8)}`;
    const exportCall = await aiSettings.textToDocx("owner", {
      title,
      content: transcript,
      folderId,
    });
    expect(exportCall.status).toBe(202);
    expect(exportCall.data?.success).toBe(true);

    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(exported, `no "${title}.docx" in My Documents`).toBeDefined();
    expect(exported!.fileExst).toBe(".docx");
    expect(exported!.pureContentLength).toBeGreaterThan(0);

    // Every turn is in the document, and the exchange is still in the order it
    // happened — a transcript that shuffles the turns would be worse than none.
    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);
    expect(text).toContain(firstQuestion);
    expect(text).toContain(secondQuestion);
    for (const reply of AiAgentChat.assistantMessages(messages)) {
      expect(text).toContain(AiAgentChat.messageText(reply));
    }
    expect(text.indexOf(firstQuestion)).toBeLessThan(
      text.indexOf(secondQuestion),
    );
  });

  test("POST /api/2.0/ai/text-to-docx - a transcript exported to an agent lands in its Result Storage, not in the room root", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other half of "save this chat": keeping it next to the agent rather
    // than in personal documents. An agent is a room, so its id is a legal
    // export target — but not the folder the document ends up in. An agent room
    // ships with "Knowledge" and "Result Storage" subfolders and everything the
    // agent produces is filed under Result Storage, exports included. A caller
    // that polls the id it passed in never sees its own document.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Export Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest export thread",
      profileId,
      agentId,
    });

    const question = "Reply with exactly the word SATURN.";
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: question,
      instructions: SHORT_ANSWERS,
    });
    expect(sent.status).toBe(200);
    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    const transcript = renderTranscript(
      messages.map((message) => ({
        role: message.role,
        text: AiAgentChat.messageText(message),
      })),
    );

    const title = `Autotest Agent Export ${apiSdk.faker.generateString(8)}`;
    const exportCall = await aiSettings.textToDocx("owner", {
      title,
      content: transcript,
      folderId: agentId,
    });
    expect(exportCall.status).toBe(202);
    expect(exportCall.data?.success).toBe(true);

    const { data: room, status: roomStatus } =
      await ownerApi.folders.getFolderByFolderId({ folderId: agentId });
    expect(roomStatus).toBe(200);
    const resultStorage = (room.response?.folders ?? []).find(
      (folder) => (folder as { title?: string }).title === "Result Storage",
    ) as { id?: number } | undefined;
    expect(
      resultStorage?.id,
      "the agent's Result Storage folder",
    ).toBeDefined();

    const exported = await waitForExportedFile(
      ownerApi,
      resultStorage!.id!,
      `${title}.docx`,
    );
    expect(
      exported,
      `no "${title}.docx" in the agent's Result Storage`,
    ).toBeDefined();

    // Nothing was left in the room root the export was addressed to.
    const rootFiles = await listFolderFiles(ownerApi, agentId);
    expect(rootFiles.map((file) => file.title)).not.toContain(`${title}.docx`);

    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);
    expect(text).toContain(question);
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
    test(`BUG 82713: POST /api/2.0/ai/text-to-docx - ${name} returns 500 instead of 400`, async ({
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

  test("BUG 82713: POST /api/2.0/ai/text-to-docx - a folderId sent as a string returns 500 instead of 400", async ({
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

  test("BUG 82714: POST /api/2.0/ai/text-to-docx - a non-existent folderId returns 500 instead of 404", async ({
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

  test("BUG 82714: POST /api/2.0/ai/text-to-docx - a deleted folderId returns 500 instead of 404", async ({
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

  test("BUG 82714: POST /api/2.0/ai/text-to-docx - a file id as folderId returns 500 instead of 404", async ({
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

// Per-message routes: read one, rewrite one, remove one.
//
//   GET    /ai/threads/get-message-by-id?messageId=
//   PUT    /ai/threads/update-message  { messageId, message }
//   DELETE /ai/threads/delete-message  bare message id
//
// Section 9.4 says there should be no API for editing a sent user message. There
// is one — `update-message` rewrites any stored message in place — so the "verify
// the route is absent / 404 / 405" case is inverted here into a test of what the
// route actually does, and the ownership question it raises is at the bottom.
//
// `append-user-message` is used as the fixture throughout: it stores a user
// message without asking the model to answer it, which keeps these tests off the
// provider.

async function setupThread(apiSdk: ApiSDK) {
  const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const catalogue = await profiles.catalogue("owner");
  const profileId = AiProfiles.byCapabilities(
    catalogue,
    AI_CAPS.textVisionTools,
  ).id;

  const agentId = await aiChat.createAgentId("owner", {
    title: "Autotest Message Agent",
    profileId,
  });
  const threadId = await aiChat.createThreadId("owner", {
    title: "Autotest thread",
    profileId,
    agentId,
  });

  return { aiChat, profileId, agentId, threadId };
}

test.describe("AI Messages - reading one message", () => {
  test("POST /api/2.0/ai/threads/append-user-message, GET get-message-by-id - a stored message is readable by id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);

    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Autotest question",
    });
    expect(appended.status).toBe(200);

    // The append response nests the whole message under `messageId` rather than
    // returning a bare id — worth pinning, because `data.messageId` reads like an
    // id and is not one.
    const stored = appended.data?.messageId as
      | { id?: string; role?: string }
      | undefined;
    expect(stored?.id, "append returns the stored message").toBeTruthy();
    expect(stored?.role).toBe("user");

    const messageId = stored!.id!;
    const { status, data } = await aiChat.getMessageById("owner", messageId);
    expect(status).toBe(200);
    expect(data?.id).toBe(messageId);
    expect(data?.role).toBe("user");
    expect(AiAgentChat.messageText(data!)).toBe("Autotest question");
  });

  test("GET /api/2.0/ai/threads/get-message-by-id - an unknown id answers 200 null and a malformed one 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    await setupThread(apiSdk);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const unknown = await aiChat.getMessageById(
      "owner",
      "019fcc1d-478e-749f-85df-7427ca64566b",
    );
    expect(unknown.status).toBe(200);
    expect(unknown.data).toBeNull();

    const malformed = await aiChat.getMessageById("owner", "not-a-guid");
    expect(malformed.status).toBe(400);
  });
});

test.describe("AI Messages - rewriting a message", () => {
  test("PUT /api/2.0/ai/threads/update-message - rewrites the content in place", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);

    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "original",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    const { status, data } = await aiChat.updateMessage("owner", {
      messageId,
      message: {
        role: "user",
        content: [{ type: "text", text: "edited" }],
      },
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    // The id survives, so this is an edit rather than a replace...
    const read = await aiChat.getMessageById("owner", messageId);
    expect(read.data?.id).toBe(messageId);
    expect(AiAgentChat.messageText(read.data!)).toBe("edited");

    // ...and the thread holds exactly one message, with the new text.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data).toHaveLength(1);
    expect(AiAgentChat.messageText(messages.data[0])).toBe("edited");
    expect(messages.data[0].id).toBe(messageId);
  });

  test("PUT /api/2.0/ai/threads/update-message - an unknown or malformed message id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "original",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    // Unlike the prompt routes, this one answers a proper 404 for a well-formed
    // id that does not exist rather than a soft `{success:false}`.
    const unknown = await aiChat.updateMessage("owner", {
      messageId: "019fcc1d-478e-749f-85df-7427ca64566b",
      message: { role: "user", content: [{ type: "text", text: "hijacked" }] },
    });
    expect(unknown.status).toBe(404);

    const malformed = await aiChat.updateMessage("owner", {
      messageId: "not-a-guid",
      message: { role: "user", content: [{ type: "text", text: "hijacked" }] },
    });
    expect(malformed.status).toBe(400);

    // The real message is untouched by either attempt.
    const read = await aiChat.getMessageById("owner", messageId);
    expect(AiAgentChat.messageText(read.data!)).toBe("original");
  });
});

test.describe("AI Messages - deleting a message", () => {
  test("DELETE /api/2.0/ai/threads/delete-message - removes one message and keeps the rest", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);

    const first = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "first",
    });
    const second = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "second",
    });
    const doomed = (first.data?.messageId as { id: string }).id;
    const keeper = (second.data?.messageId as { id: string }).id;

    const { status, data } = await aiChat.deleteMessage("owner", doomed);
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect((await aiChat.getMessageById("owner", doomed)).data).toBeNull();

    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data.map((message) => message.id)).toEqual([keeper]);

    // The thread itself outlives its messages.
    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.status).toBe(200);
    expect(thread.data?.threadId).toBe(threadId);
  });

  test("DELETE /api/2.0/ai/threads/delete-message - a malformed id is rejected and a second delete is accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "only",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    const malformed = await aiChat.deleteMessage("owner", "not-a-guid");
    expect(malformed.status).toBe(400);
    expect(
      (await aiChat.readMessages("owner", threadId)).data,
      "the rejected delete removed nothing",
    ).toHaveLength(1);

    expect((await aiChat.deleteMessage("owner", messageId)).data?.success).toBe(
      true,
    );

    const again = await aiChat.deleteMessage("owner", messageId);
    expect(again.status).toBe(200);
    expect(again.data?.success).toBe(true);
  });
});

test.describe("AI Messages - cross-user access to one message", () => {
  test("PUT|DELETE /api/2.0/ai/threads/update-message, delete-message - a non-member cannot touch a message in someone else's thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "owner's question",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    // The member is created after all of the owner's setup, so the shared
    // context's session cookie cannot make the calls below run as the owner.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await aiChat.expectActingAs("user", memberData.response!.id!, "User");

    // All three are refused outright — the message id is not a bearer token the
    // way an attachment id is (see ai_attachments_no_user_isolation).
    expect((await aiChat.getMessageById("user", messageId)).status).toBe(403);
    expect(
      (
        await aiChat.updateMessage("user", {
          messageId,
          message: {
            role: "user",
            content: [{ type: "text", text: "hijacked" }],
          },
        })
      ).status,
    ).toBe(403);
    expect((await aiChat.deleteMessage("user", messageId)).status).toBe(403);

    // The thread around it is closed too, so the refusals are not a fluke of the
    // per-message routes alone.
    expect((await aiChat.getThread("user", threadId)).status).toBe(403);

    await apiSdk.authenticateOwner();
    const after = await aiChat.getMessageById("owner", messageId);
    expect(after.status).toBe(200);
    expect(
      AiAgentChat.messageText(after.data!),
      "the owner's message content",
    ).toBe("owner's question");
    expect(
      (await aiChat.readMessages("owner", threadId)).data,
      "the owner's thread still holds the message",
    ).toHaveLength(1);
  });

  test("PUT /api/2.0/ai/threads/update-message - a room member cannot rewrite another member's message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "owner's question",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);
    await aiChat.expectActingAs(
      "roomAdmin",
      memberData.response!.id!,
      "RoomAdmin",
    );

    // Membership in the agent room buys access to the room, not to another
    // member's messages: the per-message routes stay 403.
    expect((await aiChat.getMessageById("roomAdmin", messageId)).status).toBe(
      403,
    );
    expect(
      (
        await aiChat.updateMessage("roomAdmin", {
          messageId,
          message: {
            role: "user",
            content: [{ type: "text", text: "hijacked" }],
          },
        })
      ).status,
    ).toBe(403);
    expect((await aiChat.deleteMessage("roomAdmin", messageId)).status).toBe(
      403,
    );

    await apiSdk.authenticateOwner();
    const after = await aiChat.getMessageById("owner", messageId);
    expect(AiAgentChat.messageText(after.data!)).toBe("owner's question");
    expect(
      (await aiChat.readMessages("owner", threadId)).data,
      "the owner's thread is intact",
    ).toHaveLength(1);
  });
});

// Named apart from the "AI Messages - AI Disabled" block in
// messages.ai-disabled.spec.ts, which covers the text-to-docx side of the switch.
test.describe("AI Messages - per-message routes with AI Disabled", () => {
  test("GET|PUT|DELETE /api/2.0/ai/threads/*-message - the per-message routes return 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "original",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    expect((await aiChat.getMessageById("owner", messageId)).status).toBe(403);
    expect(
      (
        await aiChat.updateMessage("owner", {
          messageId,
          message: { role: "user", content: [{ type: "text", text: "off" }] },
        })
      ).status,
    ).toBe(403);
    expect((await aiChat.deleteMessage("owner", messageId)).status).toBe(403);

    // Turning AI back on shows the refused writes really were refused.
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);

    const read = await aiChat.getMessageById("owner", messageId);
    expect(read.status).toBe(200);
    expect(AiAgentChat.messageText(read.data!)).toBe("original");
  });
});

// The inference routes other than `send-with-stream` (which chat/chat.spec.ts and
// messages/messages.spec.ts already cover).
//
//   POST /ai/ai/regenerate-stream       { threadId, entityId?, profileId? }
//   POST /ai/ai/send                    { actionType, userMessage, entityId? }
//   POST /ai/ai/send-custom             { isStream, systemPrompt, userMessage }
//   POST /ai/ai/send-with-stream-openai same body as send-with-stream
//
// `regenerate-stream` is the regenerate of section 9.4 and it works. `send` and
// `send-custom` are the one-shot, non-threaded paths and they do not: the model
// call comes back with an `auth` error even on a portal where the streaming path
// answers normally, so section 11's per-error-type matrix cannot be built on them.
//
// Two protocol notes, because they differ per route:
//   * send-with-stream / regenerate-stream stream newline-delimited JSON frames
//     with a `type` field (`AiAgentChat.streamFrames`).
//   * send-with-stream-openai streams OpenAI `data: {...}` chunks ending in
//     `data: [DONE]` (`AiAgentChat.openAiStreamChunks`).
//
// There is no stop/cancel route anywhere on this surface — but that does not
// make section 9.3 unreachable, see the stop block below.

// ---------------------------------------------------------------------------
// Stopping a running generation.
//
// The route hunt came up empty (`/ai/ai/stop`, `/stop-stream`, `/cancel`,
// `/abort`, `/threads/stop` are all 404) and that read as "nothing to cover".
// It is not. The client's `stopStreaming()` does not call a route — it aborts
// the in-flight `send-with-stream` request — so hanging up on the stream IS the
// stop gesture, and what the backend does about it is testable.
//
// What it does about it, measured live on 2026-08-06: nothing. The growth curve
// of the stored reply after cutting the connection at 5 s, against a prompt an
// uninterrupted run needs 31 s to answer:
//
//   t=5.6s   no assistant message at all
//   t=21.7s  3689 chars
//   t=24.9s  7490 chars, ending in the sentinel — the complete answer
//   t=132s   unchanged
//
// The model kept running for twenty seconds after the client was gone and the
// whole answer was billed and stored. So "Stop generation" cannot be built on
// the abort alone: it stops the *display*, not the generation. That is the bug
// below, and it is also why there is no "was it marked as stopped?" test — the
// reply is not stopped, it is complete.
//
// The sentinel is what makes completeness checkable without guessing at
// lengths: the model is told to end with FINISHED, so the control run proves
// the marker arrives on a finished answer and its presence after an abort means
// the answer ran to its end anyway.

const LONG_ANSWER_PROMPT =
  "Write a detailed essay of at least 600 words about the history of typography. " +
  "Number every paragraph. When the whole essay is done, end your answer with the exact word FINISHED.";

const SENTINEL = "FINISHED";

/** How long the reply is allowed to stream before the connection is cut. */
const STOP_AFTER_MS = 5000;

/** No growth for this long counts as "the backend has finished with it". */
const QUIET_MS = 20000;

test.describe("AI Messages - stopping a stream", () => {
  test("BUG 82898: POST /api/2.0/ai/ai/send-with-stream - hanging up mid-stream does not stop the generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Stop Agent",
      profileId,
    });

    // The positive control first. Without it the sentinel proves nothing — the
    // model might simply never write it — and there is no evidence that the
    // request is long enough to still be running at the cut-off.
    let controlMs = 0;
    await test.step("a stream nobody interrupts runs to the sentinel", async () => {
      const threadId = await aiChat.createThreadId("owner", {
        title: "Autotest control thread",
        profileId,
        agentId,
      });
      const startedAt = Date.now();
      const sent = await aiChat.sendMessage("owner", {
        threadId,
        profileId,
        agentId,
        message: LONG_ANSWER_PROMPT,
      });
      expect(sent.status).toBe(200);
      expect(sent.streamError).toBeUndefined();

      const messages = await aiChat.waitForAssistantReply("owner", threadId);
      expectHealthyAssistantReply(messages);
      expect(
        AiAgentChat.assistantText(messages),
        "the uninterrupted answer reaches its end",
      ).toContain(SENTINEL);
      controlMs = Date.now() - startedAt;
      expect(
        controlMs,
        `the answer took ${controlMs} ms — too fast to be interrupted at ${STOP_AFTER_MS} ms`,
      ).toBeGreaterThan(STOP_AFTER_MS * 2);
    });

    await test.step("the same stream, hung up on after 5 s", async () => {
      const threadId = await aiChat.createThreadId("owner", {
        title: "Autotest stopped thread",
        profileId,
        agentId,
      });

      const { aborted } = await aiChat.sendAndAbort("owner", {
        threadId,
        profileId,
        agentId,
        message: LONG_ANSWER_PROMPT,
        afterMs: STOP_AFTER_MS,
      });
      expect(
        aborted,
        `the connection was still open at ${STOP_AFTER_MS} ms — nothing was stopped`,
      ).toBe(true);

      // What the thread holds the moment the client is gone. The control needed
      // far longer than the cap, so this cannot be the finished answer.
      const atStop = await aiChat.readMessages("owner", threadId);
      expect(atStop.status).toBe(200);
      const partial = AiAgentChat.assistantText(atStop.data);
      expect(partial, "the answer was still being written").not.toContain(
        SENTINEL,
      );

      const settled = await aiChat.waitForStableAssistantText(
        "owner",
        threadId,
        QUIET_MS,
      );

      // The reply grew after the client had gone: the model was still running
      // with nobody listening, and the tokens were spent all the same.
      expect(
        settled.text.length,
        `the stored reply after the disconnect: ${settled.lengths.join(" -> ")}`,
      ).toBeGreaterThan(partial.length);

      // The question is kept either way, so the turn can be retried.
      expect(AiAgentChat.userMessages(atStop.data)).toHaveLength(1);

      test.fail();
      expect(
        settled.text,
        "a generation the user stopped must not run to its end",
      ).not.toContain(SENTINEL);
    });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the thread works again after the client hangs up", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The failure this rules out is a thread wedged by the dropped connection —
    // the next question either never answered or answered into the abandoned
    // reply. It is the half of the stop contract that does hold.
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Stop Resume Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest stop resume thread",
      profileId,
      agentId,
    });

    const { aborted } = await aiChat.sendAndAbort("owner", {
      threadId,
      profileId,
      agentId,
      message: LONG_ANSWER_PROMPT,
      afterMs: STOP_AFTER_MS,
    });
    expect(aborted).toBe(true);

    // The abandoned reply is allowed to land before the next turn — sending
    // into a thread the backend is still writing to is a different test.
    const abandoned = await aiChat.waitForStableAssistantText(
      "owner",
      threadId,
      QUIET_MS,
    );
    expect(abandoned.text.length).toBeGreaterThan(0);

    const resumed = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(resumed.status).toBe(200);
    expect(resumed.streamError).toBeUndefined();
    expect(AiAgentChat.frameTypes(resumed.text)).toContain("message-end");

    const messages = await aiChat.waitForAssistantReplies("owner", threadId, 2);
    expect(AiAgentChat.userMessages(messages)).toHaveLength(2);

    const replies = AiAgentChat.assistantMessages(messages);
    expect(replies).toHaveLength(2);

    // The new answer is its own message, healthy, and did not overwrite or
    // continue the abandoned one.
    const second = replies[1];
    expect(second.status?.error).toBeUndefined();
    expect(AiAgentChat.messageText(second).length).toBeGreaterThan(0);
    expect(second.id).not.toBe(abandoned.message?.id);
    expect(
      AiAgentChat.messageText(replies[0]),
      "the abandoned reply is left as it was",
    ).toBe(abandoned.text);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - regenerating after a hang-up replaces the abandoned reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The recovery path a user takes after stopping by accident: ask again.
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Stop Regenerate Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest stop regenerate thread",
      profileId,
      agentId,
    });

    const { aborted } = await aiChat.sendAndAbort("owner", {
      threadId,
      profileId,
      agentId,
      message: LONG_ANSWER_PROMPT,
      afterMs: STOP_AFTER_MS,
    });
    expect(aborted).toBe(true);
    const abandoned = await aiChat.waitForStableAssistantText(
      "owner",
      threadId,
      QUIET_MS,
    );
    expect(abandoned.text.length).toBeGreaterThan(0);

    const { status, streamError } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });
    expect(status).toBe(200);
    expect(streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const replies = AiAgentChat.assistantMessages(messages);

    // Regenerate replaces rather than appends, so the abandoned reply is gone
    // and the one that took its place is a complete answer.
    expect(replies).toHaveLength(1);
    expect(replies[0].id).not.toBe(abandoned.message?.id);
    expect(AiAgentChat.messageText(replies[0])).toContain(SENTINEL);
    expect(AiAgentChat.userMessages(messages)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Paging the history.
//
// The client library pages a thread's history in blocks of 100 through
// `count`/`cursor` on read-messages, the same pair `threads/list` takes. Neither
// route implements them: read-messages answers with the whole history whatever
// is asked for, and `limit`/`startIndex` are not the spelling either. The
// counterpart bug on the thread list is BUG 82825.
//
// Six messages are enough to show it — a parameter that does not narrow six
// will not narrow a hundred, and `append-user-message` builds them without
// spending an inference call per message.

test.describe("AI Messages - paging the history", () => {
  test("BUG 82899: GET /api/2.0/ai/threads/read-messages - count and cursor are accepted and ignored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Paging Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest paging thread",
      profileId,
      agentId,
    });

    const texts = ["one", "two", "three", "four", "five", "six"];
    for (const text of texts) {
      const { status } = await aiChat.appendUserMessage("owner", {
        threadId,
        profileId,
        text,
      });
      expect(status, `storing "${text}"`).toBe(200);
    }

    // The unpaged read is the baseline: everything, oldest first.
    const all = await aiChat.readMessages("owner", threadId);
    expect(all.status).toBe(200);
    expect(all.data.map((message) => AiAgentChat.messageText(message))).toEqual(
      texts,
    );

    // A first page of two comes back as all six, and so does the page after a
    // cursor — there is no way for a client to fetch a window of a long thread.
    const cursored = await aiChat.readMessages("owner", threadId, {
      count: 2,
      cursor: all.data[1].id,
    });
    expect(cursored.status).toBe(200);
    expect(cursored.data).toHaveLength(texts.length);

    const firstPage = await aiChat.readMessages("owner", threadId, {
      count: 2,
    });
    expect(firstPage.status).toBe(200);

    test.fail();
    expect(
      firstPage.data,
      "count=2 has to return two messages, not the whole history",
    ).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Regenerate, as section 9.4 has it: the button under an assistant reply drops
// that reply and asks the same model the same question again. There is no edit
// of a sent message, so regenerating is the only way to re-ask.
//
// Only one of those two halves is a server contract. `regenerate-stream` is the
// button. The "no editing" half is not enforced anywhere — `update-message`
// rewrites any stored message in place (see "AI Messages - rewriting a message"
// above), so the restriction lives in the composer alone. What is testable about
// it is the consequence: an edit is not a re-ask, it changes the transcript and
// leaves the answer standing.

/**
 * Polls until the reply `oldId` is gone and `expectedReplies` assistant messages
 * are in place, then returns the history.
 *
 * `regenerate-stream` finishes its response body before the replacement is
 * stored, so a single read straight afterwards catches the thread mid-swap —
 * either still on the old reply or, briefly, on neither.
 */
async function waitForReplacedReply(
  aiChat: AiAgentChat,
  threadId: string,
  oldId: string,
  expectedReplies = 1,
  timeoutMs = 90000,
) {
  const deadline = Date.now() + timeoutMs;
  let messages = (await aiChat.readMessages("owner", threadId)).data;

  while (Date.now() < deadline) {
    const replies = AiAgentChat.assistantMessages(messages);
    if (
      replies.length >= expectedReplies &&
      !replies.some((reply) => reply.id === oldId)
    ) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    messages = (await aiChat.readMessages("owner", threadId)).data;
  }

  return messages;
}

/**
 * Polls until some assistant reply other than `oldId` is in the thread, then
 * returns the history.
 *
 * The replace-neutral form of `waitForReplacedReply`, for the places that only
 * need "a generation happened" and must not care whether the old reply was
 * dropped: after an edit a regenerate appends rather than replaces (see
 * "an edited question moves to the end of the transcript"), so waiting for the
 * old reply to disappear there would only ever time out.
 */
async function waitForNewReply(
  aiChat: AiAgentChat,
  threadId: string,
  oldId: string,
  timeoutMs = 90000,
) {
  const deadline = Date.now() + timeoutMs;
  let messages = (await aiChat.readMessages("owner", threadId)).data;

  while (Date.now() < deadline) {
    if (
      AiAgentChat.assistantMessages(messages).some(
        (reply) => reply.id !== oldId,
      )
    ) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    messages = (await aiChat.readMessages("owner", threadId)).data;
  }

  return messages;
}

/**
 * How long a refused regenerate is watched before the thread is called
 * unchanged. An accepted one lands in a few seconds, so a read taken straight
 * after the refusal would report "nothing was generated" for a generation that
 * simply had not arrived yet.
 */
const REGENERATE_SETTLE_MS = 15000;

test.describe("AI Messages - regenerate", () => {
  test("POST /api/2.0/ai/ai/regenerate-stream - replaces the last assistant reply and keeps the question", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Regenerate Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id,
      agentId,
      message: "Reply with the single word OK.",
    });
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);

    const question = AiAgentChat.userMessages(before)[0];
    const firstReply = AiAgentChat.assistantMessages(before)[0];

    const { status, text, streamError } = await aiChat.regenerateStream(
      "owner",
      {
        threadId,
        entityId: String(agentId),
        profileId: profile.id,
      },
    );

    expect(status).toBe(200);
    expect(streamError).toBeUndefined();

    // The regenerate opens a fresh streaming lifecycle of its own.
    const frames = AiAgentChat.streamFrames(text);
    expect(frames.map((frame) => frame.type)).toContain("message-start");
    expect(frames.map((frame) => frame.type)).toContain("message-end");

    const streamedId = frames.find((frame) => frame.type === "message-start")
      ?.messageId as string | undefined;
    expect(streamedId, "the stream reports the new message id").toBeTruthy();
    expect(streamedId).not.toBe(firstReply.id);

    // Poll for the replacement rather than reading once: the stored message lands
    // after the response body is complete.
    const after = await waitForReplacedReply(aiChat, threadId, firstReply.id);

    // The old reply is replaced, not appended to: exactly one assistant message,
    // with a new id.
    const replies = AiAgentChat.assistantMessages(after);
    expect(replies).toHaveLength(1);
    expect(replies[0].id).not.toBe(firstReply.id);
    expect(replies[0].id).toBe(streamedId);
    expectHealthyAssistantReply(after);

    // The user message survives untouched — section 9.4.
    const questions = AiAgentChat.userMessages(after);
    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe(question.id);
    expect(AiAgentChat.messageText(questions[0])).toBe(
      "Reply with the single word OK.",
    );

    // And the thread keeps its profile: regenerating does not re-resolve the model.
    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.data?.profileId).toBe(profile.id);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - a thread with nothing to regenerate", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Regenerate Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    const { status } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId: profile.id,
    });

    // Whatever it answers, an empty thread must not gain a reply out of nowhere.
    expect(status).toBe(200);
    const messages = await aiChat.readMessages("owner", threadId);
    expect(AiAgentChat.assistantMessages(messages.data)).toEqual([]);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - an unknown thread reports the failure inside the stream", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Regenerate Agent",
      profileId: profile.id,
    });

    const { status, streamError } = await aiChat.regenerateStream("owner", {
      threadId: "019fcc1d-3c16-7527-90c2-bb509d2f8136",
      entityId: String(agentId),
      profileId: profile.id,
    });

    // Same shape as BUG 82723 on send-with-stream: the refusal is a frame inside a
    // 200, not an HTTP status.
    expect(status).toBe(200);
    expect(streamError).toBe("stream error");
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - a multi-turn thread loses only its last reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The route takes a threadId and no messageId, so the only reply it can
    // regenerate is the last one. That is worth pinning from both sides: the
    // earlier turns have to survive verbatim (a client that shows the button
    // under every reply would be promising something the API cannot do), and the
    // history has to stay a well-formed question/answer alternation afterwards.
    test.setTimeout(360000);

    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);

    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word ONE.",
    });
    await aiChat.waitForAssistantReply("owner", threadId);

    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word TWO.",
    });
    const before = await aiChat.waitForAssistantReplies("owner", threadId, 2);
    expectHealthyAssistantReply(before, 2);

    const questionsBefore = AiAgentChat.userMessages(before);
    expect(questionsBefore, "both questions are stored").toHaveLength(2);
    const [firstReply, lastReply] = AiAgentChat.assistantMessages(before);
    const firstReplyText = AiAgentChat.messageText(firstReply);

    const { status, streamError } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });
    expect(status).toBe(200);
    expect(streamError).toBeUndefined();

    const after = await waitForReplacedReply(aiChat, threadId, lastReply.id, 2);

    // The first answer is the same object, not a re-run that happened to say the
    // same thing — same id and same text.
    const replies = AiAgentChat.assistantMessages(after);
    expect(replies).toHaveLength(2);
    expect(replies[0].id, "the earlier reply is untouched").toBe(firstReply.id);
    expect(AiAgentChat.messageText(replies[0])).toBe(firstReplyText);
    expect(replies[1].id, "only the last reply was replaced").not.toBe(
      lastReply.id,
    );
    expectHealthyAssistantReply(after, 2);

    // Both questions survive, in order, and the transcript still alternates.
    expect(
      AiAgentChat.userMessages(after).map((message) => message.id),
    ).toEqual(questionsBefore.map((message) => message.id));
    expect(after.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - a thread whose last message is an unanswered question", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The composer cannot produce this state — the button hangs off an assistant
    // reply — but the API can be asked anyway, and either answer is defensible:
    // answer the dangling question, or do nothing. What is not defensible is
    // losing or duplicating the question, so that is what is asserted; the reply
    // count is deliberately left open rather than guessed at.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);

    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Reply with the single word OK.",
    });
    expect(appended.status).toBe(200);
    const questionId = (appended.data?.messageId as { id: string }).id;

    const { status } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });
    expect(status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, REGENERATE_SETTLE_MS));
    const messages = (await aiChat.readMessages("owner", threadId)).data;

    const questions = AiAgentChat.userMessages(messages);
    expect(
      questions,
      "the question is neither lost nor duplicated",
    ).toHaveLength(1);
    expect(questions[0].id).toBe(questionId);
    expect(AiAgentChat.messageText(questions[0])).toBe(
      "Reply with the single word OK.",
    );

    const replies = AiAgentChat.assistantMessages(messages);
    expect(
      replies.length,
      "one regenerate produces at most one reply",
    ).toBeLessThanOrEqual(1);
    if (replies.length === 1) {
      expectHealthyAssistantReply(messages);
    }
  });
});

// "…and generates it again on the same model" is the half of section 9.4 that
// the happy-path test above cannot prove: it names the profile explicitly, so a
// backend that ignored the thread's model entirely would still pass it. These
// three ask what a real button does — regenerate with no profileId of its own —
// and check which model the conversation is left on.
//
// The model is read back from `threads/get-by-id`, the same place the composer
// reads it from (see "the model of one thread" in chat/chat.spec.ts): the stored
// reply carries no marker of the model that wrote it.
test.describe("AI Messages - the model a regenerate runs on", () => {
  test("POST /api/2.0/ai/ai/regenerate-stream - a regenerate with no profileId keeps the thread's own model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Staged in a room, where the model is the user's to pick, and with the
    // portal-wide Chat binding pointed at the OTHER profile — otherwise "the
    // regenerate stayed on the thread's model" and "it re-resolved the location's
    // and landed on the same one" are the same observation. This is the
    // regenerate counterpart of BUG 82860 on send-with-stream.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Regenerate Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: first.id,
    });
    expect(bound.data?.success).toBe(true);
    expect(
      (await profiles.resolveForAction("owner", "Chat", roomId)).data
        ?.profileId,
      "the room resolves the other profile",
    ).toBe(first.id);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread on a picked model",
      profileId: second.id,
      agentId: roomId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: second.id,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread is on the picked model before the regenerate",
    ).toBe(second.id);

    const firstReply = AiAgentChat.assistantMessages(before)[0];

    // What the button sends: the thread and where it lives, and nothing about
    // the model.
    const { status, streamError } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(roomId),
    });
    expect(status).toBe(200);
    expect(streamError).toBeUndefined();

    const after = await waitForReplacedReply(aiChat, threadId, firstReply.id);
    expectHealthyAssistantReply(after);

    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "regenerating does not move the conversation onto the location's model",
    ).toBe(second.id);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - a regenerate in an agent room runs on the agent's model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The agent fixes the model and the composer hides the picker, so the
    // regenerate carries no profileId at all. The portal-wide binding points
    // elsewhere, so a fallback to it would be visible.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: second.id,
    });
    expect(bound.data?.success).toBe(true);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
    });
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is bound to the first profile",
    ).toBe(first.id);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread in an agent",
      profileId: first.id,
      agentId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);
    const firstReply = AiAgentChat.assistantMessages(before)[0];

    const { status, streamError } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
    });
    expect(status).toBe(200);
    expect(streamError).toBeUndefined();

    const after = await waitForReplacedReply(aiChat, threadId, firstReply.id);
    expectHealthyAssistantReply(after);

    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the regenerate stays on the agent's own model",
    ).toBe(first.id);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - a profileId in a regenerate does not move the thread off the agent's model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The send half of the same body IS a hole — BUG 82914 / 82915 in
    // chat.spec.ts, where a `profileId` naming another model is written onto the
    // thread and every following turn uses it. Regenerate takes the same field
    // and does not: the stream completes normally, and the thread is still on
    // the agent's own model afterwards. Worth its own test precisely because the
    // neighbouring route is broken — this is the boundary of that bug.
    //
    // Scope of the claim: WHICH model produced the text is not observable, the
    // stored reply carries no marker of it (see "the model of one thread" in
    // chat.spec.ts). What is asserted is the durable part — the model the
    // conversation is left on, which is what every following turn runs on.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
    });
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is bound to the first profile",
    ).toBe(first.id);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread on the agent's own model",
      profileId: first.id,
      agentId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: first.id,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);
    const firstReply = AiAgentChat.assistantMessages(before)[0];

    const { status, streamError } = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId: second.id,
    });

    // The foreign profile is not refused — it is accepted and ignored, so the
    // regenerate has to be shown to have actually run. Without this a backend
    // that started answering 403 would keep the assertion below true for the
    // wrong reason.
    expect(status).toBe(200);
    expect(streamError).toBeUndefined();
    const after = await waitForReplacedReply(aiChat, threadId, firstReply.id);
    expectHealthyAssistantReply(after);

    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the regenerate left the conversation on the agent's own model",
    ).toBe(first.id);
  });
});

// The other half of section 9.4: there is no editing of a sent message, so
// re-asking goes through the button. `update-message` exists all the same, which
// makes the pair below the closest an API test can get to the requirement — an
// edit changes the transcript and nothing else, a regenerate is what produces a
// new answer.
test.describe("AI Messages - editing a question is not a re-ask", () => {
  test("PUT /api/2.0/ai/threads/update-message - rewriting the question leaves the answer standing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(360000);

    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word ONE.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);

    const question = AiAgentChat.userMessages(before)[0];
    const reply = AiAgentChat.assistantMessages(before)[0];
    const replyText = AiAgentChat.messageText(reply);

    const edited = await aiChat.updateMessage("owner", {
      messageId: question.id,
      message: {
        role: "user",
        content: [{ type: "text", text: "Reply with the single word TWO." }],
      },
    });
    expect(edited.status).toBe(200);

    // Long enough that an answer triggered by the edit would have arrived.
    await new Promise((resolve) => setTimeout(resolve, REGENERATE_SETTLE_MS));
    const afterEdit = (await aiChat.readMessages("owner", threadId)).data;

    expect(
      AiAgentChat.messageText(AiAgentChat.userMessages(afterEdit)[0]),
      "the transcript now shows the edited question",
    ).toBe("Reply with the single word TWO.");
    const repliesAfterEdit = AiAgentChat.assistantMessages(afterEdit);
    expect(
      repliesAfterEdit,
      "the edit did not produce a second answer",
    ).toHaveLength(1);
    expect(repliesAfterEdit[0].id, "nor did it replace the first one").toBe(
      reply.id,
    );
    expect(AiAgentChat.messageText(repliesAfterEdit[0])).toBe(replyText);

    // The positive control: the thread was perfectly able to produce a new
    // answer, the edit just is not what asks for one.
    //
    // Deliberately neutral about replace-vs-append. On an unedited thread a
    // regenerate replaces the last reply (see "AI Messages - regenerate"), but
    // the edit above moves the question to the end of the transcript, and a
    // regenerate on a trailing question appends instead — the test.fail below.
    // All this control needs is that generation happened at all.
    const regenerated = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });
    expect(regenerated.status).toBe(200);
    expect(regenerated.streamError).toBeUndefined();

    const afterRegenerate = await waitForNewReply(aiChat, threadId, reply.id);
    const newReplies = AiAgentChat.assistantMessages(afterRegenerate).filter(
      (message) => message.id !== reply.id,
    );
    expect(
      newReplies,
      "the regenerate produced the answer the edit did not",
    ).toHaveLength(1);
    // Health checked on the new reply alone, for the same reason the count above
    // is: whether the old one is still there is the test.fail below, not this.
    expectHealthyAssistantReply(newReplies);
  });

  test("BUG 83037: PUT /api/2.0/ai/threads/update-message - an edited question moves to the end of the transcript", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `update-message` keeps the message id but stamps `createdAt` with the time
    // of the edit, and `read-messages` is ordered by `createdAt`. So editing the
    // question of an answered turn leaves the conversation reading
    //
    //   assistant "ONE"                      <- the answer
    //   user      "Reply with … TWO."        <- the question that produced it
    //
    // The question now sits after its own answer. "update-message - rewrites the
    // content in place" does not catch this: it reads the message back by id,
    // never looking at the order.
    //
    // The knock-on effect is what made this visible: with the question trailing,
    // `regenerate-stream` sees a thread whose last message is unanswered and
    // appends a second reply instead of replacing the first, so the button under
    // an answer stops replacing it for the rest of that conversation.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word ONE.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);

    // The premise: before the edit the transcript is in the only order that
    // makes sense, so the one below can only have come from the edit.
    expect(
      before.map((message) => message.role),
      "the question comes before its answer to begin with",
    ).toEqual(["user", "assistant"]);
    const question = AiAgentChat.userMessages(before)[0];

    const edited = await aiChat.updateMessage("owner", {
      messageId: question.id,
      message: {
        role: "user",
        content: [{ type: "text", text: "Reply with the single word TWO." }],
      },
    });
    expect(edited.status).toBe(200);

    const afterEdit = (await aiChat.readMessages("owner", threadId)).data;
    // The edit landed — otherwise an unchanged order below would prove nothing.
    expect(
      AiAgentChat.messageText(AiAgentChat.userMessages(afterEdit)[0]),
      "the edit was stored",
    ).toBe("Reply with the single word TWO.");
    expect(
      AiAgentChat.userMessages(afterEdit)[0].id,
      "and it is the same message, not a new one",
    ).toBe(question.id);

    test.fail();
    expect(
      afterEdit.map((message) => message.role),
      "an edit must not move the question after the answer it produced",
    ).toEqual(["user", "assistant"]);
  });
});

test.describe("AI Messages - regenerate someone else's reply", () => {
  test("BUG 82717: POST /api/2.0/ai/ai/regenerate-stream - a non-member is blocked in another user's thread, but with a 200 instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The regenerate half of BUG 82717 — the same wrong response contract the
    // send half has on someone else's thread (see chat.permission.spec.ts).
    // Access itself is fine: nothing is generated and the owner's reply is the
    // object it was, which the assertions below establish before the status is
    // looked at. What is wrong is that the refusal arrives as HTTP 200 with
    // `{"type":"error","message":"stream error"}` in the body — a status a client
    // reads as success and a message it cannot act on.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);
    const reply = AiAgentChat.assistantMessages(before)[0];
    const replyText = AiAgentChat.messageText(reply);

    // Created after all of the owner's setup: the shared context's session cookie
    // beats the bearer token, so an earlier member would run the setup as well.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await aiChat.expectActingAs("user", memberData.response!.id!, "User");

    const { status, streamError } = await aiChat.regenerateStream("user", {
      threadId,
      entityId: String(agentId),
      profileId,
    });

    await new Promise((resolve) => setTimeout(resolve, REGENERATE_SETTLE_MS));
    await apiSdk.authenticateOwner();

    // The side effect first: whatever the status says, the owner's answer has to
    // be the same object it was.
    const after = (await aiChat.readMessages("owner", threadId)).data;
    const replies = AiAgentChat.assistantMessages(after);
    expect(replies, "the owner's thread still holds one reply").toHaveLength(1);
    expect(replies[0].id, "and it is the same reply").toBe(reply.id);
    expect(AiAgentChat.messageText(replies[0])).toBe(replyText);

    // What the endpoint actually does today.
    expect(streamError).toBe("stream error");

    // What it should do: refuse the way every non-streaming route into someone
    // else's thread does (see "cross-user access to one message" above).
    test.fail();
    expect(status).toBe(403);
  });

  test("BUG 82717: POST /api/2.0/ai/ai/regenerate-stream - a member of the agent is blocked in another member's thread, but with a 200 instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Membership buys the agent, not other people's conversations — threads are
    // per user. Worth its own case because the entityId in the body IS a room the
    // caller belongs to, so a check that only looked at the entity would pass it.
    // The block holds; as above, only the way it is reported is wrong.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);
    const reply = AiAgentChat.assistantMessages(before)[0];
    const replyText = AiAgentChat.messageText(reply);

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);
    await aiChat.expectActingAs(
      "roomAdmin",
      memberData.response!.id!,
      "RoomAdmin",
    );

    const { status, streamError } = await aiChat.regenerateStream("roomAdmin", {
      threadId,
      entityId: String(agentId),
      profileId,
    });

    await new Promise((resolve) => setTimeout(resolve, REGENERATE_SETTLE_MS));
    await apiSdk.authenticateOwner();

    const after = (await aiChat.readMessages("owner", threadId)).data;
    const replies = AiAgentChat.assistantMessages(after);
    expect(replies).toHaveLength(1);
    expect(replies[0].id, "the owner's reply was not regenerated").toBe(
      reply.id,
    );
    expect(AiAgentChat.messageText(replies[0])).toBe(replyText);

    expect(streamError).toBe("stream error");

    test.fail();
    expect(status).toBe(403);
  });
});

test.describe("AI Messages - regenerate with AI Disabled", () => {
  test("BUG 82724: POST /api/2.0/ai/ai/regenerate-stream - the portal AI switch stops the regenerate, but reports it inside a 200", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // An enabled -> disabled transition rather than an end state: the regenerate
    // that worked before the flip is what makes the one after it mean something.
    //
    // The regenerate half of BUG 82724 (the send half is in
    // chat.ai-disabled.spec.ts). Inference really is stopped — nothing is
    // generated, which the assertions below establish first — the defect is that
    // the refusal comes back as HTTP 200 with an opaque "stream error" while
    // every non-streaming route answers a clean 403.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const enabled = await setPortalAiAccess(ownerApi, true);
    expect(enabled.writeStatus).toBe(200);
    expect(enabled.enabled).toBe(true);

    const { aiChat, profileId, agentId, threadId } = await setupThread(apiSdk);
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const before = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(before);
    const firstReply = AiAgentChat.assistantMessages(before)[0];

    const working = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });
    expect(working.status).toBe(200);
    expect(working.streamError).toBeUndefined();
    const regenerated = await waitForReplacedReply(
      aiChat,
      threadId,
      firstReply.id,
    );
    expectHealthyAssistantReply(regenerated);
    const survivor = AiAgentChat.assistantMessages(regenerated)[0];
    const survivorText = AiAgentChat.messageText(survivor);

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const refused = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });

    await new Promise((resolve) => setTimeout(resolve, REGENERATE_SETTLE_MS));

    // read-messages is 403 while the switch is off, so the thread is inspected
    // after turning AI back on — which doubles as the proof that the reply below
    // is readable at all.
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);

    const after = (await aiChat.readMessages("owner", threadId)).data;
    const replies = AiAgentChat.assistantMessages(after);
    expect(replies, "nothing was generated with AI off").toHaveLength(1);
    expect(replies[0].id).toBe(survivor.id);
    expect(AiAgentChat.messageText(replies[0])).toBe(survivorText);

    // What the endpoint actually does today.
    expect(refused.streamError).toBe("stream error");

    // 403 is what every neighbouring route answers with the switch off.
    test.fail();
    expect(refused.status).toBe(403);
  });
});

test.describe("AI Messages - the OpenAI-compatible stream", () => {
  test("POST /api/2.0/ai/ai/send-with-stream-openai - streams OpenAI chunks and terminates with [DONE]", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest OpenAI Stream Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    const { status, text } = await aiChat.sendWithStreamOpenAi("owner", {
      threadId,
      entityId: String(agentId),
      profileId: profile.id,
      userMessage: {
        role: "user",
        content: [{ type: "text", text: "Reply with the single word OK." }],
      },
    });

    expect(status).toBe(200);

    const {
      chunks,
      done,
      text: assembled,
    } = AiAgentChat.openAiStreamChunks(text);

    // Section 9.2, in the form this route supports it: several chunks, each tied
    // to one completion id and the model that produced it, a terminating
    // finish_reason, and a clean end-of-stream marker.
    expect(chunks.length).toBeGreaterThan(0);
    expect(done, "the stream ends with data: [DONE]").toBe(true);

    const ids = new Set(chunks.map((chunk) => chunk.id));
    expect(ids.size, "every chunk belongs to one completion").toBe(1);
    for (const chunk of chunks) {
      expect(chunk.object).toBe("chat.completion.chunk");
      expect(chunk.model).toBe(profile.modelId);
    }

    const finishReasons = chunks.flatMap((chunk) => {
      const choices = chunk.choices as Array<{ finish_reason?: string | null }>;
      return choices.map((choice) => choice.finish_reason);
    });
    expect(finishReasons, "the stream reports why it stopped").toContain(
      "stop",
    );

    // The text assembled from the chunks is a real answer, not an empty stream.
    expect(assembled.length).toBeGreaterThan(0);
  });
});

test.describe("AI Messages - one-shot inference", () => {
  test("BUG 82833: POST /api/2.0/ai/ai/send - the non-streaming path reaches the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Send Agent",
      profileId: profile.id,
    });

    // `send` resolves the model through the assignments, so Chat gets a binding
    // first — without one the route answers 500 (covered below).
    const { data: assigned } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: profile.id,
    });
    expect(assigned?.success).toBe(true);

    // The same gateway, the same profile, answering a streamed request normally —
    // so the failure below is this route, not the portal.
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest control thread",
      profileId: profile.id,
      agentId,
    });
    await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id,
      agentId,
      message: "Reply with the single word OK.",
    });
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    const { status, data } = await aiChat.send("owner", {
      actionType: "Chat",
      entityId: String(agentId),
      userMessage: {
        role: "user",
        content: [{ type: "text", text: "Reply with the single word OK." }],
      },
    });

    expect(status).toBe(200);

    // The reply used to be an empty assistant message carrying a gateway auth
    // failure, on a portal where the streamed control above answers normally.
    expect(data?.role).toBe("assistant");
    expect(
      data?.status?.error,
      "one-shot inference must not fail authentication when streaming succeeds",
    ).toBeUndefined();
    expect(JSON.stringify(data?.content), "the model's answer").toContain("OK");
  });

  test("BUG 82835: POST /api/2.0/ai/ai/send - an action type without its own binding resolves through Default", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Send Agent",
      profileId: profile.id,
    });

    // Vision has no binding of its own on a fresh portal, but the assignments API
    // resolves it perfectly well through Default — so a model *is* available.
    const resolved = await profiles.resolveForAction("owner", "Vision");
    expect(resolved.status).toBe(200);
    expect(
      resolved.data?.profileId,
      "Vision resolves through Default",
    ).toBeTruthy();

    const { status, data } = await aiChat.send("owner", {
      actionType: "Vision",
      entityId: String(agentId),
      userMessage: {
        role: "user",
        content: [{ type: "text", text: "Describe this." }],
      },
    });

    // `send` used to crash here: it only reached the model for an action type
    // with an explicit assignment, and reported the difference as a 500 rather
    // than as a "no model configured for this action" error.
    expect(
      status,
      "an action type that resolves through Default must not answer 500",
    ).toBe(200);
    expect(data?.status?.error).toBeUndefined();
  });

  test("BUG 82836: POST /api/2.0/ai/ai/send-custom - both forms reach the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const userMessage = {
      role: "user",
      content: [{ type: "text", text: "What is 2+2?" }],
    };

    // Both used to fail, each in its own way: isStream:false did not get as far
    // as the model at all — a plain 500 — and isStream:true was answered with an
    // empty assistant message carrying a gateway auth failure, on a portal where
    // send-with-stream works.
    const nonStreaming = await aiChat.sendCustom("owner", {
      isStream: false,
      systemPrompt: "Answer with a single word.",
      userMessage,
    });
    expect(nonStreaming.status).toBe(200);
    expect(nonStreaming.data?.role).toBe("assistant");
    expect(nonStreaming.data?.status?.error).toBeUndefined();
    expect(
      JSON.stringify(nonStreaming.data?.content),
      "the model's answer, unstreamed",
    ).toContain("4");

    const streaming = await aiChat.sendCustom("owner", {
      isStream: true,
      systemPrompt: "Answer with a single word.",
      userMessage,
    });
    expect(streaming.status).toBe(200);

    // NDJSON rather than one object: the message, then the closing envelope.
    const frames = AiAgentChat.sendCustomFrames(streaming.text);
    const last = frames[frames.length - 1];
    expect(last?.isEnd, "the stream closes").toBe(true);
    expect(
      last?.responseMessage?.status?.error,
      "send-custom must not fail authentication",
    ).toBeUndefined();
    expect(
      JSON.stringify(last?.responseMessage?.content),
      "the model's answer, streamed",
    ).toContain("4");
  });
});

// Copying a message.
//
// The clipboard itself is out of reach of an API test — `navigator.clipboard`
// belongs to the browser. What the API decides is what the client has to put
// into it: the copy button hands over the text of a message as the portal
// returns it, so "markdown goes into the clipboard" is a claim about
// `read-messages` / `get-message-by-id` handing back the reply's own markdown
// rather than rendered HTML, escaped text or a flattened plain-text version.
//
// Three things are checkable from here, and together they are the whole of the
// requirement minus the clipboard call itself:
//
//   * the assistant's reply is stored and served as markdown;
//   * the text is the same whether it is copied straight off the stream or
//     after the thread has been reopened — otherwise "copy" means two different
//     things depending on when it is pressed;
//   * the user's own message comes back exactly as it was typed, edits
//     included.
//
// Note what is NOT expected to survive: raw HTML in a reply is stripped on the
// way out (see the stored-injection test in agents.permission.spec.ts), so the
// payload below stays clear of angle brackets — a sanitiser doing its job must
// not read as a markdown regression.

const MARKDOWN_INSTRUCTIONS =
  "You are a formatting assistant. Whatever the user writes, your entire " +
  "reply must be the block below, reproduced verbatim. Never add commentary, " +
  "and never wrap the whole block in an extra code fence:\n" +
  MARKDOWN_ANSWER;

/** The model complied closely enough for the markdown to be observable. */
function reproducesMarkdown(reply: string): boolean {
  return (
    reply.includes(`# ${COPY_MARKER}`) &&
    reply.includes("**BOLDWORD**") &&
    reply.includes("```")
  );
}

test.describe("AI Messages - copying a message", () => {
  test("GET /api/2.0/ai/threads/read-messages - the assistant reply is served as raw markdown", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Copy Agent",
      profileId,
    });

    // The model declines to echo a block verbatim often enough that a single
    // attempt would turn "it refused" into "the markdown was mangled". Fresh
    // thread per attempt, so a half-copied reply is never read back.
    let reply = "";
    for (
      let attempt = 0;
      attempt < 5 && !reproducesMarkdown(reply);
      attempt++
    ) {
      const threadId = await aiChat.createThreadId("owner", {
        title: `Autotest copy thread ${attempt}`,
        profileId,
        agentId,
      });

      const sent = await aiChat.sendMessage("owner", {
        threadId,
        profileId,
        agentId,
        message: "Hi there!",
        instructions: MARKDOWN_INSTRUCTIONS,
      });
      expect(sent.status).toBe(200);
      expect(sent.streamError).toBeUndefined();

      const messages = await aiChat.waitForAssistantReply("owner", threadId);
      expectHealthyAssistantReply(messages);
      reply = AiAgentChat.assistantText(messages);
    }

    // Precondition, not the assertion: without the block there is nothing to
    // say about how it was stored.
    expect(
      reply,
      "the model declined to emit the markdown block in every attempt",
    ).toContain(`# ${COPY_MARKER}`);

    // Every construct arrives with its syntax intact — this is what the copy
    // button puts on the clipboard.
    for (const construct of [
      "**BOLDWORD**",
      "*ITALICWORD*",
      "- LISTONE",
      "- LISTTWO",
      "```js",
      "const answer = 42;",
      "| CELLA | CELLB |",
      "| --- |",
    ]) {
      expect(
        reply,
        `the markdown construct ${JSON.stringify(construct)} did not survive`,
      ).toContain(construct);
    }

    // ...and it is still markdown: not rendered to HTML on the way out, and not
    // escaped either. Pasting `&lt;` or `\*\*` into a document is the same
    // defect as pasting `<strong>`.
    for (const rendered of [
      "<h1",
      "<strong",
      "<em>",
      "<ul",
      "<li",
      "<table",
      "<pre",
      "<code",
    ]) {
      expect(
        reply,
        `the reply arrived rendered as HTML: ${rendered}`,
      ).not.toContain(rendered);
    }
    for (const escaped of [
      "&lt;",
      "&gt;",
      "&amp;",
      "&#",
      "\\*",
      "\\#",
      "\\|",
    ]) {
      expect(
        reply,
        `the reply arrived escaped: ${JSON.stringify(escaped)}`,
      ).not.toContain(escaped);
    }
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the streamed text and the stored text are the same copy", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Copying a reply the moment it finishes streaming and copying it after the
    // thread is reopened have to produce one text. The client can only take it
    // from two places — the last stream frame it assembled, or `read-messages`
    // — and if the portal post-processes the reply on its way into storage the
    // two diverge, silently and only for whoever copied early.
    //
    // The same holds for the question: the stream echoes it back in
    // `user-message-stored`, and that echo is what a client displays until it
    // reloads.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Copy Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest copy thread",
      profileId,
      agentId,
    });

    // Markdown in both directions, so the comparison is not made on a plain
    // one-liner that no formatting step could disturb.
    const question = "Format check: **bold**, _under_, `code`, 🙂 — dash.";

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: question,
      instructions: MARKDOWN_INSTRUCTIONS,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const streamed = AiAgentChat.streamedText(sent.text);
    expect(streamed.length, "the stream carried a reply").toBeGreaterThan(0);

    const echoed = sent.frames.find(
      (frame) => frame.type === "user-message-stored",
    );
    expect(echoed, "the stream echoes the question back").toBeDefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    const storedReply = AiAgentChat.messageText(
      AiAgentChat.assistantMessages(messages)[0],
    );
    const storedQuestion = AiAgentChat.messageText(
      AiAgentChat.userMessages(messages)[0],
    );

    // Trimmed: a trailing newline is a difference no user could perceive in a
    // paste, and pinning it would make the test about whitespace instead of
    // about the two surfaces agreeing.
    expect(
      storedReply.trim(),
      "the reply copied off the stream differs from the reply copied after a reload",
    ).toBe(streamed.trim());

    expect(AiAgentChat.frameText(echoed!)).toBe(question);
    expect(storedQuestion, "the question is stored as it was typed").toBe(
      question,
    );
  });

  test("POST /api/2.0/ai/threads/append-user-message - the user's own message comes back exactly as typed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // "Your own message can be copied too" — so what comes back has to be what
    // was typed, character for character, on both routes a client reads it
    // from, and after an edit as well. No inference here: the text is the whole
    // subject, and the model has no business touching it.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, threadId } = await setupThread(apiSdk);

    // Markdown, an emoji, a fenced block, and the two trailing spaces that
    // markdown reads as a hard line break — the one piece of formatting a
    // careless trim destroys without leaving a trace.
    const own = [
      "# My note",
      "",
      "**BOLDWORD**, _under_, `code`, 2 * 3 = 6",
      "",
      "- item one",
      "- item two 🙂",
      "",
      "```sql",
      "select 1;",
      "```",
      "",
      "hard break follows  ",
      "last line",
    ].join("\n");

    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: own,
    });
    expect(appended.status).toBe(200);
    const messageId = (appended.data?.messageId as { id?: string } | undefined)
      ?.id;
    expect(messageId, "append returns the stored message").toBeTruthy();

    const read = await aiChat.getMessageById("owner", messageId!);
    expect(read.status).toBe(200);
    expect(
      AiAgentChat.messageText(read.data!),
      "get-message-by-id changed the text the user typed",
    ).toBe(own);

    const history = await aiChat.readMessages("owner", threadId);
    expect(history.status).toBe(200);
    expect(history.data).toHaveLength(1);
    expect(
      AiAgentChat.messageText(history.data[0]),
      "read-messages changed the text the user typed",
    ).toBe(own);

    // An edited message is copied the same way, so the rewrite must not
    // normalise anything either.
    const edited = own.replace("# My note", "# My edited note ✅");
    const update = await aiChat.updateMessage("owner", {
      messageId: messageId!,
      message: { role: "user", content: [{ type: "text", text: edited }] },
    });
    expect(update.status).toBe(200);
    expect(update.data?.success).toBe(true);

    const afterEdit = await aiChat.getMessageById("owner", messageId!);
    expect(AiAgentChat.messageText(afterEdit.data!)).toBe(edited);

    const historyAfterEdit = await aiChat.readMessages("owner", threadId);
    expect(historyAfterEdit.data).toHaveLength(1);
    expect(AiAgentChat.messageText(historyAfterEdit.data[0])).toBe(edited);
  });
});

// How the answer is formatted.
//
// "The reply renders as markdown — headings, lists, tables, quotes, links
// (opened in a new tab). Code blocks carry syntax highlighting, the language
// name and a copy button; LaTeX is rendered, not shown as raw text."
//
// The rendering itself is the client's: there is no browser in this repo, so
// nothing here can say that a heading became an <h1>, that an anchor got
// target="_blank", that highlight.js coloured a keyword, that the copy button
// exists, or that KaTeX drew a fraction. Those belong in DocSpace-e2e-tests.
//
// What IS ours is everything the renderer depends on — and it is the half that
// fails silently, because every defect in it comes back as HTTP 200:
//
//   * the text is delivered as markdown SOURCE. Pre-rendered HTML, escaped
//     entities (`&amp;`, `&lt;`) or escaped markdown (`\*`, `\|`) all arrive as
//     a 200 and turn the rendered answer into visible syntax or into a wrong
//     link target.
//   * nothing normalises it on the way in or out. LaTeX is the extreme case: a
//     formula is mostly backslashes, so a single escaping or unescaping step
//     turns `\frac` into `frac` and `\\` into `\` — the formula silently stops
//     being a formula and no status code moves.
//   * a fenced block's info-string survives, because that string IS the
//     language name the UI shows and the lexer it highlights with.
//   * the text a code block contains survives. A sanitiser that strips markup
//     from a reply does not know where a fence begins, so `List<int>` and
//     `a < b && c > d` are the payload that finds it.
//   * the stream and the stored copy agree, and the stream only ever grows —
//     a snapshot that rewrites an earlier one makes a progressive renderer
//     flicker on half-arrived tables and fences.
//
// Split into three blocks, on purpose:
//
//   1. the write path — `append-user-message` / `update-message`, no model
//      involved, so every case is deterministic and a red is never "the model
//      declined";
//   2. the reply — the model has to be coerced into emitting the block, so the
//      helper retries in fresh threads and asserts the precondition first;
//   3. the .docx export, which is the one surface that must NOT keep the
//      syntax — the exporter parses the markdown instead of transcribing it.
//
// What the blocks above already cover, and this does not repeat: "AI Messages -
// copying a message" (h1, bold, italic, unordered list, table, ```js fence;
// stream == stored; a user message round-tripping verbatim) and the export test
// "a markdown answer keeps all of its content in the document". The permission
// and AI-switch matrices of these routes live in `messages.permission.spec.ts`
// and `messages.ai-disabled.spec.ts` — rendering fidelity has no role dimension
// of its own.

// --------------------------------------------------------------- 1. write path

/**
 * Stores `payload` as a user message and reads it back everywhere a client
 * reads it from — by id, from the history, and again after an edit.
 *
 * `fragments` are checked before the byte-identity assertion: they name the
 * construct that broke, which a whole-block string diff does not.
 */
async function expectStoredVerbatim(
  apiSdk: ApiSDK,
  payload: string,
  fragments: string[],
) {
  const { aiChat, profileId, threadId } = await setupThread(apiSdk);

  const appended = await aiChat.appendUserMessage("owner", {
    threadId,
    profileId,
    text: payload,
  });
  expect(appended.status).toBe(200);
  const messageId = (appended.data?.messageId as { id?: string } | undefined)
    ?.id;
  expect(messageId, "append returns the stored message").toBeTruthy();

  const read = await aiChat.getMessageById("owner", messageId!);
  expect(read.status).toBe(200);
  const stored = AiAgentChat.messageText(read.data!);

  for (const fragment of fragments) {
    expect(
      stored,
      `get-message-by-id did not return ${JSON.stringify(fragment)} as it was sent`,
    ).toContain(fragment);
  }
  expect(stored, "get-message-by-id changed the text").toBe(payload);

  const history = await aiChat.readMessages("owner", threadId);
  expect(history.status).toBe(200);
  expect(history.data).toHaveLength(1);
  expect(
    AiAgentChat.messageText(history.data[0]),
    "read-messages changed the text",
  ).toBe(payload);

  // The edit path is a second write, and it is the one a "normalise before
  // saving" step would plausibly live on.
  const edited = `${payload}\n\nEDITEDTAIL`;
  const update = await aiChat.updateMessage("owner", {
    messageId: messageId!,
    message: { role: "user", content: [{ type: "text", text: edited }] },
  });
  expect(update.status).toBe(200);
  expect(update.data?.success).toBe(true);

  const afterEdit = await aiChat.getMessageById("owner", messageId!);
  expect(
    AiAgentChat.messageText(afterEdit.data!),
    "update-message changed the text",
  ).toBe(edited);
}

const WRITE_PATH_CASES: Array<{
  name: string;
  payload: string;
  fragments: string[];
}> = [
  {
    name: "headings, inline styles and a horizontal rule",
    payload: [
      "# HEADONE",
      "## HEADTWO",
      "### HEADTHREE",
      "#### HEADFOUR",
      "##### HEADFIVE",
      "###### HEADSIX",
      "",
      "**BOLDWORD**, *ITALICWORD*, ***BOTHWORD***, ~~STRUCKWORD~~, `INLINEWORD`",
      "",
      "---",
      "",
      "Setext heading",
      "==============",
    ].join("\n"),
    fragments: [
      "###### HEADSIX",
      "***BOTHWORD***",
      "~~STRUCKWORD~~",
      "`INLINEWORD`",
      "==============",
    ],
  },
  {
    name: "ordered, nested and task lists",
    payload: [
      "1. ORDEREDONE",
      "2. ORDEREDTWO",
      "10. ORDEREDTEN",
      "",
      "- OUTERONE",
      "  - NESTEDONE",
      "    - DEEPONE",
      "* STARITEM",
      "+ PLUSITEM",
      "",
      "- [ ] TASKOPEN",
      "- [x] TASKDONE",
      "",
      "Term",
      ": definition-ish line",
    ].join("\n"),
    fragments: [
      "10. ORDEREDTEN",
      "    - DEEPONE",
      "* STARITEM",
      "+ PLUSITEM",
      "- [ ] TASKOPEN",
      "- [x] TASKDONE",
    ],
  },
  {
    name: "blockquotes, including a nested one and a quoted list",
    payload: [
      "> QUOTEONE",
      "> QUOTETWO",
      ">",
      "> > NESTEDQUOTE",
      ">",
      "> - QUOTEDITEM",
      ">",
      "> ```js",
      "> const inQuote = true;",
      "> ```",
      "",
      "plain line after the quote",
    ].join("\n"),
    fragments: ["> > NESTEDQUOTE", "> - QUOTEDITEM", "> ```js"],
  },
  {
    name: "tables, including alignment markers and escaped pipes",
    payload: [
      "| LEFTCELL | CENTERCELL | RIGHTCELL |",
      "| :--- | :---: | ---: |",
      "| 1 | 2 | 3 |",
      "| `a \\| b` | **BOLDCELL** | [LINKCELL](https://example.invalid/t) |",
      "",
      "| single |",
      "| --- |",
    ].join("\n"),
    fragments: [
      "| :--- | :---: | ---: |",
      "`a \\| b`",
      "[LINKCELL](https://example.invalid/t)",
    ],
  },
  {
    name: "fenced code blocks and every spelling of a language tag",
    payload: [
      "```js",
      "const answer = 42;",
      "```",
      "",
      "```python",
      "print('hi')",
      "```",
      "",
      "```csharp",
      "var x = 1;",
      "```",
      "",
      "```c++",
      "int main() { return 0; }",
      "```",
      "",
      "```Dockerfile",
      "FROM alpine",
      "```",
      "",
      "```foobarlang",
      "unknown-lexer line",
      "```",
      "",
      '```js title="app.js" {1,3}',
      "const withInfoString = true;",
      "```",
      "",
      "```",
      "no language tag at all",
      "```",
      "",
      "~~~sql",
      "select 1;",
      "~~~",
      "",
      "````markdown",
      "```js",
      "a fence inside a fence",
      "```",
      "````",
      "",
      "    four-space indented block",
    ].join("\n"),
    fragments: [
      "```js",
      "```python",
      "```csharp",
      "```c++",
      "```Dockerfile",
      "```foobarlang",
      '```js title="app.js" {1,3}',
      "~~~sql",
      "````markdown",
      "    four-space indented block",
    ],
  },
  {
    name: "code containing HTML, comparison operators and entity-like text",
    payload: [
      "```csharp",
      "var items = new List<int>();",
      "if (a < b && c > d) { items.Add(1); }",
      "```",
      "",
      "```html",
      "<div class=\"wrapper\" data-x='1'>",
      "  <p>PARAWORD &amp; more</p>",
      "</div>",
      "```",
      "",
      "Inline: `a < b`, `x && y`, `&lt;not-an-entity&gt;`, `<b>tags</b>`",
    ].join("\n"),
    fragments: [
      "new List<int>();",
      "if (a < b && c > d)",
      "<div class=\"wrapper\" data-x='1'>",
      "<p>PARAWORD &amp; more</p>",
      "`&lt;not-an-entity&gt;`",
      "`<b>tags</b>`",
    ],
  },
  {
    name: "links in every form, with the query strings and encodings intact",
    payload: [
      "[PLAINLINK](https://example.invalid/page)",
      "[QUERYLINK](https://example.invalid/search?a=1&b=2&utm_source=x)",
      "[ANCHORLINK](https://example.invalid/doc#section-2)",
      "[TITLEDLINK](https://example.invalid/t 'A title')",
      "[UNICODELINK](https://example.invalid/search-🙂?q=%D1%82%D0%B5%D1%81%D1%82%20file)",
      "[PARENLINK](<https://example.invalid/a(b)c>)",
      "[SPACELINK](<https://example.invalid/a b c>)",
      "[MAILLINK](mailto:someone@example.invalid)",
      "[RELATIVELINK](/rooms/shared/filter?folder=12)",
      "",
      "<https://example.invalid/autolink>",
      "<someone@example.invalid>",
      "https://example.invalid/bare-url?x=1&y=2",
      "",
      "[REFLINK][ref] and ![IMAGEALT](https://example.invalid/i.png 'Img')",
      "",
      "[ref]: https://example.invalid/reference-target",
    ].join("\n"),
    fragments: [
      "https://example.invalid/search?a=1&b=2&utm_source=x",
      "https://example.invalid/doc#section-2",
      "https://example.invalid/search-🙂?q=%D1%82%D0%B5%D1%81%D1%82%20file",
      "[PARENLINK](<https://example.invalid/a(b)c>)",
      "<https://example.invalid/autolink>",
      "https://example.invalid/bare-url?x=1&y=2",
      "[ref]: https://example.invalid/reference-target",
    ],
  },
  {
    name: "LaTeX in every delimiter, with the backslashes intact",
    payload: [
      "Inline: $E = mc^2$, and \\(\\alpha + \\beta \\ne \\gamma\\).",
      "",
      "$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
      "",
      "\\[",
      "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
      "\\]",
      "",
      "$$",
      "\\begin{pmatrix}",
      "1 & 2 \\\\",
      "3 & 4",
      "\\end{pmatrix}",
      "$$",
      "",
      "Escapes a renderer needs: \\%, \\_, \\{, \\}, \\&, \\$100, \\\\ and \\textbackslash",
    ].join("\n"),
    fragments: [
      "$E = mc^2$",
      "\\(\\alpha + \\beta \\ne \\gamma\\)",
      "$$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
      "\\int_0^\\infty e^{-x^2}\\,dx",
      "\\begin{pmatrix}",
      "1 & 2 \\\\",
      "\\%, \\_, \\{, \\}, \\&, \\$100, \\\\ and \\textbackslash",
    ],
  },
];

test.describe("AI Messages - markdown on the write path", () => {
  for (const { name, payload, fragments } of WRITE_PATH_CASES) {
    test(`POST /api/2.0/ai/threads/append-user-message, GET get-message-by-id, PUT update-message - ${name} survive verbatim`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      await expectStoredVerbatim(apiSdk, payload, fragments);
    });
  }

  test("POST /api/2.0/ai/threads/append-user-message - a link with an active scheme is stored exactly as it was typed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Separate from the link case above, because the claim is different. This
    // one is not "fidelity is good": it records that the API neither strips nor
    // neutralises an active-scheme href, so the renderer is the only thing
    // between the text and a click.
    //
    // Note what this deliberately does NOT assert: it is not an XSS finding.
    // A JSON string field has no HTML parsing context, so `javascript:` in a
    // response body proves only what was delivered. Whether the anchor ends up
    // clickable — and whether it opens in a new tab with rel="noopener" —
    // is a browser assertion and belongs in DocSpace-e2e-tests. If a future
    // build starts sanitising these on the way in, this test goes red and the
    // decision is a product one, not a bug by itself.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const payload = [
      "[SCRIPTLINK](javascript:alert(1))",
      "[DATALINK](data:text/plain;base64,SEVMTE8=)",
      "[VBLINK](vbscript:msgbox(1))",
      "[FILELINK](file:///etc/passwd)",
      "[CASELINK](JaVaScRiPt:alert(2))",
    ].join("\n");

    await expectStoredVerbatim(apiSdk, payload, [
      "javascript:alert(1)",
      "data:text/plain;base64,SEVMTE8=",
      "JaVaScRiPt:alert(2)",
    ]);
  });
});

// -------------------------------------------------------------------- 2. reply

function echoInstructions(block: string) {
  return (
    "You are a formatting assistant. Whatever the user writes, your entire " +
    "reply must be the block below, reproduced verbatim, character for " +
    "character. Never add commentary, never correct or normalise anything, " +
    "and never wrap the whole block in an extra code fence:\n" +
    block
  );
}

/**
 * Gets the model to emit `block` and returns the reply.
 *
 * A fresh thread per attempt: a half-copied reply must never be read back as
 * mangled formatting. `markers` are the precondition — asserted here, once,
 * with a message that separates "the model refused" from "the portal broke the
 * markdown", which is the only way a red in the caller means anything.
 */
async function replyReproducing(
  apiSdk: ApiSDK,
  options: {
    agentTitle: string;
    block: string;
    markers: string[];
    attempts?: number;
  },
) {
  const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = AiProfiles.byCapabilities(
    await profiles.catalogue("owner"),
    AI_CAPS.textVisionTools,
  ).id;
  const agentId = await aiChat.createAgentId("owner", {
    title: options.agentTitle,
    profileId,
  });

  const instructions = echoInstructions(options.block);
  const reproduced = (text: string) =>
    options.markers.every((marker) => text.includes(marker));

  let reply = "";
  let sent: Awaited<ReturnType<AiAgentChat["sendMessage"]>> | undefined;
  let threadId = "";

  for (
    let attempt = 0;
    attempt < (options.attempts ?? 5) && !reproduced(reply);
    attempt++
  ) {
    threadId = await aiChat.createThreadId("owner", {
      title: `Autotest render thread ${attempt}`,
      profileId,
      agentId,
    });

    sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Hi there!",
      instructions,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);
    reply = AiAgentChat.assistantText(messages);
  }

  for (const marker of options.markers) {
    expect(
      reply,
      `the model declined to emit ${JSON.stringify(marker)} in every attempt — nothing can be concluded about how it was stored`,
    ).toContain(marker);
  }

  return { aiChat, profileId, agentId, threadId, reply, sent: sent! };
}

/** Rendered-HTML tells: none of these may appear in a markdown reply. */
const HTML_TELLS = [
  "<h1",
  "<h2",
  "<h3",
  "<strong",
  "<em>",
  "<ol",
  "<ul",
  "<li",
  "<table",
  "<thead",
  "<pre",
  "<code",
  "<blockquote",
  "<hr",
  "<a href",
  "<p>",
];

/** Escaping tells: pasting `&amp;` or `\|` is the same defect as pasting `<b>`. */
const ESCAPE_TELLS = [
  "&lt;",
  "&gt;",
  "&amp;",
  "&quot;",
  "&#",
  "\\*",
  "\\#",
  "\\|",
  "\\_",
];

const RENDER_BLOCK = [
  "## RENDERCHECK",
  "",
  "**BOLDWORD**, *ITALICWORD*, `INLINEWORD`, ~~STRUCKWORD~~",
  "",
  "### RENDERSUB",
  "",
  "1. ORDEREDONE",
  "2. ORDEREDTWO",
  "",
  "- OUTERONE",
  "  - NESTEDONE",
  "",
  "> QUOTEWORD",
  "",
  "[LINKWORD](https://example.invalid/docs?a=1&b=2#frag)",
  "",
  "| CELLA | CELLB |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "```python",
  'print("CODEWORD")',
  "```",
  "",
  "---",
].join("\n");

test.describe("AI Messages - markdown of a reply", () => {
  test("GET /api/2.0/ai/threads/read-messages - a reply keeps every markdown construct as source", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The constructs the requirement names, on the one surface that is not
    // under the client's control: what `read-messages` hands back. The existing
    // "served as raw markdown" test covers h1/bold/italic/bullet/table/```js —
    // this adds the ones it does not: h2 and h3, an ordered list, a nested
    // item, a blockquote, a link with a query string, inline code,
    // strikethrough, a horizontal rule and a non-js language tag.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { reply } = await replyReproducing(apiSdk, {
      agentTitle: "Autotest Render Agent",
      block: RENDER_BLOCK,
      markers: ["## RENDERCHECK", "> QUOTEWORD", "```python"],
    });

    for (const construct of [
      "## RENDERCHECK",
      "### RENDERSUB",
      "**BOLDWORD**",
      "*ITALICWORD*",
      "`INLINEWORD`",
      "~~STRUCKWORD~~",
      "1. ORDEREDONE",
      "2. ORDEREDTWO",
      "- OUTERONE",
      "  - NESTEDONE",
      "> QUOTEWORD",
      // The whole href, `&` included: an entity-escaped query string is a link
      // that goes somewhere else.
      "[LINKWORD](https://example.invalid/docs?a=1&b=2#frag)",
      "| CELLA | CELLB |",
      "| --- |",
      "```python",
      'print("CODEWORD")',
      "---",
    ]) {
      expect(
        reply,
        `the markdown construct ${JSON.stringify(construct)} did not survive`,
      ).toContain(construct);
    }

    for (const tell of HTML_TELLS) {
      expect(
        reply,
        `the reply arrived rendered as HTML: ${tell}`,
      ).not.toContain(tell);
    }
    for (const tell of ESCAPE_TELLS) {
      expect(
        reply,
        `the reply arrived escaped: ${JSON.stringify(tell)}`,
      ).not.toContain(tell);
    }
  });

  test("GET /api/2.0/ai/threads/read-messages - a reply keeps LaTeX delimiters and backslashes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The highest-risk construct in the requirement and the one with no
    // coverage at all. A formula is delimiters plus backslashes, and both are
    // exactly what a JSON round-trip, a markdown escaper or an over-eager
    // unescaper eat: `\frac` loses its backslash and becomes the word "frac",
    // `\\` collapses to `\` and a matrix loses its rows, `$$` collapses to `$`
    // and display math turns inline. Every one of those is a 200 with a
    // reply that simply never renders.
    //
    // Kept short on purpose: the fewer characters the model has to copy
    // exactly, the less often the retry loop ends on a refusal.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const block = [
      "LATEXCHECK",
      "",
      "Inline: $E = mc^2$ and \\(\\alpha + \\beta\\).",
      "",
      "$$\\frac{NUMERWORD}{DENOMWORD} = \\sqrt{GAMMAWORD}$$",
      "",
      "\\[ \\int_0^1 x^2\\,dx = \\frac{1}{3} \\]",
    ].join("\n");

    const { reply } = await replyReproducing(apiSdk, {
      agentTitle: "Autotest LaTeX Agent",
      block,
      markers: ["LATEXCHECK", "$$"],
    });

    for (const construct of [
      "$E = mc^2$",
      "\\(\\alpha + \\beta\\)",
      "$$\\frac{NUMERWORD}{DENOMWORD} = \\sqrt{GAMMAWORD}$$",
      "\\[",
      "\\int_0^1 x^2\\,dx",
      "\\frac{1}{3}",
    ]) {
      expect(
        reply,
        `the LaTeX fragment ${JSON.stringify(construct)} did not survive`,
      ).toContain(construct);
    }

    // Display math needs both dollars: `$$` collapsed to `$` renders the
    // formula inline, or not at all.
    expect(
      (reply.match(/\$\$/g) ?? []).length,
      "the display-math delimiters were not delivered in pairs",
    ).toBeGreaterThanOrEqual(2);

    // ...and nothing doubled or escaped the backslashes on the way through.
    for (const mangled of [
      "\\\\frac", // \\frac — a doubled backslash
      "\\\\alpha",
      "\\\\(",
      "\\$", // an escaped dollar is no longer a delimiter
      "&#36;",
      "&bsol;",
      "\\\\[",
    ]) {
      expect(
        reply,
        `the LaTeX arrived mangled: ${JSON.stringify(mangled)}`,
      ).not.toContain(mangled);
    }

    // And it is LaTeX source, not something already turned into markup.
    for (const tell of ["<span", "katex", "MathJax", "<math", "&lt;"]) {
      expect(reply, `the formula arrived pre-rendered: ${tell}`).not.toContain(
        tell,
      );
    }
  });

  test("GET /api/2.0/ai/threads/read-messages - a code block keeps HTML and comparison operators", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The requirement promises syntax highlighting for code, and real code is
    // full of `<`, `>` and `&`. A reply is passed through something that strips
    // raw markup — see the stored-HTML tests in agents.security.spec.ts — and
    // that step has no idea where a fence begins, so a C#/HTML snippet is where
    // it would show up as silently wrong code in the block.
    //
    // Asserts the correct outcome: the code survives. If this is red on a live
    // portal, it is a bug to file, not a contract to pin — do not "fix" it by
    // asserting the mangled form.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const block = [
      "CODECHECK",
      "",
      "```csharp",
      "var items = new List<int>();",
      "if (a < b && c > d) { items.Add(1); }",
      "```",
    ].join("\n");

    const { reply } = await replyReproducing(apiSdk, {
      agentTitle: "Autotest Code Agent",
      block,
      markers: ["CODECHECK", "```csharp"],
    });

    for (const construct of [
      "```csharp",
      "new List<int>();",
      "if (a < b && c > d)",
      "items.Add(1);",
    ]) {
      expect(
        reply,
        `the code fragment ${JSON.stringify(construct)} did not survive the reply path`,
      ).toContain(construct);
    }

    for (const tell of ["&lt;", "&gt;", "&amp;", "&#"]) {
      expect(
        reply,
        `the code inside the fence arrived entity-escaped: ${tell}`,
      ).not.toContain(tell);
    }
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the streamed snapshots only ever grow and end on the stored text", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // A client renders while the reply arrives, and the protocol hands it
    // cumulative snapshots rather than pieces. So the requirement's "renders as
    // markdown" has a timing half: every snapshot must extend the previous one.
    // A snapshot that rewrites what was already shown makes a half-arrived
    // table or fence flicker or collapse mid-render, and the final text alone —
    // which is all the existing stream/stored comparison looks at — cannot see
    // it.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, threadId, sent, reply } = await replyReproducing(apiSdk, {
      agentTitle: "Autotest Stream Agent",
      block: RENDER_BLOCK,
      markers: ["## RENDERCHECK", "```python"],
    });

    const snapshots = AiAgentChat.deltaTexts(sent.text);
    expect(
      snapshots.length,
      "the reply arrived in more than one frame, so there is a sequence to check",
    ).toBeGreaterThan(1);

    for (let i = 1; i < snapshots.length; i++) {
      expect(
        snapshots[i].startsWith(snapshots[i - 1]),
        `frame ${i} does not extend frame ${i - 1}: a client would have to re-render text it had already shown`,
      ).toBe(true);
    }

    // The last snapshot is what a client holds when the stream closes, and the
    // thread is what it holds after a reload — same reply, same markdown.
    const streamed = AiAgentChat.streamedText(sent.text);
    expect(streamed).toBe(snapshots[snapshots.length - 1]);

    const messages = await aiChat.readMessages("owner", threadId);
    const stored = AiAgentChat.messageText(
      AiAgentChat.assistantMessages(messages.data)[0],
    );
    expect(
      stored.trim(),
      "the markdown shown while streaming differs from the markdown stored",
    ).toBe(streamed.trim());
    expect(stored.trim()).toBe(reply.trim());
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - a regenerated reply is markdown too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Regenerate is a second inference path, and it stores over the reply the
    // first one produced. Any post-processing that lives on only one of the two
    // would leave "Try again" giving a differently formatted answer than the
    // original — worth one test, since the whole block above measures
    // send-with-stream only.
    //
    // The instructions have to be re-sent: the backend does not pull an agent's
    // stored AI Instructions into a turn by itself, and a regenerate is a turn.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { aiChat, profileId, agentId, threadId } = await replyReproducing(
      apiSdk,
      {
        agentTitle: "Autotest Regenerate Markdown Agent",
        block: RENDER_BLOCK,
        markers: ["## RENDERCHECK"],
      },
    );

    const instructions = echoInstructions(RENDER_BLOCK);
    let regenerated = "";

    for (
      let attempt = 0;
      attempt < 3 && !regenerated.includes("```python");
      attempt++
    ) {
      const { status, streamError } = await aiChat.regenerateStream("owner", {
        threadId,
        entityId: String(agentId),
        profileId,
        actionArgs: { prompt: { mode: "replace", text: instructions } },
      });
      expect(status).toBe(200);
      expect(streamError).toBeUndefined();

      const messages = await aiChat.readMessages("owner", threadId);
      expectHealthyAssistantReply(messages.data);
      regenerated = AiAgentChat.assistantText(messages.data);
    }

    expect(
      regenerated,
      "the model declined to emit the block on every regenerate — nothing can be concluded",
    ).toContain("```python");

    for (const construct of [
      "## RENDERCHECK",
      "**BOLDWORD**",
      "> QUOTEWORD",
      "[LINKWORD](https://example.invalid/docs?a=1&b=2#frag)",
      "| CELLA | CELLB |",
      "```python",
    ]) {
      expect(
        regenerated,
        `the regenerated reply lost ${JSON.stringify(construct)}`,
      ).toContain(construct);
    }

    for (const tell of HTML_TELLS) {
      expect(
        regenerated,
        `the regenerated reply arrived rendered as HTML: ${tell}`,
      ).not.toContain(tell);
    }
    for (const tell of ESCAPE_TELLS) {
      expect(
        regenerated,
        `the regenerated reply arrived escaped: ${JSON.stringify(tell)}`,
      ).not.toContain(tell);
    }
  });
});

// ------------------------------------------------------------------- 3. export

// The mirror image of the two blocks above: everywhere else the markdown has to
// survive as source, and here it has to be *read*. Deliberately no gateway and
// no conversation — the payload is fixed, so the only variable is the exporter.

test.describe("AI Messages - markdown in the .docx export", () => {
  test("POST /api/2.0/ai/text-to-docx - quotes, ordered and nested lists and links are rendered, not transcribed", async ({
    apiSdk,
  }) => {
    // The existing export test covers a heading, bold, italic, a bullet list, a
    // fence and a table. These are the constructs it leaves out, and the ones
    // most likely to be dropped whole: an exporter that does not know
    // blockquotes tends to lose the quoted paragraph rather than print it.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const content = [
      "## EXPORTHEAD",
      "",
      "> QUOTEWORD",
      "",
      "1. ORDEREDONE",
      "2. ORDEREDTWO",
      "",
      "- OUTERONE",
      "  - NESTEDONE",
      "",
      "[LINKWORD](https://example.invalid/target?a=1&b=2)",
      "",
      "`INLINEWORD` and ~~STRUCKWORD~~",
    ].join("\n");

    const title = `Exported render ${apiSdk.faker.generateString(8)}`;
    const { data, status } = await aiSettings.textToDocx("owner", {
      title,
      content,
      folderId,
    });
    expect(status).toBe(202);
    expect(data?.success).toBe(true);

    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(exported, `no "${title}.docx" in My Documents`).toBeDefined();

    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);

    for (const fragment of [
      "EXPORTHEAD",
      "QUOTEWORD",
      "ORDEREDONE",
      "ORDEREDTWO",
      "OUTERONE",
      "NESTEDONE",
      "LINKWORD",
      "INLINEWORD",
      "STRUCKWORD",
    ]) {
      expect(text, `"${fragment}" is missing from the document`).toContain(
        fragment,
      );
    }

    // Top to bottom, the way it was written.
    expect(text.indexOf("EXPORTHEAD")).toBeLessThan(text.indexOf("QUOTEWORD"));
    expect(text.indexOf("QUOTEWORD")).toBeLessThan(text.indexOf("ORDEREDONE"));
    expect(text.indexOf("ORDEREDONE")).toBeLessThan(text.indexOf("NESTEDONE"));
    expect(text.indexOf("NESTEDONE")).toBeLessThan(text.indexOf("LINKWORD"));

    // The markdown was parsed, not printed: no reader should be looking at the
    // quote marker, the bullet, the backticks, the tildes or — worst of the
    // set — the raw `](url)` of a link.
    for (const syntax of [
      "## EXPORTHEAD",
      "> QUOTEWORD",
      "- OUTERONE",
      "`INLINEWORD`",
      "~~STRUCKWORD~~",
      "](",
    ]) {
      expect(
        text,
        `the document shows the markdown source: ${JSON.stringify(syntax)}`,
      ).not.toContain(syntax);
    }
  });

  test("BUG 83038: POST /api/2.0/ai/text-to-docx - a formula is written into the document as raw TeX", async ({
    apiSdk,
  }) => {
    // The exporter renders every other markdown construct — headings, bold,
    // lists, quotes, tables, links, fences — and stops at math. Measured
    // 2026-08-11, `$$\frac{A}{B} = \sqrt{C}$$` lands in the document as the
    // literal line `\frac{A}{B} = \sqrt{C}`: not typeset, and without even the
    // `$$` that marked it as a formula, so the reader cannot recognise it and
    // nobody can paste it back into the chat to see it rendered. The chat
    // renders that same formula, so "save this answer" silently downgrades it.
    //
    // Asserts the correct outcome — the document must not show TeX source — so
    // this goes red while the bug is open and reports an unexpected pass once
    // the exporter typesets the formula.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const content = [
      "# MATHEXPORT",
      "",
      "Inline math: $NUMERWORD^2$ inside a sentence.",
      "",
      "$$\\frac{NUMERWORD}{DENOMWORD} = \\sqrt{GAMMAWORD}$$",
      "",
      "TAILWORD closes the answer.",
    ].join("\n");

    const title = `Exported math ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content,
      folderId,
    });
    expect(status).toBe(202);

    const exported = await waitForExportedFile(
      ownerApi,
      folderId,
      `${title}.docx`,
    );
    expect(exported, `no "${title}.docx" in My Documents`).toBeDefined();

    const text = await readExportedDocxText(apiSdk, "owner", exported!.id);
    // Logged before anything can fail: this is the evidence the bug report
    // needs, and it is also what tells a red "the formula is still TeX" apart
    // from a red "the export broke".
    console.log(`exported math document:\n${text}`);

    // The green half of the claim, asserted before test.fail() so a regression
    // here cannot hide inside the expected failure: the operands do reach the
    // reader, and the prose around the formula keeps its place. The defect is
    // the form they arrive in, not a data loss.
    for (const fragment of [
      "MATHEXPORT",
      "NUMERWORD",
      "DENOMWORD",
      "GAMMAWORD",
      "TAILWORD",
    ]) {
      expect(
        text,
        `"${fragment}" is missing from the document — the exporter dropped the formula outright`,
      ).toContain(fragment);
    }
    expect(text.indexOf("MATHEXPORT")).toBeLessThan(text.indexOf("NUMERWORD"));
    expect(text.indexOf("NUMERWORD")).toBeLessThan(text.indexOf("TAILWORD"));

    // Everything below this line is the buggy claim, and it is what makes the
    // test red today — the assertions above it must all be green, or a real
    // regression would hide inside the expected failure.
    test.fail();

    // A reader of a .docx is not reading markdown, so a rendered formula shows
    // no TeX commands and no delimiters. `extractDocxText` strips the OOXML
    // tags, so a typeset formula still leaves its operands in the text checked
    // above — only the source vanishes. `\frac{` is what fails today; `$$` is
    // here so that merely putting the delimiters back, without typesetting,
    // does not read as a fix.
    for (const source of [
      "\\frac{",
      "\\sqrt{",
      "\\frac{NUMERWORD}{DENOMWORD}",
      "$$",
    ]) {
      expect(
        text,
        `the document shows the TeX source instead of a formula: ${JSON.stringify(source)}`,
      ).not.toContain(source);
    }
  });
});
