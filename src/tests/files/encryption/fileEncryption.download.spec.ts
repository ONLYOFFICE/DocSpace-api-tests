import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK, UserType } from "@/src/services/api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  Api,
  ZERO_GUID,
  createOwnerPrivateRoom,
  getOwnerId,
  inviteToRoom as inviteRaw,
  okBody,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  Account,
  UploadedFile,
  addAccounts,
  anonymousPresignedStatus,
  bulkDownload,
  containsMarker,
  downloadVia,
  expectDownloads,
  fetchAs,
  markedBytes,
  uploadEncrypted,
} from "@/src/helpers/private-room-download";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

/**
 * Downloading files of a private room (PR-DL-*, PR-HDL, PR-SEC-028/029).
 *
 * The portal only stores and hands out what a client uploaded as `encrypted`,
 * so the bytes in these tests are random buffers with a unique marker, not real
 * ciphertext. They prove WHICH bytes come back, to WHOM, and that a refusal
 * carries none of them - not that a client can decrypt anything (that is the
 * crypto package).
 *
 * Contract used, from the SDK JSDoc of getPresignedUri and bulkDownload: a
 * member of the room gets an address, a caller without access is refused, an
 * unknown id is "not found", an anonymous caller is rejected; bulkDownload
 * fails the whole call with 403 for an item the caller may not read.
 *
 * What neither the JSDoc nor the HTML guide fixes is NOT asserted and not
 * recorded: downloading as a member who holds no file key or no account key
 * (only "never anything but the uploaded bytes, never a 5xx" is asserted), and
 * the reach of an already issued address after removal (SPEC-018, see
 * fileEncryption.presigned.spec.ts). Those rows stay SPEC GAP in the audit.
 */

/** Invites a member and proves the invitation went through: every later refusal rests on it. */
const inviteToRoom = async (
  ...args: Parameters<typeof inviteRaw>
): Promise<Awaited<ReturnType<typeof inviteRaw>>> => {
  const res = await inviteRaw(...args);
  expect(res.status, "inviting a member").toBe(200);
  return res;
};

const issueFileKey = async (
  owner: Api,
  fileId: number,
  userId: string,
  value = "dl-fk",
) => {
  const { status } = await owner.files.setEncryptionInfo({
    fileId,
    accessRequestKeyDto: [
      { userId, publicKeyId: ZERO_GUID, privateKeyEnc: value },
    ],
  });
  expect(status, "issuing a file key").toBe(200);
};

/** A private Custom room of the owner holding one uploaded file. */
const roomWithFile = async (apiSdk: ApiSDK, marker: string) => {
  const owner = apiSdk.forRole("owner");
  const roomId = await createOwnerPrivateRoom(apiSdk);
  const file = await uploadEncrypted(owner, roomId, {
    bytes: markedBytes(marker),
  });
  return {
    owner,
    ownerToken: apiSdk.tokenStore.getToken("owner"),
    roomId,
    file,
  };
};

const MEMBER_ROLES = [
  { label: "RoomManager", type: "RoomAdmin", access: FileShare.RoomManager },
  { label: "Read", type: "User", access: FileShare.Read },
  { label: "ContentCreator", type: "User", access: FileShare.ContentCreator },
] as const satisfies readonly {
  label: string;
  type: UserType;
  access: FileShare;
}[];

