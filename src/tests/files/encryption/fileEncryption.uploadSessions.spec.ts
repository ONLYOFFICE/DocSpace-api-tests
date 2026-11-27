import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import {
  Api,
  ZERO_GUID,
  createOwnerPrivateRoom,
  inviteToRoom,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  addAccounts,
  downloadVia,
  markedBytes,
} from "@/src/helpers/private-room-download";
import {
  filesIn,
  getChunkSize,
  idsOf,
  openSession,
  sendNext,
  sendNumbered,
  storedFileId,
  unfinishedOperations,
} from "@/src/helpers/private-room-upload";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

/**
 * Who may work with an open upload session of a private room, and what a
 * session survives (PR-UP-053/054, PR-MEM-025, PR-SEC-027, SPEC-017/018).
 *
 * The session id is documented as a delegated capability: the SDK JSDoc of
 * ChunkedUploadSessionDto.id says it "is the only thing the server checks, so
 * anyone holding it can write into this upload", and of uploadSession that the
 * session "is addressed by its id". The one operation the JSDoc ties to the
 * opener is cancelling. So what is ASSERTED here is what the JSDoc promises -
 * only the opener cancels, an anonymous caller is rejected, a session of a
 * deleted room or folder or one that is finished or cancelled is gone, nothing
 * is written to a place other than the session's folder. What else a holder of
 * the id can do (send into it, finalize it, keep using it after the opener lost
 * their place) has no defined status or policy, so only the invariants that hold
 * either way are asserted: no server error, at most one file per session, a file
 * that appears is whole, encrypted and in the session's folder, nothing is left
 * unfinished. The statuses and attribution are not asserted (SPEC GAP in the audit).
 *
 * The session ids used are the tests' own; nothing is guessed.
 */

/** A DocSpaceAdmin's private room with a ContentCreator (the opener), a reader and outsiders. */
const sessionRoom = async (apiSdk: ApiSDK) => {
  const portalOwner = apiSdk.forRole("owner");
  const [admin, creator, reader, outsider, otherAdmin] = await addAccounts(
    apiSdk,
    [
      { type: "DocSpaceAdmin", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "DocSpaceAdmin", key: true },
    ],
  );
  const created = await admin.api.rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest Sessions " + apiSdk.faker.generateString(6),
      roomType: RoomType.CustomRoom,
      private: true,
    },
  });
  expect(created.status).toBe(200);
  const roomId = created.data.response!.id!;
  expect(
    (
      await inviteToRoom(
        admin.api,
        roomId,
        creator.id,
        FileShare.ContentCreator,
      )
    ).status,
  ).toBe(200);
  expect(
    (await inviteToRoom(admin.api, roomId, reader.id, FileShare.Read)).status,
  ).toBe(200);
  // The premise of every "not a member" below.
  const members = [...(await roomMemberAccess(admin.api, roomId)).keys()];
  expect(members).toContain(creator.id);
  expect(members).not.toContain(outsider.id);
  expect(members).not.toContain(otherAdmin.id);
  return { portalOwner, admin, creator, reader, outsider, otherAdmin, roomId };
};

