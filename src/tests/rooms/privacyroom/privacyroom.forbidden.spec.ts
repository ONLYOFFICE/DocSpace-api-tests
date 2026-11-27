import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, LinkType, RoomType } from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import { inviteToRoom } from "@/src/helpers/private-rooms";
import { addAccounts } from "@/src/helpers/private-room-download";
import { KIT_ROLES } from "@/src/helpers/private-room-forbidden";
import {
  RoomKit,
  buildRoomKit,
  portalState,
  roomState,
} from "@/src/helpers/private-room-roomkit";
import { createPrivateRoom, ensureEncryptionKeys } from "@/src/helpers/rooms";
import { unfinishedOperations } from "@/src/helpers/private-room-upload";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomFromTemplate } from "@/src/helpers/wait-for-room-from-template";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";
import {
  expectNoServerError,
  expectRefused,
} from "@/src/helpers/private-room-lifecycle";

/**
 * Operations a private ROOM must refuse (PR-RFORB-*, PR-ROOM-021, PR-INV-005/006/028).
 *
 * The functional prohibitions come from the product guide (private-rooms-
 * onboarding.html, "Unavailable for a private room"): no external links, no
 * links for members, no embedding settings, no Share tab, no editing or exporting
 * the index, no saving as a template, no duplicating the room, no AI chat, AI
 * actions or plugins for the room, its folders and files; and "the type and the
 * flag cannot be changed afterwards". Where the SDK JSDoc says otherwise (the
 * template JSDoc: the template "inherits the source room's ... privacy" and gets
 * "copies of the room's files") the guide is the functional reference and the
 * contradiction is recorded, not followed.
 *
 * Every operation is tried on an ordinary Custom room first (the positive
 * control: the same call works for this caller) and then on the private room,
 * which is read back before and after: members, links, files, keys, flags,
 * settings, and the rooms and templates the caller can list. The HTTP status is
 * not asserted as an exact value: the guide does not define one, so the
 * assertion is the unchanged state plus "never a server error". An operation the
 * caller cannot do in an ordinary room either has no positive control: such rows
 * are listed in KNOWN_NO_CONTROL, reported and not counted as covered, and any
 * OTHER missing control fails the test instead of being skipped.
 *
 * Out of scope: files and folders (packages 3 and 4), metadata (package 12), the
 * full invitation, role, key and archive matrices (packages 6-8, 15).
 */

/**
 * Operations a role cannot do even in an ordinary room (so there is no positive
 * control for the private room). Explicit, reported in the test annotations and
 * not counted as covered; anything missing from this list must pass its control.
 */
const KNOWN_NO_CONTROL: Partial<Record<string, string[]>> = {};

type Reply = { status: number; data?: unknown };
type RoomOp = {
  name: string;
  /** Run on the empty rooms instead of the populated ones. */
  empty?: boolean;
  /** The operation queues a template and has to be waited for. */
  template?: boolean;
  run: (k: RoomKit, roomId: number) => Promise<Reply>;
};

const link = (
  k: RoomKit,
  id: number,
  body: {
    linkType: LinkType;
    access: FileShare;
    title: string;
    password?: string;
    expirationDate?: string;
    internal?: boolean;
  },
) => k.actor.rooms.setRoomLink({ id, roomLinkRequest: body as never });

