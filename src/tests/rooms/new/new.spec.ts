import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  RoomType,
  type FileEntryBaseDto,
  type NewItemsDtoFileEntryBaseDto,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(titlesOf(data.response)).not.toContain(
      "Autotest News Will Be Deleted.docx",
    );
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
