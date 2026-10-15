import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadAs, downloadFile } from "@/src/helpers/download";
import { Role } from "@/src/services/token-store";

type MemberType = "RoomAdmin" | "User" | "Guest";

const roleOfType: Record<MemberType, Role> = {
  RoomAdmin: "roomAdmin",
  User: "user",
  Guest: "guest",
};

// `null` access means the caller is not a member of the room.
const creationMatrix: Array<{
  label: string;
  type: MemberType;
  access: FileShare | null;
  canCreate: boolean;
}> = [
  {
    label: "RoomAdmin RoomManager",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
    canCreate: true,
  },
  {
    label: "User ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
    canCreate: true,
  },
  {
    label: "User Editing",
    type: "User",
    access: FileShare.Editing,
    canCreate: false,
  },
  {
    label: "User Read",
    type: "User",
    access: FileShare.Read,
    canCreate: false,
  },
  {
    label: "Guest Read",
    type: "Guest",
    access: FileShare.Read,
    canCreate: false,
  },
  {
    label: "User without room access",
    type: "User",
    access: null,
    canCreate: false,
  },
  {
    label: "RoomAdmin without room access",
    type: "RoomAdmin",
    access: null,
    canCreate: false,
  },
];

async function filesCount(apiSdk: ApiSDK, folderId: number) {
  const { data } = await apiSdk
    .forRole("owner")
    .folders.getFolderByFolderId({ folderId });
  return data.response?.current?.filesCount ?? 0;
}

async function roomWithHtmlFile(apiSdk: ApiSDK, title: string) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  const roomId = roomData.response!.id!;
  const { data: fileData } = await ownerApi.files.createHtmlFile({
    folderId: roomId,
    createTextOrHtmlFile: { title: "Autotest Source", content: "<p>src</p>" },
  });
  return { ownerApi, roomId, fileId: fileData.response!.id! };
}

test.describe("File creation - permissions", () => {
  for (const { label, type, access, canCreate } of creationMatrix) {
    test(`copyas, saveaspdf and html - ${label} ${canCreate ? "can" : "cannot"} create files in the room`, async ({
      apiSdk,
    }) => {
      const { ownerApi, roomId, fileId } = await roomWithHtmlFile(
        apiSdk,
        "Autotest Creation Permissions Room",
      );
      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      if (access !== null) {
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberData.response!.id!, access }],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);
      }

      // Positive control: the owner can create all three kinds of file here.
      const ownerResults = await Promise.all([
        ownerApi.files.copyFileAs({
          fileId,
          copyAsJsonElement: { destTitle: "Owner.html", destFolderId: roomId },
        }),
        ownerApi.files.saveFileAsPdf({
          id: fileId,
          saveAsPdf: { folderId: roomId, title: "Owner" },
        }),
        ownerApi.files.createHtmlFile({
          folderId: roomId,
          createTextOrHtmlFile: { title: "Owner Html", content: "<p>o</p>" },
        }),
      ]);
      expect(ownerResults.map((r) => r.status)).toEqual([200, 200, 200]);
      const countAfterOwner = await filesCount(apiSdk, roomId);
      expect(countAfterOwner).toBe(4);

      const expected = canCreate ? 200 : 403;
      await test.step("copyFileAs", async () => {
        const { status } = await api.files.copyFileAs({
          fileId,
          copyAsJsonElement: { destTitle: "Member.html", destFolderId: roomId },
        });
        expect(status).toBe(expected);
      });
      await test.step("saveFileAsPdf", async () => {
        const { status } = await api.files.saveFileAsPdf({
          id: fileId,
          saveAsPdf: { folderId: roomId, title: "Member" },
        });
        expect(status).toBe(expected);
      });
      await test.step("createHtmlFile", async () => {
        const { status } = await api.files.createHtmlFile({
          folderId: roomId,
          createTextOrHtmlFile: { title: "Member Html", content: "<p>m</p>" },
        });
        expect(status).toBe(expected);
      });

      expect(await filesCount(apiSdk, roomId)).toBe(
        countAfterOwner + (canCreate ? 3 : 0),
      );
    });
  }

  test("copyas, saveaspdf and html - Anonymous user gets 401 and creates nothing", async ({
    apiSdk,
  }) => {
    const { roomId, fileId } = await roomWithHtmlFile(
      apiSdk,
      "Autotest Creation Anonymous Room",
    );
    const anonymousApi = apiSdk.forAnonymous();

    const results = await Promise.all([
      anonymousApi.files.copyFileAs({
        fileId,
        copyAsJsonElement: { destTitle: "Anon.html", destFolderId: roomId },
      }),
      anonymousApi.files.saveFileAsPdf({
        id: fileId,
        saveAsPdf: { folderId: roomId, title: "Anon" },
      }),
      anonymousApi.files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFile: { title: "Anon Html", content: "<p>a</p>" },
      }),
    ]);

    expect(results.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(await filesCount(apiSdk, roomId)).toBe(1);
  });
});

