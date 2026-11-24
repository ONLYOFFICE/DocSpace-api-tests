import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK, UserType } from "@/src/services/api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  Api,
  ZERO_GUID,
  createOwnerPrivateRoom,
  inviteToRoom,
  roomKeyHolders,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  addAccounts,
  containsMarker,
  downloadVia,
  markedBytes,
  uploadEncrypted,
} from "@/src/helpers/private-room-download";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import {
  filesIn,
  getChunkSize,
  idsOf,
  openSession,
  rawRequest,
  sendNext,
  sendNumbered,
  storedFileId,
  unfinishedOperations,
  uploadInParts,
} from "@/src/helpers/private-room-upload";

/**
 * Uploading files into a private room (PR-UP-*, PR-ACL-001/002/010, PR-HUP).
 *
 * The portal accepts content into a private room only as a chunked-upload
 * session opened with `encrypted: true`, and never reads the bytes; the buffers
 * here are random with a unique marker, so they prove WHAT is stored and WHERE,
 * not that anything is really encrypted (that is the crypto package).
 *
 * Contract used: the SDK JSDoc of createUploadSessionInFolder (the caller must be
 * allowed to add content, an unknown folder is "not found", a negative size is
 * invalid), uploadSession / uploadAsyncSession (parts by arrival or by number, the
 * session is found by its id alone and the route folder is not matched against
 * it), finalizeSession and abortUploadSession (only the opener may cancel).
 *
 * What neither the JSDoc nor the HTML guide fixes - a keyless member's upload,
 * a session that outlives the opener's membership or the room's state, the exact
 * answer for a malformed id - is recorded as an `observation` annotation, not
 * asserted. Client-only rules (the key lock, Keep both / Cancel on equal names,
 * the "cannot remove member while uploading" block) have no REST surface.
 */

const observe = (what: string) =>
  test.info().annotations.push({ type: "observation", description: what });

/** An owner and a private Custom room. */
const setupRoom = async (apiSdk: ApiSDK) => {
  const owner = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const roomId = await createOwnerPrivateRoom(apiSdk);
  return { owner, ownerToken, roomId };
};

/** What a stored file must look like and carry, read back as the owner. */
const expectStored = async (
  owner: Api,
  ownerToken: string,
  fileId: number,
  expected: {
    bytes: Buffer;
    folderId: number;
    title?: string;
    ext?: string;
    createdBy?: string;
  },
) => {
  const { data, status } = await owner.files.getFileInfo({ fileId });
  expect(status, "getFileInfo").toBe(200);
  const info = data.response!;
  expect(info.folderId).toBe(expected.folderId);
  expect(info.encrypted).toBe(true);
  expect(info.pureContentLength).toBe(expected.bytes.length);
  expect(info.version).toBe(1);
  if (expected.title) expect(info.title).toBe(expected.title);
  if (expected.ext) expect(info.fileExst).toBe(`.${expected.ext}`);
  if (expected.createdBy) expect(info.createdBy?.id).toBe(expected.createdBy);
  const got = await downloadVia(owner, ownerToken, fileId);
  expect(got.issued, "presigneduri").toBe(200);
  expect(got.fetched, "fetching the bytes").toBe(200);
  expect(got.bytes!.equals(expected.bytes), "stored bytes differ").toBe(true);
};

/** A refused upload leaves the room as it was and no operation hanging. */
const expectUntouched = async (
  owner: Api,
  roomId: number,
  before: number[],
) => {
  expect(idsOf(await filesIn(owner, roomId))).toEqual(before);
  expect(await unfinishedOperations(owner)).toEqual([]);
};

const removeFromRoom = async (owner: Api, roomId: number, userId: string) => {
  const { status } = await owner.rooms.setRoomSecurity({
    id: roomId,
    roomInvitationRequest: {
      invitations: [{ id: userId, access: FileShare.None }],
      notify: false,
    },
  });
  expect(status, "removing a member").toBe(200);
};

const UPLOADERS = [
  { label: "RoomManager", type: "RoomAdmin", access: FileShare.RoomManager },
  { label: "ContentCreator", type: "User", access: FileShare.ContentCreator },
] as const satisfies readonly {
  label: string;
  type: UserType;
  access: FileShare;
}[];

