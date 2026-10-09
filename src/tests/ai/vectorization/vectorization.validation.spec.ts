import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  createKnowledgeFile,
  waitForVectorization,
} from "@/src/helpers/ai-vectorization";
import { ApiSDK } from "@/src/services/api-sdk";
import { uploadFileViaSession } from "@/src/helpers/upload-file";
import { RoomType, VectorizationStatus } from "@onlyoffice/docspace-api-sdk";
import type { AiVectorizationStartTaskRequest } from "@onlyoffice/docspace-api-sdk";

// POST /ai/vectorization/tasks — what the happy-path file leaves out: the shape
// of the acknowledgement, several files and repeats in one request, the body
// validation and the ids the route will not accept. Measured 2026-10-09.
//
// What the route is, as measured:
//   * the answer is an acknowledgement, not a job: `{count:0, status:0,
//     statusCode:200, links:[{href, action:"POST"}]}`. There is no task id, so
//     nothing can be polled — which is why every "it is indexed" claim below is
//     made on the FILE's `vectorizationStatus`, never on this response;
//   * only files in an agent's Knowledge folder are indexable. A file anywhere
//     else — My Documents, a subfolder, a room — answers 403 even to its owner,
//     and Knowledge itself refuses to hold an unsupported format (an image or an
//     archive is a 403 on upload), so "start a task for an unsupported file" has
//     no reachable shape;
//   * the body is `{files: number[]}`; a bad shape is a 400, an id that does not
//     resolve to a file is a 404 for the whole request.
// DocSpace also vectorizes a Knowledge file by itself the moment it arrives, so
// a task on a fresh file cannot be told apart from that — see
// helpers/ai-vectorization.ts.

const startTask = (
  api: ReturnType<ApiSDK["forRole"]>,
  // Bodies are deliberately wrong, so they go through the SDK method with a cast
  // instead of around it.
  body: unknown,
) =>
  api.vectorization.aiVectorizationStartTask({
    aiVectorizationStartTaskRequest: body as AiVectorizationStartTaskRequest,
  });

const SUPPORTED_FORMATS: Array<[string, string, string]> = [
  ["txt", "text/plain", "Plain text for the index. ".repeat(20)],
  ["md", "text/markdown", `# Heading\n${"Markdown body. ".repeat(20)}`],
  ["csv", "text/csv", "name,value\nalpha,1\nbeta,2\n"],
  ["json", "application/json", '{"key":"value"}'],
  ["empty txt", "text/plain", ""],
];

test.describe("Vectorization - startTask request and response", () => {
  test("POST /api/2.0/ai/vectorization/tasks - the answer acknowledges the request and carries no task to wait for", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);
    const fileId = await createKnowledgeFile(
      ownerApi,
      knowledgeFolderId,
      "Autotest Ack File.docx",
    );

    const { data, status } = await startTask(ownerApi, { files: [fileId] });

    expect(status).toBe(200);
    expect(data.statusCode, "the internal service's own status").toBe(200);
    expect(data.status).toBe(0);
    expect(data.count, "no queued-task count is reported").toBe(0);
    expect(data.links).toEqual([
      {
        href: expect.stringMatching(/\/internal\/ai\/vectorization\/tasks$/),
        action: "POST",
      },
    ]);

    // Nothing in the answer is a handle: no id, no task, no result payload. This
    // is the documented contract ("nothing to poll"), pinned so that a build that
    // starts returning one is noticed and the polling story can change.
    expect(Object.keys(data).sort()).toEqual([
      "count",
      "links",
      "status",
      "statusCode",
    ]);
  });

  test("POST /api/2.0/ai/vectorization/tasks - several files, repeats and duplicates in one request are accepted and every file ends up indexed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);

    const files: number[] = [];
    for (const index of [1, 2, 3]) {
      files.push(
        await createKnowledgeFile(
          ownerApi,
          knowledgeFolderId,
          `Autotest Batch File ${index}.docx`,
        ),
      );
    }

    // One request for all three.
    const batch = await startTask(ownerApi, { files });
    expect(batch.status, JSON.stringify(batch.data)).toBe(200);

    // The same request again: a file that is already indexed is not an error.
    const again = await startTask(ownerApi, { files });
    expect(again.status).toBe(200);

    // The same id twice in one request, mixed with another.
    const duplicates = await startTask(ownerApi, {
      files: [files[0], files[0], files[1]],
    });
    expect(duplicates.status).toBe(200);

    // And one request per file, one after the other.
    for (const fileId of files) {
      const single = await startTask(ownerApi, { files: [fileId] });
      expect(single.status, `file ${fileId}`).toBe(200);
    }

    // The end state is on the files, not in any of those answers: all three are
    // indexed and none was left failed by the repeats.
    for (const fileId of files) {
      expect(
        await waitForVectorization(ownerApi, fileId),
        `file ${fileId}`,
      ).toBe(VectorizationStatus.Completed);
    }
  });

  test("POST /api/2.0/ai/vectorization/tasks - every format a Knowledge folder accepts can be submitted, and one it refuses never gets that far", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);

    for (const [label, mimeType, body] of SUPPORTED_FORMATS) {
      const name = `autotest-format.${label === "empty txt" ? "txt" : label}`;
      const upload = await uploadFileViaSession(
        apiSdk,
        "owner",
        knowledgeFolderId,
        Buffer.from(body, "utf-8"),
        name,
        mimeType,
      );
      const fileId = (upload.data as { response?: { id?: number } }).response
        ?.id;
      expect(upload.status, `uploading ${label}`).toBe(201);
      expect(fileId, `${label} was stored`).toBeTruthy();

      const { status } = await startTask(ownerApi, { files: [fileId!] });
      expect(status, `starting a task for ${label}`).toBe(200);
      expect(
        await waitForVectorization(ownerApi, fileId!),
        `${label} ends up indexed`,
      ).toBe(VectorizationStatus.Completed);
    }

    // The unsupported side: the folder refuses the file itself, so there is no
    // id to submit. Pinned because it is the reason this route has no
    // "unsupported format" case.
    for (const [name, mimeType, body] of [
      ["autotest-format.png", "image/png", "not really a png"],
      ["autotest-format.zip", "application/zip", "PK"],
    ] as const) {
      const upload = await uploadFileViaSession(
        apiSdk,
        "owner",
        knowledgeFolderId,
        Buffer.from(body, "utf-8"),
        name,
        mimeType,
      );
      expect(upload.status, `${name} cannot enter Knowledge`).toBe(403);
    }
  });
});

