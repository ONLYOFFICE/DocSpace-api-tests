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
    let after = await aiChat.readMessages("owner", threadId);
    const deadline = Date.now() + 60000;
    while (
      Date.now() < deadline &&
      AiAgentChat.assistantMessages(after.data).some(
        (message) => message.id === firstReply.id,
      )
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      after = await aiChat.readMessages("owner", threadId);
    }

    // The old reply is replaced, not appended to: exactly one assistant message,
    // with a new id.
    const replies = AiAgentChat.assistantMessages(after.data);
    expect(replies).toHaveLength(1);
    expect(replies[0].id).not.toBe(firstReply.id);
    expect(replies[0].id).toBe(streamedId);
    expectHealthyAssistantReply(after.data);

    // The user message survives untouched — section 9.4.
    const questions = AiAgentChat.userMessages(after.data);
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
