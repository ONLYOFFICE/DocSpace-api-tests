import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
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
import { putFile } from "@/src/helpers/private-room-arena";
import {
  ALL,
  accessOf,
  expectNoServerError,
  expectRefused,
  invite,
  issue,
  keysOf,
  leave,
  memberIds,
  newScene,
  ownerOf,
  reach,
} from "@/src/helpers/private-room-lifecycle";

/**
 * Changing roles, removing members, leaving, and what happens to access
 * afterwards (PR-MEM, PR-INV, PR-ACL-031/032, PR-SEC-020, SPEC-008/029).
 *
 * See the header of privacyroom.lifecycle.spec.ts for the method. Three levels
 * are read back every time: membership and role, the account key, the wrapped
 * file keys a member holds. A removed member's file keys are proved gone by
 * inviting them again and reading their own entries (a caller only sees their
 * own); the other members' entries are compared before and after.
 */

test.describe("Changing the role of an existing member", () => {
  test("PUT /files/rooms/:id/share - Role changes for members without an account key, without file keys or after a key replacement", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const { owner, scene, roomId } = await newScene(apiSdk, "Life roles");
    const [noEntries, replaced, m1, m2, m3] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    const files = [scene.rootFile.id, scene.deepFile.id];
    for (const m of [noEntries, replaced, m1, m2, m3])
      expect(
        (await inviteToRoom(owner, roomId, m.id, FileShare.Read)).status,
      ).toBe(200);
    for (const m of [replaced, m1, m2, m3])
      await issue(owner, files, m.id, "role");

    // A member with no file keys at all: the role changes and no entry appears.
    expect(await keysOf(noEntries.api, scene.rootFile.id)).toBe("[]");
    expect(
      (await invite(owner, roomId, noEntries.id, FileShare.ContentCreator))
        .status,
    ).toBe(200);
    expect((await accessOf(owner, roomId)).get(noEntries.id)).toBe(
      FileShare.ContentCreator,
    );
    expect(await keysOf(noEntries.api, scene.rootFile.id)).toBe("[]");

    // The account key is replaced: the role changes and the entries stay as they are.
    const replacedKeys = await keysOf(replaced.api, scene.rootFile.id);
    expect(
      (
        await replaced.api.privacyroom.replaceKey({
          encryptionKeyRequestDto: {
            publicKey: "role-new-pk",
            privateKeyEnc: "role-new-prv",
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (await invite(owner, roomId, replaced.id, FileShare.Editing)).status,
    ).toBe(200);
    expect((await accessOf(owner, roomId)).get(replaced.id)).toBe(
      FileShare.Editing,
    );
    expect(await keysOf(replaced.api, scene.rootFile.id)).toBe(replacedKeys);

    // The same role again changes no file key.
    const before = await keysOf(m1.api, scene.rootFile.id);
    expect((await invite(owner, roomId, m1.id, FileShare.Read)).status).toBe(
      200,
    );
    expect(await keysOf(m1.api, scene.rootFile.id)).toBe(before);
    // A change that keeps the right to read keeps the entries (Read -> ContentCreator -> Read).
    expect(
      (await invite(owner, roomId, m1.id, FileShare.ContentCreator)).status,
    ).toBe(200);
    expect(await keysOf(m1.api, scene.rootFile.id)).toBe(before);
    expect((await invite(owner, roomId, m1.id, FileShare.Read)).status).toBe(
      200,
    );
    expect(await keysOf(m1.api, scene.rootFile.id)).toBe(before);

    // Several members in one request.
    const both = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: m2.id, access: FileShare.ContentCreator },
          { id: m3.id, access: FileShare.Editing },
        ],
        notify: false,
      },
    });
    // Two valid recipients with valid roles: a success, both roles applied.
    expect(both.status, "two role changes in one request").toBe(200);
    const acc = await accessOf(owner, roomId);
    expect([acc.get(m2.id), acc.get(m3.id)]).toEqual([
      FileShare.ContentCreator,
      FileShare.Editing,
    ]);

    // A role the room does not describe: recorded, the member stays a member and keeps the entries.
    const keysM3 = await keysOf(m3.api, scene.rootFile.id);
    for (const role of [
      FileShare.Review,
      FileShare.Comment,
      FileShare.FillForms,
    ]) {
      // Which of these roles the room accepts is not defined; whatever the answer, the member stays.
      expectNoServerError(
        (await invite(owner, roomId, m3.id, role)).status,
        `role ${role}`,
      );
    }
    expect((await accessOf(owner, roomId)).has(m3.id)).toBe(true);
    expect(await keysOf(m3.api, scene.rootFile.id)).toBe(keysM3);

    // The owner still manages the room (inviting the owner's own id has its own test in the lifecycle spec).
    expect(
      (await invite(owner, roomId, m1.id, FileShare.Read)).status,
      "the owner still manages the room",
    ).toBe(200);
    expect(
      (await owner.files.getEncryptionInfo({ fileId: scene.rootFile.id }))
        .status,
    ).toBe(200);
  });
});

