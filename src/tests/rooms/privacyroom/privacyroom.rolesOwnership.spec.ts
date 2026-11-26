import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  ZERO_GUID,
  inviteToRoom,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  Member,
  MemberDef,
  buildArena,
  putFile,
} from "@/src/helpers/private-room-arena";
import { addAccounts } from "@/src/helpers/private-room-download";
import { rawRequest } from "@/src/helpers/private-room-upload";

/**
 * Ownership, role changes, creating a private room, and keys versus rights
 * (PR-OWN-006, PR-MEM-020/021, PR-ROOM-*, the guide's role table).
 *
 * The expectations come from the product guide (only the owner transfers the
 * room; keys are needed to create a private room; a room manager manages
 * members; a content creator uploads) and the SDK JSDoc. See the header of
 * privacyroom.roles.spec.ts for the method and for how the guide's silence is
 * handled. Nothing here is derived from what the server happens to do.
 */

const observe = (what: string) =>
  test.info().annotations.push({ type: "observation", description: what });

const isOk = (status: number) => status >= 200 && status < 300;

test.describe("Ownership transfer - only the owner", () => {
  test("PUT /files/owner - Every role tries to hand the private room to another member; only the owner may", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const a = await buildArena(apiSdk);
    const ownerOf = async (room: number) =>
      (await a.admin.rooms.getRoomInfo({ id: room })).data.response!.createdBy
        ?.id;
    const transfer = (who: Member, room: number, to: Member) =>
      who.api.sharing.changeFileOwner({
        changeOwnerRequestDto: { folderIds: [room] as never, userId: to.id },
      });

    const outcome: Record<string, { priv: boolean; plain: boolean }> = {};
    for (const who of a.members) {
      // The receiver is a keyed RoomAdmin who is already a member (the guide: a member with a verified key).
      const to = who.key === "mgr" ? a.by("raCC") : a.by("mgr");
      for (const [kind, room] of [
        ["priv", a.priv],
        ["plain", a.plain],
      ] as const) {
        const before = await ownerOf(room);
        const res = await transfer(who, room, to);
        const changed = (await ownerOf(room)) !== before;
        (outcome[who.key] ??= { priv: false, plain: false })[kind] = changed;
        observe(
          `transfer (${kind}) by ${who.key} to ${to.key}: ${res.status}, owner changed: ${changed}`,
        );
        if (changed)
          // Hand it back: the new owner returns the room to the account that built the scene.
          await to.api.sharing.changeFileOwner({
            changeOwnerRequestDto: {
              folderIds: [room] as never,
              userId: a.adminId,
            },
          });
        expect
          .soft(
            await ownerOf(room),
            `${kind}: the owner was restored after ${who.key}`,
          )
          .toBe(before);
      }
    }

    expect(
      outcome["owner"].priv,
      "the owner transfers (positive control)",
    ).toBe(true);
    for (const who of a.members.filter((m) => m.key !== "owner")) {
      // The guide's table: "Передать комнату другому участнику - Владелец".
      expect
        .soft(
          outcome[who.key].priv,
          `${who.key}: only the owner transfers a private room`,
        )
        .toBe(false);
    }
    for (const [g, p] of [
      ["dsaReader", "reader"],
      ["raReader", "reader"],
      ["dsaCC", "ccOther"],
      ["raCC", "ccOther"],
    ]) {
      expect
        .soft(
          outcome[g].priv,
          `${g} versus ${p}: the global role must not matter`,
        )
        .toBe(outcome[p].priv);
    }
    // The JSDoc lets a portal administrator transfer any room; what the ordinary room does is recorded for contrast.
    observe(
      `ordinary room: ${
        a.members
          .filter((m) => outcome[m.key].plain)
          .map((m) => m.key)
          .join(", ") || "only nobody"
      } could transfer`,
    );
  });
});