test.describe("GET /files/file/:fileId/presigneduri - private room download", () => {
  test("GET /files/file/:fileId/presigneduri - Owner downloads exactly the uploaded bytes", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(apiSdk, "DL-OWNER");

    const got = await downloadVia(owner, ownerToken, file.id);

    expect(got.issued).toBe(200);
    expect(got.fetched).toBe(200);
    expect(got.bytes!.equals(file.bytes)).toBe(true);
    // The file is what the room says it is: an encrypted one under the server name.
    const info = okBody(
      await owner.files.getFileInfo({ fileId: file.id }),
      "getFileInfo",
    );
    expect(info.encrypted).toBe(true);
    expect(info.title).toBe(file.serverName);
    expect(info.pureContentLength).toBe(file.bytes.length);
  });

  for (const { label, type, access } of MEMBER_ROLES) {
    test(`GET /files/file/:fileId/presigneduri - ${label} with an issued file key downloads the uploaded bytes`, async ({
      apiSdk,
    }) => {
      const { owner, roomId, file } = await roomWithFile(apiSdk, `DL-${label}`);
      const [member] = await addAccounts(apiSdk, [{ type, key: true }]);
      expect(
        (await inviteToRoom(owner, roomId, member.id, access)).status,
      ).toBe(200);
      await issueFileKey(owner, file.id, member.id);
      // The member really holds the file key the portal stored for them.
      const { data } = await member.api.files.getEncryptionInfo({
        fileId: file.id,
      });
      expect(data.response?.fileKeys?.map((k) => k.privateKeyEnc)).toEqual([
        "dl-fk",
      ]);

      await expectDownloads(member.api, member.token, file, label);
    });
  }

  test("GET /files/file/:fileId/presigneduri - A file in a nested folder downloads", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await roomWithFile(apiSdk, "DL-NEST");
    const outer = okBody(
      await owner.folders.createFolder({
        folderId: roomId,
        createFolderRequest: { title: "outer" },
      }),
      "createFolder outer",
    );
    const inner = okBody(
      await owner.folders.createFolder({
        folderId: outer.id!,
        createFolderRequest: { title: "inner" },
      }),
      "createFolder inner",
    );
    const file = await uploadEncrypted(owner, inner.id!, {
      bytes: markedBytes("DL-NESTED-FILE"),
    });

    await expectDownloads(owner, ownerToken, file, "nested file");
  });

  for (const ext of ["docx", "xlsx", "pptx", "pdf"]) {
    test(`GET /files/file/:fileId/presigneduri - A .${ext} file downloads unchanged`, async ({
      apiSdk,
    }) => {
      const { owner, ownerToken, roomId } = await roomWithFile(
        apiSdk,
        "DL-FMT",
      );
      const file = await uploadEncrypted(owner, roomId, {
        ext,
        bytes: markedBytes(`DL-${ext}`, 900),
      });

      await expectDownloads(owner, ownerToken, file, ext);
      expect(file.serverName.endsWith(`.${ext}`)).toBe(true);
      const info = okBody(
        await owner.files.getFileInfo({ fileId: file.id }),
        "getFileInfo",
      );
      expect(info.title).toBe(file.serverName);
      expect(info.fileExst).toBe(`.${ext}`);
    });
  }

  test("GET /files/file/:fileId/presigneduri - Repeated downloads are identical and change nothing", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(apiSdk, "DL-REPEAT");
    const ownerId = await getOwnerId(owner);
    await issueFileKey(owner, file.id, ownerId, "dl-fk-owner");
    // Both reads must succeed: two failed reads would be "identical" too.
    const read = async () => {
      const info = okBody(
        await owner.files.getFileInfo({ fileId: file.id }),
        "getFileInfo",
      );
      const keys = okBody(
        await owner.files.getEncryptionInfo({ fileId: file.id }),
        "getEncryptionInfo",
      );
      return {
        version: info.version,
        versionGroup: info.versionGroup,
        encrypted: info.encrypted,
        title: info.title,
        contentLength: info.contentLength,
        updated: info.updated,
        fileKeys: keys.fileKeys?.map((k) => k.privateKeyEnc),
      };
    };
    const before = await read();

    const first = await downloadVia(owner, ownerToken, file.id);
    const second = await downloadVia(owner, ownerToken, file.id);

    expect(first.issued, "first presigneduri").toBe(200);
    expect(first.fetched, "first fetch").toBe(200);
    expect(second.issued, "second presigneduri").toBe(200);
    expect(second.fetched, "second fetch").toBe(200);
    expect(first.bytes!.equals(file.bytes)).toBe(true);
    expect(second.bytes!.equals(first.bytes!)).toBe(true);
    expect(await read()).toEqual(before);
    expect(before.encrypted).toBe(true);
    expect(before.fileKeys).toEqual(["dl-fk-owner"]);
  });

  test("GET /files/file/:fileId/presigneduri - A file never returns the content of another file", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-ALPHA",
    );
    const other = await uploadEncrypted(owner, roomId, {
      bytes: markedBytes("DL-OMEGA"),
    });

    const a = await downloadVia(owner, ownerToken, file.id);
    const b = await downloadVia(owner, ownerToken, other.id);

    expect(a.fetched, "fetching the first file").toBe(200);
    expect(b.fetched, "fetching the second file").toBe(200);

    expect(a.bytes!.equals(file.bytes)).toBe(true);
    expect(b.bytes!.equals(other.bytes)).toBe(true);
    expect(containsMarker(a.bytes!, "DL-OMEGA")).toBe(false);
    expect(containsMarker(b.bytes!, "DL-ALPHA")).toBe(false);
  });

  test("GET /files/file/:fileId/presigneduri - The download carries the server name, not a user-chosen one", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await roomWithFile(apiSdk, "DL-NAME");
    const file = await uploadEncrypted(owner, roomId, {
      bytes: markedBytes("DL-NAME-FILE"),
    });
    const url = okBody(
      await owner.files.getPresignedUri({ fileId: file.id }),
      "getPresignedUri",
    ) as unknown as string;

    const got = await fetchAs(url, ownerToken);

    expect(got.status).toBe(200);
    expect(got.headers.get("content-disposition") ?? "").toContain(
      file.serverName,
    );
    // The address and the listing name the file by its server name too.
    const folder = okBody(
      await owner.folders.getFolderByFolderId({ folderId: roomId }),
      "getFolderByFolderId",
    );
    const titles = folder.files?.map((f) => f.title) ?? [];
    expect(titles).toContain(file.serverName);
  });

  test("GET /files/file/:fileId/presigneduri - A member downloads from an archived private room", async ({
    apiSdk,
  }) => {
    const { owner, roomId, file } = await roomWithFile(apiSdk, "DL-ARCH");
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    await issueFileKey(owner, file.id, member.id);
    await expectDownloads(member.api, member.token, file, "before archiving");

    await archiveRoomAndWait(apiSdk, roomId);

    await expectDownloads(member.api, member.token, file, "archived room");
  });
});

