import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/files/share", () => {
  test.fail(
    "BUG XXXX: POST /api/2.0/files/share - Guest should not see groups field in getSecurityInfo response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
          members: [ownerId, userId],
        },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Sharing Room",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Sharing File.docx" },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await guestApi.sharing.getSecurityInfo({
        baseBatchRequestDto: {
          fileIds: [fileId as unknown as object],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();

      for (const entry of data.response ?? []) {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        expect(sharedToUser?.["groups"]).toBeUndefined();
      }
    },
  );
});
