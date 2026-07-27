import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  RoomType,
  type FileEntryBaseDto,
  type NewItemsDtoFileEntryBaseDto,
  type RoomNewItemsDto,
  type NewItemsDtoRoomNewItemsDto,
} from "@onlyoffice/docspace-api-sdk";
import { createPrivateRoom } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

// --- Single-room shape: GET /files/rooms/:id/news (getNewRoomItems) ---
// response: NewItemsDtoFileEntryBaseDto[]  (grouped by date)
//   .items: FileEntryBaseDto[]            (the new file entries)

function flattenNewItems(
  groups: NewItemsDtoFileEntryBaseDto[] | null | undefined,
): FileEntryBaseDto[] {
  return (groups ?? []).flatMap((g) => g.items ?? []);
}

function titlesOf(
  groups: NewItemsDtoFileEntryBaseDto[] | null | undefined,
): (string | null | undefined)[] {
  return flattenNewItems(groups).map((e) => e.title);
}

// --- Aggregated shape: GET /files/rooms/news (getRoomsNewItems) ---
// response: NewItemsDtoRoomNewItemsDto[]  (grouped by date)
//   .items: RoomNewItemsDto[]            (grouped by room)
//     .room:  FileEntryBaseDto           (the room; has `title`, no `id`)
//     .items: FileEntryBaseDto[]         (the new file entries)

function roomGroupsOf(
  groups: NewItemsDtoRoomNewItemsDto[] | null | undefined,
): RoomNewItemsDto[] {
  return (groups ?? []).flatMap((g) => g.items ?? []);
}

function flattenRoomsNewItems(
  groups: NewItemsDtoRoomNewItemsDto[] | null | undefined,
): FileEntryBaseDto[] {
  return roomGroupsOf(groups).flatMap((r) => r.items ?? []);
}

function roomsNewTitlesOf(
  groups: NewItemsDtoRoomNewItemsDto[] | null | undefined,
): (string | null | undefined)[] {
  return flattenRoomsNewItems(groups).map((e) => e.title);
}

function roomTitlesOf(
  groups: NewItemsDtoRoomNewItemsDto[] | null | undefined,
): (string | null | undefined)[] {
  return roomGroupsOf(groups).map((r) => r.room?.title);
}