test.describe("GET /files/file/:fileId/presigneduri - private room isolation", () => {
  const NON_MEMBERS = [
    {
      label: "a User with an account key who is not a member",
      type: "User",
      key: true,
    },
    { label: "a RoomAdmin who is not a member", type: "RoomAdmin", key: true },
    {
      label: "a DocSpaceAdmin who is not a member",
      type: "DocSpaceAdmin",
      key: true,
    },
    { label: "a Guest", type: "Guest", key: false },
  ] as const satisfies readonly {
    label: string;
    type: UserType;
    key: boolean;
  }[];

  /** Everything a refused caller must not obtain, after proving the file is fetchable. */
  const expectRefused = async (
    apiSdk: ApiSDK,
    who: Account,
    owner: Api,
    ownerToken: string,
    roomId: number,
    file: UploadedFile,
    marker: string,
  ) => {
    // Positive control: the file exists and its owner fetches it.
    await expectDownloads(owner, ownerToken, file, "owner (control)");

    const issued = await who.api.files.getPresignedUri({ fileId: file.id });
    expect(issued.status, "presigneduri").toBe(403);
    expect(JSON.stringify(issued.data)).not.toContain("stream_auth");
    expect(JSON.stringify(issued.data)).not.toContain(marker);

    const bulk = await bulkDownload(who.api, who.token, { fileIds: [file.id] });
    expect(bulk.status, "bulkdownload of the file").toBe(403);
    expect(bulk.bytes).toBeUndefined();
    const bulkRoom = await bulkDownload(who.api, who.token, {
      folderIds: [roomId],
    });
    expect(bulkRoom.status, "bulkdownload of the room").toBe(403);
    expect(bulkRoom.bytes).toBeUndefined();
    void apiSdk;
  };

  for (const { label, type, key } of NON_MEMBERS) {
    test(`GET /files/file/:fileId/presigneduri - ${label} is refused`, async ({
      apiSdk,
    }) => {
      const { owner, ownerToken, roomId, file } = await roomWithFile(
        apiSdk,
        "DL-ISO",
      );
      const [who] = await addAccounts(apiSdk, [{ type, key }]);

      await expectRefused(
        apiSdk,
        who,
        owner,
        ownerToken,
        roomId,
        file,
        "DL-ISO",
      );
      // Not a member, and nothing about the refusal made them one.
      expect((await roomMemberAccess(owner, roomId)).has(who.id)).toBe(false);
    });
  }

  test("GET /files/file/:fileId/presigneduri - The Portal Owner who is not a member is refused", async ({
    apiSdk,
  }) => {
    // A DocSpaceAdmin with a key creates the private room; the Portal Owner is never invited.
    const [admin] = await addAccounts(apiSdk, [
      { type: "DocSpaceAdmin", key: true },
    ]);
    const { data, status } = await admin.api.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin Private " + apiSdk.faker.generateString(6),
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(status).toBe(200);
    const roomId = data.response!.id!;
    const file = await uploadEncrypted(admin.api, roomId, {
      bytes: markedBytes("DL-OWNER-NONMEMBER"),
    });
    await expectDownloads(admin.api, admin.token, file, "creator (control)");
    const owner = apiSdk.forRole("owner");

    const issued = await owner.files.getPresignedUri({ fileId: file.id });
    expect(issued.status).toBe(403);
    expect(JSON.stringify(issued.data)).not.toContain("stream_auth");
    const bulk = await bulkDownload(
      owner,
      apiSdk.tokenStore.getToken("owner"),
      {
        fileIds: [file.id],
      },
    );
    expect(bulk.status).toBe(403);
    expect(bulk.bytes).toBeUndefined();
  });

  test("GET /files/file/:fileId/presigneduri - An anonymous caller is rejected", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(apiSdk, "DL-ANON");
    await expectDownloads(owner, ownerToken, file, "owner (control)");

    expect(await anonymousPresignedStatus(apiSdk, file.id)).toBe(401);
  });

  test("GET /files/file/:fileId/presigneduri - A member of another private room is refused", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-OTHERROOM",
    );
    const otherRoom = await createOwnerPrivateRoom(apiSdk);
    const otherFile = await uploadEncrypted(owner, otherRoom, {
      bytes: markedBytes("DL-OTHER-ROOM-FILE"),
    });
    const [neighbour] = await addAccounts(apiSdk, [
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, otherRoom, neighbour.id, FileShare.Editing);
    await issueFileKey(owner, otherFile.id, neighbour.id);
    // Control: in their own room they download; the other room's file is the refused one.
    await expectDownloads(
      neighbour.api,
      neighbour.token,
      otherFile,
      "own room",
    );

    // The premise: a member of the other room only, not of this one.
    expect((await roomMemberAccess(owner, roomId)).has(neighbour.id)).toBe(
      false,
    );
    expect((await roomMemberAccess(owner, otherRoom)).get(neighbour.id)).toBe(
      FileShare.Editing,
    );

    await expectRefused(
      apiSdk,
      neighbour,
      owner,
      ownerToken,
      roomId,
      file,
      "DL-OTHERROOM",
    );
  });

  test("GET /files/file/:fileId/presigneduri - A removed member is refused with every id they knew", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-REMOVED",
    );
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    await issueFileKey(owner, file.id, member.id);
    await expectDownloads(
      member.api,
      member.token,
      file,
      "member before removal",
    );
    expect(
      (await inviteToRoom(owner, roomId, member.id, FileShare.None)).status,
    ).toBe(200);
    expect((await roomMemberAccess(owner, roomId)).has(member.id)).toBe(false);

    await expectRefused(
      apiSdk,
      member,
      owner,
      ownerToken,
      roomId,
      file,
      "DL-REMOVED",
    );
    // The file key is gone with the membership; a new address cannot be issued either.
    expect(
      (await member.api.files.getEncryptionInfo({ fileId: file.id })).status,
    ).toBe(403);
    // The address issued before the removal is not asserted: what it still serves is not
    // fixed by the contract (SPEC-018, covered as a SPEC GAP in fileEncryption.presigned.spec.ts).
  });
});

