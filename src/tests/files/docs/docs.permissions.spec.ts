import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/docs/converter - access control", () => {
  test("User without access to the file is refused with 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Docs Converter No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "No Access.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.docs.convertFile({
      convertFileRequestDto: { fileId, outputtype: "pdf" },
    });

    expect(status).toBe(403);
  });

  test("Anonymous cannot convert a file", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().docs.convertFile({
      convertFileRequestDto: { fileId: 1, outputtype: "pdf" },
    });

    expect(status).toBe(401);
  });
});
