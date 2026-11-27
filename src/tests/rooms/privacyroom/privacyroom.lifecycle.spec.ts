import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import API from "@/src/services/api";
import { ApiSDK } from "@/src/services/api-sdk";
import { EmployeeStatus, FileShare } from "@onlyoffice/docspace-api-sdk";
import {
  ZERO_GUID,
  createOwnerPrivateRoom,
  inviteToRoom,
} from "@/src/helpers/private-rooms";
import {
  Account,
  addAccounts,
  downloadVia,
  markedBytes,
  uploadEncrypted,
} from "@/src/helpers/private-room-download";
import { snapshot } from "@/src/helpers/private-room-isolation";
import {
  accessOf,
  assertUniqueIds,
  expectNoServerError,
  expectRefused,
  invite,
  keysOf,
  issue,
  memberIds,
  newScene,
  ownerOf,
  rawMembers,
  reach,
} from "@/src/helpers/private-room-lifecycle";

/**
 * Invitations and the membership lifecycle of a private room (PR-INV, PR-MEM,
 * PR-PEND, PR-OWN-006, SPEC-008/011/029).
 *
 * Membership, the account key and the file key entries are three separate
 * things and every scenario reads all three back: who is in the room and with
 * which role (getRoomSecurityInfo), whether an account holds a key
 * (getUserKeys), and which wrapped file keys a member holds (getEncryptionInfo,
 * a caller sees only their own). Nothing here derives an expectation from what
 * the server happens to do: the guide's role table and the SDK JSDoc are the
 * references, and where they are silent the outcome is RECORDED as an
 * `observation`, with the invariants that must hold either way (nobody without a
 * key becomes a member, no duplicates, the owner and the content are untouched).
 *
 * Dummy file keys and bytes are used: whether a re-issued key really decrypts is
 * the crypto package. Roles, the full Access Pending matrix and parallel races
 * belong to packages 6, 8 and 17.
 */