test.describe("POST /files/:folderId/session - upload into a private room", () => {
  test("POST /files/:folderId/session - Owner uploads files of every kind and gets the bytes back", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const stored: number[] = [];
    // Office formats, a PDF and attachments the editors do not open.
    for (const ext of [
      "docx",
      "xlsx",
      "pptx",
      "pdf",
      "png",
      "mp3",
      "mp4",
      "zip",
    ]) {
      await test.step(`.${ext}`, async () => {
        const bytes = markedBytes(`UP-${ext}`, 700);
        const file = await uploadEncrypted(owner, roomId, { ext, bytes });
        stored.push(file.id);
        await expectStored(owner, ownerToken, file.id, {
          bytes,
          folderId: roomId,
          title: file.serverName,
          ext,
        });
      });
    }
    // Nothing else appeared next to them: no converted copy of any of the files.
    expect(idsOf(await filesIn(owner, roomId))).toEqual([...stored].sort());
  });

  for (const { label, type, access } of UPLOADERS) {
    test(`POST /files/:folderId/session - ${label} uploads a file into the room`, async ({
      apiSdk,
    }) => {
      const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
      const [member] = await addAccounts(apiSdk, [{ type, key: true }]);
      expect(
        (await inviteToRoom(owner, roomId, member.id, access)).status,
      ).toBe(200);
      expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
        access,
      );
      expect((await member.api.privacyroom.getUserKeys()).data.count).toBe(1);

      const bytes = markedBytes(`UP-${label}`);
      const file = await uploadEncrypted(member.api, roomId, { bytes });

      await expectStored(owner, ownerToken, file.id, {
        bytes,
        folderId: roomId,
        title: file.serverName,
        createdBy: member.id,
      });
      expect(idsOf(await filesIn(owner, roomId))).toEqual([file.id]);
    });
  }

  test("POST /files/:folderId/session - A file goes into the room root and into a nested folder", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const { data: outer } = await owner.folders.createFolder({
      folderId: roomId,
      createFolderRequest: { title: "outer" },
    });
    const { data: inner } = await owner.folders.createFolder({
      folderId: outer.response!.id!,
      createFolderRequest: { title: "inner" },
    });
    const innerId = inner.response!.id!;

    const rootBytes = markedBytes("UP-ROOT");
    const root = await uploadEncrypted(owner, roomId, { bytes: rootBytes });
    const deepBytes = markedBytes("UP-DEEP");
    const deep = await uploadEncrypted(owner, innerId, { bytes: deepBytes });

    await expectStored(owner, ownerToken, root.id, {
      bytes: rootBytes,
      folderId: roomId,
    });
    await expectStored(owner, ownerToken, deep.id, {
      bytes: deepBytes,
      folderId: innerId,
    });
    expect(idsOf(await filesIn(owner, roomId))).toEqual([root.id]);
    expect(idsOf(await filesIn(owner, innerId))).toEqual([deep.id]);
  });

  test("POST /files/:folderId/session - Files uploaded one after another keep their own content", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const uploaded = [];
    for (const marker of ["UP-SEQ-A", "UP-SEQ-B", "UP-SEQ-C"]) {
      const bytes = markedBytes(marker);
      uploaded.push({
        marker,
        bytes,
        file: await uploadEncrypted(owner, roomId, { bytes }),
      });
    }
    expect(new Set(uploaded.map((u) => u.file.id)).size).toBe(3);
    expect(new Set(uploaded.map((u) => u.file.serverName)).size).toBe(3);
    for (const { bytes, file, marker } of uploaded) {
      await expectStored(owner, ownerToken, file.id, {
        bytes,
        folderId: roomId,
        title: file.serverName,
      });
      // The other files' markers are not in this one.
      const got = await downloadVia(owner, ownerToken, file.id);
      for (const other of uploaded.filter((u) => u.marker !== marker))
        expect(containsMarker(got.bytes!, other.marker)).toBe(false);
    }
    expect(idsOf(await filesIn(owner, roomId))).toEqual(
      uploaded.map((u) => u.file.id).sort(),
    );
  });

  test("POST /files/:folderId/session - Concurrent uploads by several members all land with their own bytes", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const [manager, creator] = await addAccounts(apiSdk, [
      { type: "RoomAdmin", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, manager.id, FileShare.RoomManager);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);

    const jobs = [
      { who: owner, marker: "UP-PAR-O1" },
      { who: owner, marker: "UP-PAR-O2" },
      { who: manager.api, marker: "UP-PAR-M" },
      { who: creator.api, marker: "UP-PAR-C" },
    ].map((j) => ({ ...j, bytes: markedBytes(j.marker) }));
    const files = await Promise.all(
      jobs.map((j) => uploadEncrypted(j.who, roomId, { bytes: j.bytes })),
    );

    for (const [i, file] of files.entries())
      await expectStored(owner, ownerToken, file.id, {
        bytes: jobs[i].bytes,
        folderId: roomId,
        title: file.serverName,
      });
    expect(idsOf(await filesIn(owner, roomId))).toEqual(
      files.map((f) => f.id).sort(),
    );
  });

  test("POST /files/:folderId/session - The name of the multipart part is not kept, only the session's", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const bytes = markedBytes("UP-PARTNAME");
    const opened = await openSession(owner, roomId, { size: bytes.length });
    expect(opened.status).toBe(200);

    const sent = await sendNext(
      owner,
      roomId,
      opened.id!,
      bytes,
      "Quarterly-Report-Original-Name.docx",
    );
    expect(sent.status).toBe(201);

    const { data } = await owner.files.getFileInfo({
      fileId: storedFileId(sent),
    });
    expect(data.response?.title).toBe(opened.name);
    const files = await filesIn(owner, roomId);
    expect(JSON.stringify(data.response)).not.toContain("Quarterly");
    expect(JSON.stringify(files)).not.toContain("Quarterly");
  });

  test("POST /files/:folderId/session - A file larger than one part is uploaded in parts and comes back intact", async ({
    apiSdk,
  }) => {
    test.setTimeout(180_000);
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const chunk = await getChunkSize(owner);
    // Two parts: one full part and a short tail.
    const bytes = markedBytes("UP-MULTI", chunk + 1000);

    await test.step("parts sent in reverse order and one of them twice, then finalize", async () => {
      const up = await uploadInParts(owner, roomId, bytes, {
        partSize: chunk,
        order: "desc",
        repeatFirst: true,
      });
      expect(up.sent).toEqual([200, 200, 200]);
      expect(up.finalized.status).toBe(201);
      expect(up.id).toBeGreaterThan(0);
      await expectStored(owner, ownerToken, up.id, {
        bytes,
        folderId: roomId,
        title: up.opened.name,
      });
    });

    await test.step("parts appended by arrival complete the upload by themselves", async () => {
      const opened = await openSession(owner, roomId, { size: bytes.length });
      const first = await sendNext(
        owner,
        roomId,
        opened.id!,
        bytes.subarray(0, chunk),
      );
      expect(first.status).toBe(200);
      expect(storedFileId(first)).toBe(0);
      const last = await sendNext(
        owner,
        roomId,
        opened.id!,
        bytes.subarray(chunk),
      );
      expect(last.status).toBe(201);
      await expectStored(owner, ownerToken, storedFileId(last), {
        bytes,
        folderId: roomId,
        title: opened.name,
      });
    });
  });

  test("POST /files/:folderId/session - Finalize before every part arrived stores no file", async ({
    apiSdk,
  }) => {
    test.setTimeout(120_000);
    const { owner, roomId } = await setupRoom(apiSdk);
    const chunk = await getChunkSize(owner);
    const bytes = markedBytes("UP-INCOMPLETE", chunk + 1000);
    const opened = await openSession(owner, roomId, { size: bytes.length });
    expect(
      (
        await sendNumbered(
          owner,
          roomId,
          opened.id!,
          1,
          bytes.subarray(0, chunk),
        )
      ).status,
    ).toBe(200);

    const fin = await owner.operations.finalizeSession({
      folderId: roomId,
      sessionId: opened.id!,
    });

    // The JSDoc says finalize "assembles whatever is there"; the portal refuses.
    // That is the safer outcome, so only the end state is asserted.
    observe(`finalize with one of two parts: ${fin.status}`);
    expect(await filesIn(owner, roomId)).toEqual([]);
    expect(await unfinishedOperations(owner)).toEqual([]);
  });
});