test.describe("Removing a member", () => {
  test("PUT /files/rooms/:id/share - Removing members leaves the files, the folders, the content and the other members' keys as they were", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const { owner, scene, roomId, ownerToken } = await newScene(
      apiSdk,
      "Life removal",
    );
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const empty = await createOwnerPrivateRoom(apiSdk, "Life removal empty");
    const [a, author, replaced, partial, f, g, mgr, mgr2] = await addAccounts(
      apiSdk,
      [
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "User", key: true },
        { type: "RoomAdmin", key: true },
        { type: "RoomAdmin", key: true },
      ],
    );
    // The empty room.
    expect(
      (await inviteToRoom(owner, empty, a.id, FileShare.Read)).status,
    ).toBe(200);
    expect((await invite(owner, empty, a.id, FileShare.None)).status).toBe(200);
    expect((await memberIds(owner, empty)).includes(a.id)).toBe(false);

    const roles: [Account, FileShare][] = [
      [a, FileShare.Read],
      [author, FileShare.ContentCreator],
      [replaced, FileShare.Read],
      [partial, FileShare.Read],
      [f, FileShare.Read],
      [g, FileShare.Read],
      [mgr, FileShare.RoomManager],
      [mgr2, FileShare.RoomManager],
    ];
    for (const [m, role] of roles)
      expect((await inviteToRoom(owner, roomId, m.id, role)).status).toBe(200);
    const bytes = markedBytes("LIFE-RM-AUTHOR");
    const nested = await uploadEncrypted(author.api, scene.innerId, { bytes });
    const authored = await uploadEncrypted(author.api, roomId, {
      bytes: markedBytes("LIFE-RM-ROOT"),
    });
    const files = [
      scene.rootFile.id,
      scene.deepFile.id,
      nested.id,
      authored.id,
    ];
    for (const [m] of roles) {
      if (m === partial) await issue(owner, [files[0]], m.id, "rm");
      else await issue(owner, files, m.id, "rm");
    }

    const content = async () => ({
      ...(await snapshot(owner, scene)),
      members: undefined,
      nested: JSON.stringify(
        (
          await owner.folders.getFolderByFolderId({ folderId: scene.innerId })
        ).data.response?.files?.map((x) => [
          (x as unknown as { id: number }).id,
          x.title,
          (x as unknown as { createdBy?: { id?: string } }).createdBy?.id,
        ]),
      ),
    });
    const baseline = await content();
    const intact = async (label: string) => {
      expect(await content(), `${label}: files and folders changed`).toEqual(
        baseline,
      );
      for (const file of [scene.rootFile, scene.deepFile, nested])
        expect(
          (await downloadVia(owner, ownerToken, file.id)).bytes!.equals(
            file.bytes,
          ),
          `${label}: bytes of ${file.id}`,
        ).toBe(true);
      expect(await ownerOf(owner, roomId), `${label}: owner`).toBe(ownerId);
    };
    const entriesOf = async (who: Account[]) =>
      Object.fromEntries(
        await Promise.all(
          who.map(async (m) => [m.id, await keysOf(m.api, files[0])] as const),
        ),
      );

    // Removing a member: gone from the list, others' entries untouched, content intact.
    const others = [author, replaced, partial, f, g, mgr, mgr2];
    let entriesBefore = await entriesOf(others);
    expect((await invite(owner, roomId, a.id, FileShare.None)).status).toBe(
      200,
    );
    expect((await accessOf(owner, roomId)).has(a.id)).toBe(false);
    expect(await entriesOf(others)).toEqual(entriesBefore);
    await intact("remove a Read member");
    // The removed member's entries are gone: invited again, they hold none.
    expect(
      (await inviteToRoom(owner, roomId, a.id, FileShare.Read)).status,
    ).toBe(200);
    expect(await keysOf(a.api, files[0]), "stale entries came back").toBe("[]");

    // Removing the author: their files stay, with their content and author.
    expect(
      (await invite(owner, roomId, author.id, FileShare.None)).status,
    ).toBe(200);
    expect((await accessOf(owner, roomId)).has(author.id)).toBe(false);
    await intact("remove the author");
    expect(
      (await owner.files.getFileInfo({ fileId: nested.id })).data.response
        ?.createdBy?.id,
    ).toBe(author.id);

    // A member who replaced the account key and one with only some file keys: removed by a manager.
    expect(
      (
        await replaced.api.privacyroom.replaceKey({
          encryptionKeyRequestDto: {
            publicKey: "rm-pk",
            privateKeyEnc: "rm-prv",
          },
        })
      ).status,
    ).toBe(200);
    const stay = [f, g, mgr, mgr2];
    entriesBefore = await entriesOf(stay);
    for (const [who, label] of [
      [replaced, "replaced key"],
      [partial, "only some file keys"],
    ] as const) {
      const res = await mgr.api.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: who.id, access: FileShare.None }],
          notify: false,
        },
      });
      // A manager may remove members (HTML): success, and the member is gone.
      expect(res.status, `a manager removes a member with ${label}`).toBe(200);
      expect(
        (await accessOf(owner, roomId)).has(who.id),
        `${label}: the member is gone`,
      ).toBe(false);
      expect(await entriesOf(stay), `${label}: others' entries`).toEqual(
        entriesBefore,
      );
      await intact(`remove a member with ${label}`);
    }
    // Two members in one request; the same removal again; a user nobody knows.
    const two = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: f.id, access: FileShare.None },
          { id: g.id, access: FileShare.None },
        ],
        notify: false,
      },
    });
    // Two valid removals in one request: a success, both gone.
    expect(two.status, "two removals in one request").toBe(200);
    const left = await memberIds(owner, roomId);
    expect(left).not.toContain(f.id);
    expect(left).not.toContain(g.id);
    // Removing someone who is already gone: the answer is not defined, nothing may change and nothing may crash.
    const again = await invite(owner, roomId, f.id, FileShare.None);
    expectNoServerError(again.status, "removing a member who is already gone");
    expect(await memberIds(owner, roomId)).toEqual(left);
    await intact("repeat removal");

    // The owner cannot be removed by the ordinary call; a manager removes another manager.
    const ownerTry = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: ownerId, access: FileShare.None }],
        notify: false,
      },
    });
    const byManager = await mgr.api.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: ownerId, access: FileShare.None }],
        notify: false,
      },
    });
    // What these answer is not defined; that the owner stays the owner and a member is.
    expectNoServerError(ownerTry.status, "the owner removes the owner");
    expectNoServerError(byManager.status, "a manager removes the owner");
    expect(await ownerOf(owner, roomId)).toBe(ownerId);
    expect(await memberIds(owner, roomId)).toContain(ownerId);
    expect((await owner.rooms.getRoomInfo({ id: roomId })).status).toBe(200);
    const m2 = await mgr.api.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: mgr2.id, access: FileShare.None }],
        notify: false,
      },
    });
    // Whether a manager may remove another manager is not defined by the guide: no crash, nothing else changes.
    expectNoServerError(m2.status, "a manager removes another manager");
    expect(await memberIds(owner, roomId)).toContain(mgr.id);
    await intact("end of the removals");
  });
});

