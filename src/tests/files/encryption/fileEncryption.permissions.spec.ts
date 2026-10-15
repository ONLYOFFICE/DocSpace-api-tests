import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { createPrivateRoom } from "@/src/helpers/rooms";

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

type MemberType = "DocSpaceAdmin" | "RoomAdmin" | "User";

// `null` access means the caller is not a member of the private room.
const encryptionAccessMatrix: Array<{
  label: string;
  type: MemberType;
  access: FileShare | null;
  canRead: boolean;
  // null = not asserted: the SDK says "members with editing rights" may set keys,
  // yet only ContentCreator and above do; whether Editing belongs is unclear.
  canSet: boolean | null;
}> = [
  {
    label: "RoomAdmin RoomManager",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
    canRead: true,
    canSet: true,
  },
  {
    label: "User ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
    canRead: true,
    canSet: true,
  },
  {
    label: "User Editing",
    type: "User",
    access: FileShare.Editing,
    canRead: true,
    canSet: null,
  },
  {
    label: "User Read",
    type: "User",
    access: FileShare.Read,
    canRead: true,
    canSet: false,
  },
  {
    label: "User without room access",
    type: "User",
    access: null,
    canRead: false,
    canSet: false,
  },
  {
    label: "DocSpaceAdmin without room access",
    type: "DocSpaceAdmin",
    access: null,
    canRead: false,
    canSet: false,
  },
];

test.describe("File encryption - permissions", () => {
  for (const {
    label,
    type,
    access,
    canRead,
    canSet,
  } of encryptionAccessMatrix) {
    test(`GET/PUT /files/:fileId/access - ${label}: read ${canRead ? "allowed" : "denied"}, set ${canSet === null ? "not asserted" : canSet ? "allowed" : "denied"}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await createPrivateRoom(apiSdk, "owner", {
        title: "Autotest File Encryption Permissions Room",
        roomType: RoomType.CustomRoom,
      });
      const roomId = roomData.response!.id!;
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Encrypted File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      const memberId = memberData.response!.id!;
      await api.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: "mpk", privateKeyEnc: "mprv" },
      });
      if (access !== null) {
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberId, access }],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);
      }

      // Positive control: the owner can read the same file.
      const { status: ownerRead } = await ownerApi.files.getEncryptionInfo({
        fileId,
      });
      expect(ownerRead).toBe(200);

      await test.step("getEncryptionInfo", async () => {
        const { data, status } = await api.files.getEncryptionInfo({ fileId });
        expect(status).toBe(canRead ? 200 : 403);
        if (canRead) {
          // Only the caller's own keys come back, never the owner's.
          expect(data.response?.userKeys?.map((k) => k.userId)).toEqual([
            memberId,
          ]);
        }
      });

      if (canSet !== null)
        await test.step("setEncryptionInfo", async () => {
          const { status } = await api.files.setEncryptionInfo({
            fileId,
            accessRequestKeyDto: [
              {
                userId: memberId,
                publicKeyId: ZERO_GUID,
                privateKeyEnc: "member-file-key",
              },
            ],
          });

          expect(status).toBe(canSet ? 200 : 403);
          if (canRead) {
            const { data } = await api.files.getEncryptionInfo({ fileId });
            expect(data.response?.fileKeys).toHaveLength(canSet ? 1 : 0);
          }
        });
    });
  }

  test("GET/PUT /files/:fileId/access - Anonymous user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const { data: roomData } = await createPrivateRoom(apiSdk, "owner", {
      title: "Autotest File Encryption Anonymous Room",
      roomType: RoomType.CustomRoom,
    });
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomData.response!.id!,
      createFileJsonElement: { title: "Autotest Encrypted File.docx" },
    });
    const fileId = fileData.response!.id!;
    const anonymousApi = apiSdk.forAnonymous();

    const { status: getStatus } = await anonymousApi.files.getEncryptionInfo({
      fileId,
    });
    const { status: setStatus } = await anonymousApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        {
          userId: me.response!.id!,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(getStatus).toBe(401);
    expect(setStatus).toBe(401);
    const { data } = await ownerApi.files.getEncryptionInfo({ fileId });
    expect(data.response?.fileKeys).toEqual([]);
  });
});