test.describe("GET /files/file/:fileId/presigneduri - membership is independent of keys", () => {
  // Room membership, an account key, a file key and the ability to decrypt are
  // four separate things. The REST layer only ever serves the stored bytes, so
  // these tests pin the facts that ARE defined (membership, which keys are stored)
  // and assert about the download only that it is never a server error and never
  // serves anything but the uploaded bytes.
  const expectOnlyUploadedBytes = async (
    who: Account,
    file: UploadedFile,
    situation: string,
  ) => {
    const got = await downloadVia(who.api, who.token, file.id);
    // Either the address is issued, or the call is refused with a client error:
    // never a server error, never an unexplained 2xx/3xx.
    const issuedOrRefused = (s: number) => s === 200 || (s >= 400 && s < 500);
    expect(
      issuedOrRefused(got.issued),
      `${situation}: presigneduri answered ${got.issued}`,
    ).toBe(true);
    if (got.issued === 200) {
      expect(
        issuedOrRefused(got.fetched!),
        `${situation}: address fetch answered ${got.fetched}`,
      ).toBe(true);
      if (got.fetched === 200)
        expect(got.bytes!.equals(file.bytes), `${situation}: bytes`).toBe(true);
      else
        expect(
          containsMarker(got.bytes!, "DL-"),
          `${situation}: a refused fetch carries bytes`,
        ).toBe(false);
    } else {
      expect(
        got.bytes,
        `${situation}: no bytes without an address`,
      ).toBeUndefined();
    }
    return got;
  };

  test("GET /files/file/:fileId/presigneduri - A member without a file key entry: membership and keys are separate", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-NOFK",
    );
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    await expectDownloads(owner, ownerToken, file, "owner (control)");

    expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
      FileShare.Read,
    );
    const info = await member.api.files.getEncryptionInfo({ fileId: file.id });
    expect(info.status).toBe(200);
    expect(info.data.response?.fileKeys ?? []).toEqual([]);
    expect(info.data.response?.userKeys?.length).toBe(1);

    await expectOnlyUploadedBytes(
      member,
      file,
      "member with no file key entry",
    );
  });

  test("GET /files/file/:fileId/presigneduri - A member without an active account key: membership stays, no key pair comes back", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-NOACCT",
    );
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    await issueFileKey(owner, file.id, member.id);
    await expectDownloads(
      member.api,
      member.token,
      file,
      "member with keys (control)",
    );

    // ZERO_GUID removes the caller's current key (see privacyroom.spec.ts).
    expect(
      (await member.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);

    expect((await member.api.privacyroom.getUserKeys()).data.count).toBe(0);
    expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
      FileShare.Read,
    );
    // The owner is unaffected by the member's key deletion.
    const ownerView = await owner.files.getEncryptionInfo({ fileId: file.id });
    expect(ownerView.status).toBe(200);
    await expectDownloads(owner, ownerToken, file, "owner (control)");

    await expectOnlyUploadedBytes(
      member,
      file,
      "member who deleted their account key",
    );
  });

  test("GET /files/file/:fileId/presigneduri - A member who replaced their account key, before and after a new file key is issued", async ({
    apiSdk,
  }) => {
    const { owner, roomId, file } = await roomWithFile(apiSdk, "DL-REPLACED");
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    await issueFileKey(owner, file.id, member.id, "fk-for-old-key");
    await expectDownloads(
      member.api,
      member.token,
      file,
      "member with the old key (control)",
    );

    // Delete the key and register a new one: the member keeps the room but the stored
    // file key was wrapped for the old key.
    expect(
      (await member.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    const created = await member.api.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        publicKey: "dl-new-pk",
        privateKeyEnc: "dl-new-prv",
      },
    });
    expect(created.status).toBe(201);
    expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
      FileShare.Read,
    );
    const stale = await member.api.files.getEncryptionInfo({ fileId: file.id });
    expect(stale.data.response?.userKeys?.map((k) => k.publicKey)).toEqual([
      "dl-new-pk",
    ]);
    expect(stale.data.response?.fileKeys?.map((k) => k.privateKeyEnc)).toEqual([
      "fk-for-old-key",
    ]);
    await expectOnlyUploadedBytes(
      member,
      file,
      "after key replacement, before re-issue",
    );

    // The manager issues a file key again.
    await issueFileKey(owner, file.id, member.id, "fk-for-new-key");
    const fresh = await member.api.files.getEncryptionInfo({ fileId: file.id });
    expect(fresh.data.response?.fileKeys?.map((k) => k.privateKeyEnc)).toEqual([
      "fk-for-new-key",
    ]);
    const after = await expectOnlyUploadedBytes(member, file, "after re-issue");
    // Once the file key is re-issued nothing blocks the member any more.
    expect(after.issued).toBe(200);
    expect(after.bytes!.equals(file.bytes)).toBe(true);
  });
});

