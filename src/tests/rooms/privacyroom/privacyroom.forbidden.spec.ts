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

/**
 * Operations a private ROOM must refuse (PR-RFORB-*, PR-ROOM-021, PR-INV-005/006/028).
 *
 * The functional prohibitions come from the product guide (private-rooms-
 * onboarding.html, "Недоступно для приватной комнаты"): no external links, no
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
 * recorded; the guide does not define one, so it is not asserted. An operation
 * the caller cannot do in an ordinary room either is reported as NO CONTROL and
 * does not count as covered.
 *
 * Out of scope: files and folders (packages 3 and 4), metadata (package 12), the
 * full invitation, role, key and archive matrices (packages 6-8, 15).
 */

const observe = (what: string) =>
  test.info().annotations.push({ type: "observation", description: what });

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

      for (const op of OPS) {
        const plainTarget = op.empty ? kit.emptyPlain : kit.plain;
        const privTarget = op.empty ? kit.emptyPriv : kit.priv;

        // The control: the same call works on the ordinary room for this caller.
        const control = await op.run(kit, plainTarget);
        if (!ok(control)) {
          observe(
            `${role}: ${op.name}: NO CONTROL (the ordinary room answers ${control.status}); not counted as covered`,
          );
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

        observe(
          `${role}: ${op.name}: control ${control.status}, private room ${refused.status}`,
        );
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

  test("PUT /files/rooms/:id - Settings the guide does not mention are recorded, not asserted", async ({
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
      if (!ok(control)) {
        observe(`${name}: NO CONTROL (${control.status})`);
        continue;
      }
      const before = await roomState(kit.admin, kit.priv);
      const res = await kit.actor.rooms.updateRoom({
        id: kit.priv,
        updateRoomRequest: body as never,
      });
      const after = await roomState(kit.admin, kit.priv);
      observe(
        `updateRoom ${name}: ordinary room ${control.status}, private room ${res.status}; applied: ${JSON.stringify(after.info) !== JSON.stringify(before.info)}`,
      );
      // Whatever the answer, the room keeps its type, privacy, members, files and keys.
      expect(after.info.private).toBe(true);
      expect(after.info.roomType).toBe(RoomType.CustomRoom);
      expect({ ...after, info: undefined }).toEqual({
        ...before,
        info: undefined,
      });
    }
  });

  test("PUT /files/rooms/:id - A virtual data room of a private kind cannot be indexed or exported", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const owner = apiSdk.forRole("owner");
    // The control: an ordinary virtual data room is indexed and exported.
    const vdr = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "RoomOps VDR",
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
    ).toBe(200);
    expect((await owner.rooms.startRoomIndexExport({ id: vdrId })).status).toBe(
      200,
    );

    const priv = await createPrivateRoom(apiSdk, "owner", {
      title: "RoomOps private VDR",
      roomType: RoomType.VirtualDataRoom,
    });
    expect(priv.status, "setup: a private virtual data room is created").toBe(
      200,
    );
    const privId = priv.data.response!.id!;
    expect(priv.data.response!.private).toBe(true);

    const before = await roomState(owner, privId);
    const indexed = await owner.rooms.updateRoom({
      id: privId,
      updateRoomRequest: { indexing: true } as never,
    });
    const exported = await owner.rooms.startRoomIndexExport({ id: privId });
    observe(
      `private virtual data room: indexing ${indexed.status}, export ${exported.status}`,
    );

    // The index is not switched on and no export is queued.
    const after = await roomState(owner, privId);
    expect(after.info.indexing).toBe(false);
    expect(after).toEqual(before);
    expect(
      ok(exported),
      "an export was queued for a room that is not indexed",
    ).toBe(false);
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
    observe(
      `an address with no account invited to an ordinary room: ${plainMail.status}`,
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
    observe(
      `group invited to the private room: ${byGroup.status}; address with no account: ${byMail.status}`,
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
      // The ordinary archived room is refused too, so the archive state alone explains these answers.
      observe(
        `archived: ${name}: ordinary room ${onPlain.status}, private room ${onPrivate.status}`,
      );
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
    observe(
      `private room built from an ordinary template holds ${privateRoom.files.length} files`,
    );
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

    for (const roomType of [RoomType.CustomRoom, RoomType.VirtualDataRoom]) {
      const created = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: `RoomOps private ${roomType}`,
          roomType,
          private: true,
          indexing: true,
        } as never,
      });
      observe(
        `private room of type ${roomType} created with indexing: ${created.status}`,
      );
      // Either the room is not created or it is created without an index.
      if (created.status === 200)
        expect(
          (await owner.rooms.getRoomInfo({ id: created.data.response!.id! }))
            .data.response!.indexing,
        ).toBe(false);
    }
  });
});