const OPS: RoomOp[] = [
  {
    name: "createRoomTemplate (room with files and folders)",
    template: true,
    run: (k, roomId) =>
      k.actor.rooms.createRoomTemplate({
        roomTemplateDto: { roomId, title: "tpl" },
      }),
  },
  {
    name: "createRoomTemplate (empty room)",
    empty: true,
    template: true,
    run: (k, roomId) =>
      k.actor.rooms.createRoomTemplate({
        roomTemplateDto: { roomId, title: "tpl-empty" },
      }),
  },
  {
    name: "createRoomTemplate (copyLogo)",
    template: true,
    run: (k, roomId) =>
      k.actor.rooms.createRoomTemplate({
        roomTemplateDto: { roomId, title: "tpl-logo", copyLogo: true },
      }),
  },
  {
    name: "createRoomTemplate (public)",
    template: true,
    run: (k, roomId) =>
      k.actor.rooms.createRoomTemplate({
        roomTemplateDto: { roomId, title: "tpl-public", public: true },
      }),
  },
  {
    name: "duplicate the room (duplicateBatchItems, room with content)",
    run: (k, roomId) =>
      k.actor.operations.duplicateBatchItems({
        duplicateRequestDto: { folderIds: [roomId] as never },
      }),
  },
  {
    name: "duplicate the room (duplicateBatchItems, empty room)",
    empty: true,
    run: (k, roomId) =>
      k.actor.operations.duplicateBatchItems({
        duplicateRequestDto: { folderIds: [roomId] as never },
      }),
  },
  {
    name: "setRoomLink (external, view)",
    run: (k, id) =>
      link(k, id, {
        linkType: LinkType.External,
        access: FileShare.Read,
        title: "view",
      }),
  },
  {
    name: "setRoomLink (external, edit)",
    run: (k, id) =>
      link(k, id, {
        linkType: LinkType.External,
        access: FileShare.Editing,
        title: "edit",
      }),
  },
  {
    name: "setRoomLink (external, password and expiry)",
    run: (k, id) =>
      link(k, id, {
        linkType: LinkType.External,
        access: FileShare.Read,
        title: "protected",
        password: "Secr3tPass!",
        expirationDate: new Date(Date.now() + 86_400_000).toISOString(),
      }),
  },
  {
    name: "setRoomLink (invitation, for members)",
    run: (k, id) =>
      link(k, id, {
        linkType: LinkType.Invitation,
        access: FileShare.Read,
        title: "members",
        internal: true,
      }),
  },
  {
    name: "updateRoom (indexing on)",
    run: (k, id) =>
      k.actor.rooms.updateRoom({
        id,
        updateRoomRequest: { indexing: true } as never,
      }),
  },
  {
    name: "updateRoom (indexing together with allowed settings)",
    run: (k, id) =>
      k.actor.rooms.updateRoom({
        id,
        updateRoomRequest: {
          title: "mixed",
          tags: ["mixed"],
          indexing: true,
        } as never,
      }),
  },
];

const ok = (r: Reply) => r.status >= 200 && r.status < 300;

