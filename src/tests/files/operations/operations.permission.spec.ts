import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /files/fileops/copy - Permissions", () => {
  test("BUG 65580: PUT /files/fileops/copy - User cannot copy a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myFolderData } = await userApi.folders.getMyFolder({});
    const destFolderId = (myFolderData as any).response?.current?.id;

    const { data, status } = await userApi.operations.copyBatchItems({
      batchRequestDto: {
        folderIds: [roomId],
        destFolderId,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });
});

test.describe("PUT /files/fileops/move - Permissions", () => {
  test("BUG 65580: PUT /files/fileops/move - User cannot move a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myFolderData } = await userApi.folders.getMyFolder({});
    const destFolderId = (myFolderData as any).response?.current?.id;

    const { data, status } = await userApi.operations.moveBatchItems({
      batchRequestDto: {
        folderIds: [roomId],
        destFolderId,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });
});
