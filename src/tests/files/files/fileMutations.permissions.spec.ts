import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

type MemberType = "RoomAdmin" | "User" | "Guest";

// Documented in the SDK (updateFile, lockFile, deleteFile):
// - rename somebody else's file needs room-manager rights, a content creator may
//   rename only their own file;
// - lock: room admin and content creator; editing and read access are not enough;
// - delete: room admin, and a content creator on their own file only.
// `null` access means the caller is not a member of the room.
const levels: Array<{
  label: string;
  type: MemberType;
  access: FileShare | null;
  manager: boolean;
  creator: boolean;
}> = [
  {
    label: "RoomManager",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
    manager: true,
    creator: true,
  },
  {
    label: "ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
    manager: false,
    creator: true,
  },
  {
    label: "Editing",
    type: "User",
    access: FileShare.Editing,
    manager: false,
    creator: false,
  },
  {
    label: "Read",
    type: "User",
    access: FileShare.Read,
    manager: false,
    creator: false,
  },
];

const matrix: Array<{
  roomLabel: string;
  roomType: RoomType;
  levels: string[];
}> = [
  {
    roomLabel: "Custom",
    roomType: RoomType.CustomRoom,
    levels: ["RoomManager", "ContentCreator", "Editing", "Read"],
  },
  {
    roomLabel: "Collaboration",
    roomType: RoomType.EditingRoom,
    levels: ["ContentCreator", "Editing", "Read"],
  },
  {
    roomLabel: "Public",
    roomType: RoomType.PublicRoom,
    levels: ["RoomManager", "ContentCreator"],
  },
  {
    roomLabel: "VDR",
    roomType: RoomType.VirtualDataRoom,
    levels: ["ContentCreator", "Editing", "Read"],
  },
];

async function ownerFile(apiSdk: ApiSDK, roomId: number, title: string) {
  const { data } = await apiSdk.forRole("owner").files.createHtmlFile({
    folderId: roomId,
    createTextOrHtmlFileRequest: { title, content: "<p>keep</p>" },
  });
  return (data.response as { id: number }).id;
}

async function state(apiSdk: ApiSDK, fileId: number) {
  const { data, status } = await apiSdk
    .forRole("owner")
    .files.getFileInfo({ fileId });
  return {
    status,
    title: data.response?.title,
    locked: data.response?.locked ?? false,
  };
}