test.describe("Inviting an existing user", () => {
  test("PUT /files/rooms/:id/share - A keyed user joins an empty room and a room with files, with every role, and nothing else changes", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const { owner, scene, roomId, ownerToken } = await newScene(
      apiSdk,
      "Life invite content",
    );
    const empty = await createOwnerPrivateRoom(apiSdk, "Life invite empty");
    const [reader, author, ce, c1, c2, c3, ra] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "RoomAdmin", key: true },
    ]);
    // Existing members of the room with content: one reads, one authors a file of their own.
    expect(
      (await inviteToRoom(owner, roomId, reader.id, FileShare.Read)).status,
    ).toBe(200);
    expect(
      (await inviteToRoom(owner, roomId, author.id, FileShare.ContentCreator))
        .status,
    ).toBe(200);
    const authorBytes = markedBytes("LIFE-AUTHOR");
    const authored = await uploadEncrypted(author.api, roomId, {
      bytes: authorBytes,
    });
    const files = [scene.rootFile.id, scene.deepFile.id, authored.id];
    await issue(owner, files, reader.id, "life-reader");
    await issue(owner, files, author.id, "life-author");

    // An empty room: the invitation works and the invitee reaches it.
    expect((await invite(owner, empty, ce.id, FileShare.Read)).status).toBe(
      200,
    );
    expect((await accessOf(owner, empty)).get(ce.id)).toBe(FileShare.Read);
    expect((await ce.api.rooms.getRoomInfo({ id: empty })).status).toBe(200);

    const roles: [Account, FileShare][] = [
      [c1, FileShare.Read],
      [c2, FileShare.Editing],
      [c3, FileShare.ContentCreator],
      [ra, FileShare.RoomManager],
    ];
    for (const [who, role] of roles) {
      const before = {
        snap: await snapshot(owner, scene),
        readerKeys: await keysOf(reader.api, scene.rootFile.id),
        authorKeys: await keysOf(author.api, authored.id),
        members: await memberIds(owner, roomId),
      };

      const res = await invite(owner, roomId, who.id, role);

      expect(res.status, `invite as ${role}`).toBe(200);
      const after = await accessOf(owner, roomId);
      expect(after.get(who.id), "the role").toBe(role);
      // memberIds proves uniqueness on the raw list.
      expect(
        (await memberIds(owner, roomId)).filter((id) => id === who.id),
      ).toHaveLength(1);
      expect([...after.keys()].sort()).toEqual(
        [...before.members, who.id].sort(),
      );
      // The invitee reaches the room, a nested folder and a file...
      const got = await reach(who.api, scene);
      expect
        .soft(
          got.room && got.content && got.nested && got.file,
          `${role}: reaches the room`,
        )
        .toBe(true);
      expect.soft(got.inPrivateRooms, `${role}: listed`).toBe(true);
      // ...but membership gave them no file key: that is a separate step.
      expect(
        await keysOf(who.api, scene.rootFile.id),
        `${role}: no file key yet`,
      ).toBe("[]");
      // Others' entries and the room are exactly as they were.
      expect(await keysOf(reader.api, scene.rootFile.id)).toBe(
        before.readerKeys,
      );
      expect(await keysOf(author.api, authored.id)).toBe(before.authorKeys);
      const afterSnap = await snapshot(owner, scene);
      expect({ ...afterSnap, members: undefined }).toEqual({
        ...before.snap,
        members: undefined,
      });
      expect(
        (await downloadVia(owner, ownerToken, scene.deepFile.id)).bytes!.equals(
          scene.deepFile.bytes,
        ),
      ).toBe(true);
      expect(
        (await downloadVia(owner, ownerToken, authored.id)).bytes!.equals(
          authorBytes,
        ),
      ).toBe(true);
    }

    // The missing-key list names the new members' files, and is empty once the keys are written.
    const missing = await owner.privacyroom.getRoomMissingFileKeys({ roomId });
    const forC1 = (missing.data.response ?? []).find((e) => e.userId === c1.id);
    expect(forC1?.fileIds?.slice().sort()).toEqual(files.slice().sort());
    for (const [who] of roles)
      await issue(owner, files, who.id, `life-${who.id.slice(0, 4)}`);
    const stillMissing = (
      (await owner.privacyroom.getRoomMissingFileKeys({ roomId })).data
        .response ?? []
    ).filter((e) => roles.some(([who]) => who.id === e.userId));
    expect(stillMissing, "members that were issued keys").toEqual([]);
    expect(await keysOf(c1.api, scene.rootFile.id)).not.toBe("[]");

    // The same user invited again with the same role: no change; with another role: the role changes, one entry.
    const members = await memberIds(owner, roomId);
    expect((await invite(owner, roomId, c1.id, FileShare.Read)).status).toBe(
      200,
    );
    expect((await memberIds(owner, roomId)).sort()).toEqual(
      [...members].sort(),
    );
    expect(
      (await invite(owner, roomId, c1.id, FileShare.ContentCreator)).status,
    ).toBe(200);
    expect((await accessOf(owner, roomId)).get(c1.id)).toBe(
      FileShare.ContentCreator,
    );
    expect(
      (await memberIds(owner, roomId)).filter((id) => id === c1.id),
    ).toHaveLength(1);
    // The role change is the only thing that changed for c1.
    expect((await memberIds(owner, roomId)).sort()).toEqual(
      [...members].sort(),
    );
  });

  test("PUT /files/rooms/:id/share - A user who never had a key, deleted it, or changed it between the candidate list and the invitation", async ({
    apiSdk,
  }) => {
    test.setTimeout(300_000);
    const { owner, scene, roomId } = await newScene(apiSdk, "Life key states");
    const [many, replaced, never, deleted, regained, raceReplace, raceDelete] =
      await addAccounts(apiSdk, [
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: false },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
      ]);
    const keyCount = async (a: Account) =>
      (await a.api.privacyroom.getUserKeys()).data.count;
    const state = async () => ({
      members: await memberIds(owner, roomId),
      snap: await snapshot(owner, scene),
    });
    const refuse = async (who: Account, label: string) => {
      const before = await state();
      const res = await invite(owner, roomId, who.id, FileShare.Read);
      // The guide: an invitation without a usable key is refused. The exact status is not fixed.
      expectRefused(res.status, `${label}: invitation`);
      expect(await state(), `${label}: nothing changed`).toEqual(before);
      expect((await accessOf(owner, roomId)).has(who.id)).toBe(false);
    };
    const join = async (who: Account, label: string) => {
      const res = await invite(owner, roomId, who.id, FileShare.Read);
      expect(res.status, label).toBe(200);
      expect((await accessOf(owner, roomId)).get(who.id), label).toBe(
        FileShare.Read,
      );
      expect(
        (await who.api.rooms.getRoomInfo({ id: roomId })).status,
        `${label}: reaches the room`,
      ).toBe(200);
    };

    // Several key records on the account.
    expect(
      (
        await many.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            id: randomUUID(),
            publicKey: "second-pk",
            privateKeyEnc: "second-prv",
          } as never,
        })
      ).status,
    ).toBe(201);
    expect(await keyCount(many)).toBe(2);
    await join(many, "a user with two key records");
    // A replaced key.
    expect(
      (
        await replaced.api.privacyroom.replaceKey({
          encryptionKeyRequestDto: {
            publicKey: "replaced-pk",
            privateKeyEnc: "replaced-prv",
          },
        })
      ).status,
    ).toBe(200);
    await join(replaced, "a user who replaced their key");

    // No key, a deleted key, then a new key.
    expect(await keyCount(never)).toBe(0);
    await refuse(never, "a user who never registered a key");
    expect(
      (await deleted.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    expect(await keyCount(deleted)).toBe(0);
    await refuse(deleted, "a user who deleted their key");
    expect(
      (await regained.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    await refuse(regained, "a user with every key record deleted");
    expect(
      (
        await regained.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "regained-pk",
            privateKeyEnc: "regained-prv",
          },
        })
      ).status,
    ).toBe(201);
    await join(
      regained,
      "a user who registered a new key after deleting the old one",
    );
    // Retry after the cause is gone: the user who had no key registers one and is invited.
    expect(
      (
        await never.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "never-pk",
            privateKeyEnc: "never-prv",
          },
        })
      ).status,
    ).toBe(201);
    await join(never, "the retry after the key was created");

    // The key changes after the candidate list was read.
    const listed = await owner.privacyroom.getRoomCandidateKeys({
      roomId,
      userIds: [raceReplace.id],
    });
    const firstKey = (listed.data.response ?? []).find(
      (k) => k.userId === raceReplace.id,
    )?.publicKey;
    expect(firstKey, "the candidate list shows the key").toBeDefined();
    expect(
      (
        await raceReplace.api.privacyroom.replaceKey({
          encryptionKeyRequestDto: {
            publicKey: "race-new-pk",
            privateKeyEnc: "race-new-prv",
          },
        })
      ).status,
    ).toBe(200);
    await join(
      raceReplace,
      "a key replaced between the list and the invitation",
    );
    const relisted = await owner.privacyroom.getRoomCandidateKeys({
      roomId,
      userIds: [raceReplace.id],
    });
    expect(
      (relisted.data.response ?? []).find((k) => k.userId === raceReplace.id)
        ?.publicKey,
    ).not.toBe(firstKey);
    // The key is deleted after the list.
    await owner.privacyroom.getRoomCandidateKeys({
      roomId,
      userIds: [raceDelete.id],
    });
    expect(
      (await raceDelete.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    await refuse(
      raceDelete,
      "a key deleted between the list and the invitation",
    );
  });
});