/** A room with people in it: private (one encrypted file, a wrapped key for everyone) or ordinary. */
const stage = async (
  apiSdk: Parameters<typeof newScene>[0],
  kind: "private" | "ordinary",
  title: string,
  people: [Account, FileShare][],
) => {
  const owner = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const roomId =
    kind === "private"
      ? await createOwnerPrivateRoom(apiSdk, title)
      : (
          await owner.rooms.createRoom({
            createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
          })
        ).data.response!.id!;
  const bytes = markedBytes(`LEAVE-${title}`);
  // Preparing the data is part of the test: an upload that fails fails the test.
  const file =
    kind === "private"
      ? await uploadEncrypted(owner, roomId, { bytes })
      : undefined;
  for (const [m, role] of people)
    expect(
      (await inviteToRoom(owner, roomId, m.id, role)).status,
      `${title}: inviting ${role}`,
    ).toBe(200);
  if (file)
    for (const [m] of people) await issue(owner, [file.id], m.id, "leave");
  return { owner, ownerToken, roomId, file, bytes };
};

const entriesOf = async (who: Account[], fileId: number) =>
  Object.fromEntries(
    await Promise.all(
      who.map(async (m) => [m.id, await keysOf(m.api, fileId)] as const),
    ),
  );

const sorted = (ids: string[]) => [...ids].sort();