test.describe("GET /api/2.0/files/rooms/:id/news - Contract", () => {
  test("GET /files/rooms/:id/news - Owner gets 200 and empty array for an empty room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Empty Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(flattenNewItems(data.response)).toEqual([]);
  });

  test("GET /files/rooms/:id/news - Owner gets 200 and empty array for an empty private room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await createPrivateRoom(apiSdk, "owner", {
      title: "Autotest News Empty Private Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(flattenNewItems(data.response)).toEqual([]);
  });

  test("GET /files/rooms/:id/news - response items contain required fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Item Shape",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Shape File.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    for (const item of flattenNewItems(data.response)) {
      expect(item.title).toBeDefined();
      expect(item.title).not.toBe("");
      expect(item.fileEntryType).toBeDefined();
      expect(item.createdBy).toBeDefined();
      expect(item.updated).toBeDefined();
    }
  });

  test("GET /files/rooms/:id/news - non-existent roomId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.getNewRoomItems({
      id: 999999999,
    });

    expect(status).toBe(404);
  });

  test("GET /files/rooms/:id/news - roomId 0 returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.getNewRoomItems({ id: 0 });

    expect(status).toBe(404);
  });

  test("GET /files/rooms/:id/news - deleted room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Deleted Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.rooms.getNewRoomItems({ id: roomId });

    expect(status).toBe(404);
  });

  test("GET /files/rooms/:id/news - archived room returns 200 for owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("GET /api/2.0/files/rooms/:id/news - Core semantics", () => {
  test("GET /files/rooms/:id/news - File created by another user appears in news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News File By Other",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Other File.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(titlesOf(data.response)).toContain("Autotest News Other File.docx");
  });

  test("GET /files/rooms/:id/news - Own file does not appear in news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Own File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News My Own File.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(titlesOf(data.response)).not.toContain(
      "Autotest News My Own File.docx",
    );
  });

  test.fail(
    "BUG 81712: GET /files/rooms/:id/news - File created before visit does not appear in news",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest News Pre-Visit File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      // owner creates the file BEFORE user visits
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News Pre-Visit File.docx" },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data, status } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(titlesOf(data.response)).not.toContain(
        "Autotest News Pre-Visit File.docx",
      );
    },
  );

  test.fail(
    "BUG 81712: GET /files/rooms/:id/news - Re-opening room resets news to empty",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest News Re-Visit",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News Re-Visit File.docx" },
      });

      // user re-visits — should mark all new items as read
      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data, status } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(flattenNewItems(data.response)).toEqual([]);
    },
  );

  test.fail(
    "BUG 81713: GET /files/rooms/:id/news - File updated by another user appears in news",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest News Updated File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest News File Before Update.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      await ownerApi.files.updateFile({
        fileId,
        updateFile: { title: "Autotest News File After Update.docx" },
      });

      const { data, status } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(titlesOf(data.response)).toContain(
        "Autotest News File After Update.docx",
      );
    },
  );

  test.fail(
    "BUG 81713: GET /files/rooms/:id/news - Renamed file appears with the new title",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest News Renamed File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News Old Title.docx" },
      });
      const fileId = fileData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      await ownerApi.files.updateFile({
        fileId,
        updateFile: { title: "Autotest News New Title.docx" },
      });

      const { data, status } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });

      expect(status).toBe(200);
      const titles = titlesOf(data.response);
      expect(titles).toContain("Autotest News New Title.docx");
      expect(titles).not.toContain("Autotest News Old Title.docx");
    },
  );

  test("GET /files/rooms/:id/news - Subfolder created by another user does not appear in news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Subfolder Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest News Subfolder By Owner" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(titlesOf(data.response)).not.toContain(
      "Autotest News Subfolder By Owner",
    );
  });

  test("GET /files/rooms/:id/news - File inside a subfolder appears in news (recursive)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Recursive File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    const { data: subfolderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest News Subfolder For File" },
    });
    const subfolderId = subfolderData.response!.id!;

    await ownerApi.files.createFile({
      folderId: subfolderId,
      createFileJsonElement: { title: "Autotest News File In Subfolder.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(titlesOf(data.response)).toContain(
      "Autotest News File In Subfolder.docx",
    );
  });

  test("GET /files/rooms/:id/news - Multiple new files all appear in news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Multiple Files",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Multi File 1.docx" },
    });
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Multi File 2.docx" },
    });
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Multi File 3.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    const titles = titlesOf(data.response);
    expect(titles).toContain("Autotest News Multi File 1.docx");
    expect(titles).toContain("Autotest News Multi File 2.docx");
    expect(titles).toContain("Autotest News Multi File 3.docx");
  });

  test("GET /files/rooms/:id/news - Mixed old and new files - only new appear", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Mixed Old New",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    // file A created BEFORE user visit
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Old File A.docx" },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    // file B created AFTER user visit
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News New File B.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    const titles = titlesOf(data.response);
    expect(titles).toContain("Autotest News New File B.docx");
    expect(titles).not.toContain("Autotest News Old File A.docx");
  });

  test("GET /files/rooms/:id/news - Mixed own and others files - only others appear", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Mixed Own Others",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Mixed Own File.docx" },
    });
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Mixed Other File.docx" },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    const titles = titlesOf(data.response);
    expect(titles).toContain("Autotest News Mixed Other File.docx");
    expect(titles).not.toContain("Autotest News Mixed Own File.docx");
  });

  test("GET /files/rooms/:id/news - Deleted new file is not returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Deleted File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Will Be Deleted.docx" },
    });
    const fileId = fileData.response!.id!;

    // Wait until the "new" badge is actually written for the invited user
    // before deleting — otherwise the delete cleanup may race ahead of the
    // async badge creation, leaving an orphan badge that never clears.
    await expect
      .poll(
        async () => {
          const { data, status } = await userApi.rooms.getNewRoomItems({
            id: roomId,
          });
          expect(status).toBe(200);
          return titlesOf(data.response);
        },
        { timeout: 10_000, intervals: [500, 1000, 2000] },
      )
      .toContain("Autotest News Will Be Deleted.docx");

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    await expect
      .poll(
        async () => {
          const { data, status } = await userApi.rooms.getNewRoomItems({
            id: roomId,
          });
          expect(status).toBe(200);
          return titlesOf(data.response);
        },
        { timeout: 10_000, intervals: [500, 1000, 2000] },
      )
      .not.toContain("Autotest News Will Be Deleted.docx");
  });
});

