import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

// DocsApi: convertFile (POST /api/2.0/docs/converter) saves a converted copy
// as a brand-new file, distinct from copyas/saveaspdf in
// src/tests/files/conversion/ (those convert while copying/saving under a
// different route). runBuilderScript (POST /api/2.0/docs/builder) queues a
// document-builder script run.

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