test.describe("Leaving a room, and what removeSecurityInfo does", () => {
  test("DELETE /files/share - A member below manager who calls it leaves alone: only they go, nobody else's keys or the content change (private room, ordinary room as the control)", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const owner = apiSdk.forRole("owner");
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const [reader, author, editor, mgr] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "RoomAdmin", key: true },
    ]);
    const people: [Account, FileShare][] = [
      [reader, FileShare.Read],
      [author, FileShare.ContentCreator],
      [editor, FileShare.Editing],
      [mgr, FileShare.RoomManager],
    ];
    for (const kind of ["private", "ordinary"] as const) {
      const label = `${kind} room`;
      const s = await stage(apiSdk, kind, `Leave member ${kind}`, people);
      const stay = [author, editor, mgr];
      const before = await memberIds(owner, s.roomId);
      expect(before, `${label}: setup`).toEqual(
        expect.arrayContaining([
          ownerId,
          reader.id,
          author.id,
          editor.id,
          mgr.id,
        ]),
      );
      const keysBefore = s.file ? await entriesOf(stay, s.file.id) : {};
      // The positive control: the member reads the room until they leave.
      expect(
        (await reader.api.rooms.getRoomInfo({ id: s.roomId })).status,
        `${label}: member before leaving`,
      ).toBe(200);

      const res = await leave(reader.api, s.roomId);

      expect(res.status, `${label}: leave`).toBe(200);
      expect(res.data.response, `${label}: the answer is always true`).toBe(
        true,
      );
      const after = await memberIds(owner, s.roomId);
      expect(sorted(after), `${label}: only the caller went`).toEqual(
        sorted(before.filter((id) => id !== reader.id)),
      );
      expect(after, `${label}: the owner stays`).toContain(ownerId);
      expectRefused(
        (await reader.api.rooms.getRoomInfo({ id: s.roomId })).status,
        `${label}: the member who left`,
      );
      if (s.file) {
        expect(
          await entriesOf(stay, s.file.id),
          `${label}: others' keys`,
        ).toEqual(keysBefore);
        expect(
          (await owner.files.getFileInfo({ fileId: s.file.id })).status,
          `${label}: the file`,
        ).toBe(200);
        expect(
          (await downloadVia(owner, s.ownerToken, s.file.id)).bytes!.equals(
            s.bytes,
          ),
          `${label}: the content`,
        ).toBe(true);
        // The leaver's wrapped key went with them: invited again they hold none.
        expect(
          (await inviteToRoom(owner, s.roomId, reader.id, FileShare.Read))
            .status,
        ).toBe(200);
        expect(
          await keysOf(reader.api, s.file.id),
          `${label}: a stale file key survived`,
        ).toBe("[]");
      }
    }
  });

  test("DELETE /files/share - Called by a manager or by the owner it revokes everyone but the owner, as documented; the files, the owner's keys and the content stay (private rooms, ordinary room as the control)", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const owner = apiSdk.forRole("owner");
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const [reader, author, editor, mgr] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "RoomAdmin", key: true },
    ]);
    const people: [Account, FileShare][] = [
      [reader, FileShare.Read],
      [author, FileShare.ContentCreator],
      [editor, FileShare.Editing],
      [mgr, FileShare.RoomManager],
    ];
    const variants: ["private" | "ordinary", "manager" | "owner"][] = [
      ["private", "manager"],
      ["private", "owner"],
      ["ordinary", "manager"],
    ];
    for (const [kind, who] of variants) {
      const label = `${kind} room, called by the ${who}`;
      const s = await stage(apiSdk, kind, `Mass ${kind} ${who}`, people);
      const actor = who === "owner" ? owner : mgr.api;
      const before = await memberIds(owner, s.roomId);
      expect(before, `${label}: setup`).toHaveLength(5);
      const ownerKeys = s.file ? await keysOf(owner, s.file.id) : "";
      expect(
        (await mgr.api.rooms.getRoomInfo({ id: s.roomId })).status,
        `${label}: the manager reads the room before`,
      ).toBe(200);

      const res = await leave(actor, s.roomId);

      expect(res.status, label).toBe(200);
      expect(res.data.response, `${label}: the answer is always true`).toBe(
        true,
      );
      expect(
        await memberIds(owner, s.roomId),
        `${label}: members after`,
      ).toEqual([ownerId]);
      expect(await ownerOf(owner, s.roomId), `${label}: the creator`).toBe(
        ownerId,
      );
      for (const [m] of people)
        expectRefused(
          (await m.api.rooms.getRoomInfo({ id: s.roomId })).status,
          `${label}: ${m.id} after`,
        );
      if (s.file) {
        expect(
          await keysOf(owner, s.file.id),
          `${label}: the owner's own key`,
        ).toBe(ownerKeys);
        expect(
          (await owner.files.getFileInfo({ fileId: s.file.id })).status,
          `${label}: the file`,
        ).toBe(200);
        expect(
          (await downloadVia(owner, s.ownerToken, s.file.id)).bytes!.equals(
            s.bytes,
          ),
          `${label}: the content`,
        ).toBe(true);
      }
      // Safe to repeat (JSDoc): the owner calls it again, nothing changes.
      if (who === "owner") {
        const again = await leave(owner, s.roomId);
        expect(again.status, `${label}: repeat`).toBe(200);
        expect(await memberIds(owner, s.roomId)).toEqual([ownerId]);
      }
      // Whoever lost the room lost the wrapped keys: invited again, they hold none.
      if (s.file)
        for (const [m, role] of people) {
          expect(
            (await inviteToRoom(owner, s.roomId, m.id, role)).status,
            `${label}: inviting ${role} again`,
          ).toBe(200);
          expect(
            await keysOf(m.api, s.file.id),
            `${label}: a stale file key of ${role}`,
          ).toBe("[]");
        }
    }
  });

  test("PUT /files/rooms/:id/share - A manager leaves by setting their own access to None, or removes one member: nobody else goes (private rooms, ordinary room as the control)", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const owner = apiSdk.forRole("owner");
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const [reader, author, mgr, mgr2] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "RoomAdmin", key: true },
      { type: "RoomAdmin", key: true },
    ]);
    const people: [Account, FileShare][] = [
      [reader, FileShare.Read],
      [author, FileShare.ContentCreator],
      [mgr, FileShare.RoomManager],
      [mgr2, FileShare.RoomManager],
    ];
    const variants: ["private" | "ordinary", "self" | "one"][] = [
      ["private", "self"],
      ["private", "one"],
      ["ordinary", "self"],
    ];
    for (const [kind, what] of variants) {
      const label = `${kind} room, manager removes ${what === "self" ? "themselves" : "one member"}`;
      const s = await stage(apiSdk, kind, `Mgr ${kind} ${what}`, people);
      const gone = what === "self" ? mgr : reader;
      const stay = people.map(([m]) => m).filter((m) => m !== gone);
      const before = await memberIds(owner, s.roomId);
      const keysBefore = s.file ? await entriesOf(stay, s.file.id) : {};
      expect(
        (await mgr.api.rooms.getRoomInfo({ id: s.roomId })).status,
        `${label}: the manager reads the room before`,
      ).toBe(200);

      const res = await invite(mgr.api, s.roomId, gone.id, FileShare.None);

      expect(res.status, label).toBe(200);
      const after = await accessOf(owner, s.roomId);
      expect(sorted([...after.keys()]), `${label}: members after`).toEqual(
        sorted(before.filter((id) => id !== gone.id)),
      );
      expect(after.has(ownerId), `${label}: the owner stays`).toBe(true);
      expect(
        after.get(mgr2.id),
        `${label}: the other manager keeps the role`,
      ).toBe(FileShare.RoomManager);
      expectRefused(
        (await gone.api.rooms.getRoomInfo({ id: s.roomId })).status,
        `${label}: the removed member`,
      );
      if (what === "one")
        expect(
          (await mgr.api.rooms.getRoomInfo({ id: s.roomId })).status,
          `${label}: the manager is still in the room`,
        ).toBe(200);
      if (s.file) {
        expect(
          await entriesOf(stay, s.file.id),
          `${label}: the others' keys`,
        ).toEqual(keysBefore);
        expect(
          (await downloadVia(owner, s.ownerToken, s.file.id)).bytes!.equals(
            s.bytes,
          ),
          `${label}: the content`,
        ).toBe(true);
        expect(
          (await inviteToRoom(owner, s.roomId, gone.id, FileShare.Read)).status,
        ).toBe(200);
        expect(
          await keysOf(gone.api, s.file.id),
          `${label}: a stale file key`,
        ).toBe("[]");
      }
    }
  });
});