test.describe("GET /api/2.0/files/rooms/:id/news - Cross-check with folder endpoint", () => {
  test("Both endpoints return empty for an empty room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Cross Empty",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const roomResult = await ownerApi.rooms.getNewRoomItems({ id: roomId });
    const folderResult = await ownerApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(roomResult.status).toBe(200);
    expect(folderResult.status).toBe(200);
    expect(flattenNewItems(roomResult.data.response)).toEqual([]);
    expect(folderResult.data.response).toEqual([]);
  });

  test("Room and folder news endpoints return the same items for the same roomId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest News Cross Parity",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News Cross File.docx" },
    });

    const roomResult = await userApi.rooms.getNewRoomItems({ id: roomId });
    const folderResult = await userApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(roomResult.status).toBe(200);
    expect(folderResult.status).toBe(200);

    const roomTitles = titlesOf(roomResult.data.response);
    const folderTitles = (folderResult.data.response ?? []).map((e) => e.title);

    // BUG candidate: /files/rooms/{id}/news must return the same new items
    // as /files/{folderId}/news for the same room id — both endpoints should be consistent.
    expect(folderTitles).toContain("Autotest News Cross File.docx");
    expect(roomTitles).toContain("Autotest News Cross File.docx");
  });
});

test.describe("GET /api/2.0/files/rooms/news - Contract", () => {
  test("GET /files/rooms/news - Owner with only own content gets 200 and no new items", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Empty",
        roomType: RoomType.CustomRoom,
      },
    });

    const { data, status } = await ownerApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(flattenRoomsNewItems(data.response)).toEqual([]);
  });

  test("GET /files/rooms/news - response items contain required fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Shape",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Rooms News Shape File.docx" },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    for (const group of roomGroupsOf(data.response)) {
      expect(group.room?.title).toBeDefined();
      for (const item of group.items ?? []) {
        expect(item.title).toBeDefined();
        expect(item.title).not.toBe("");
        expect(item.fileEntryType).toBeDefined();
        expect(item.createdBy).toBeDefined();
        expect(item.updated).toBeDefined();
      }
    }
  });
});

test.describe("GET /api/2.0/files/rooms/news - Core semantics", () => {
  test("GET /files/rooms/news - File created by another user is returned as new", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News File By Other",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Rooms News Other File.docx",
      },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(roomsNewTitlesOf(data.response)).toContain(
      "Autotest Rooms News Other File.docx",
    );
  });

  test("GET /files/rooms/news - Own created file is not returned as new", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Own File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Rooms News My Own File.docx" },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(roomsNewTitlesOf(data.response)).not.toContain(
      "Autotest Rooms News My Own File.docx",
    );
  });

  test("GET /files/rooms/news - Subfolder created by another user is not returned as new", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Subfolder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Rooms News Subfolder By Owner" },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(roomsNewTitlesOf(data.response)).not.toContain(
      "Autotest Rooms News Subfolder By Owner",
    );
  });

  test("GET /files/rooms/news - File inside a subfolder is returned as new (recursive)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Recursive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    const { data: subfolderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Rooms News Subfolder For File" },
    });
    const subfolderId = subfolderData.response!.id!;

    await ownerApi.files.createFile({
      folderId: subfolderId,
      createFileJsonElement: {
        title: "Autotest Rooms News File In Subfolder.docx",
      },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(roomsNewTitlesOf(data.response)).toContain(
      "Autotest Rooms News File In Subfolder.docx",
    );
  });

  test("GET /files/rooms/news - Multiple new files from the same room all appear", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Multiple Files",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Rooms News Multi File 1.docx" },
    });
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Rooms News Multi File 2.docx" },
    });
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Rooms News Multi File 3.docx" },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    const titles = roomsNewTitlesOf(data.response);
    expect(titles).toContain("Autotest Rooms News Multi File 1.docx");
    expect(titles).toContain("Autotest Rooms News Multi File 2.docx");
    expect(titles).toContain("Autotest Rooms News Multi File 3.docx");
  });

  test("GET /files/rooms/news - Mixed own and others files - only others appear", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Mixed Own Others",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Rooms News Mixed Own File.docx",
      },
    });
    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Rooms News Mixed Other File.docx",
      },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    const titles = roomsNewTitlesOf(data.response);
    expect(titles).toContain("Autotest Rooms News Mixed Other File.docx");
    expect(titles).not.toContain("Autotest Rooms News Mixed Own File.docx");
  });

  test("GET /files/rooms/news - Deleted new file is not returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Deleted File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Rooms News Will Be Deleted.docx",
      },
    });
    const fileId = fileData.response!.id!;

    // Wait until the "new" badge is actually written for the invited user
    // before deleting — otherwise the delete cleanup may race ahead of the
    // async badge creation, leaving an orphan badge that never clears.
    await expect
      .poll(
        async () => {
          const { data, status } = await userApi.rooms.getRoomsNewItems();
          expect(status).toBe(200);
          return roomsNewTitlesOf(data.response);
        },
        { timeout: 10_000, intervals: [500, 1000, 2000] },
      )
      .toContain("Autotest Rooms News Will Be Deleted.docx");

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    await expect
      .poll(
        async () => {
          const { data, status } = await userApi.rooms.getRoomsNewItems();
          expect(status).toBe(200);
          return roomsNewTitlesOf(data.response);
        },
        { timeout: 10_000, intervals: [500, 1000, 2000] },
      )
      .not.toContain("Autotest Rooms News Will Be Deleted.docx");
  });
});

