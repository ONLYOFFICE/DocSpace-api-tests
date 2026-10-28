import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import {
  createPrivateRoom,
  privateSupportedRoomTypes,
} from "@/src/helpers/rooms";

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

type OwnerApi = ReturnType<ApiSDK["forRole"]>;

// The owner's key pair comes from ensureEncryptionKeys inside createPrivateRoom,
// and its id is the zero GUID (the default id of a key created without one).
async function createPrivateRoomWithFile(
  apiSdk: ApiSDK,
  roomType: RoomType = RoomType.CustomRoom,
) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData, status } = await createPrivateRoom(apiSdk, "owner", {
    title: "Autotest File Encryption Room",
    roomType,
  });
  expect(status).toBe(200);
  const roomId = roomData.response!.id!;
  const { data: fileData } = await ownerApi.files.createFile({
    folderId: roomId,
    createFileRequest: { title: "Autotest Encrypted File.docx" },
  });
  const { data: me } = await ownerApi.profiles.getSelfProfile();
  return {
    ownerApi,
    roomId,
    fileId: fileData.response!.id!,
    ownerId: me.response!.id!,
  };
}

async function readFileKeys(api: OwnerApi, fileId: number) {
  const { data } = await api.files.getEncryptionInfo({ fileId });
  return data.response?.fileKeys ?? [];
}

test.describe("GET /files/:fileId/access", () => {
  for (const { label, roomType } of privateSupportedRoomTypes) {
    test(`GET /files/:fileId/access - ${label} private room returns the caller's keys and no file keys yet`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId, ownerId } = await createPrivateRoomWithFile(
        apiSdk,
        roomType,
      );

      const { data, status } = await ownerApi.files.getEncryptionInfo({
        fileId,
      });

      expect(status).toBe(200);
      expect(data.response?.userKeys).toHaveLength(1);
      expect(data.response?.userKeys?.[0].userId).toBe(ownerId);
      expect(data.response?.userKeys?.[0].publicKey).toMatch(/^pk-/);
      expect(data.response?.fileKeys).toEqual([]);
    });
  }

  test("GET /files/:fileId/access - Reading is repeatable and does not create file keys", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);

    const first = await ownerApi.files.getEncryptionInfo({ fileId });
    const second = await ownerApi.files.getEncryptionInfo({ fileId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data.response).toEqual(first.data.response);
  });

  // Documented: "a caller without [read access], and a file that does not
  // exist, are both refused with 403".
  test("GET /files/:fileId/access - Non-existent fileId returns 403", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .files.getEncryptionInfo({ fileId: 999999999 });

    expect(status).toBe(403);
  });
});