test.describe("A member whose account key was deleted", () => {
  test("PUT /files/rooms/:id/share - Removing, re-roling and leaving a member without an account key, against members with a key as the control", async ({
    apiSdk,
  }) => {
    test.setTimeout(600_000);
    const { owner, scene, roomId } = await newScene(apiSdk, "Keyless member");
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const [mgr, k1, k2, k3, k4, k5, c1, c2, c3, c4] = await addAccounts(
      apiSdk,
      [
        { type: "RoomAdmin", key: true },
        ...Array.from({ length: 9 }, () => ({
          type: "User" as const,
          key: true,
        })),
      ],
    );
    const fileId = scene.rootFile.id;
    expect(
      (await inviteToRoom(owner, roomId, mgr.id, FileShare.RoomManager)).status,
    ).toBe(200);
    const all = [k1, k2, k3, k4, k5, c1, c2, c3, c4];
    for (const m of all)
      expect(
        (await inviteToRoom(owner, roomId, m.id, FileShare.Read)).status,
      ).toBe(200);
    for (const m of [mgr, ...all]) await issue(owner, [fileId], m.id, "nokey");
    // The account key of k1..k5 is deleted; k5 then registers a new one.
    for (const m of [k1, k2, k3, k4, k5])
      expect(
        (await m.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
        "deleting the account key",
      ).toBe(204);
    expect(
      (
        await k5.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "nokey-pk",
            privateKeyEnc: "nokey-prv",
          },
        })
      ).status,
    ).toBe(201);

    type Req = {
      name: string;
      subject: Account;
      send: () => Promise<{ status: number }>;
      removes: boolean;
    };
    const none = (api: typeof owner, who: Account) => () =>
      invite(api, roomId, who.id, FileShare.None);
    const reqs: Req[] = [
      {
        name: "owner removes (setRoomSecurity None)",
        subject: k1,
        send: none(owner, k1),
        removes: true,
      },
      {
        name: "manager removes (setRoomSecurity None)",
        subject: k2,
        send: none(mgr.api, k2),
        removes: true,
      },
      {
        name: "owner changes the role to Editing",
        subject: k3,
        send: () => invite(owner, roomId, k3.id, FileShare.Editing),
        removes: false,
      },
      {
        name: "the member leaves (removeSecurityInfo)",
        subject: k4,
        send: () => leave(k4.api, roomId),
        removes: true,
      },
      {
        name: "owner removes after the member registered a new key",
        subject: k5,
        send: none(owner, k5),
        removes: true,
      },
    ];
    const controls: Req[] = [
      {
        name: "owner removes (setRoomSecurity None)",
        subject: c1,
        send: none(owner, c1),
        removes: true,
      },
      {
        name: "manager removes (setRoomSecurity None)",
        subject: c2,
        send: none(mgr.api, c2),
        removes: true,
      },
      {
        name: "owner changes the role to Editing",
        subject: c3,
        send: () => invite(owner, roomId, c3.id, FileShare.Editing),
        removes: false,
      },
      {
        name: "the member leaves (removeSecurityInfo)",
        subject: c4,
        send: () => leave(c4.api, roomId),
        removes: true,
      },
    ];

    // The positive control: the same four requests for members WITH a key behave as the guide says.
    for (const r of controls) {
      const res = await r.send();
      const acc = await accessOf(owner, roomId);
      expect(res.status, `control, ${r.name}`).toBe(200);
      if (r.removes)
        expect(acc.has(r.subject.id), `control, ${r.name}: member`).toBe(false);
      else
        expect(acc.get(r.subject.id), `control, ${r.name}: role`).toBe(
          FileShare.Editing,
        );
    }

    // The members without an account key: exact requests and answers are recorded in ONE annotation;
    // the current refusals are not asserted as the contract (SPEC-008), only what must hold either way.
    const record: unknown[] = [];
    for (const r of reqs) {
      const before = await accessOf(owner, roomId);
      const keysBefore = await keysOf(r.subject.api, fileId);
      const res = await r.send();
      const after = await accessOf(owner, roomId);
      const still = after.has(r.subject.id);
      const keysAfter = still ? await keysOf(r.subject.api, fileId) : "gone";
      record.push({
        request: r.name,
        status: res.status,
        roleBefore: before.get(r.subject.id),
        roleAfter: after.get(r.subject.id) ?? "not a member",
        keyEntriesBefore: keysBefore === "[]" ? 0 : 1,
        keyEntriesAfter:
          keysAfter === "gone" ? "member gone" : keysAfter === "[]" ? 0 : 1,
      });
      expectNoServerError(res.status, r.name);
      expect(
        before.has(r.subject.id),
        `${r.name}: setup, the member is in the room`,
      ).toBe(true);
      expect(await ownerOf(owner, roomId), `${r.name}: owner`).toBe(ownerId);
      // The answer and the state must agree: success changes the state, a refusal leaves it as it was.
      if (res.status === 200 && r.removes)
        expect(still, `${r.name}: 200 but the member is still there`).toBe(
          false,
        );
      if (res.status >= 400) {
        expect(
          after.get(r.subject.id),
          `${r.name}: refused but the role changed`,
        ).toBe(before.get(r.subject.id));
        expect(keysAfter, `${r.name}: refused but the file keys changed`).toBe(
          keysBefore,
        );
      }
      if (res.status === 200 && !r.removes)
        expect(
          after.get(r.subject.id),
          `${r.name}: 200 but the role is not applied`,
        ).toBe(FileShare.Editing);
      // Nobody else is affected.
      for (const other of [mgr, k1, k2, k3, k4, k5].filter(
        (m) => m !== r.subject,
      ))
        if (before.has(other.id))
          expect(after.get(other.id), `${r.name}: another member's role`).toBe(
            before.get(other.id),
          );
    }
    test.info().annotations.push({
      type: "observation",
      description: `members without an account key (SPEC-008): ${JSON.stringify(record)}`,
    });
    expect(
      (await owner.rooms.getRoomInfo({ id: roomId })).status,
      "the room is intact",
    ).toBe(200);
  });
});