test.describe("Recipients that cannot be invited, and batches", () => {
  test("PUT /files/rooms/:id/share - One request with several recipients: what each does, and that separate requests are independent", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const { owner, roomId } = await newScene(apiSdk, "Life batch");
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const [a, b, c, d, keyless, guest, deactivated, retry] = await addAccounts(
      apiSdk,
      [
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: false },
        { type: "Guest" },
        { type: "User", key: true },
        { type: "User", key: false },
      ],
    );
    const send = (invs: { id: string; access: FileShare }[]) =>
      owner.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: { invitations: invs, notify: false },
      });
    const reset = async (ids: string[]) => {
      for (const id of ids)
        if ((await accessOf(owner, roomId)).has(id))
          await invite(owner, roomId, id, FileShare.None);
    };
    const invariant = async (label: string) => {
      const acc = await accessOf(owner, roomId);
      // Nobody who cannot hold a key is ever a member, and nobody is listed twice.
      expect(acc.has(keyless.id), `${label}: a user without a key joined`).toBe(
        false,
      );
      expect(acc.has(guest.id), `${label}: a Guest joined`).toBe(false);
      expect(
        acc.has(deactivated.id),
        `${label}: a deactivated user joined`,
      ).toBe(false);
      expect(await ownerOf(owner, roomId), `${label}: the owner changed`).toBe(
        ownerId,
      );
    };

    const cases: [string, { id: string; access: FileShare }[], string[]][] = [
      [
        "two keyed users",
        [
          { id: a.id, access: FileShare.Read },
          { id: b.id, access: FileShare.Read },
        ],
        [a.id, b.id],
      ],
      [
        "a keyed user and a user without a key",
        [
          { id: c.id, access: FileShare.Read },
          { id: keyless.id, access: FileShare.Read },
        ],
        [c.id],
      ],
      [
        "a keyed user and a Guest",
        [
          { id: d.id, access: FileShare.Read },
          { id: guest.id, access: FileShare.Read },
        ],
        [d.id],
      ],
      [
        "a keyed user and an id nobody holds",
        [
          { id: a.id, access: FileShare.Read },
          { id: randomUUID(), access: FileShare.Read },
        ],
        [a.id],
      ],
      [
        "a new user and a member with another role",
        [
          { id: b.id, access: FileShare.Read },
          { id: a.id, access: FileShare.Editing },
        ],
        [a.id, b.id],
      ],
      [
        "two users with different roles",
        [
          { id: c.id, access: FileShare.ContentCreator },
          { id: d.id, access: FileShare.Editing },
        ],
        [c.id, d.id],
      ],
      [
        "the same user twice with different roles",
        [
          { id: a.id, access: FileShare.Read },
          { id: a.id, access: FileShare.ContentCreator },
        ],
        [a.id],
      ],
    ];
    for (const [label, invs, candidates] of cases) {
      const before = await memberIds(owner, roomId);
      const res = await send(invs);
      // The guide describes the CLIENT sending each recipient on its own, so the status and the
      // partial application of a mixed batch are not asserted; the invariants below are.
      expectNoServerError(res.status, label);
      await memberIds(owner, roomId); // uniqueness on the raw list
      await invariant(label);
      if (candidates.every((id) => !before.includes(id)) && res.status === 200)
        for (const id of candidates)
          expect(
            (await accessOf(owner, roomId)).has(id),
            `${label}: 200 but a recipient is not a member`,
          ).toBe(true);
      await reset([a.id, b.id, c.id, d.id]);
    }
    // The same user twice: the last entry wins and there is one membership.
    await send([
      { id: a.id, access: FileShare.Read },
      { id: a.id, access: FileShare.ContentCreator },
    ]);
    expect((await accessOf(owner, roomId)).get(a.id)).toBe(
      FileShare.ContentCreator,
    );
    await reset([a.id]);

    // A malformed id and a deactivated user (the owner's own id has its own test).
    const garbage = await send([{ id: "not-a-guid", access: FileShare.Read }]);
    expectRefused(garbage.status, "a malformed id");
    expect(await memberIds(owner, roomId)).not.toContain("not-a-guid");
    expect(
      (
        await owner.userStatus.updateUserStatus({
          status: EmployeeStatus.Terminated,
          updateMembersRequestDto: { userIds: [deactivated.id] },
        })
      ).status,
    ).toBe(200);
    const deact = await send([{ id: deactivated.id, access: FileShare.Read }]);
    // The status for a deactivated user is not defined; that they do not become a member is.
    expectNoServerError(deact.status, "a deactivated user");
    await invariant("a deactivated user");

    // Separate requests (the client's way): each succeeds or fails on its own.
    const one = await invite(owner, roomId, a.id, FileShare.Read);
    const two = await invite(owner, roomId, keyless.id, FileShare.Read);
    const three = await invite(owner, roomId, b.id, FileShare.Read);
    expect([one.status, three.status]).toEqual([200, 200]);
    expectRefused(two.status, "separate request for a user without a key");
    expect([...(await accessOf(owner, roomId)).keys()].sort()).toEqual(
      [ownerId, a.id, b.id].sort(),
    );
    // The retry after the cause is removed.
    expect(
      (
        await retry.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "retry-pk",
            privateKeyEnc: "retry-prv",
          },
        })
      ).status,
    ).toBe(201);
    expect((await invite(owner, roomId, retry.id, FileShare.Read)).status).toBe(
      200,
    );
    expect((await accessOf(owner, roomId)).get(retry.id)).toBe(FileShare.Read);
  });

  test("PUT /files/rooms/:id/share - A user of another portal and a deleted user are not invited", async ({
    apiSdk,
    playwright,
  }) => {
    test.setTimeout(400_000);
    const { owner, roomId } = await newScene(apiSdk, "Life foreign");
    const [gone] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    const context = await playwright.request.newContext({ timeout: 30_000 });
    const other = new API(context);
    try {
      await other.setup();
      const sdkB = new ApiSDK(context, other.tokenStore);
      const foreignId = (await sdkB.forRole("owner").profiles.getSelfProfile())
        .data.response!.id!;
      const before = await memberIds(owner, roomId);
      const res = await invite(owner, roomId, foreignId, FileShare.Read);
      expectRefused(res.status, "a user of another portal");
      expect(await memberIds(owner, roomId)).toEqual(before);
    } finally {
      try {
        await other.auth.authenticateOwner();
        await other.cleanup();
      } catch (error) {
        console.warn(`ORPHANED PORTAL: ${other.portalDomain}. ${error}`);
      }
      await context.dispose();
    }
    // A deleted user: terminate, then delete.
    expect(
      (
        await owner.userStatus.updateUserStatus({
          status: EmployeeStatus.Terminated,
          updateMembersRequestDto: { userIds: [gone.id] },
        })
      ).status,
    ).toBe(200);
    // Preparing the data is part of the test: a user that cannot be deleted is a failure, not a skip.
    const removed = await owner.profiles.deleteMember({ userId: gone.id });
    expect(removed.status, "deleting the terminated user").toBe(200);
    const before = await memberIds(owner, roomId);
    const res = await invite(owner, roomId, gone.id, FileShare.Read);
    // The status for a deleted user is not defined; that they do not become a member is.
    expectNoServerError(res.status, "a deleted user");
    expect(await memberIds(owner, roomId)).toEqual(before);
    expect(await memberIds(owner, roomId)).not.toContain(gone.id);
  });
});