test.describe("Role changes - the next request already sees the new role", () => {
  test("PUT /files/rooms/:id/share - Promoting and demoting a member changes what their own, unchanged session may do", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const defs: MemberDef[] = [
      {
        key: "u",
        label: "a RoomAdmin (a plain User cannot be made a manager)",
        global: "RoomAdmin",
        local: FileShare.Read,
      },
    ];
    const a = await buildArena(apiSdk, { members: defs, extras: 1 });
    const u = a.by("u");
    const candidate = a.extras[0];

    const can = async () => {
      const upload = !!(await putFile(u.api, "priv", a.priv));
      const folder = isOk(
        (
          await u.api.folders.createFolder({
            folderId: a.priv,
            createFolderRequest: {
              title: `rc-${Math.random().toString(36).slice(2, 8)}`,
            },
          })
        ).status,
      );
      const inv = await u.api.rooms.setRoomSecurity({
        id: a.priv,
        roomInvitationRequest: {
          invitations: [{ id: candidate.id, access: FileShare.Read }],
          notify: false,
        },
      });
      const invited = (await roomMemberAccess(a.admin, a.priv)).has(
        candidate.id,
      );
      if (invited)
        await inviteToRoom(a.admin, a.priv, candidate.id, FileShare.None);
      return { upload, folder, invite: invited && isOk(inv.status) };
    };
    const setRole = async (access: FileShare) => {
      expect((await inviteToRoom(a.admin, a.priv, u.id, access)).status).toBe(
        200,
      );
      expect((await roomMemberAccess(a.admin, a.priv)).get(u.id)).toBe(access);
    };

    // The same bearer token is used for every request below; nothing re-authenticates.
    expect(await can(), "Read: nothing is allowed").toEqual({
      upload: false,
      folder: false,
      invite: false,
    });

    await setRole(FileShare.ContentCreator);
    expect(
      await can(),
      "promoted to ContentCreator: creates content, still no invitations",
    ).toEqual({
      upload: true,
      folder: true,
      invite: false,
    });

    await setRole(FileShare.RoomManager);
    expect(await can(), "promoted to RoomManager: everything").toEqual({
      upload: true,
      folder: true,
      invite: true,
    });

    await setRole(FileShare.Read);
    expect(
      await can(),
      "demoted to Read: everything is taken away at once",
    ).toEqual({
      upload: false,
      folder: false,
      invite: false,
    });

    // Re-assigning the current role is harmless.
    await setRole(FileShare.ContentCreator);
    const before = [...(await roomMemberAccess(a.admin, a.priv)).entries()];
    expect(
      (await inviteToRoom(a.admin, a.priv, u.id, FileShare.ContentCreator))
        .status,
    ).toBe(200);
    expect([...(await roomMemberAccess(a.admin, a.priv)).entries()]).toEqual(
      before,
    );
    expect(
      (await can()).upload,
      "still a ContentCreator after the repeat",
    ).toBe(true);
  });
});

test.describe("Creating a private room - global role and key", () => {
  test("POST /files/rooms - Who may create a private room: global role crossed with the state of the account key", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const owner = apiSdk.forRole("owner");
    const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
    const kinds = ["DocSpaceAdmin", "RoomAdmin", "User"] as const;
    const states = ["has", "none", "deleted"] as const;
    const specs = [
      ...kinds.flatMap((type) =>
        states.map((state) => ({ type, key: state !== "none" })),
      ),
      { type: "Guest" as const, key: false },
    ];
    const accounts = await addAccounts(apiSdk, specs);
    const subjects: {
      label: string;
      global: string;
      state: string;
      api: typeof owner;
      id: string;
    }[] = [];
    let i = 0;
    for (const type of kinds)
      for (const state of states) {
        const acc = accounts[i++];
        if (state === "deleted") {
          expect(
            (await acc.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
          ).toBe(204);
        }
        subjects.push({
          label: `${type} (${state})`,
          global: type,
          state,
          api: acc.api,
          id: acc.id,
        });
      }
    const guest = accounts[i++];
    subjects.push({
      label: "Guest",
      global: "Guest",
      state: "none",
      api: guest.api,
      id: guest.id,
    });

    const createPrivate = (api: typeof owner, title: string) =>
      api.rooms.createRoom({
        createRoomRequestDto: {
          title,
          roomType: RoomType.CustomRoom,
          private: true,
        },
      });
    const privateIds = async (api: typeof owner) =>
      (
        ((
          await api.rooms.getRoomsFolder({
            searchArea: "PrivateRooms" as never,
          })
        ).data.response?.folders ?? []) as { id?: number }[]
      ).map((f) => f.id);

    const check = async (
      s: (typeof subjects)[number],
      expectAllowed: boolean,
    ) => {
      const before = await privateIds(s.api);
      const res = await createPrivate(s.api, `Roles create ${s.label}`);
      const roomId = (res.data?.response as { id?: number } | undefined)?.id;
      const created = isOk(res.status) && !!roomId;
      const control = await s.api.rooms.createRoom({
        createRoomRequestDto: {
          title: `Roles ordinary ${s.label}`,
          roomType: RoomType.CustomRoom,
        },
      });
      observe(
        `${s.label}: private room ${res.status}${created ? " created" : ""}; an ordinary room by the same account: ${control.status}`,
      );
      if (created) {
        const info = (await s.api.rooms.getRoomInfo({ id: roomId! })).data
          .response!;
        expect.soft(info.private, `${s.label}: the flag`).toBe(true);
        expect
          .soft(info.roomType, `${s.label}: the type`)
          .toBe(RoomType.CustomRoom);
        expect
          .soft(info.createdBy?.id, `${s.label}: the owner is the creator`)
          .toBe(s.id);
        expect
          .soft(await privateIds(s.api), `${s.label}: listed for its creator`)
          .toContain(roomId);
      } else {
        expect
          .soft(
            await privateIds(s.api),
            `${s.label}: a refused request left a room behind`,
          )
          .toEqual(before);
      }
      if (isOk(control.status))
        expect
          .soft(
            created,
            `${s.label}: expected ${expectAllowed ? "created" : "refused"}`,
          )
          .toBe(expectAllowed);
      else
        observe(
          `${s.label}: NO CONTROL (an ordinary room by the same account answers ${control.status}); the answer says nothing special about privacy`,
        );
    };

    // The guide: no entry point for User and Guest; creating needs a key (the Create key dialog).
    for (const s of subjects) {
      const roleMayCreate =
        s.global === "DocSpaceAdmin" || s.global === "RoomAdmin";
      await check(s, roleMayCreate && s.state === "has");
    }

    // The Portal Owner walks through the three states on one account.
    const ownerSubject = {
      label: "Portal Owner",
      global: "Owner",
      state: "",
      api: owner,
      id: ownerId,
    };
    await check(
      { ...ownerSubject, label: "Portal Owner (no key)", state: "none" },
      false,
    );
    expect(
      (
        await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "owner-pk",
            privateKeyEnc: "owner-prv",
          },
        })
      ).status,
    ).toBe(201);
    await check(
      { ...ownerSubject, label: "Portal Owner (has key)", state: "has" },
      true,
    );
    expect((await owner.privacyroom.deleteKeys({ id: ZERO_GUID })).status).toBe(
      204,
    );
    await check(
      {
        ...ownerSubject,
        label: "Portal Owner (key deleted)",
        state: "deleted",
      },
      false,
    );

    // Anonymous: no session, no room.
    const anonymous = await rawRequest(apiSdk, null, "rooms", {
      json: {
        title: "Roles anonymous",
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(anonymous.status).toBe(401);
    // The Create room call is under files/rooms, not files/{id}: the raw helper's path is the portal's files area.
    void anonymous;
  });
});