test.describe("Access after removal or leaving", () => {
  test("GET /files/* - The same session goes from allowed to forbidden at every step once the member is removed or has left", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const { owner, scene, roomId } = await newScene(apiSdk, "Life after");
    const [removed, leaver, admin] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "DocSpaceAdmin", key: true },
    ]);
    const cases: [Account, FileShare, string][] = [
      [removed, FileShare.Read, "a member removed by the owner"],
      [leaver, FileShare.ContentCreator, "a member who left"],
      [admin, FileShare.Read, "a DocSpaceAdmin who left"],
    ];
    for (const [m, role] of cases) {
      expect((await inviteToRoom(owner, roomId, m.id, role)).status).toBe(200);
      await issue(owner, [scene.rootFile.id, scene.deepFile.id], m.id, "after");
    }
    // The positive control: before the change everything is reachable.
    for (const [m, , label] of cases)
      expect(await reach(m.api, scene), `${label}: before`).toEqual(ALL(true));

    expect(
      (await invite(owner, roomId, removed.id, FileShare.None)).status,
    ).toBe(200);
    // removeSecurityInfo answers true for a member leaving (JSDoc).
    const left = await leave(leaver.api, roomId);
    const adminLeft = await leave(admin.api, roomId);
    expect(left.status, "a member leaves").toBe(200);
    expect(adminLeft.status, "a DocSpaceAdmin leaves").toBe(200);
    const members = await memberIds(owner, roomId);
    for (const gone of [removed, leaver, admin])
      expect(members, `${gone.id} is no longer a member`).not.toContain(
        gone.id,
      );

    for (const [m, , label] of cases) {
      const now = await reach(m.api, scene);
      expect.soft(now, `${label}: after`).toEqual(ALL(false));
    }
    // The remaining state is the owner's: the room and the files are intact.
    expect(
      (await owner.files.getFileInfo({ fileId: scene.rootFile.id })).status,
    ).toBe(200);
  });
});