test.describe("GET /api/2.0/files/rooms/news - Aggregation across rooms", () => {
  test("GET /files/rooms/news - Returns new items from multiple rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomAData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Aggregate Room A",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomAId = roomAData.response!.id!;

    const { data: roomBData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Aggregate Room B",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomBId = roomBData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    for (const roomId of [roomAId, roomBId]) {
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await userApi.rooms.getRoomInfo({ id: roomId });
    }

    await ownerApi.files.createFile({
      folderId: roomAId,
      createFileJsonElement: {
        title: "Autotest Rooms News Aggregate File A.docx",
      },
    });
    await ownerApi.files.createFile({
      folderId: roomBId,
      createFileJsonElement: {
        title: "Autotest Rooms News Aggregate File B.docx",
      },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);

    const titles = roomsNewTitlesOf(data.response);
    expect(titles).toContain("Autotest Rooms News Aggregate File A.docx");
    expect(titles).toContain("Autotest Rooms News Aggregate File B.docx");

    const roomTitles = roomTitlesOf(data.response);
    expect(roomTitles).toContain("Autotest Rooms News Aggregate Room A");
    expect(roomTitles).toContain("Autotest Rooms News Aggregate Room B");
  });

  test("GET /files/rooms/news - Does not return items from rooms unavailable to the user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomAData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Visible Room A",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomAId = roomAData.response!.id!;

    const { data: roomBData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Hidden Room B",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomBId = roomBData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    // user is invited to room A only
    await ownerApi.rooms.setRoomSecurity({
      id: roomAId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });
    await userApi.rooms.getRoomInfo({ id: roomAId });

    await ownerApi.files.createFile({
      folderId: roomAId,
      createFileJsonElement: {
        title: "Autotest Rooms News Visible File.docx",
      },
    });
    await ownerApi.files.createFile({
      folderId: roomBId,
      createFileJsonElement: {
        title: "Autotest Rooms News Hidden File.docx",
      },
    });

    const { data, status } = await userApi.rooms.getRoomsNewItems();

    expect(status).toBe(200);

    const titles = roomsNewTitlesOf(data.response);
    expect(titles).toContain("Autotest Rooms News Visible File.docx");
    expect(titles).not.toContain("Autotest Rooms News Hidden File.docx");

    expect(roomTitlesOf(data.response)).not.toContain(
      "Autotest Rooms News Hidden Room B",
    );
  });
});

test.describe("GET /api/2.0/files/rooms/news - Cross-check with room endpoint", () => {
  test("GET /files/rooms/news - Includes the same new item as GET /files/rooms/:id/news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms News Cross Parity",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.rooms.getRoomInfo({ id: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Rooms News Cross File.docx" },
    });

    const roomsResult = await userApi.rooms.getRoomsNewItems();
    const singleResult = await userApi.rooms.getNewRoomItems({ id: roomId });

    expect(roomsResult.status).toBe(200);
    expect(singleResult.status).toBe(200);

    expect(titlesOf(singleResult.data.response)).toContain(
      "Autotest Rooms News Cross File.docx",
    );
    expect(roomsNewTitlesOf(roomsResult.data.response)).toContain(
      "Autotest Rooms News Cross File.docx",
    );
  });
});

test.describe("GET /api/2.0/files/rooms/news - Access control", () => {
  test("GET /files/rooms/news - Anonymous request returns 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.rooms.getRoomsNewItems();

    expect(status).toBe(401);
  });
});
