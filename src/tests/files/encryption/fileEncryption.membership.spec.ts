import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  Api,
  ZERO_GUID,
  addKeyedMembers,
  createOwnerPrivateRoom,
  createRoomFile,
  getOwnerId,
  inviteToRoom,
} from "@/src/helpers/private-rooms";

/**
 * GET/PUT /files/{fileId}/access (getEncryptionInfo / setEncryptionInfo)
 * against room membership: who may read or issue file keys, and that a refusal
 * stores nothing. Complements fileEncryption.spec.ts (payload validation) and
 * fileEncryption.permissions.spec.ts (the role matrix at one point in time).
 *
 * File keys are opaque strings to the portal, so these tests prove which
 * account the portal hands which stored value to — not that a client can
 * decrypt a file.
 */

const readFileKeys = async (api: Api, fileId: number) => {
  const { data, status } = await api.files.getEncryptionInfo({ fileId });
  expect(status).toBe(200);
  return data.response?.fileKeys ?? [];
};

const issue = (
  api: Api,
  fileId: number,
  userId: string,
  privateKeyEnc: string,
) =>
  api.files.setEncryptionInfo({
    fileId,
    accessRequestKeyDto: [{ userId, publicKeyId: ZERO_GUID, privateKeyEnc }],
  });

test.describe("GET/PUT /files/{fileId}/access - membership", () => {
  test("GET /files/{fileId}/access - A removed member can neither read nor issue file keys", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    await inviteToRoom(owner, roomId, m1.id, FileShare.ContentCreator);
    expect((await issue(owner, fileId, m1.id, "fk-for-m1")).status).toBe(200);
    expect(
      (await readFileKeys(m1.api, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["fk-for-m1"]);

    await inviteToRoom(owner, roomId, m1.id, FileShare.None);

    expect((await m1.api.files.getEncryptionInfo({ fileId })).status).toBe(403);
    expect(
      (await issue(m1.api, fileId, m1.id, "fk-after-removal")).status,
    ).toBe(403);
    // The owner's view is unaffected.
    expect(await readFileKeys(owner, fileId)).toEqual([]);
  });

  test("PUT /files/{fileId}/access - Changing a member's role changes what they may issue, and a refusal stores nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    await test.step("Read: refused, nothing stored", async () => {
      expect((await issue(m1.api, fileId, m1.id, "from-read")).status).toBe(
        403,
      );
      expect(await readFileKeys(m1.api, fileId)).toEqual([]);
    });

    await test.step("ContentCreator: accepted and stored", async () => {
      await inviteToRoom(owner, roomId, m1.id, FileShare.ContentCreator);
      expect((await issue(m1.api, fileId, m1.id, "from-creator")).status).toBe(
        200,
      );
      expect(
        (await readFileKeys(m1.api, fileId)).map((k) => k.privateKeyEnc),
      ).toEqual(["from-creator"]);
    });

    await test.step("back to Read: refused again, stored key untouched", async () => {
      await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
      expect(
        (await issue(m1.api, fileId, m1.id, "from-read-again")).status,
      ).toBe(403);
      expect(
        (await readFileKeys(m1.api, fileId)).map((k) => k.privateKeyEnc),
      ).toEqual(["from-creator"]);
    });
  });

  test("GET /files/{fileId}/access - A member sees only their own key pair and file keys", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    await issue(owner, fileId, ownerId, "fk-owner");
    await issue(owner, fileId, m1.id, "fk-m1");

    const { data, status } = await m1.api.files.getEncryptionInfo({ fileId });

    expect(status).toBe(200);
    expect(data.response!.fileKeys!.map((k) => k.privateKeyEnc)).toEqual([
      "fk-m1",
    ]);
    expect(data.response!.userKeys!.map((k) => k.userId)).toEqual([m1.id]);
    expect(data.response!.userKeys![0].privateKeyEnc).toBe(m1.privateKeyEnc);
    expect(JSON.stringify(data)).not.toContain("fk-owner");

    // Positive control: the owner's own view does hold the owner's file key.
    expect(
      (await readFileKeys(owner, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["fk-owner"]);
  });

  test("GET /files/{fileId}/access - A member who deleted their key gets no key pair back", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    const before = await m1.api.files.getEncryptionInfo({ fileId });
    expect(before.data.response!.userKeys).toHaveLength(1);

    expect(
      (await m1.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);

    const { data, status } = await m1.api.files.getEncryptionInfo({ fileId });
    expect(status).toBe(200);
    expect(data.response!.userKeys ?? []).toEqual([]);
    expect(JSON.stringify(data)).not.toContain(m1.privateKeyEnc);
  });

  test("PUT /files/{fileId}/access - An issued file key is not rewritten when the recipient replaces their key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    await issue(owner, fileId, m1.id, "fk-issued");

    await m1.api.privacyroom.replaceKey({
      encryptionKeyRequestDto: {
        publicKey: "member-pk-rot-" + apiSdk.faker.generateString(10),
        privateKeyEnc: "prv-rot",
      },
    });

    // Re-wrapping for the new key is the client's job; the portal keeps the
    // stored row as it was issued.
    const keys = await readFileKeys(m1.api, fileId);
    expect(keys.map((k) => k.privateKeyEnc)).toEqual(["fk-issued"]);
    expect(keys[0].publicKeyId).toBe(ZERO_GUID);
  });

  test("PUT /files/{fileId}/access - Repeating a multi-recipient request does not duplicate anyone's key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    const send = (suffix: string) =>
      owner.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          {
            userId: ownerId,
            publicKeyId: ZERO_GUID,
            privateKeyEnc: "o-" + suffix,
          },
          {
            userId: m1.id,
            publicKeyId: ZERO_GUID,
            privateKeyEnc: "m-" + suffix,
          },
        ],
      });

    expect((await send("1")).status).toBe(200);
    expect((await send("2")).status).toBe(200);

    expect(
      (await readFileKeys(owner, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["o-2"]);
    expect(
      (await readFileKeys(m1.api, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["m-2"]);
  });
});