test.describe("Vectorization - startTask input validation", () => {
  test("POST /api/2.0/ai/vectorization/tasks - a body without a list of numeric file ids is a 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);
    const fileId = await createKnowledgeFile(
      ownerApi,
      knowledgeFolderId,
      "Autotest Control File.docx",
    );

    // The control: the same route with a good body is accepted, so every 400
    // below is about the body and not about the route or the portal state.
    expect((await startTask(ownerApi, { files: [fileId] })).status).toBe(200);

    const refused: Array<[string, unknown]> = [
      ["an empty list", { files: [] }],
      ["no list", {}],
      ["files: null", { files: null }],
      ["a string instead of a list", { files: String(fileId) }],
      ["an object instead of a list", { files: {} }],
      ["null in the list", { files: [null] }],
      ["an empty object in the list", { files: [{}] }],
      ["a non-numeric id", { files: ["abc"] }],
      ["a fractional id", { files: [1.5] }],
      ["an id beyond the integer range", { files: [1e20] }],
      ["a valid id next to a null", { files: [fileId, null] }],
    ];

    for (const [label, body] of refused) {
      const { status, data } = await startTask(ownerApi, body);
      expect(status, `${label}: ${JSON.stringify(data)}`).toBe(400);
      expect(data, label).toEqual({ error: "Bad Request" });
    }
  });

  test("POST /api/2.0/ai/vectorization/tasks - an id that is not a file is a 404 for the whole request", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);
    const fileId = await createKnowledgeFile(
      ownerApi,
      knowledgeFolderId,
      "Autotest Real File.docx",
    );

    expect(
      (await startTask(ownerApi, { files: [fileId] })).status,
      "the control: the real file is accepted on its own",
    ).toBe(200);

    const refused: Array<[string, number[]]> = [
      ["id 0", [0]],
      ["a negative id", [-1]],
      ["an id that does not exist", [999999999]],
      // A folder is not a file: the Knowledge folder's own id is a real entry.
      ["a folder id", [knowledgeFolderId]],
      // One bad id refuses the lot — the real file next to it is not accepted
      // on its own either.
      ["a real file next to one that does not exist", [fileId, 999999999]],
      ["a missing id first, a real file after", [999999999, fileId]],
    ];

    for (const [label, files] of refused) {
      const { status, data } = await startTask(ownerApi, { files });
      expect(status, `${label}: ${JSON.stringify(data)}`).toBe(404);
      expect(data, label).toEqual({ error: "Not Found" });
    }
  });

  test("POST /api/2.0/ai/vectorization/tasks - fields the route does not know are ignored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);
    const fileId = await createKnowledgeFile(
      ownerApi,
      knowledgeFolderId,
      "Autotest Extra Field File.docx",
    );

    // Not a validation failure: an unrecognised field is dropped. Pinned so a
    // build that starts reading one (a `force` flag, a provider override) is
    // noticed.
    const { status } = await startTask(ownerApi, {
      files: [fileId],
      provider: "ignored",
      force: true,
    });
    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/vectorization/tasks - a file outside an agent's Knowledge folder is refused with 403 even for its owner", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(apiSdk);

    // The control: a Knowledge file of the same owner is accepted, so the 403s
    // below are about WHERE the file is.
    const knowledgeFile = await createKnowledgeFile(
      ownerApi,
      knowledgeFolderId,
      "Autotest Knowledge Control.docx",
    );
    expect((await startTask(ownerApi, { files: [knowledgeFile] })).status).toBe(
      200,
    );

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const myId = myFolder.response!.current!.id!;
    const { data: sub } = await ownerApi.folders.createFolder({
      folderId: myId,
      createFolder: { title: "Autotest Vectorization Subfolder" },
    });
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Vectorization Room",
        roomType: RoomType.CustomRoom,
      },
    });

    const outside: Array<[string, number]> = [
      ["My Documents", myId],
      ["a subfolder of My Documents", sub.response!.id!],
      ["a Custom room", room.response!.id!],
    ];
    for (const [label, folderId] of outside) {
      const { data: created, status: createStatus } =
        await ownerApi.files.createFile({
          folderId,
          createFileJsonElement: { title: "Autotest Outside Knowledge.docx" },
        });
      expect(createStatus, `creating a file in ${label}`).toBe(200);
      const fileId = created.response!.id!;

      const { status, data } = await startTask(ownerApi, { files: [fileId] });
      expect(status, `${label}: ${JSON.stringify(data)}`).toBe(403);

      // And it did not become indexed: such a file never gets the field.
      const { data: info } = await ownerApi.files.getFileInfo({ fileId });
      expect(
        (info.response as { vectorizationStatus?: unknown })
          .vectorizationStatus,
        `${label}: the refused file is not indexed`,
      ).toBeUndefined();
    }
  });
});