test.describe("POST /files/:folderId/session - who may upload into a private room", () => {
  const REFUSED = [
    {
      label: "a member with Read access",
      type: "User",
      key: true,
      setup: "read",
    },
    {
      label: "a User who is not a member",
      type: "User",
      key: true,
      setup: "none",
    },
    {
      label: "a RoomAdmin who is not a member",
      type: "RoomAdmin",
      key: true,
      setup: "none",
    },
    {
      label: "a DocSpaceAdmin who is not a member",
      type: "DocSpaceAdmin",
      key: true,
      setup: "none",
    },
    { label: "a Guest", type: "Guest", key: false, setup: "none" },
    {
      label: "a member who was removed from the room",
      type: "User",
      key: true,
      setup: "removed",
    },
    {
      label: "a member of another private room",
      type: "User",
      key: true,
      setup: "other",
    },
  ] as const satisfies readonly {
    label: string;
    type: UserType;
    key: boolean;
    setup: "read" | "none" | "removed" | "other";
  }[];

  for (const { label, type, key, setup } of REFUSED) {
    test(`POST /files/:folderId/session - ${label[0].toUpperCase()}${label.slice(1)} cannot upload`, async ({
      apiSdk,
    }) => {
      const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
      const [account] = await addAccounts(apiSdk, [{ type, key }]);
      // Positive control: the room takes an upload from someone allowed to.
      const control = await uploadEncrypted(owner, roomId, {
        bytes: markedBytes("UP-CONTROL"),
      });

      if (setup === "read")
        expect(
          (await inviteToRoom(owner, roomId, account.id, FileShare.Read))
            .status,
        ).toBe(200);
      if (setup === "removed") {
        await inviteToRoom(owner, roomId, account.id, FileShare.ContentCreator);
        expect((await roomMemberAccess(owner, roomId)).get(account.id)).toBe(
          FileShare.ContentCreator,
        );
        await removeFromRoom(owner, roomId, account.id);
      }
      if (setup === "other") {
        const otherRoom = await createOwnerPrivateRoom(apiSdk);
        await inviteToRoom(
          owner,
          otherRoom,
          account.id,
          FileShare.ContentCreator,
        );
        expect((await roomMemberAccess(owner, otherRoom)).get(account.id)).toBe(
          FileShare.ContentCreator,
        );
      }
      // The premise the refusal rests on.
      expect((await roomMemberAccess(owner, roomId)).get(account.id)).toBe(
        setup === "read" ? FileShare.Read : undefined,
      );

      const before = idsOf(await filesIn(owner, roomId));
      expect(before).toEqual([control.id]);
      const opened = await openSession(account.api, roomId, { size: 20 });

      expect(opened.status).toBe(403);
      expect(opened.id).toBeUndefined();
      await expectUntouched(owner, roomId, before);
      await expectStored(owner, ownerToken, control.id, {
        bytes: control.bytes,
        folderId: roomId,
      });
    });
  }

  test("POST /files/:folderId/session - The Portal Owner who is not a member of a DocSpaceAdmin's private room cannot upload", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [admin] = await addAccounts(apiSdk, [
      { type: "DocSpaceAdmin", key: true },
    ]);
    const { data, status } = await admin.api.rooms.createRoom({
      createRoomRequestDto: {
        title: "Admin private " + apiSdk.faker.generateString(6),
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(status).toBe(200);
    const roomId = data.response!.id!;
    const control = await uploadEncrypted(admin.api, roomId, {
      bytes: markedBytes("UP-ADMINROOM"),
    });
    expect(
      (await roomMemberAccess(admin.api, roomId)).get(admin.id),
    ).toBeDefined();
    expect([
      ...(await roomMemberAccess(admin.api, roomId)).keys(),
    ]).not.toContain(await ownerId(owner));

    const opened = await openSession(owner, roomId, { size: 20 });

    expect(opened.status).toBe(403);
    expect(idsOf(await filesIn(admin.api, roomId))).toEqual([control.id]);
  });

  test("POST /files/:folderId/session - An anonymous caller cannot upload", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const control = await uploadEncrypted(owner, roomId);

    const res = await rawRequest(apiSdk, null, `${roomId}/session`, {
      json: {
        fileName: `${control.serverName}`,
        fileSize: 20,
        encrypted: true,
      },
    });

    expect(res.status).toBe(401);
    expect(idsOf(await filesIn(owner, roomId))).toEqual([control.id]);
  });
});

const ownerId = async (api: Api) =>
  (await api.profiles.getSelfProfile()).data.response!.id!;

test.describe("POST /files/:folderId/session - the uploader's account key", () => {
  test("POST /files/:folderId/session - A member with an active key uploads, and the room keeps working for them", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.ContentCreator);
    expect((await roomKeyHolders(owner, roomId)).sort()).toEqual(
      [member.id, await ownerId(owner)].sort(),
    );

    const bytes = markedBytes("UP-KEYED");
    const file = await uploadEncrypted(member.api, roomId, { bytes });

    await expectStored(owner, ownerToken, file.id, { bytes, folderId: roomId });
  });

  test("POST /files/:folderId/session - A member who deleted their account key stays a member; the upload is recorded, not asserted", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.ContentCreator);
    expect(
      (await member.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    // Membership and keys are separate: the member is still in the room without a key.
    expect((await member.api.privacyroom.getUserKeys()).data.count).toBe(0);
    expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
      FileShare.ContentCreator,
    );
    expect(await roomKeyHolders(owner, roomId)).not.toContain(member.id);

    const opened = await openSession(member.api, roomId, { size: 20 });
    observe(`keyless member opens a session: ${opened.status}`);
    if (opened.status === 200) {
      const sent = await sendNext(
        member.api,
        roomId,
        opened.id!,
        Buffer.alloc(20, 9),
      );
      observe(`keyless member sends the bytes: ${sent.status}`);
      observe(
        `files in the room afterwards: ${(await filesIn(owner, roomId)).length}`,
      );
    }
    // Whatever the answer, it did not change who is in the room.
    expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
      FileShare.ContentCreator,
    );
  });

  test("POST /files/:folderId/session - A member who replaced their account key uploads; the upload is recorded", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.ContentCreator);
    expect(
      (await member.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    expect(
      (
        await member.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "up-new-pk",
            privateKeyEnc: "up-new-prv",
          },
        })
      ).status,
    ).toBe(201);
    expect(await roomKeyHolders(owner, roomId)).toContain(member.id);

    const opened = await openSession(member.api, roomId, { size: 20 });
    observe(`replaced-key member opens a session: ${opened.status}`);
    if (opened.status === 200) {
      const sent = await sendNext(
        member.api,
        roomId,
        opened.id!,
        Buffer.alloc(20, 9),
      );
      observe(`replaced-key member sends the bytes: ${sent.status}`);
    }
  });

  for (const change of ["deleted", "replaced"] as const) {
    test(`POST /files/:folderId/session - The owner uploads into a room where a member ${change} their account key`, async ({
      apiSdk,
    }) => {
      const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
      const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
      await inviteToRoom(owner, roomId, member.id, FileShare.Read);
      expect(
        (await member.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
      ).toBe(204);
      if (change === "replaced")
        expect(
          (
            await member.api.privacyroom.setKeys({
              encryptionKeyRequestDto: {
                publicKey: "up-r-pk",
                privateKeyEnc: "up-r-prv",
              },
            })
          ).status,
        ).toBe(201);
      expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
        FileShare.Read,
      );

      const bytes = markedBytes(`UP-CO-${change}`);
      const file = await uploadEncrypted(owner, roomId, { bytes });

      await expectStored(owner, ownerToken, file.id, {
        bytes,
        folderId: roomId,
      });
      // The upload registered no file key for anyone, the keyless member included.
      const info = await member.api.files.getEncryptionInfo({
        fileId: file.id,
      });
      expect(info.data.response?.fileKeys ?? []).toEqual([]);
    });
  }
});