test.describe("The assertions of this file detect what they are meant to", () => {
  test("Helpers - the duplicate and refusal checks fail on a duplicate, on a success and on a server error", async () => {
    expect(() => assertUniqueIds(["a", "b", "a"])).toThrow();
    expect(() => assertUniqueIds(["a", "b"])).not.toThrow();
    expect(() => expectRefused(500, "x")).toThrow();
    expect(() => expectRefused(200, "x")).toThrow();
    expect(() => expectRefused(403, "x")).not.toThrow();
    expect(() => expectRefused(400, "x")).not.toThrow();
    expect(() => expectNoServerError(502, "x")).toThrow();
  });
});

test.describe("Inviting the owner of the room", () => {
  test.fail(
    "BUG XXXXX: PUT /files/rooms/:id/share - Inviting the owner's own id adds a second record of the owner to the member list",
    async ({ apiSdk }) => {
      test.setTimeout(200_000);
      const { owner, roomId } = await newScene(apiSdk, "Life owner invite");
      const ownerId = (await owner.profiles.getSelfProfile()).data.response!
        .id!;
      const [other] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
      // The control: an ordinary invitation lists the member once.
      expect(
        (await invite(owner, roomId, other.id, FileShare.Read)).status,
      ).toBe(200);
      assertUniqueIds((await rawMembers(owner, roomId)).map((m) => m.id));

      const res = await invite(owner, roomId, ownerId, FileShare.Read);
      expectNoServerError(res.status, "the owner invited as Read");
      // State first: the owner stays the owner.
      expect(await ownerOf(owner, roomId)).toBe(ownerId);
      // The room must not list one subject twice, whatever the invitation answered.
      assertUniqueIds(
        (await rawMembers(owner, roomId)).map((m) => m.id),
        "members after inviting the owner",
      );
    },
  );
});