test.describe("Inviting again after removal or leaving", () => {
  test("PUT /files/rooms/:id/share - A removed or departed member comes back without their old keys, once, with the others untouched", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const { owner, scene, roomId } = await newScene(apiSdk, "Life reinvite");
    const [r1, r2, r3, r4, bystander] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    const files = [scene.rootFile.id, scene.deepFile.id];
    for (const m of [r1, r2, r3, r4, bystander]) {
      expect(
        (await inviteToRoom(owner, roomId, m.id, FileShare.Read)).status,
      ).toBe(200);
      await issue(owner, files, m.id, "re");
    }
    const bystanderKeys = await keysOf(bystander.api, files[0]);
    const comesBack = async (who: Account, role: FileShare, label: string) => {
      const res = await invite(owner, roomId, who.id, role);
      expect(res.status, label).toBe(200);
      expect(
        (await accessOf(owner, roomId)).get(who.id),
        `${label}: role`,
      ).toBe(role);
      expect(
        (await memberIds(owner, roomId)).filter((id) => id === who.id),
        `${label}: duplicates`,
      ).toHaveLength(1);
      const got = await reach(who.api, scene);
      expect
        .soft(
          got.room && got.content && got.nested && got.file,
          `${label}: reaches the room`,
        )
        .toBe(true);
      // The old entries are not restored; the member has to be given new ones.
      expect(
        await keysOf(who.api, files[0]),
        `${label}: old entries came back`,
      ).toBe("[]");
      await issue(owner, files, who.id, "again");
      expect(await keysOf(who.api, files[0]), `${label}: new entry`).not.toBe(
        "[]",
      );
      expect(
        await keysOf(bystander.api, files[0]),
        `${label}: another member's entry`,
      ).toBe(bystanderKeys);
    };

    // Removed, same key.
    expect((await invite(owner, roomId, r1.id, FileShare.None)).status).toBe(
      200,
    );
    await comesBack(r1, FileShare.Read, "removed, the same key");
    // Removed, key replaced meanwhile.
    expect((await invite(owner, roomId, r2.id, FileShare.None)).status).toBe(
      200,
    );
    expect(
      (
        await r2.api.privacyroom.replaceKey({
          encryptionKeyRequestDto: {
            publicKey: "re-new-pk",
            privateKeyEnc: "re-new-prv",
          },
        })
      ).status,
    ).toBe(200);
    await comesBack(r2, FileShare.Read, "removed, key replaced");
    // Left, key deleted and created anew.
    expect((await leave(r3.api, roomId)).status).toBe(200);
    expect((await accessOf(owner, roomId)).has(r3.id)).toBe(false);
    expect(
      (await r3.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    // Without an account key the invitation is refused (guide); the exact status is not fixed.
    expectRefused(
      (await invite(owner, roomId, r3.id, FileShare.Read)).status,
      "invitation after the key was deleted",
    );
    expect((await accessOf(owner, roomId)).has(r3.id)).toBe(false);
    expect(
      (
        await r3.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "re-again-pk",
            privateKeyEnc: "re-again-prv",
          },
        })
      ).status,
    ).toBe(201);
    await comesBack(r3, FileShare.Read, "left, key deleted and created anew");
    // Removed, comes back with another role and can use it.
    expect((await invite(owner, roomId, r4.id, FileShare.None)).status).toBe(
      200,
    );
    await comesBack(r4, FileShare.ContentCreator, "removed, another role");
    expect(
      await putFile(r4.api, "priv", roomId),
      "the new role works",
    ).toBeDefined();
  });
});