test.describe("POST /files/:folderId/session - file key entries around an upload", () => {
  test("POST /files/:folderId/session - The upload itself registers no file key entry for anyone", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [a, b] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, a.id, FileShare.Read);
    await inviteToRoom(owner, roomId, b.id, FileShare.Read);

    const file = await uploadEncrypted(owner, roomId);

    // Entries are wrapped by the client and sent afterwards; the server makes none.
    for (const [who, api] of [
      ["owner", owner],
      ["member A", a.api],
      ["member B", b.api],
    ] as const) {
      const { data, status } = await api.files.getEncryptionInfo({
        fileId: file.id,
      });
      expect(status, who).toBe(200);
      expect(data.response?.fileKeys ?? [], who).toEqual([]);
    }
  });

  test("POST /files/:fileId/access - The uploader registers entries for several members and each reads only their own", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [a, b] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, a.id, FileShare.Read);
    await inviteToRoom(owner, roomId, b.id, FileShare.Read);
    const file = await uploadEncrypted(owner, roomId);

    const issued = await owner.files.setEncryptionInfo({
      fileId: file.id,
      accessRequestKeyDto: [
        { userId: a.id, publicKeyId: ZERO_GUID, privateKeyEnc: "up-fk-A" },
        { userId: b.id, publicKeyId: ZERO_GUID, privateKeyEnc: "up-fk-B" },
      ],
    });

    expect(issued.status).toBe(200);
    expect(issued.data.response?.skippedUserIds ?? []).toEqual([]);
    const seenByA = await a.api.files.getEncryptionInfo({ fileId: file.id });
    const seenByB = await b.api.files.getEncryptionInfo({ fileId: file.id });
    expect(
      seenByA.data.response?.fileKeys?.map((k) => k.privateKeyEnc),
    ).toEqual(["up-fk-A"]);
    expect(
      seenByB.data.response?.fileKeys?.map((k) => k.privateKeyEnc),
    ).toEqual(["up-fk-B"]);
    // The key listed beside the entry is the reader's own, not the other member's.
    expect(seenByA.data.response?.userKeys?.map((k) => k.userId)).toEqual([
      a.id,
    ]);
    expect(seenByB.data.response?.userKeys?.map((k) => k.userId)).toEqual([
      b.id,
    ]);
    const entry = seenByA.data.response?.fileKeys?.[0];
    observe(`entry of member A: ${JSON.stringify(entry)}`);
  });

  test("POST /files/:fileId/access - A ContentCreator registers entries for their own upload", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [creator, reader, stranger] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);
    await inviteToRoom(owner, roomId, reader.id, FileShare.Read);
    const file = await uploadEncrypted(creator.api, roomId);

    const issued = await creator.api.files.setEncryptionInfo({
      fileId: file.id,
      accessRequestKeyDto: [
        {
          userId: creator.id,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "up-cc-self",
        },
        {
          userId: reader.id,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "up-cc-reader",
        },
        {
          userId: stranger.id,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: "up-cc-stranger",
        },
      ],
    });

    expect(issued.status).toBe(200);
    // The two members got an entry; the user outside the room was skipped.
    expect(issued.data.response?.skippedUserIds).toEqual([stranger.id]);
    const own = await creator.api.files.getEncryptionInfo({ fileId: file.id });
    expect(own.data.response?.fileKeys?.map((k) => k.privateKeyEnc)).toEqual([
      "up-cc-self",
    ]);
    const theirs = await reader.api.files.getEncryptionInfo({
      fileId: file.id,
    });
    expect(theirs.data.response?.fileKeys?.map((k) => k.privateKeyEnc)).toEqual(
      ["up-cc-reader"],
    );
    // Outsiders read nothing: the user outside the room is refused, the owner is not.
    const outsider = await stranger.api.files.getEncryptionInfo({
      fileId: file.id,
    });
    expect(outsider.status).toBe(403);
    expect(JSON.stringify(outsider.data)).not.toContain("up-cc-");
    expect(
      (await owner.files.getEncryptionInfo({ fileId: file.id })).status,
    ).toBe(200);
  });

  test("POST /files/:fileId/access - Entries of two files are independent", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [a, b] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, a.id, FileShare.Read);
    await inviteToRoom(owner, roomId, b.id, FileShare.Read);
    const first = await uploadEncrypted(owner, roomId);
    const second = await uploadEncrypted(owner, roomId);

    for (const [file, member, value] of [
      [first, a, "up-ind-first-A"],
      [second, b, "up-ind-second-B"],
    ] as const)
      expect(
        (
          await owner.files.setEncryptionInfo({
            fileId: file.id,
            accessRequestKeyDto: [
              {
                userId: member.id,
                publicKeyId: ZERO_GUID,
                privateKeyEnc: value,
              },
            ],
          })
        ).status,
      ).toBe(200);

    const keysOf = async (member: typeof a, fileId: number) =>
      (
        await member.api.files.getEncryptionInfo({ fileId })
      ).data.response?.fileKeys?.map((k) => k.privateKeyEnc) ?? [];
    expect(await keysOf(a, first.id)).toEqual(["up-ind-first-A"]);
    expect(await keysOf(a, second.id)).toEqual([]);
    expect(await keysOf(b, second.id)).toEqual(["up-ind-second-B"]);
    expect(await keysOf(b, first.id)).toEqual([]);
  });
});