test.describe("Keys and rights are independent", () => {
  test("PUT /files/rooms/:id/share - A key is not a right, and the lack of one is not the loss of the room", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const defs: MemberDef[] = [
      {
        key: "creator",
        label: "a ContentCreator",
        global: "User",
        local: FileShare.ContentCreator,
      },
      {
        key: "reader",
        label: "a Read member who holds a file key",
        global: "User",
        local: FileShare.Read,
      },
    ];
    const a = await buildArena(apiSdk, { members: defs });
    const creator = a.by("creator");
    const reader = a.by("reader");
    const file = (await putFile(a.admin, "priv", a.priv))!;
    expect(file, "setup: a file").toBeTruthy();
    // The Read member holds a file key and an account key: neither is a right to write.
    expect(
      (
        await a.admin.files.setEncryptionInfo({
          fileId: file,
          accessRequestKeyDto: [
            {
              userId: reader.id,
              publicKeyId: ZERO_GUID,
              privateKeyEnc: "indep-fk",
            },
          ],
        })
      ).status,
    ).toBe(200);
    const readerKeys = await reader.api.files.getEncryptionInfo({
      fileId: file,
    });
    expect(readerKeys.data.response?.fileKeys).toHaveLength(1);
    expect((await reader.api.privacyroom.getUserKeys()).data.count).toBe(1);

    const folderBefore = (
      await a.admin.folders.getFolderByFolderId({ folderId: a.priv })
    ).data.response;
    const writes = {
      upload: await putFile(reader.api, "priv", a.priv),
      folder: (
        await reader.api.folders.createFolder({
          folderId: a.priv,
          createFolderRequest: { title: "key-is-not-a-right" },
        })
      ).status,
      delete: (
        await reader.api.operations.deleteBatchItems({
          deleteBatchRequestDto: {
            fileIds: [file] as never,
            deleteAfter: false,
            immediately: true,
          },
        })
      ).status,
    };
    observe(
      `a Read member with keys: upload ${writes.upload ? "accepted" : "refused"}, createFolder ${writes.folder}, delete ${writes.delete}`,
    );
    expect(
      writes.upload,
      "upload by a Read member holding keys",
    ).toBeUndefined();
    expect(
      isOk(writes.folder),
      "createFolder by a Read member holding keys",
    ).toBe(false);
    expect(isOk(writes.delete), "delete by a Read member holding keys").toBe(
      false,
    );
    const folderAfter = (
      await a.admin.folders.getFolderByFolderId({ folderId: a.priv })
    ).data.response;
    expect((folderAfter?.files ?? []).length).toBe(
      (folderBefore?.files ?? []).length,
    );
    expect((folderAfter?.folders ?? []).length).toBe(
      (folderBefore?.folders ?? []).length,
    );

    // A member whose account key is deleted keeps the room, the role and the file's stored key; what the server lets them do is recorded.
    expect(
      (await creator.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    expect((await creator.api.privacyroom.getUserKeys()).data.count).toBe(0);
    expect((await roomMemberAccess(a.admin, a.priv)).get(creator.id)).toBe(
      FileShare.ContentCreator,
    );
    const keyless = await putFile(creator.api, "priv", a.priv);
    observe(
      `a ContentCreator who deleted their account key: upload ${keyless ? "accepted" : "refused"} (the guide: a client-side requirement)`,
    );
    expect((await roomMemberAccess(a.admin, a.priv)).get(creator.id)).toBe(
      FileShare.ContentCreator,
    );
    // After a new key the member simply continues.
    expect(
      (
        await creator.api.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            publicKey: "new-pk",
            privateKeyEnc: "new-prv",
          },
        })
      ).status,
    ).toBe(201);
    expect(
      await putFile(creator.api, "priv", a.priv),
      "upload after the key is back",
    ).toBeDefined();
  });
});
