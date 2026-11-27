import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import {
  createPrivateRoom,
  privateSupportedRoomTypes,
} from "@/src/helpers/rooms";
import { okBody, uploadPrivateRoomFile } from "@/src/helpers/private-rooms";

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
  expect(status, `createPrivateRoom: ${JSON.stringify(roomData)}`).toBe(200);
  expect(roomData.response?.private, "the room is not private").toBe(true);
  const roomId = roomData.response!.id!;
  const fileId = await uploadPrivateRoomFile(ownerApi, roomId);
  const me = okBody(await ownerApi.profiles.getSelfProfile(), "getSelfProfile");
  return {
    ownerApi,
    roomId,
    fileId,
    ownerId: me.id!,
  };
}

// The read must succeed: an error answer is not "no file keys".
async function readFileKeys(api: OwnerApi, fileId: number) {
  const info = okBody(
    await api.files.getEncryptionInfo({ fileId }),
    `getEncryptionInfo(${fileId})`,
  );
  expect(Array.isArray(info.fileKeys), "fileKeys is not a list").toBe(true);
  return info.fileKeys!;
}

// A write that is a precondition of the test: the exact status is asserted.
async function seedKey(
  api: OwnerApi,
  fileId: number,
  userId: string,
  privateKeyEnc: string,
) {
  const res = await api.files.setEncryptionInfo({
    fileId,
    accessRequestKeyDto: [{ userId, publicKeyId: ZERO_GUID, privateKeyEnc }],
  });
  expect(
    res.status,
    `seed key ${privateKeyEnc}: ${JSON.stringify(res.data)}`,
  ).toBe(200);
  expect(res.data.response?.skippedUserIds, "seed key was skipped").toEqual([]);
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
      expect(Array.isArray(data.response?.fileKeys)).toBe(true);
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
    expect(first.data.response?.userKeys).toHaveLength(1);
    expect(first.data.response?.fileKeys).toEqual([]);
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

      const { data, status } = await ownerApi.files.setEncryptionInfo({
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
      expect(data.response?.skippedUserIds).toEqual([]);
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

    await seedKey(ownerApi, fileId, ownerId, "first");
    expect(
      (await readFileKeys(ownerApi, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["first"]);
    await seedKey(ownerApi, fileId, ownerId, "second");

    const fileKeys = await readFileKeys(ownerApi, fileId);
    expect(fileKeys.map((k) => k.privateKeyEnc)).toEqual(["second"]);
  });

  test("PUT /files/:fileId/access - Setting the owner's key leaves another account's key in place", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    const {
      api: memberApi,
      data: memberData,
      status: addStatus,
    } = await apiSdk.addAuthenticatedMember("owner", "User");
    expect(addStatus).toBe(200);
    const memberId = memberData.response!.id!;
    const { status: keysStatus } = await memberApi.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: "mpk", privateKeyEnc: "mprv" },
    });
    expect(keysStatus).toBe(201);
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);

    await seedKey(ownerApi, fileId, memberId, "for-member");
    expect(
      (await readFileKeys(memberApi, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["for-member"]);

    await seedKey(ownerApi, fileId, ownerId, "for-owner");

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
    await seedKey(ownerApi, fileId, ownerId, "kept");

    const { status, data } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [],
    });

    expect(status, JSON.stringify(data)).toBe(200);
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

  // Documented: "An account named in the request that cannot read the file is
  // skipped, nothing is stored for it, and it comes back in `skippedUserIds`".
  // An id that belongs to nobody cannot read the file either, so it is skipped
  // like any other. The caller's own right to issue keys is a separate check
  // and still answers 403 - see fileEncryption.membership.spec.ts.
  test("PUT /files/:fileId/access - Account that does not exist is skipped and nothing is stored", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);
    const ghost = "11111111-1111-1111-1111-111111111111";

    const { data, status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ghost, publicKeyId: ZERO_GUID, privateKeyEnc: "k" },
      ],
    });

    expect(status).toBe(200);
    expect(data.response?.skippedUserIds).toEqual([ghost]);
    expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
  });

  test("PUT /files/:fileId/access - File outside a private room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const me = okBody(
      await ownerApi.profiles.getSelfProfile(),
      "getSelfProfile",
    );
    const room = okBody(
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Not Private Room",
          roomType: RoomType.CustomRoom,
        },
      }),
      "createRoom",
    );
    expect(room.private, "the room must not be private").toBeFalsy();
    const plainFileId = okBody(
      await ownerApi.files.createFile({
        folderId: room.id!,
        createFileRequest: { title: "Autotest Plain File.docx" },
      }),
      "createFile",
    ).id!;

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId: plainFileId,
      accessRequestKeyDto: [
        {
          userId: me.id!,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(await readFileKeys(ownerApi, plainFileId)).toEqual([]);
    expect(status).toBe(403);
  });

  test("PUT /files/:fileId/access - File in My Documents returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const me = okBody(
      await ownerApi.profiles.getSelfProfile(),
      "getSelfProfile",
    );
    const myDocsFileId = okBody(
      await ownerApi.files.createFileInMyDocuments({
        createFileRequest: { title: "Autotest My Documents File.docx" },
      }),
      "createFileInMyDocuments",
    ).id!;

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId: myDocsFileId,
      accessRequestKeyDto: [
        {
          userId: me.id!,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "k",
        },
      ],
    });

    expect(status).toBe(403);
  });

  // A blank key is stored and silently overwrites the real one.
  test("BUG XXXXX: PUT /files/:fileId/access - Blank privateKeyEnc returns 400 and keeps the existing key", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    await seedKey(ownerApi, fileId, ownerId, "real-key");
    expect(
      (await readFileKeys(ownerApi, fileId)).map((k) => k.privateKeyEnc),
      "setup: the real key is stored",
    ).toEqual(["real-key"]);

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "" },
      ],
    });

    // Every read comes first; only the two assertions of the violation follow the marker.
    const stored = (await readFileKeys(ownerApi, fileId)).map(
      (k) => k.privateKeyEnc,
    );
    // Known violation (setup succeeded): the blank key overwrites the real one.
    test.fail();
    expect(stored).toEqual(["real-key"]);
    expect(status).toBe(400);
  });

  // A missing privateKeyEnc crashes on the database write (500).
  test("BUG XXXXX: PUT /files/:fileId/access - Missing privateKeyEnc returns 400", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    expect(await readFileKeys(ownerApi, fileId), "setup: no keys").toEqual([]);

    const { status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [{ userId: ownerId, publicKeyId: ZERO_GUID }],
    });

    const stored = await readFileKeys(ownerApi, fileId);
    // Known violation (setup succeeded): 500 instead of 400.
    test.fail();
    expect(stored).toEqual([]);
    expect(status).toBe(400);
  });

  // The same account twice in one request surfaces an EF Core tracking exception as 403.
  test("BUG XXXXX: PUT /files/:fileId/access - Same account twice in one request returns 400", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    expect(await readFileKeys(ownerApi, fileId), "setup: no keys").toEqual([]);

    const { status, data } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "d1" },
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "d2" },
      ],
    });

    const stored = await readFileKeys(ownerApi, fileId);
    // Known violation (setup succeeded): 403 with an EF Core exception text.
    test.fail();
    expect(stored).toEqual([]);
    expect(status).toBe(400);
    expect(JSON.stringify(data)).not.toContain("DbFileKeys");
  });

  // A publicKeyId that names none of the account's keys is accepted and stored.
  test("BUG XXXXX: PUT /files/:fileId/access - publicKeyId of a key the account does not own returns 400", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, ownerId } =
      await createPrivateRoomWithFile(apiSdk);
    expect(await readFileKeys(ownerApi, fileId), "setup: no keys").toEqual([]);

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

    const stored = await readFileKeys(ownerApi, fileId);
    // Known violation (setup succeeded): the key is accepted and stored.
    test.fail();
    expect(stored).toEqual([]);
    expect(status).toBe(400);
  });

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

  // Documented: "An account named in the request that cannot read the file is
  // skipped, nothing is stored for it, and it comes back in `skippedUserIds`,
  // while the keys of the others are stored."
  test("PUT /files/:fileId/access - Account without access to the file is skipped and nothing is stored", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await createPrivateRoomWithFile(apiSdk);
    const { data: outsider, status: addStatus } = await apiSdk.addMember(
      "owner",
      "User",
    );
    expect(addStatus).toBe(200);
    const outsiderId = outsider.response!.id!;

    const { data, status } = await ownerApi.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: outsiderId, publicKeyId: ZERO_GUID, privateKeyEnc: "k" },
      ],
    });

    expect(status).toBe(200);
    expect(data.response?.skippedUserIds).toEqual([outsiderId]);
    expect(await readFileKeys(ownerApi, fileId)).toEqual([]);
  });
});