test.describe("PUT /files/fileops/bulkdownload - private room archives", () => {
  test("PUT /files/fileops/bulkdownload - Several files come back in one archive with their bytes", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-BULK-A",
    );
    const second = await uploadEncrypted(owner, roomId, {
      ext: "pdf",
      bytes: markedBytes("DL-BULK-B"),
    });

    const bulk = await bulkDownload(owner, ownerToken, {
      fileIds: [file.id, second.id],
    });

    expect(bulk.status).toBe(200);
    expect(bulk.error).toBe("");
    expect(bulk.downloadStatus).toBe(200);
    expect(bulk.isZip).toBe(true);
    const byName = new Map(bulk.entries!.map((e) => [e.name, e.bytes]));
    expect([...byName.keys()].sort()).toEqual(
      [file.serverName, second.serverName].sort(),
    );
    expect(byName.get(file.serverName)!.equals(file.bytes)).toBe(true);
    expect(byName.get(second.serverName)!.equals(second.bytes)).toBe(true);
  });

  test("PUT /files/fileops/bulkdownload - A folder comes back as an archive of its files only", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await roomWithFile(
      apiSdk,
      "DL-BULK-ROOTFILE",
    );
    const folderId = okBody(
      await owner.folders.createFolder({
        folderId: roomId,
        createFolderRequest: { title: "pack" },
      }),
      "createFolder",
    ).id!;
    const inFolder = await uploadEncrypted(owner, folderId, {
      bytes: markedBytes("DL-IN-FOLDER"),
    });
    const outside = await uploadEncrypted(owner, roomId, {
      bytes: markedBytes("DL-OUTSIDE-FOLDER"),
    });
    await expectDownloads(owner, ownerToken, outside, "outside file (control)");

    const bulk = await bulkDownload(owner, ownerToken, {
      folderIds: [folderId],
    });

    expect(bulk.status).toBe(200);
    expect(bulk.isZip).toBe(true);
    expect(bulk.entries!.map((e) => e.name)).toEqual([inFolder.serverName]);
    expect(bulk.entries![0].bytes.equals(inFolder.bytes)).toBe(true);
    expect(containsMarker(bulk.bytes!, "DL-OUTSIDE-FOLDER")).toBe(false);
  });

  test("PUT /files/fileops/bulkdownload - A whole room comes back with its folder structure", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-BULK-ROOM",
    );
    const docs = okBody(
      await owner.folders.createFolder({
        folderId: roomId,
        createFolderRequest: { title: "docs" },
      }),
      "createFolder",
    );
    const nested = await uploadEncrypted(owner, docs.id!, {
      ext: "xlsx",
      bytes: markedBytes("DL-BULK-NESTED"),
    });

    const bulk = await bulkDownload(owner, ownerToken, { folderIds: [roomId] });

    expect(bulk.status).toBe(200);
    expect(bulk.isZip).toBe(true);
    const byName = new Map(bulk.entries!.map((e) => [e.name, e.bytes]));
    expect([...byName.keys()].sort()).toEqual(
      [file.serverName, `docs/${nested.serverName}`].sort(),
    );
    expect(byName.get(file.serverName)!.equals(file.bytes)).toBe(true);
    expect(byName.get(`docs/${nested.serverName}`)!.equals(nested.bytes)).toBe(
      true,
    );
  });

  test("PUT /files/fileops/bulkdownload - A member's archive of the room holds the same files", async ({
    apiSdk,
  }) => {
    const { owner, roomId, file } = await roomWithFile(
      apiSdk,
      "DL-BULK-MEMBER",
    );
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    await issueFileKey(owner, file.id, member.id);

    const bulk = await bulkDownload(member.api, member.token, {
      folderIds: [roomId],
    });

    expect(bulk.status).toBe(200);
    expect(bulk.entries!.map((e) => e.name)).toEqual([file.serverName]);
    expect(bulk.entries![0].bytes.equals(file.bytes)).toBe(true);
  });

  test("PUT /files/fileops/bulkdownload - A request mixing readable and unreadable files never carries the unreadable one", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerToken = apiSdk.tokenStore.getToken("owner");
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    const room = await createOwnerPrivateRoom(apiSdk);
    const hiddenRoom = await createOwnerPrivateRoom(apiSdk);
    const open = await uploadEncrypted(owner, room, {
      bytes: markedBytes("DL-MIX-READABLE"),
    });
    const secret = await uploadEncrypted(owner, hiddenRoom, {
      bytes: markedBytes("DL-MIX-SECRET"),
    });
    await inviteToRoom(owner, room, member.id, FileShare.Read);
    await issueFileKey(owner, open.id, member.id);
    await expectDownloads(
      owner,
      ownerToken,
      secret,
      "unreadable file (control)",
    );
    await expectDownloads(
      member.api,
      member.token,
      open,
      "readable file (control)",
    );

    const mixed = await bulkDownload(member.api, member.token, {
      fileIds: [open.id, secret.id],
    });

    // The status is not asserted here (see the BUG XXXXX test below); the unreadable
    // file must be absent whatever it is, and the call must not be a server error.
    expect(mixed.status, "bulkdownload of a mixed request").toBeLessThan(500);
    expect(
      mixed.bytes ? containsMarker(mixed.bytes, "DL-MIX-SECRET") : false,
      "the unreadable file's bytes",
    ).toBe(false);
    expect(mixed.entries?.map((e) => e.name) ?? []).not.toContain(
      secret.serverName,
    );
    // When the call was answered with an archive, it is the readable file that is in it.
    if (mixed.status === 200) {
      expect(mixed.downloadStatus, "fetching the archive").toBe(200);
      const carried = mixed.isZip
        ? mixed.entries!.find((e) => e.name === open.serverName)?.bytes
        : mixed.bytes;
      expect(carried?.equals(open.bytes), "the readable file's bytes").toBe(
        true,
      );
    }
  });

  test("BUG XXXXX: PUT /files/fileops/bulkdownload - A request mixing a readable and an unreadable file answers 200 and skips the unreadable one instead of 403", async ({
    apiSdk,
  }) => {
    // JSDoc of bulkDownload: "an item the caller may not read fails the whole call with 403".
    // Reproduced with ordinary rooms, so it is not specific to private rooms: the call
    // answers 200 and packs only the readable file.
    const owner = apiSdk.forRole("owner");
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: false }]);
    const mkRoom = async (title: string) =>
      okBody(
        await owner.rooms.createRoom({
          createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
        }),
        `createRoom ${title}`,
      ).id!;
    const mkFile = async (roomId: number, title: string) =>
      okBody(
        await owner.files.createFile({
          folderId: roomId,
          createFileRequest: { title },
        }),
        `createFile ${title}`,
      ).id!;
    const openRoom = await mkRoom("Autotest Ordinary Mixed");
    const hiddenRoom = await mkRoom("Autotest Ordinary Hidden");
    const readable = await mkFile(openRoom, "readable.docx");
    const unreadable = await mkFile(hiddenRoom, "unreadable.docx");
    await inviteToRoom(owner, openRoom, member.id, FileShare.Read);
    // The premises: the member reads the first file and is refused the second.
    expect((await roomMemberAccess(owner, hiddenRoom)).has(member.id)).toBe(
      false,
    );
    expect(
      (await member.api.files.getFileInfo({ fileId: readable })).status,
      "the member reads the readable file",
    ).toBe(200);
    expect(
      (await member.api.files.getFileInfo({ fileId: unreadable })).status,
      "the member is refused the unreadable file",
    ).toBe(403);
    // Control: the member can fetch the readable file alone.
    expect(
      (await bulkDownload(member.api, member.token, { fileIds: [readable] }))
        .status,
    ).toBe(200);

    const mixed = await bulkDownload(member.api, member.token, {
      fileIds: [readable, unreadable],
    });

    // Known defect: the answer is 200 (the unreadable item is skipped) instead of 403.
    test.fail();
    expect(mixed.status).toBe(403);
  });

  test("PUT /files/fileops/bulkdownload - A single file comes back as itself", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(
      apiSdk,
      "DL-BULK-ONE",
    );

    const bulk = await bulkDownload(owner, ownerToken, { fileIds: [file.id] });

    expect(bulk.status).toBe(200);
    expect(bulk.downloadStatus).toBe(200);
    // Observed: a one-file request is not wrapped in a ZIP.
    if (bulk.isZip) expect(bulk.entries).toHaveLength(1);
    const bytes = bulk.isZip ? bulk.entries![0].bytes : bulk.bytes!;
    expect(bytes.equals(file.bytes)).toBe(true);
  });
});