const rawSession = async (
  apiSdk: ApiSDK,
  method: "POST" | "DELETE",
  roomId: number,
  sessionId: string,
) => {
  const response = await apiSdk.request.fetch(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/${roomId}/session/${sessionId}`,
    {
      method,
      headers: {
        Cookie: "",
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
      ...(method === "POST"
        ? {
            multipart: {
              file: {
                name: "p",
                mimeType: "application/octet-stream",
                buffer: Buffer.alloc(20, 3),
              },
            },
          }
        : {}),
    },
  );
  return response.status();
};

/** What a file the room gained is, as the room's admin reads it back. */
const describeFile = async (
  admin: Api,
  token: string,
  fileId: number,
  creatorId: string,
  senderId: string,
) => {
  const info = await admin.files.getFileInfo({ fileId });
  const f = info.data.response!;
  const got = await downloadVia(admin, token, fileId);
  return {
    folderId: f.folderId,
    encrypted: f.encrypted,
    size: f.pureContentLength,
    author:
      f.createdBy?.id === senderId
        ? "the sender"
        : f.createdBy?.id === creatorId
          ? "the opener"
          : "somebody else",
    bytes: got.bytes!,
  };
};

test.describe("Upload sessions - the opener's session and who else may use it", () => {
  test("DELETE /files/:folderId/session/:sessionId - Only the opener cancels a session, and the attempts of everybody else leave it intact", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const {
      portalOwner,
      admin,
      creator,
      reader,
      outsider,
      otherAdmin,
      roomId,
    } = await sessionRoom(apiSdk);
    const bytes = markedBytes("P3-OPENER", 60);
    const opened = await openSession(creator.api, roomId, {
      size: bytes.length,
    });
    expect(opened.status).toBe(200);

    const attempts: [string, Api][] = [
      ["a member with Read access", reader.api],
      ["the owner of the room", admin.api],
      ["a user who is not a member", outsider.api],
      ["a DocSpaceAdmin who is not a member", otherAdmin.api],
      ["the Portal Owner who is not a member", portalOwner],
    ];
    for (const [who, api] of attempts) {
      const res = await api.operations.abortUploadSession({
        folderId: roomId,
        sessionId: opened.id!,
      });
      expect.soft(res.status, `cancel by ${who}`).toBe(403);
    }
    const anonymous = await rawSession(apiSdk, "DELETE", roomId, opened.id!);
    expect.soft(anonymous, "cancel by an anonymous caller").toBe(401);

    // The session is still there: its opener finishes it with their own bytes.
    const sent = await sendNext(creator.api, roomId, opened.id!, bytes);
    expect(sent.status).toBe(201);
    const stored = await filesIn(admin.api, roomId);
    expect(stored.map((f) => f.id)).toEqual([storedFileId(sent)]);
    expect(stored[0].size).toBe(bytes.length);
    expect(stored[0].encrypted).toBe(true);
  });

  test("POST /files/:folderId/session/:sessionId - An anonymous caller cannot send into a session, which stays usable by its opener", async ({
    apiSdk,
  }) => {
    const { admin, creator, roomId } = await sessionRoom(apiSdk);
    const opened = await openSession(creator.api, roomId, { size: 20 });
    expect(opened.status).toBe(200);

    expect(await rawSession(apiSdk, "POST", roomId, opened.id!)).toBe(401);

    expect(await filesIn(admin.api, roomId)).toEqual([]);
    const sent = await sendNext(
      creator.api,
      roomId,
      opened.id!,
      Buffer.alloc(20, 4),
    );
    expect(sent.status).toBe(201);
    expect(idsOf(await filesIn(admin.api, roomId))).toEqual([
      storedFileId(sent),
    ]);
  });

  test("POST /files/:folderId/session/:sessionId - A holder of the id outside the opener's rights never produces a server error, a second file or a broken one", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const {
      portalOwner,
      admin,
      creator,
      reader,
      outsider,
      otherAdmin,
      roomId,
    } = await sessionRoom(apiSdk);
    const ownerToken = admin.token;
    const holders: [string, Api, string][] = [
      ["a member with Read access", reader.api, reader.id],
      ["a user who is not a member", outsider.api, outsider.id],
      ["a DocSpaceAdmin who is not a member", otherAdmin.api, otherAdmin.id],
      [
        "the Portal Owner who is not a member",
        portalOwner,
        (await portalOwner.profiles.getSelfProfile()).data.response!.id!,
      ],
    ];
    for (const [who, api, senderId] of holders) {
      const mine = Buffer.alloc(20, 1);
      const theirs = Buffer.alloc(20, 2);
      const before = idsOf(await filesIn(admin.api, roomId));
      const opened = await openSession(creator.api, roomId, { size: 20 });
      expect(opened.status).toBe(200);

      const sent = await sendNext(api, roomId, opened.id!, theirs);

      const after = await filesIn(admin.api, roomId);
      const gained = after.filter((f) => !before.includes(f.id));
      if (gained.length === 1) {
        const f = await describeFile(
          admin.api,
          ownerToken,
          gained[0].id,
          creator.id,
          senderId,
        );
        // Whatever the policy, the file is whole and where the session said.
        expect(f.folderId).toBe(roomId);
        expect(f.encrypted).toBe(true);
        expect(f.bytes.equals(theirs)).toBe(true);
      }
      const late = await sendNext(creator.api, roomId, opened.id!, mine);
      expect(sent.status, `${who} sends: not a server error`).toBeLessThan(500);
      expect(late.status, `the opener sends after ${who}`).toBeLessThan(500);
      expect(
        gained.length,
        `${who}: files from one session`,
      ).toBeLessThanOrEqual(1);
      // One session never yields a second file, whoever completed it.
      const final = (await filesIn(admin.api, roomId)).filter(
        (f) => !before.includes(f.id),
      );
      expect(
        final.length,
        `${who}: files after the opener's send`,
      ).toBeLessThanOrEqual(1);
      if (gained.length === 1)
        expect(final.map((f) => f.id)).toEqual([gained[0].id]);
    }
    expect(await unfinishedOperations(admin.api)).toEqual([]);
  });

  test("POST /files/:folderId/session/:sessionId - Parts of a large upload sent by two accounts never leave a server error, a second file or a broken one", async ({
    apiSdk,
  }) => {
    test.setTimeout(300_000);
    const { admin, creator, outsider, roomId } = await sessionRoom(apiSdk);
    const ownerToken = admin.token;
    const chunk = await getChunkSize(admin.api);
    const head = markedBytes("P3-HEAD", chunk);
    const tail = Buffer.alloc(1000, 9);

    await test.step("another account sends the last part by arrival", async () => {
      const opened = await openSession(creator.api, roomId, {
        size: head.length + tail.length,
      });
      expect(
        (await sendNext(creator.api, roomId, opened.id!, head)).status,
      ).toBe(200);
      const before = idsOf(await filesIn(admin.api, roomId));
      const done = await sendNext(outsider.api, roomId, opened.id!, tail);
      expect(done.status, "the last part by another account").toBeLessThan(500);
      const gained = (await filesIn(admin.api, roomId)).filter(
        (f) => !before.includes(f.id),
      );
      expect(gained.length, "files from one session").toBeLessThanOrEqual(1);
      // An answer that carries a stored file means the file exists.
      if (storedFileId(done))
        expect(gained.map((f) => f.id)).toEqual([storedFileId(done)]);
      if (gained.length === 1) {
        const f = await describeFile(
          admin.api,
          ownerToken,
          gained[0].id,
          creator.id,
          outsider.id,
        );
        expect(f.folderId).toBe(roomId);
        expect(f.encrypted).toBe(true);
        // Whatever the policy, the file holds the parts that were sent, whole.
        expect(f.bytes.equals(Buffer.concat([head, tail]))).toBe(true);
      }
    });

    await test.step("another account finalizes a numbered upload", async () => {
      const full = Buffer.concat([head, tail]);
      const opened = await openSession(creator.api, roomId, {
        size: full.length,
      });
      expect(
        (await sendNumbered(creator.api, roomId, opened.id!, 1, head)).status,
      ).toBe(200);
      expect(
        (await sendNumbered(creator.api, roomId, opened.id!, 2, tail)).status,
      ).toBe(200);
      const before = idsOf(await filesIn(admin.api, roomId));
      const fin = await outsider.api.operations.finalizeSession({
        folderId: roomId,
        sessionId: opened.id!,
      });
      expect(fin.status, "finalize by another account").toBeLessThan(500);
      const gained = (await filesIn(admin.api, roomId)).filter(
        (f) => !before.includes(f.id),
      );
      expect(gained.length, "files from one session").toBeLessThanOrEqual(1);
      if (gained.length === 1) {
        const f = await describeFile(
          admin.api,
          ownerToken,
          gained[0].id,
          creator.id,
          outsider.id,
        );
        expect(f.bytes.equals(full)).toBe(true);
      }
      const again = await creator.api.operations.finalizeSession({
        folderId: roomId,
        sessionId: opened.id!,
      });
      expect(again.status, "the opener then finalizes").toBeLessThan(500);
      const final = (await filesIn(admin.api, roomId)).filter(
        (f) => !before.includes(f.id),
      );
      expect(
        final.length,
        "files after the opener's finalize",
      ).toBeLessThanOrEqual(1);
    });
  });

  test("PUT /files/:folderId/session/:sessionId/finalize - A session open while the opener loses their place in the room never ends in a server error, a second file or a broken one", async ({
    apiSdk,
  }) => {
    test.setTimeout(300_000);
    const { admin, creator, roomId } = await sessionRoom(apiSdk);
    const ownerToken = admin.token;
    const chunk = await getChunkSize(admin.api);
    const full = markedBytes("P3-LOSE", chunk + 1000);

    const lose: [string, () => Promise<void>][] = [
      [
        "is removed from the room",
        async () => {
          const res = await admin.api.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [{ id: creator.id, access: FileShare.None }],
              notify: false,
            },
          });
          expect(res.status).toBe(200);
          expect([
            ...(await roomMemberAccess(admin.api, roomId)).keys(),
          ]).not.toContain(creator.id);
        },
      ],
      [
        "is lowered to Read",
        async () => {
          expect(
            (await inviteToRoom(admin.api, roomId, creator.id, FileShare.Read))
              .status,
          ).toBe(200);
          expect(
            (await roomMemberAccess(admin.api, roomId)).get(creator.id),
          ).toBe(FileShare.Read);
        },
      ],
      [
        "deletes their account key",
        async () => {
          expect(
            (await creator.api.privacyroom.deleteKeys({ id: ZERO_GUID }))
              .status,
          ).toBe(204);
          expect((await creator.api.privacyroom.getUserKeys()).data.count).toBe(
            0,
          );
        },
      ],
    ];
    for (const [change, apply] of lose) {
      // Each case starts from an opener who is a ContentCreator with a key.
      expect(
        (
          await inviteToRoom(
            admin.api,
            roomId,
            creator.id,
            FileShare.ContentCreator,
          )
        ).status,
        `${change}: restoring the opener`,
      ).toBe(200);
      expect((await roomMemberAccess(admin.api, roomId)).get(creator.id)).toBe(
        FileShare.ContentCreator,
      );
      const keys = await creator.api.privacyroom.getUserKeys();
      if ((keys.data.count ?? 0) === 0)
        expect(
          (
            await creator.api.privacyroom.setKeys({
              encryptionKeyRequestDto: {
                publicKey: "p3-pk",
                privateKeyEnc: "p3-prv",
              },
            })
          ).status,
        ).toBe(201);
      const before = idsOf(await filesIn(admin.api, roomId));
      const opened = await openSession(creator.api, roomId, {
        size: full.length,
      });
      expect(opened.status).toBe(200);
      expect(
        (
          await sendNumbered(
            creator.api,
            roomId,
            opened.id!,
            1,
            full.subarray(0, chunk),
          )
        ).status,
      ).toBe(200);

      await apply();

      const second = await sendNumbered(
        creator.api,
        roomId,
        opened.id!,
        2,
        full.subarray(chunk),
      );
      const fin = await creator.api.operations.finalizeSession({
        folderId: roomId,
        sessionId: opened.id!,
      });
      const gained = (await filesIn(admin.api, roomId)).filter(
        (f) => !before.includes(f.id),
      );
      expect(second.status, `${change}: second part`).toBeLessThan(500);
      expect(fin.status, `${change}: finalize`).toBeLessThan(500);
      if (gained.length === 1) {
        const f = await describeFile(
          admin.api,
          ownerToken,
          gained[0].id,
          creator.id,
          creator.id,
        );
        expect(f.folderId).toBe(roomId);
        expect(f.encrypted).toBe(true);
        expect(f.bytes.equals(full), `${change}: the file is whole`).toBe(true);
      }
      expect(
        gained.length,
        `${change}: files from one session`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("POST /files/:folderId/session/:sessionId - A session of a deleted folder or a deleted room is gone and stores nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const folder = (
      await owner.folders.createFolder({
        folderId: roomId,
        createFolderRequest: { title: "p3-gone" },
      })
    ).data.response!.id!;
    const inFolder = await openSession(owner, folder, { size: 20 });
    const inRoom = await openSession(owner, roomId, { size: 20 });
    expect(inFolder.status).toBe(200);
    expect(inRoom.status).toBe(200);

    expect(
      (
        await owner.folders.deleteFolder({
          folderId: folder,
          deleteFolderRequest: { deleteAfter: false, immediately: true },
        })
      ).status,
    ).toBe(200);
    expect((await waitForOperation(owner.operations)).error).toBe("");
    const afterFolder = await sendNext(
      owner,
      folder,
      inFolder.id!,
      Buffer.alloc(20, 5),
    );
    expect(afterFolder.status).toBe(404);
    expect(await filesIn(owner, roomId)).toEqual([]);

    // The room is archived and deleted for good.
    expect(
      (
        await owner.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        })
      ).status,
    ).toBe(200);
    expect((await waitForOperation(owner.operations)).error).toBe("");
    expect(
      (
        await owner.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        })
      ).status,
    ).toBe(200);
    expect((await waitForOperation(owner.operations)).error).toBe("");
    expect((await owner.rooms.getRoomInfo({ id: roomId })).status).toBe(404);
    const afterRoom = await sendNext(
      owner,
      roomId,
      inRoom.id!,
      Buffer.alloc(20, 6),
    );
    expect(afterRoom.status).toBe(404);
  });

  test("POST /files/:folderId/session/:sessionId - A finished or a cancelled session cannot be used again", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const finished = await openSession(owner, roomId, { size: 20 });
    const sent = await sendNext(
      owner,
      roomId,
      finished.id!,
      Buffer.alloc(20, 7),
    );
    expect(sent.status).toBe(201);
    const cancelled = await openSession(owner, roomId, { size: 20 });
    expect(
      (
        await owner.operations.abortUploadSession({
          folderId: roomId,
          sessionId: cancelled.id!,
        })
      ).status,
    ).toBe(200);
    const stored = idsOf(await filesIn(owner, roomId));
    expect(stored).toEqual([storedFileId(sent)]);

    for (const [name, id] of [
      ["finished", finished.id!],
      ["cancelled", cancelled.id!],
    ] as const) {
      const again = await sendNext(owner, roomId, id, Buffer.alloc(20, 8));
      expect.soft(again.status, `${name}: send`).toBe(404);
      const fin = await owner.operations.finalizeSession({
        folderId: roomId,
        sessionId: id,
      });
      expect.soft(fin.status, `${name}: finalize`).toBe(404);
      const abort = await owner.operations.abortUploadSession({
        folderId: roomId,
        sessionId: id,
      });
      expect.soft(abort.status, `${name}: cancel`).toBe(404);
    }
    // Nothing was added or changed by the repeated calls.
    expect(idsOf(await filesIn(owner, roomId))).toEqual(stored);
  });
});