test.describe("updateFile, lockFile and deleteFile - room type and access level matrix", () => {
  for (const room of matrix) {
    for (const level of levels.filter((l) => room.levels.includes(l.label))) {
      test(`${room.roomLabel} room - ${level.label} on somebody else's file: rename ${level.manager ? "allowed" : "denied"}, lock ${level.creator ? "allowed" : "denied"}, delete ${level.manager ? "allowed" : "denied"}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Mutations ${room.roomLabel}`,
            roomType: room.roomType,
          },
        });
        const roomId = roomData.response!.id!;
        const renameId = await ownerFile(apiSdk, roomId, "Rename me");
        const lockId = await ownerFile(apiSdk, roomId, "Lock me");
        const deleteId = await ownerFile(apiSdk, roomId, "Delete me");
        const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
          "owner",
          level.type,
        );
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [
              { id: memberData.response!.id!, access: level.access! },
            ],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);

        await test.step("updateFile (rename)", async () => {
          const { status } = await api.files.updateFile({
            fileId: renameId,
            updateFileRequest: { title: "Renamed by member" },
          });
          expect(status).toBe(level.manager ? 200 : 403);
          expect((await state(apiSdk, renameId)).title).toBe(
            level.manager ? "Renamed by member.html" : "Rename me.html",
          );
        });

        await test.step("lockFile", async () => {
          const { status } = await api.files.lockFile({
            fileId: lockId,
            lockFileRequest: { lockFile: true },
          });
          expect(status).toBe(level.creator ? 200 : 403);
          expect((await state(apiSdk, lockId)).locked).toBe(level.creator);
        });

        await test.step("deleteFile", async () => {
          const { status } = await api.files.deleteFile({
            fileId: deleteId,
            deleteFileRequest: { immediately: true },
          });
          expect(status).toBe(level.manager ? 200 : 403);
          if (level.manager) {
            await waitForOperation(api.operations);
            expect((await state(apiSdk, deleteId)).status).toBe(404);
          } else {
            expect((await state(apiSdk, deleteId)).status).toBe(200);
          }
        });
      });
    }
  }

  test("Custom room - ContentCreator renames, locks and deletes their own file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Mutations Own File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    const { data: created } = await api.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFileRequest: { title: "Mine", content: "<p>mine</p>" },
    });
    const fileId = (created.response as { id: number }).id;

    const { status: renameStatus } = await api.files.updateFile({
      fileId,
      updateFileRequest: { title: "Mine renamed" },
    });
    expect(renameStatus).toBe(200);
    expect((await state(apiSdk, fileId)).title).toBe("Mine renamed.html");

    const { status: lockStatus } = await api.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: true },
    });
    expect(lockStatus).toBe(200);
    expect((await state(apiSdk, fileId)).locked).toBe(true);
    await api.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: false },
    });

    const { status: deleteStatus } = await api.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });
    expect(deleteStatus).toBe(200);
    await waitForOperation(api.operations);
    expect((await state(apiSdk, fileId)).status).toBe(404);
  });

  // Documented: the lock "blocks editing, renaming and deleting for everybody but
  // the account that set it and the room admins".
  async function lockedByOwner(apiSdk: ApiSDK) {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Mutations Lock Enforcement",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    const { data: created } = await api.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFileRequest: { title: "Locked", content: "<p>x</p>" },
    });
    const fileId = (created.response as { id: number }).id;
    const { status: lockStatus } = await ownerApi.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: true },
    });
    expect(lockStatus).toBe(200);
    return { api, fileId };
  }

  test("Custom room - A lock set by the owner blocks a ContentCreator from deleting", async ({
    apiSdk,
  }) => {
    const { api, fileId } = await lockedByOwner(apiSdk);

    const { status } = await api.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });

    expect(status).toBe(403);
    const after = await state(apiSdk, fileId);
    expect(after.status).toBe(200);
    expect(after.title).toBe("Locked.html");
    expect(after.locked).toBe(true);
  });

  // Whatever status the refused rename answers (500 today, see the BUG test), the
  // file has to stay exactly as it was: title, lock and content.
  test("Custom room - A refused rename of a file locked by the owner changes nothing", async ({
    apiSdk,
  }) => {
    const { api, fileId } = await lockedByOwner(apiSdk);
    const before = await state(apiSdk, fileId);

    await api.files.updateFile({
      fileId,
      updateFileRequest: { title: "Renamed while locked" },
    });

    expect(await state(apiSdk, fileId)).toEqual(before);
    expect(before.locked).toBe(true);
  });

  // The rename is refused as documented, but through an unhandled exception (500).
  test.fail(
    "BUG XXXXX: Custom room - A lock set by the owner blocks a ContentCreator from renaming with a client error, not 500",
    async ({ apiSdk }) => {
      const { api, fileId } = await lockedByOwner(apiSdk);

      const { status } = await api.files.updateFile({
        fileId,
        updateFileRequest: { title: "Renamed while locked" },
      });

      expect((await state(apiSdk, fileId)).title).toBe("Locked.html");
      expect(status).not.toBe(500);
    },
  );

  // Documented: "A lock set by somebody else can only be released by a room manager."
  test("Custom room - A ContentCreator cannot release a lock set by the owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Mutations Unlock",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const fileId = await ownerFile(apiSdk, roomId, "Owner lock");
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    await ownerApi.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: true },
    });

    const { status } = await api.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: false },
    });

    expect(status).toBe(403);
    expect((await state(apiSdk, fileId)).locked).toBe(true);
  });

  for (const outsider of [
    { label: "User without room access", type: "User" as const },
    { label: "Guest without room access", type: "Guest" as const },
  ]) {
    test(`Custom room - ${outsider.label} cannot rename, lock or delete and nothing changes`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Mutations Outsider",
          roomType: RoomType.CustomRoom,
        },
      });
      const fileId = await ownerFile(
        apiSdk,
        roomData.response!.id!,
        "Protected",
      );
      const { api } = await apiSdk.addAuthenticatedMember(
        "owner",
        outsider.type,
      );

      const results = [
        await api.files.updateFile({
          fileId,
          updateFileRequest: { title: "Renamed by outsider" },
        }),
        await api.files.lockFile({
          fileId,
          lockFileRequest: { lockFile: true },
        }),
        await api.files.deleteFile({
          fileId,
          deleteFileRequest: { immediately: true },
        }),
      ];

      expect(results.map((r) => r.status)).toEqual([403, 403, 403]);
      const after = await state(apiSdk, fileId);
      expect(after.status).toBe(200);
      expect(after.title).toBe("Protected.html");
      expect(after.locked).toBe(false);
    });
  }

  // Documented: a DocSpace admin who is not a member of the room is refused on rename.
  test("Custom room - DocSpaceAdmin who is not a member cannot rename and nothing changes", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Mutations Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const fileId = await ownerFile(
      apiSdk,
      roomData.response!.id!,
      "Admin target",
    );
    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await api.files.updateFile({
      fileId,
      updateFileRequest: { title: "Renamed by admin" },
    });

    expect(status).toBe(403);
    expect((await state(apiSdk, fileId)).title).toBe("Admin target.html");
  });
});