test.describe("File creation and download - cross-room isolation", () => {
  test("A member of room A cannot reach a file of room B through copyas, saveaspdf, html or presigned addresses", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomA } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Isolation Room A",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomAId = roomA.response!.id!;
    const { roomId: roomBId, fileId: fileBId } = await roomWithHtmlFile(
      apiSdk,
      "Autotest Isolation Room B",
    );
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomAId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);

    // Positive control: the same member can create in room A.
    const { status: controlStatus } = await api.files.createHtmlFile({
      folderId: roomAId,
      createTextOrHtmlFile: { title: "Own Room File", content: "<p>a</p>" },
    });
    expect(controlStatus).toBe(200);

    await test.step("File of room B cannot be copied into room A", async () => {
      const { status } = await api.files.copyFileAs({
        fileId: fileBId,
        copyAsJsonElement: { destTitle: "Stolen.html", destFolderId: roomAId },
      });
      expect(status).toBe(403);
    });
    await test.step("File of room B cannot be converted into room A", async () => {
      const { status } = await api.files.saveFileAsPdf({
        id: fileBId,
        saveAsPdf: { folderId: roomAId, title: "Stolen" },
      });
      expect(status).toBe(403);
    });
    await test.step("Nothing can be created in room B", async () => {
      const { status } = await api.files.createHtmlFile({
        folderId: roomBId,
        createTextOrHtmlFile: { title: "Planted", content: "<p>x</p>" },
      });
      expect(status).toBe(403);
    });
    await test.step("No download address is issued for the file of room B", async () => {
      const { status: uriStatus } = await api.files.getPresignedUri({
        fileId: fileBId,
      });
      const { status: signedStatus } = await api.files.getPresignedFileUri({
        fileId: fileBId,
      });
      expect(uriStatus).toBe(403);
      expect(signedStatus).toBe(403);
    });

    expect(await filesCount(apiSdk, roomAId)).toBe(1);
    expect(await filesCount(apiSdk, roomBId)).toBe(1);
  });
});

test.describe("GET /files/file/:fileId/presigneduri and /presigned - permissions", () => {
  const readers: Array<{
    label: string;
    type: MemberType;
    access: FileShare | null;
    canRead: boolean;
  }> = [
    {
      label: "RoomAdmin RoomManager",
      type: "RoomAdmin",
      access: FileShare.RoomManager,
      canRead: true,
    },
    {
      label: "User ContentCreator",
      type: "User",
      access: FileShare.ContentCreator,
      canRead: true,
    },
    {
      label: "User Editing",
      type: "User",
      access: FileShare.Editing,
      canRead: true,
    },
    { label: "User Read", type: "User", access: FileShare.Read, canRead: true },
    {
      label: "Guest Read",
      type: "Guest",
      access: FileShare.Read,
      canRead: true,
    },
    {
      label: "User without room access",
      type: "User",
      access: null,
      canRead: false,
    },
    {
      label: "RoomAdmin without room access",
      type: "RoomAdmin",
      access: null,
      canRead: false,
    },
  ];

  for (const { label, type, access, canRead } of readers) {
    test(`presigned addresses - ${label} ${canRead ? "can" : "cannot"} get and use them`, async ({
      apiSdk,
    }) => {
      const { ownerApi, roomId, fileId } = await roomWithHtmlFile(
        apiSdk,
        "Autotest Presigned Permissions Room",
      );
      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      if (access !== null) {
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberData.response!.id!, access }],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);
      }

      // Positive control: the owner downloads the content.
      const ownerDownload = await downloadFile(apiSdk, "owner", fileId);
      expect(ownerDownload.bytes.toString("utf8")).toBe("<p>src</p>");

      const { data: uri, status: uriStatus } = await api.files.getPresignedUri({
        fileId,
      });
      const { status: signedStatus } = await api.files.getPresignedFileUri({
        fileId,
      });

      expect(uriStatus).toBe(canRead ? 200 : 403);
      expect(signedStatus).toBe(canRead ? 200 : 403);
      if (canRead) {
        const download = await downloadAs(
          apiSdk,
          roleOfType[type],
          uri.response as unknown as string,
        );
        expect(download.status).toBe(200);
        expect(download.bytes.toString("utf8")).toBe("<p>src</p>");
      } else {
        expect(uri.response).toBeUndefined();
      }
    });
  }

  test("presigned addresses - Access removed from the room stops new addresses", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, fileId } = await roomWithHtmlFile(
      apiSdk,
      "Autotest Presigned Revoke Room",
    );
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });
    expect((await api.files.getPresignedUri({ fileId })).status).toBe(200);

    const { status: removeStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.None }],
        notify: false,
      },
    });

    expect(removeStatus).toBe(200);
    expect((await api.files.getPresignedUri({ fileId })).status).toBe(403);
    expect((await api.files.getPresignedFileUri({ fileId })).status).toBe(403);
  });

  test("presigned addresses - Anonymous user gets 401", async ({ apiSdk }) => {
    const { fileId } = await roomWithHtmlFile(
      apiSdk,
      "Autotest Presigned Anonymous Room",
    );
    const anonymousApi = apiSdk.forAnonymous();

    const { status: uriStatus } = await anonymousApi.files.getPresignedUri({
      fileId,
    });
    const { status: signedStatus } =
      await anonymousApi.files.getPresignedFileUri({ fileId });

    expect(uriStatus).toBe(401);
    expect(signedStatus).toBe(401);
  });
});