test.describe("Membership of an archived room", () => {
  test("PUT /files/rooms/:id/share - An archived room takes no membership change, private or ordinary, and leaving it is a no-op", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const owner = apiSdk.forRole("owner");
    const [m1, m2] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    const priv = await createOwnerPrivateRoom(apiSdk, "Life archived private");
    const plain = (
      await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Life archived plain",
          roomType: RoomType.CustomRoom,
        },
      })
    ).data.response!.id!;
    for (const room of [priv, plain]) {
      expect(
        (await inviteToRoom(owner, room, m1.id, FileShare.Read)).status,
      ).toBe(200);
      // The control: before archiving the same invitation works.
      expect((await invite(owner, room, m2.id, FileShare.Read)).status).toBe(
        200,
      );
      expect((await invite(owner, room, m2.id, FileShare.None)).status).toBe(
        200,
      );
    }
    await archiveRoomAndWait(apiSdk, priv);
    await archiveRoomAndWait(apiSdk, plain);
    for (const [name, room] of [
      ["private", priv],
      ["ordinary", plain],
    ] as const) {
      const before = [...(await accessOf(owner, room)).entries()];
      // The archive is read-only: a change is refused (4xx, the exact status is not fixed), the ordinary room does the same.
      expectRefused(
        (await invite(owner, room, m2.id, FileShare.Read)).status,
        `${name}: invitation`,
      );
      expectRefused(
        (await invite(owner, room, m1.id, FileShare.Editing)).status,
        `${name}: role change`,
      );
      expectRefused(
        (await invite(owner, room, m1.id, FileShare.None)).status,
        `${name}: removal`,
      );
      // removeSecurityInfo always answers true and changes nothing in an archived room.
      expect((await leave(m1.api, room)).status, `${name}: leave`).toBe(200);
      expect(
        [...(await accessOf(owner, room)).entries()],
        `${name}: membership changed`,
      ).toEqual(before);
    }
  });
});

test.describe("Repeated membership requests", () => {
  test("PUT /files/rooms/:id/share - The same invitation, removal, leave and role change sent twice at once leave one consistent state", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const { owner, roomId } = await newScene(apiSdk, "Life repeat");
    const [a, b, c, d] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    const twice = <T>(fn: () => Promise<T>) => Promise.all([fn(), fn()]);
    const count = async (id: string) =>
      (await memberIds(owner, roomId)).filter((x) => x === id).length;

    const inv = await twice(() => invite(owner, roomId, a.id, FileShare.Read));
    for (const r of inv)
      expectNoServerError(r.status, "invitation twice at once");
    expect(await count(a.id), "invitation twice").toBe(1);
    expect((await accessOf(owner, roomId)).get(a.id)).toBe(FileShare.Read);

    const role = await twice(() =>
      invite(owner, roomId, a.id, FileShare.ContentCreator),
    );
    for (const r of role)
      expectNoServerError(r.status, "role change twice at once");
    expect(await count(a.id), "role change twice").toBe(1);
    expect((await accessOf(owner, roomId)).get(a.id)).toBe(
      FileShare.ContentCreator,
    );

    expect(
      (await inviteToRoom(owner, roomId, b.id, FileShare.Read)).status,
    ).toBe(200);
    const rm = await twice(() => invite(owner, roomId, b.id, FileShare.None));
    for (const r of rm) expectNoServerError(r.status, "removal twice at once");
    expect(await count(b.id), "removal twice").toBe(0);

    expect(
      (await inviteToRoom(owner, roomId, c.id, FileShare.Read)).status,
    ).toBe(200);
    expect(
      (await inviteToRoom(owner, roomId, d.id, FileShare.Read)).status,
    ).toBe(200);
    const lv = await twice(() => leave(c.api, roomId));
    // removeSecurityInfo is safe to repeat and always true (JSDoc); the second call for a member who is gone may also be refused, never a crash.
    for (const r of lv) expectNoServerError(r.status, "leaving twice at once");
    expect(
      lv.map((r) => r.status),
      "at least one leave succeeded",
    ).toContain(200);
    expect(await count(c.id), "leaving twice").toBe(0);
    expect(
      await count(d.id),
      "another member is untouched by the repeated leave",
    ).toBe(1);
    expect(await ownerOf(owner, roomId)).toBe(
      (await owner.profiles.getSelfProfile()).data.response!.id,
    );
  });
});