test.describe("Rooms API - a private room refuses what the product guide takes away", () => {
  for (const { role, label } of KIT_ROLES.filter((r) => r.role !== "creator")) {
    test(`Rooms API - ${label[0].toUpperCase()}${label.slice(1)} cannot save a private room as a template, duplicate it, share it by link or index it`, async ({
      apiSdk,
    }) => {
      test.setTimeout(290_000);
      const kit = await buildRoomKit(apiSdk, role);
      const { actor, admin } = kit;

      const uncontrolled: string[] = [];
      for (const op of OPS) {
        const plainTarget = op.empty ? kit.emptyPlain : kit.plain;
        const privTarget = op.empty ? kit.emptyPriv : kit.priv;

        // The control: the same call works on the ordinary room for this caller.
        const control = await op.run(kit, plainTarget);
        if (!ok(control)) {
          // No positive control: the row is listed, not silently skipped, and not counted as covered.
          uncontrolled.push(op.name);
          continue;
        }
        if (op.template) await waitForRoomTemplate(actor.rooms);
        await expect
          .poll(async () => (await unfinishedOperations(actor)).length)
          .toBe(0);

        const before = {
          room: await roomState(admin, privTarget),
          portal: await portalState(actor, admin),
        };
        const refused = await op.run(kit, privTarget);
        // A job that was queued anyway has to finish before the end state is read.
        if (ok(refused) && op.template)
          await waitForRoomTemplate(actor.rooms).catch(() => undefined);
        if (ok(refused))
          await waitForOperation(actor.operations).catch(() => undefined);
        await expect
          .poll(async () => (await unfinishedOperations(actor)).length)
          .toBe(0);

        expectNoServerError(refused.status, `${op.name}: private room`);
        expect
          .soft(
            await roomState(admin, privTarget),
            `${op.name}: the private room changed`,
          )
          .toEqual(before.room);
        expect
          .soft(
            await portalState(actor, admin),
            `${op.name}: rooms or templates appeared`,
          )
          .toEqual(before.portal);
      }

      expect(
        uncontrolled,
        `${role}: operations with no positive control (an unexpected one means the setup is broken)`,
      ).toEqual(KNOWN_NO_CONTROL[role] ?? []);
      if (uncontrolled.length)
        test.info().annotations.push({
          type: "NO CONTROL",
          description: `${role}: ${uncontrolled.join("; ")} (not counted as covered)`,
        });

      // The prohibitions are not too wide: allowed settings still work on the private room.
      const allowed = await actor.rooms.updateRoom({
        id: kit.priv,
        updateRoomRequest: { title: "Renamed private room", tags: ["kept"] },
      });
      expect(allowed.status).toBe(200);
      const after = (await admin.rooms.getRoomInfo({ id: kit.priv })).data
        .response!;
      expect(after.title).toBe("Renamed private room");
      expect(after.private).toBe(true);
      expect(after.roomType).toBe(RoomType.CustomRoom);
      expect(after.tags).toEqual(["kept"]);
    });
  }

  test("PUT /files/rooms/:id - Settings the guide allows change a private room and never its type or its privacy", async ({
    apiSdk,
  }) => {
    const kit = await buildRoomKit(apiSdk, "owner");
    for (const [name, privateRoom, plainRoom] of [
      ["populated", kit.priv, kit.plain],
      ["empty", kit.emptyPriv, kit.emptyPlain],
    ] as const) {
      const control = await kit.actor.rooms.updateRoom({
        id: plainRoom,
        updateRoomRequest: { title: `Edited ${name} plain`, tags: ["edit"] },
      });
      expect(control.status, `${name}: control`).toBe(200);
      const before = await roomState(kit.admin, privateRoom);

      const edited = await kit.actor.rooms.updateRoom({
        id: privateRoom,
        updateRoomRequest: { title: `Edited ${name} private`, tags: ["edit"] },
      });

      expect(edited.status, name).toBe(200);
      const info = (await kit.admin.rooms.getRoomInfo({ id: privateRoom })).data
        .response!;
      expect(info.title).toBe(`Edited ${name} private`);
      expect(info.tags).toEqual(["edit"]);
      // The type and the flag are not among the fields updateRoom defines; what it keeps is checked.
      const after = await roomState(kit.admin, privateRoom);
      expect(after.info.private).toBe(true);
      expect(after.info.roomType).toBe(RoomType.CustomRoom);
      expect(after).toEqual(before);
    }
  });

  test("PUT /files/rooms/:id - Settings the guide does not mention never change the type, the privacy, the members, the files or the keys", async ({
    apiSdk,
  }) => {
    const kit = await buildRoomKit(apiSdk, "owner");
    for (const [name, body] of [
      ["denyDownload", { denyDownload: true }],
      [
        "lifetime",
        {
          lifetime: {
            value: 5,
            period: 0,
            deletePermanently: false,
            enabled: true,
          },
        },
      ],
      [
        "watermark",
        { watermark: { text: "wm", rotate: 0, imageScale: 1, imageUrl: "" } },
      ],
    ] as const) {
      const control = await kit.actor.rooms.updateRoom({
        id: kit.plain,
        updateRoomRequest: body as never,
      });
      // Preparing the control is part of the test: the owner sets this on an ordinary room.
      expect(control.status, `${name}: control on the ordinary room`).toBe(200);
      const before = await roomState(kit.admin, kit.priv);
      const res = await kit.actor.rooms.updateRoom({
        id: kit.priv,
        updateRoomRequest: body as never,
      });
      const after = await roomState(kit.admin, kit.priv);
      // Whether the setting itself applies is not defined; never a server error, and:
      expectNoServerError(res.status, `updateRoom ${name}`);
      // Whatever the answer, the room keeps its type, privacy, members, files and keys.
      expect(after.info.private).toBe(true);
      expect(after.info.roomType).toBe(RoomType.CustomRoom);
      expect({ ...after, info: undefined }).toEqual({
        ...before,
        info: undefined,
      });
    }
  });

  test("PUT /files/rooms/:id - A private Custom room cannot be indexed or have an index exported", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const owner = apiSdk.forRole("owner");
    // The control that the calls work where the product allows them: an ordinary virtual data room.
    // (A private virtual data room is not a legal state - only a Custom room may be private - so the
    // combination "private + indexed + exported" cannot be tested; see types.spec.ts for the type rule.)
    const vdr = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "RoomOps VDR control",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    expect(vdr.status).toBe(200);
    const vdrId = vdr.data.response!.id!;
    expect(
      (
        await owner.rooms.updateRoom({
          id: vdrId,
          updateRoomRequest: { indexing: true } as never,
        })
      ).status,
      "control: indexing an ordinary virtual data room",
    ).toBe(200);
    expect(
      (await owner.rooms.startRoomIndexExport({ id: vdrId })).status,
      "control: exporting an ordinary indexed virtual data room",
    ).toBe(200);

    const priv = await createPrivateRoom(apiSdk, "owner", {
      title: "RoomOps private Custom",
      roomType: RoomType.CustomRoom,
    });
    expect(priv.status, "setup: a private Custom room is created").toBe(200);
    const privId = priv.data.response!.id!;
    expect(priv.data.response!.private).toBe(true);

    const before = await roomState(owner, privId);
    const indexed = await owner.rooms.updateRoom({
      id: privId,
      updateRoomRequest: { indexing: true } as never,
    });
    const exported = await owner.rooms.startRoomIndexExport({ id: privId });

    // The index is not switched on and no export is queued. The guide fixes no status for
    // these refusals, so a 4xx and an unchanged room are required, never a success or a crash.
    expectNoServerError(indexed.status, "indexing a private room");
    expectRefused(exported.status, "exporting the index of a private room");
    const after = await roomState(owner, privId);
    expect(after.info.indexing).toBe(false);
    expect(after).toEqual(before);
    await expect
      .poll(async () => (await unfinishedOperations(owner)).length, {
        message: "an export was queued for a private room",
      })
      .toBe(0);
  });

  test("PUT /files/rooms/:id/share - A group and an address with no account are refused as members of a private room", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const kit = await buildRoomKit(apiSdk, "owner");
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    const created = await owner.groupApi.addGroup({
      groupRequestDto: {
        groupName: "RoomOps group",
        members: [member.id],
      } as never,
    });
    expect(created.status).toBe(200);
    const groupId = (created.data.response as { id?: string }).id!;

    // The control: an ordinary room takes the group and the address.
    const plainGroup = await inviteToRoom(
      owner,
      kit.plain,
      groupId,
      FileShare.Read,
    );
    expect(plainGroup.status, "control: group in an ordinary room").toBe(200);
    expect(
      (
        (await owner.rooms.getRoomSecurityInfo({ id: kit.plain })).data
          .response ?? []
      ).map((m) => (m.sharedTo as { id?: string }).id),
    ).toContain(groupId);
    const plainMail = await owner.rooms.setRoomSecurity({
      id: kit.plain,
      roomInvitationRequest: {
        invitations: [
          { email: "roomops-ext@example.com", access: FileShare.Read } as never,
        ],
        notify: false,
      },
    });
    expectNoServerError(
      plainMail.status,
      "an address invited to an ordinary room",
    );

    const before = await roomState(owner, kit.priv);
    const byGroup = await inviteToRoom(
      owner,
      kit.priv,
      groupId,
      FileShare.Read,
    );
    const byMail = await owner.rooms.setRoomSecurity({
      id: kit.priv,
      roomInvitationRequest: {
        invitations: [
          { email: "roomops-ext@example.com", access: FileShare.Read } as never,
        ],
        notify: false,
      },
    });
    // Groups are not members of a private room (guide); the control above shows the same call works in an ordinary room.
    expectRefused(byGroup.status, "a group invited to the private room");
    // An address with no account: no member can be created for it; whatever the status, never a crash.
    expectNoServerError(
      byMail.status,
      "an address invited to the private room",
    );

    // Nobody joined, no entry was added, nothing else changed.
    expect(await roomState(owner, kit.priv)).toEqual(before);
    expect(
      (await owner.rooms.getRoomSecurityInfo({ id: kit.priv })).data.response,
    ).toHaveLength(before.members.length);
  });

  test("Rooms API - An archived private room refuses the same operations (refused for its state as well, recorded)", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const kit = await buildRoomKit(apiSdk, "owner");
    const { actor, admin } = kit;
    await archiveRoomAndWait(apiSdk, kit.emptyPlain);
    await archiveRoomAndWait(apiSdk, kit.emptyPriv);

    const tries: [string, (id: number) => Promise<Reply>][] = [
      [
        "template",
        (id) =>
          actor.rooms.createRoomTemplate({
            roomTemplateDto: { roomId: id, title: "arch" },
          }),
      ],
      [
        "duplicate",
        (id) =>
          actor.operations.duplicateBatchItems({
            duplicateRequestDto: { folderIds: [id] as never },
          }),
      ],
      [
        "external link",
        (id) =>
          link(kit, id, {
            linkType: LinkType.External,
            access: FileShare.Read,
            title: "arch",
          }),
      ],
      [
        "invitation link",
        (id) =>
          link(kit, id, {
            linkType: LinkType.Invitation,
            access: FileShare.Read,
            title: "arch",
            internal: true,
          }),
      ],
      [
        "updateRoom",
        (id) =>
          actor.rooms.updateRoom({
            id,
            updateRoomRequest: {
              title: "archived edit",
              indexing: true,
            } as never,
          }),
      ],
    ];
    for (const [name, run] of tries) {
      const before = {
        room: await roomState(admin, kit.emptyPriv),
        portal: await portalState(actor, admin),
      };
      const onPlain = await run(kit.emptyPlain);
      const onPrivate = await run(kit.emptyPriv);
      await expect
        .poll(async () => (await unfinishedOperations(actor)).length)
        .toBe(0);
      // An archived room is read-only: refused for the ordinary room too, so the archive state alone explains it.
      expectRefused(onPlain.status, `archived ordinary room: ${name}`);
      expectRefused(onPrivate.status, `archived private room: ${name}`);
      expect
        .soft(
          await roomState(admin, kit.emptyPriv),
          `${name}: archived private room changed`,
        )
        .toEqual(before.room);
      expect
        .soft(
          await portalState(actor, admin),
          `${name}: rooms or templates appeared`,
        )
        .toEqual(before.portal);
    }
  });
});