test.describe("PUT /files/:fileId/access", () => {
  for (const { label, roomType } of privateSupportedRoomTypes) {
    test(`PUT /files/:fileId/access - ${label} private room stores the file key`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId, ownerId } = await createPrivateRoomWithFile(
        apiSdk,
        roomType,
      );

      const { status } = await ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          {
            userId: ownerId,
            publicKeyId: ZERO_GUID,
            privateKeyEnc: "file-key-1",
          },
        ],
      });

      expect(status).toBe(200);
      const fileKeys = await readFileKeys(ownerApi, fileId);
      expect(fileKeys).toHaveLength(1);
      expect(fileKeys[0]).toMatchObject({
        fileId,
        userId: ownerId,
        publicKeyId: ZERO_GUID,
        privateKeyEnc: "file-key-1",
      });
    });
  }

  test("PUT /files/:fileId/access - Setting a key for the same account again replaces it", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    const setKey = (privateKeyEnc: string) =>
      ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc },
        ],
      });

    expect((await setKey("first")).status).toBe(200);
    expect((await setKey("second")).status).toBe(200);

    const fileKeys = await readFileKeys(ownerApi, fileId);
    expect(fileKeys.map((k) => k.privateKeyEnc)).toEqual(["second"]);
  });

  test("PUT /files/:fileId/access - Setting the owner's key leaves another account's key in place", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    const { api: memberApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;
    await memberApi.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: "mpk", privateKeyEnc: "mprv" },
    });
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);

    await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        {
          userId: memberId,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "for-member",
        },
      ],
    });
    expect(
      (await readFileKeys(memberApi, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["for-member"]);

    await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "for-owner" },
      ],
    });

    expect(
      (await readFileKeys(memberApi, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["for-member"]);
    expect(
      (await readFileKeys(ownerApi, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["for-owner"]);
  });

  test("PUT /files/:fileId/access - Empty list changes nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "kept" },
      ],
    });

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [],
    });

    expect(status).toBe(200);
    expect(
      (await readFileKeys(ownerApi, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["kept"]);
  });

  test("PUT /files/:fileId/access - Missing body returns 400 and stores nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);

    const { status } = await ownerApi.files.setEncryptionInfo({ fileId });

    expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
    expect(status).toBe(400);
  });

  test("PUT /files/:fileId/access - Malformed userId returns 400 and stores nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: "not-a-guid", publicKeyId: ZERO_GUID, privateKeyEnc: "k" },
      ],
    });

    expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
    expect(status).toBe(400);
  });

  test("PUT /files/:fileId/access - Account that does not exist returns 403 and stores nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        {
          userId: "11111111-1111-1111-1111-111111111111",
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
    expect(status).toBe(403);
  });

  test("PUT /files/:fileId/access - File outside a private room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Not Private Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomData.response!.id!,
      createFileRequest: { title: "Autotest Plain File.docx" },
    });

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId: fileData.response!.id!,
      accessRequestKeyDto: [
        {
          userId: me.response!.id!,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(await readFileKeys(ownerApi, fileData.response!.id!)).toEqual([]);
    expect(status).toBe(403);
  });

  test("PUT /files/:fileId/access - File in My Documents returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest My Documents File.docx" },
    });

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId: fileData.response!.id!,
      accessRequestKeyDto: [
        {
          userId: me.response!.id!,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(status).toBe(403);
  });

  // A blank key is stored and silently overwrites the real one.
  test.fail(
    "BUG XXXXX: PUT /files/:fileId/access - Blank privateKeyEnc returns 400 and keeps the existing key",
    async ({ apiSdk }) => {
      const { ownerApi, fileId, ownerId } =
        await createPrivateRoomWithFile(apiSdk);
      await ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          {
            userId: ownerId,
            publicKeyId: ZERO_GUID,
            privateKeyEnc: "real-key",
          },
        ],
      });

      const { status } = await ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "" },
        ],
      });

      expect(
        (await readFileKeys(ownerApi, fileId)).map((k) => k.privateKeyEnc),
      ).toEqual(["real-key"]);
      expect(status).toBe(400);
    },
  );

  // A missing privateKeyEnc crashes on the database write (500).
  test.fail(
    "BUG XXXXX: PUT /files/:fileId/access - Missing privateKeyEnc returns 400",
    async ({ apiSdk }) => {
      const { ownerApi, fileId, ownerId } =
        await createPrivateRoomWithFile(apiSdk);

      const { status } = await ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [{ userId: ownerId, publicKeyId: ZERO_GUID }],
      });

      expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
      expect(status).toBe(400);
    },
  );

  // The same account twice in one request surfaces an EF Core tracking exception as 403.
  test.fail(
    "BUG XXXXX: PUT /files/:fileId/access - Same account twice in one request returns 400",
    async ({ apiSdk }) => {
      const { ownerApi, fileId, ownerId } =
        await createPrivateRoomWithFile(apiSdk);

      const { status, data } = await ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "d1" },
          { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "d2" },
        ],
      });

      expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
      expect(status).toBe(400);
      expect(JSON.stringify(data)).not.toContain("DbFileKeys");
    },
  );

  // A publicKeyId that names none of the account's keys is accepted and stored.
  test.fail(
    "BUG XXXXX: PUT /files/:fileId/access - publicKeyId of a key the account does not own returns 400",
    async ({ apiSdk }) => {
      const { ownerApi, fileId, ownerId } =
        await createPrivateRoomWithFile(apiSdk);

      const { status } = await ownerApi.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          {
            userId: ownerId,
            publicKeyId: "22222222-2222-2222-2222-222222222222",
            privateKeyEnc: "k",
          },
        ],
      });

      expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
      expect(status).toBe(400);
    },
  );

  // Documented: "a file outside a private room and a file that does not exist
  // are all refused with 403".
  test("PUT /files/:fileId/access - Non-existent fileId returns 403", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").files.setEncryptionInfo({
      fileId: 999999999,
      accessRequestKeyDto: [],
    });

    expect(status).toBe(403);
  });

  // Documented: "every account named in the request has to have read access".
  test("PUT /files/:fileId/access - Account without access to the file returns 403 and stores nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);
    const { data: outsider } = await apiSdk.addMember("owner", "User");

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        {
          userId: outsider.response!.id!,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
    expect(status).toBe(403);
  });
});