test.describe("GET /files/file/:fileId/presigneduri - missing and malformed files", () => {
  test("GET /files/file/:fileId/presigneduri - A file that does not exist is not found", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(
      apiSdk,
      "DL-MISSING",
    );
    await expectDownloads(owner, ownerToken, file, "existing file (control)");

    const { status } = await owner.files.getPresignedUri({ fileId: 987654321 });

    expect(status).toBe(404);
  });

  test("GET /files/file/:fileId/presigneduri - A permanently deleted file is no longer served", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(
      apiSdk,
      "DL-DELETED",
    );
    const knownUrl = okBody(
      await owner.files.getPresignedUri({ fileId: file.id }),
      "getPresignedUri",
    ) as unknown as string;
    await expectDownloads(owner, ownerToken, file, "before deletion");

    const del = await owner.files.deleteFile({
      fileId: file.id,
      deleteFileRequest: { immediately: true },
    });
    expect(del.status).toBe(200);
    const op = await waitForOperation(owner.operations, {
      started: del.data.response,
    });
    expect(op.error).toBe("");

    expect(
      (await owner.files.getPresignedUri({ fileId: file.id })).status,
    ).toBe(404);
    const stale = await fetchAs(knownUrl, ownerToken);
    // No contract fixes the refusal status of an address for a deleted file; it must be a
    // refusal (4xx), never a server error, and carry none of the content.
    expect(stale.status).toBeGreaterThanOrEqual(400);
    expect(stale.status).toBeLessThan(500);
    expect(containsMarker(stale.bytes, "DL-DELETED")).toBe(false);
  });

  test("GET /files/file/:fileId/presigneduri - A malformed id never returns content", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, file } = await roomWithFile(
      apiSdk,
      "DL-MALFORMED",
    );
    await expectDownloads(owner, ownerToken, file, "existing file (control)");

    const { status } = await owner.files.getPresignedUri({
      fileId: "not-a-file-id",
    });

    // No contract fixes the status for a value that is no id; it must be a client
    // refusal (never a 5xx) and must not disturb the existing file.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    await expectDownloads(owner, ownerToken, file, "existing file (after)");
  });
});