test.describe("Rooms API - rooms created from templates and with indexing", () => {
  test("POST /files/rooms/fromtemplate - A private room built from an ordinary template gets none of its plain files", async ({
    apiSdk,
  }) => {
    test.setTimeout(200_000);
    const owner = apiSdk.forRole("owner");
    await ensureEncryptionKeys(apiSdk, "owner");
    const source = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "RoomOps source",
        roomType: RoomType.CustomRoom,
      },
    });
    expect(source.status).toBe(200);
    const sourceId = source.data.response!.id!;
    expect(
      (
        await owner.files.createFile({
          folderId: sourceId,
          createFileRequest: { title: "plain.docx" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await owner.rooms.createRoomTemplate({
          roomTemplateDto: { roomId: sourceId, title: "RoomOps template" },
        })
      ).status,
    ).toBe(200);
    const templateId = await waitForRoomTemplate(owner.rooms);

    const fromTemplate = async (asPrivate: boolean) => {
      const started = await owner.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: `RoomOps from template ${asPrivate}`,
          private: asPrivate,
        },
      });
      expect(started.status).toBe(200);
      const roomId = await waitForRoomFromTemplate(owner.rooms);
      const info = (await owner.rooms.getRoomInfo({ id: roomId })).data
        .response!;
      const files = ((
        await owner.folders.getFolderByFolderId({ folderId: roomId })
      ).data.response?.files ?? []) as {
        title?: string;
        encrypted?: boolean;
      }[];
      return { info, files };
    };
    // The control: an ordinary room built from the template gets the file.
    const ordinary = await fromTemplate(false);
    expect(ordinary.info.private).toBeFalsy();
    expect(ordinary.files.map((f) => f.title)).toEqual(["plain.docx"]);

    const privateRoom = await fromTemplate(true);

    expect(privateRoom.info.private).toBe(true);
    // A private room holds only encrypted files: the plain file was not copied into it.
    expect(privateRoom.files.filter((f) => f.encrypted !== true)).toEqual([]);
  });

  test("POST /files/rooms - A private room cannot be created with indexing switched on", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    await ensureEncryptionKeys(apiSdk, "owner");
    // The control: an ordinary virtual data room is created indexed.
    const ordinary = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "RoomOps indexed VDR",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      } as never,
    });
    expect(ordinary.status).toBe(200);
    expect(
      (await owner.rooms.getRoomInfo({ id: ordinary.data.response!.id! })).data
        .response!.indexing,
    ).toBe(true);

    // Only a Custom room may be private, so that is the only type tried (a private virtual data room is
    // a known defect pinned in types.spec.ts and is not used as a fixture here).
    const title = "RoomOps private indexed";
    const created = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title,
        roomType: RoomType.CustomRoom,
        private: true,
        indexing: true,
      } as never,
    });
    expectNoServerError(
      created.status,
      "creating a private room with indexing",
    );
    // A refusal may still leave a room behind (see the createRoom private flake), so the portal is read,
    // not the answer: no room of that name may carry an index.
    const rooms = (
      (await owner.rooms.getRoomsFolder({ count: 100 })).data.response
        ?.folders ?? []
    ).filter((r) => r.title === title);
    for (const room of rooms)
      expect(
        (
          await owner.rooms.getRoomInfo({
            id: (room as unknown as { id: number }).id,
          })
        ).data.response!.indexing,
        "a private room was created indexed",
      ).toBe(false);
    if (created.status === 200)
      expect(rooms, "a 200 answer without a room").toHaveLength(1);
    else expectRefused(created.status, "creating a private room with indexing");
  });
});
