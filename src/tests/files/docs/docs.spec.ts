import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

// DocsApi: convertFile (POST /api/2.0/docs/converter) saves a converted copy
// as a brand-new file, distinct from copyas/saveaspdf in
// src/tests/files/conversion/ (those convert while copying/saving under a
// different route). runBuilderScript (POST /api/2.0/docs/builder) queues a
// document-builder script run.
//
// Gotcha confirmed live: the SDK doc's own example script -
// `builder.OpenFile(1234)` - is misleading. The real validator
// (DocumentBuilderScriptRunner.CheckScript, confirmed by reading the backend
// source on a release branch - this class isn't in the public master
// branch) requires the file id as a QUOTED STRING:
// `builder.OpenFile("1234")`. An unquoted numeric literal is rejected with
// 400 before anything runs. Likewise `SaveFile`'s first argument is the
// output format (e.g. "docx"), not a file handle, and its second argument is
// the key that must match an entry in the request's `outputs` map.

test.describe("POST /api/2.0/docs/converter - Convert a file", () => {
  test("Owner converts a docx file to pdf", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Converter Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Convert Me.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.docs.convertFile({
      convertFileRequestDto: { fileId, outputtype: "pdf" },
    });

    expect(status).toBe(200);
    expect(data.response?.fileExst).toBe(".pdf");
    expect(data.response?.title).toBe("Convert Me.pdf");
    expect(data.response?.id).not.toBe(fileId);
  });

  test("Owner is refused with 400 for an empty outputtype", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Converter Empty Type Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "No Output Type.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.docs.convertFile({
      convertFileRequestDto: { fileId, outputtype: "" },
    });

    expect(status).toBe(400);
  });

  test("Owner is refused with 400 for a format the source cannot become", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Converter Bad Type Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Bad Output Type.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.docs.convertFile({
      convertFileRequestDto: { fileId, outputtype: "notarealformat" },
    });

    expect(status).toBe(400);
  });

  test("Owner gets 404 for a file that doesn't exist", async ({ apiSdk }) => {
    const { status } = await apiSdk.forRole("owner").docs.convertFile({
      convertFileRequestDto: { fileId: 999999999, outputtype: "pdf" },
    });

    expect(status).toBe(404);
  });
});

test.describe("POST /api/2.0/docs/builder - Run a document builder script", () => {
  test("Owner runs a script that opens a file and saves a new one from it", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Builder Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Builder Source.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.docs.runBuilderScript({
      runBuilderScriptRequestDto: {
        script: `builder.OpenFile("${fileId}");\nbuilder.SaveFile("docx", "result.docx");\nbuilder.CloseFile();`,
        outputs: { "result.docx": { folderId: roomId } },
      },
    });
    expect(status).toBe(200);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.error).toBeFalsy();
    expect(operation.files?.[0].title).toBe("result.docx");
  });

  test("Owner is refused with 400 when a script names a file with an unquoted (bare numeric) id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Builder Bad Syntax Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Bad Syntax Source.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.docs.runBuilderScript({
      runBuilderScriptRequestDto: {
        script: `builder.OpenFile(${fileId});\nbuilder.CloseFile();`,
      },
    });

    expect(status).toBe(400);
  });

  test("Owner is refused with 400 for an empty script", async ({ apiSdk }) => {
    const { status } = await apiSdk.forRole("owner").docs.runBuilderScript({
      runBuilderScriptRequestDto: { script: "" },
    });

    expect(status).toBe(400);
  });

  test("Owner's second call while the first is still running is refused with 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Builder Concurrent Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Concurrent Source.docx" },
    });
    const fileId = fileData.response!.id!;
    const runBody = {
      script: `builder.OpenFile("${fileId}");\nbuilder.SaveFile("docx", "result.docx");\nbuilder.CloseFile();`,
      outputs: { "result.docx": { folderId: roomId } },
    };

    const first = await ownerApi.docs.runBuilderScript({
      runBuilderScriptRequestDto: runBody,
    });
    expect(first.status).toBe(200);

    const { status } = await ownerApi.docs.runBuilderScript({
      runBuilderScriptRequestDto: runBody,
    });
    expect(status).toBe(403);

    await waitForOperation(ownerApi.operations);
  });
});