test.describe("POST /files/:folderId/session - cancelling an upload", () => {
  test("DELETE /files/:folderId/session/:sessionId - An upload cancelled after the session opened stores nothing and cannot be continued", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const before = idsOf(await filesIn(owner, roomId));
    const opened = await openSession(owner, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    const aborted = await owner.operations.abortUploadSession({
      folderId: roomId,
      sessionId: opened.id!,
    });

    expect(aborted.status).toBe(200);
    const late = await sendNext(owner, roomId, opened.id!, Buffer.alloc(20, 9));
    observe(`sending into a cancelled session: ${late.status}`);
    expect(late.status).toBeGreaterThanOrEqual(400);
    await expectUntouched(owner, roomId, before);
    expect(storedFileId(late)).toBe(0);

    // A second cancel is not safe to repeat (JSDoc): the record is gone.
    const again = await owner.operations.abortUploadSession({
      folderId: roomId,
      sessionId: opened.id!,
    });
    observe(`second cancel: ${again.status}`);
    expect(again.status).toBeGreaterThanOrEqual(400);

    // Uploading again under the same name works and stores the new bytes only.
    const bytes = markedBytes("UP-AFTER-CANCEL");
    const retry = await openSession(owner, roomId, {
      size: bytes.length,
      fileName: opened.name,
    });
    expect(retry.status).toBe(200);
    const sent = await sendNext(owner, roomId, retry.id!, bytes);
    expect(sent.status).toBe(201);
    await expectStored(owner, ownerToken, storedFileId(sent), {
      bytes,
      folderId: roomId,
      title: opened.name,
    });
    expect(await filesIn(owner, roomId)).toHaveLength(1);
  });

  test("DELETE /files/:folderId/session/:sessionId - An upload cancelled after one part and after several parts stores nothing", async ({
    apiSdk,
  }) => {
    test.setTimeout(180_000);
    const { owner, roomId } = await setupRoom(apiSdk);
    const chunk = await getChunkSize(owner);
    const bytes = markedBytes("UP-CANCEL", chunk + 1000);
    const before = idsOf(await filesIn(owner, roomId));

    await test.step("after the first part", async () => {
      const s = await openSession(owner, roomId, { size: bytes.length });
      expect(
        (await sendNumbered(owner, roomId, s.id!, 1, bytes.subarray(0, chunk)))
          .status,
      ).toBe(200);
      expect(
        (
          await owner.operations.abortUploadSession({
            folderId: roomId,
            sessionId: s.id!,
          })
        ).status,
      ).toBe(200);
      await expectUntouched(owner, roomId, before);
    });

    await test.step("after all parts but before finalize", async () => {
      const s = await openSession(owner, roomId, { size: bytes.length });
      expect(
        (await sendNumbered(owner, roomId, s.id!, 1, bytes.subarray(0, chunk)))
          .status,
      ).toBe(200);
      expect(
        (await sendNumbered(owner, roomId, s.id!, 2, bytes.subarray(chunk)))
          .status,
      ).toBe(200);
      expect(
        (
          await owner.operations.abortUploadSession({
            folderId: roomId,
            sessionId: s.id!,
          })
        ).status,
      ).toBe(200);
      await expectUntouched(owner, roomId, before);
      // The session is gone: neither a part nor finalize can bring the file back.
      const part = await sendNumbered(
        owner,
        roomId,
        s.id!,
        2,
        bytes.subarray(chunk),
      );
      const fin = await owner.operations.finalizeSession({
        folderId: roomId,
        sessionId: s.id!,
      });
      expect(part.status).toBeGreaterThanOrEqual(400);
      expect(fin.status).toBeGreaterThanOrEqual(400);
      await expectUntouched(owner, roomId, before);
    });
  });

  test("DELETE /files/:folderId/session/:sessionId - Only the member who opened a session may cancel it", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [creator, manager] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "RoomAdmin", key: true },
    ]);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);
    await inviteToRoom(owner, roomId, manager.id, FileShare.RoomManager);
    const opened = await openSession(creator.api, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    // Even a room manager is refused; the session is still there for its opener.
    const foreign = await manager.api.operations.abortUploadSession({
      folderId: roomId,
      sessionId: opened.id!,
    });
    expect(foreign.status).toBe(403);
    const bytes = Buffer.alloc(20, 9);
    const sent = await sendNext(creator.api, roomId, opened.id!, bytes);
    expect(sent.status).toBe(201);
  });

  test("POST /files/:folderId/session/:sessionId - A session reaches the folder it was opened for, whatever folder the route names", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const otherRoom = await createOwnerPrivateRoom(apiSdk);
    const bytes = Buffer.alloc(20, 9);
    const opened = await openSession(owner, roomId, { size: bytes.length });

    const sent = await sendNext(owner, otherRoom, opened.id!, bytes);

    // JSDoc: the folder in the path is not matched against the session.
    expect(sent.status).toBe(201);
    await expectStored(owner, ownerToken, storedFileId(sent), {
      bytes,
      folderId: roomId,
      title: opened.name,
    });
    expect(await filesIn(owner, otherRoom)).toEqual([]);
  });

  test("POST /files/:folderId/session/:sessionId - A session id is a capability: whoever holds it can send into it (recorded)", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [creator, outsider] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);
    const opened = await openSession(creator.api, roomId, { size: 20 });
    expect(opened.status).toBe(200);
    // The premise: outside the room the user cannot open a session of their own.
    expect((await openSession(outsider.api, roomId, { size: 20 })).status).toBe(
      403,
    );

    const sent = await sendNext(
      outsider.api,
      roomId,
      opened.id!,
      Buffer.alloc(20, 9),
    );

    // JSDoc: "The session is addressed by its id". Whether a non-member may
    // complete someone else's session is not defined.
    observe(
      `a user outside the room sends into a session opened by a member: ${sent.status}`,
    );
    if (sent.status === 201) {
      const { data } = await owner.files.getFileInfo({
        fileId: storedFileId(sent),
      });
      observe(
        `the file is attributed to: ${data.response?.createdBy?.id === creator.id ? "the opener" : "the sender"}`,
      );
    }
  });
});