test.describe("GET/PUT /files/{fileId}/access - isolation between private rooms", () => {
  test("GET /files/{fileId}/access - A member of one private room cannot read or issue keys for a file in another", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomA = await createOwnerPrivateRoom(apiSdk);
    const roomB = await createOwnerPrivateRoom(apiSdk);
    const fileA = await createRoomFile(owner, roomA, "Autotest a.docx");
    const fileB = await createRoomFile(owner, roomB, "Autotest b.docx");
    await inviteToRoom(owner, roomA, m1.id, FileShare.ContentCreator);

    // Positive control: m1 works in the room they belong to.
    expect((await issue(m1.api, fileA, m1.id, "fk-a")).status).toBe(200);

    expect(
      (await m1.api.files.getEncryptionInfo({ fileId: fileB })).status,
    ).toBe(403);
    expect((await issue(m1.api, fileB, m1.id, "fk-b")).status).toBe(403);

    // Nothing was stored for B: once m1 is let into it, their view is empty.
    await inviteToRoom(owner, roomB, m1.id, FileShare.Read);
    expect(await readFileKeys(m1.api, fileB)).toEqual([]);
  });

  test("PUT /files/{fileId}/access - The owner cannot issue a key for an account outside the file's room, and nothing is stored", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomA = await createOwnerPrivateRoom(apiSdk);
    const roomB = await createOwnerPrivateRoom(apiSdk);
    const fileB = await createRoomFile(owner, roomB, "Autotest b.docx");
    await inviteToRoom(owner, roomA, m1.id, FileShare.Read);

    const { status } = await issue(owner, fileB, m1.id, "fk-leak");
    expect(status).toBe(403);

    await inviteToRoom(owner, roomB, m1.id, FileShare.Read);
    expect(await readFileKeys(m1.api, fileB)).toEqual([]);
  });
});

test.describe("GET/PUT /files/{fileId}/access - archived room", () => {
  test("PUT /files/{fileId}/access - A file of an archived private room can be read but no key can be issued", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest fk.docx");
    expect((await issue(owner, fileId, ownerId, "fk-before")).status).toBe(200);

    await archiveRoomAndWait(apiSdk, roomId);

    expect(
      (await readFileKeys(owner, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["fk-before"]);
    expect((await issue(owner, fileId, ownerId, "fk-after")).status).toBe(403);
    expect(
      (await readFileKeys(owner, fileId)).map((k) => k.privateKeyEnc),
    ).toEqual(["fk-before"]);
  });
});