test.describe("POST /files/:folderId/session - the membership changes while a session is open", () => {
  test("POST /files/:folderId/session/:sessionId - A member removed during an upload cannot open another, the open one is recorded", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [creator] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);
    const opened = await openSession(creator.api, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    await removeFromRoom(owner, roomId, creator.id);

    expect((await openSession(creator.api, roomId, { size: 20 })).status).toBe(
      403,
    );
    const sent = await sendNext(
      creator.api,
      roomId,
      opened.id!,
      Buffer.alloc(20, 9),
    );
    observe(
      `the removed member finishes the session opened before: ${sent.status}`,
    );
    observe(`files in the room: ${(await filesIn(owner, roomId)).length}`);
  });

  test("POST /files/:folderId/session/:sessionId - A member lowered to Read during an upload cannot open another, the open one is recorded", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [creator] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);
    const opened = await openSession(creator.api, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    await inviteToRoom(owner, roomId, creator.id, FileShare.Read);
    expect((await roomMemberAccess(owner, roomId)).get(creator.id)).toBe(
      FileShare.Read,
    );

    expect((await openSession(creator.api, roomId, { size: 20 })).status).toBe(
      403,
    );
    const sent = await sendNext(
      creator.api,
      roomId,
      opened.id!,
      Buffer.alloc(20, 9),
    );
    observe(
      `the lowered member finishes the session opened before: ${sent.status}`,
    );
  });

  test("POST /files/:folderId/session/:sessionId - A member who deletes their account key during an upload; the open session is recorded", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const [creator] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, creator.id, FileShare.ContentCreator);
    const opened = await openSession(creator.api, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    expect(
      (await creator.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    expect((await roomMemberAccess(owner, roomId)).get(creator.id)).toBe(
      FileShare.ContentCreator,
    );

    const sent = await sendNext(
      creator.api,
      roomId,
      opened.id!,
      Buffer.alloc(20, 9),
    );
    observe(`finishing the session after the key was deleted: ${sent.status}`);
  });

  test("POST /files/:folderId/session/:sessionId - A room archived during an upload refuses new sessions, the open one is recorded", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const opened = await openSession(owner, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    await archiveRoomAndWait(apiSdk, roomId);

    expect((await openSession(owner, roomId, { size: 20 })).status).toBe(403);
    const sent = await sendNext(owner, roomId, opened.id!, Buffer.alloc(20, 9));
    observe(
      `finishing the session after the room was archived: ${sent.status}`,
    );
    observe(
      `files in the archived room: ${(await filesIn(owner, roomId)).length}`,
    );
  });
});

test.describe("POST /files/:folderId/session - refused and invalid uploads", () => {
  test("POST /files/:folderId/session - An upload into a folder that does not exist is answered as not found", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);

    const opened = await openSession(owner, 2147480000, { size: 20 });

    expect(opened.status).toBe(404);
    await expectUntouched(owner, roomId, []);
  });

  test("POST /files/:folderId/session - An upload into a folder deleted from the room is answered as not found", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const { data } = await owner.folders.createFolder({
      folderId: roomId,
      createFolderRequest: { title: "short-lived" },
    });
    const folderId = data.response!.id!;
    expect((await openSession(owner, folderId, { size: 20 })).status).toBe(200);
    expect(
      (
        await owner.folders.deleteFolder({
          folderId,
          deleteFolderRequest: { deleteAfter: false, immediately: true },
        })
      ).status,
    ).toBe(200);
    await waitForOperation(owner.operations);

    const opened = await openSession(owner, folderId, { size: 20 });

    expect(opened.status).toBe(404);
    await expectUntouched(owner, roomId, []);
  });

  test("POST /files/:folderId/session - An upload into an archived private room is refused", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const control = await uploadEncrypted(owner, roomId);
    await archiveRoomAndWait(apiSdk, roomId);

    const opened = await openSession(owner, roomId, { size: 20 });

    // JSDoc is silent about archived rooms; the refusal is the observed answer.
    expect(opened.status).toBe(403);
    expect(idsOf(await filesIn(owner, roomId))).toEqual([control.id]);
    expect(await unfinishedOperations(owner)).toEqual([]);
  });

  test("POST /files/:folderId/session - A negative size is rejected when the session opens", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);

    const opened = await openSession(owner, roomId, { size: -1 });

    expect(opened.status).toBe(400);
    expect(opened.id).toBeUndefined();
    await expectUntouched(owner, roomId, []);
  });

  test("POST /files/:folderId/session - A session without a file name is rejected", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);

    const opened = await openSession(owner, roomId, { size: 20, fileName: "" });

    expect(opened.status).toBe(400);
    expect(opened.id).toBeUndefined();
    await expectUntouched(owner, roomId, []);
  });

  test("POST /files/:folderId/session - A malformed folder id opens no session (answer recorded)", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);

    const opened = await openSession(owner, "not-a-folder-id", { size: 20 });

    observe(`malformed folder id: ${opened.status}`);
    expect(opened.id).toBeUndefined();
    await expectUntouched(owner, roomId, []);
  });

  for (const flag of [false, null] as const) {
    test(`POST /files/:folderId/session - An upload ${flag === null ? "without the encrypted flag" : "with encrypted: false"} is refused and creates no file`, async ({
      apiSdk,
    }) => {
      const { owner, roomId } = await setupRoom(apiSdk);
      const control = await uploadEncrypted(owner, roomId);

      const opened = await openSession(owner, roomId, {
        size: 20,
        ext: "docx",
        encrypted: flag,
      });

      // The JSDoc of `encrypted` says false stores the bytes as they arrive and
      // does not mention a private room; the refusal is the observed answer.
      expect(opened.status).toBe(403);
      expect(opened.id).toBeUndefined();
      await expectUntouched(owner, roomId, [control.id]);
    });
  }

  test("POST /files/:folderId/upload - The general upload routes cannot put a plain file into a private room", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const ownerToken = apiSdk.tokenStore.getToken("owner");
    const control = await uploadEncrypted(owner, roomId);
    const bytes = markedBytes("UP-PLAIN", 40);

    const simple = await rawRequest(apiSdk, ownerToken, `${roomId}/upload`, {
      multipart: { name: "plain.docx", bytes },
    });
    // Conversion-related switches change nothing about the refusal.
    const switched = await rawRequest(apiSdk, ownerToken, `${roomId}/upload`, {
      multipart: { name: "plain.docx", bytes },
      query:
        "storeOriginalFile=false&createNewIfExist=true&keepConvertStatus=true",
    });
    const inserted = await rawRequest(apiSdk, ownerToken, `${roomId}/insert`, {
      multipart: { name: "plain.docx", bytes },
    });

    expect(simple.status).toBe(403);
    expect(switched.status).toBe(403);
    observe(`POST /files/{id}/insert with a plain body: ${inserted.status}`);
    await expectUntouched(owner, roomId, [control.id]);
  });

  test("POST /files/:folderId/session - Uploading over an existing private file without the encrypted flag is refused and changes nothing", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const original = await uploadEncrypted(owner, roomId, {
      bytes: markedBytes("UP-ORIGINAL"),
    });

    const opened = await openSession(owner, roomId, {
      size: 20,
      fileName: original.serverName,
      encrypted: false,
      createNewIfExist: false,
    });

    expect(opened.status).toBe(403);
    await expectUntouched(owner, roomId, [original.id]);
    await expectStored(owner, ownerToken, original.id, {
      bytes: original.bytes,
      folderId: roomId,
      title: original.serverName,
    });
  });

  test("POST /files/:folderId/session - One refused upload among several does not spoil the others, and a retry succeeds", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const good = [markedBytes("UP-BATCH-1"), markedBytes("UP-BATCH-2")];

    const results = await Promise.all([
      uploadEncrypted(owner, roomId, { bytes: good[0] }),
      openSession(owner, roomId, { size: 20, encrypted: false }),
      uploadEncrypted(owner, roomId, { bytes: good[1] }),
    ]);

    const [first, refused, second] = results;
    expect(refused.status).toBe(403);
    expect(idsOf(await filesIn(owner, roomId))).toEqual(
      [first.id, second.id].sort(),
    );
    await expectStored(owner, ownerToken, first.id, {
      bytes: good[0],
      folderId: roomId,
    });
    await expectStored(owner, ownerToken, second.id, {
      bytes: good[1],
      folderId: roomId,
    });

    // The same upload sent properly afterwards goes through.
    const retryBytes = markedBytes("UP-BATCH-RETRY");
    const retry = await uploadEncrypted(owner, roomId, { bytes: retryBytes });
    await expectStored(owner, ownerToken, retry.id, {
      bytes: retryBytes,
      folderId: roomId,
    });
    expect(await filesIn(owner, roomId)).toHaveLength(3);
  });

  test("POST /files/:folderId/session - Uploading under an existing server name stores a second file and keeps the first", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
    const firstBytes = markedBytes("UP-SAMENAME-1");
    const first = await uploadEncrypted(owner, roomId, { bytes: firstBytes });
    const secondBytes = markedBytes("UP-SAMENAME-2");

    const opened = await openSession(owner, roomId, {
      size: secondBytes.length,
      fileName: first.serverName,
    });
    expect(opened.status).toBe(200);
    const sent = await sendNext(owner, roomId, opened.id!, secondBytes);

    expect(sent.status).toBe(201);
    const secondId = storedFileId(sent);
    expect(secondId).not.toBe(first.id);
    // No overwrite and no new version: two files, each at version 1 with its own bytes.
    await expectStored(owner, ownerToken, first.id, {
      bytes: firstBytes,
      folderId: roomId,
    });
    await expectStored(owner, ownerToken, secondId, {
      bytes: secondBytes,
      folderId: roomId,
    });
    expect(idsOf(await filesIn(owner, roomId))).toEqual(
      [first.id, secondId].sort(),
    );
    observe(
      `titles of the two files: ${(await filesIn(owner, roomId)).map((f) => f.title).join(" | ")}`,
    );
  });

  test("POST /files/:folderId/session - An empty file is accepted and stored as an empty file (recorded)", async ({
    apiSdk,
  }) => {
    const { owner, roomId } = await setupRoom(apiSdk);
    const opened = await openSession(owner, roomId, { size: 0 });
    observe(`opening a session for 0 bytes: ${opened.status}`);
    if (opened.status === 200) {
      const sent = await sendNext(owner, roomId, opened.id!, Buffer.alloc(0));
      observe(`sending 0 bytes: ${sent.status}`);
      observe(`files in the room: ${(await filesIn(owner, roomId)).length}`);
    }
  });

  test.fail(
    "BUG XXXXX: POST /files/:folderId/session/:sessionId - A payload shorter than the declared fileSize is stored with the declared size",
    async ({ apiSdk }) => {
      const { owner, ownerToken, roomId } = await setupRoom(apiSdk);
      const sent = Buffer.alloc(50, 5);
      const opened = await openSession(owner, roomId, { size: 100 });
      expect(opened.status).toBe(200);

      const res = await sendNext(owner, roomId, opened.id!, sent);

      // JSDoc: the declared size is "compared with the parts as they arrive". Either the
      // upload is refused, or the file reports the bytes it really holds.
      if (res.status === 201) {
        const fileId = storedFileId(res);
        const info = await owner.files.getFileInfo({ fileId });
        const got = await downloadVia(owner, ownerToken, fileId);
        observe(
          `declared 100, sent 50: file info says ${info.data.response?.pureContentLength}, download is ${got.bytes?.length} bytes`,
        );
        // The same upload into an ordinary room: the behaviour is not specific to private rooms.
        const plain = await owner.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Upload Plain " + apiSdk.faker.generateString(6),
            roomType: RoomType.CustomRoom,
          },
        });
        const plainRoom = plain.data.response?.id;
        if (plainRoom) {
          const po = await openSession(owner, plainRoom, {
            size: 100,
            encrypted: false,
          });
          if (po.id) {
            const pr = await sendNext(owner, plainRoom, po.id, sent);
            const pi = await owner.files.getFileInfo({
              fileId: storedFileId(pr),
            });
            observe(
              `ordinary room, declared 100, sent 50: ${pr.status}, file info says ${pi.data.response?.pureContentLength}`,
            );
          }
        }
        expect(info.data.response?.pureContentLength).toBe(got.bytes?.length);
      } else {
        expect(res.status).toBe(400);
        expect(await filesIn(owner, roomId)).toEqual([]);
      }
    },
  );
});
