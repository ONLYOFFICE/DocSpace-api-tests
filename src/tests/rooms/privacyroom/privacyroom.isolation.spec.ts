import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { expectNoServerError } from "@/src/helpers/private-room-lifecycle";
import { ApiSDK, UserType } from "@/src/services/api-sdk";
import {
  Api,
  createOwnerPrivateRoom,
  getFilePublicKeys,
  inviteToRoom,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  addAccounts,
  uploadEncrypted,
} from "@/src/helpers/private-room-download";
import {
  KEY_MARKER,
  READERS,
  Scene,
  anonymousGet,
  buildScene,
  folderAttempt,
  issueMarkedKeys,
  leaks,
  mentionsId,
  snapshot,
} from "@/src/helpers/private-room-isolation";

/**
 * Isolation of a private room through the GENERAL Rooms, Folders, Files and
 * Sharing APIs (PR-SEC-001/002/003/017-020/023-026, PR-INFO-014/015, PR-LIST-*,
 * PR-ACL-022/023): every read method that takes a room, folder or file id, tried
 * by every kind of caller that is not a member.
 *
 * Each refusal is paired with a positive control - the same call by a room
 * manager answers 200 - and is searched for every piece of the protected objects
 * (room title, folder names, server file names, the marker of an issued file
 * key). The room is read back afterwards to prove the attempts changed nothing.
 *
 * What the contract does not settle (the body of a refusal carrying a stack
 * trace, SPEC-038) is kept out of these tests and recorded in the audit.
 */

const TITLE = () => "P3ROOM" + Math.random().toString(36).slice(2, 8);

const OUTSIDERS = [
  {
    label: "a User with a key who is not a member",
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
  setup: "none" | "removed" | "other";
}[];

/** The owner's scene plus a RoomManager to act as the positive control. */
const ownerScene = async (apiSdk: ApiSDK) => {
  const owner = apiSdk.forRole("owner");
  const roomTitle = TITLE();
  const roomId = await createOwnerPrivateRoom(apiSdk, roomTitle);
  const scene = await buildScene(
    owner,
    apiSdk.tokenStore.getToken("owner"),
    roomId,
    roomTitle,
  );
  return { owner, scene };
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

/** Every reader as `subject` (refused) and as `control` (answered), softly. */
const checkReaders = async (control: Api, subject: Api, scene: Scene) => {
  for (const reader of READERS) {
    const ok = await reader.call(control, scene);
    expect.soft(ok.status, `${reader.name}: control`).toBe(200);
    const refused = await reader.call(subject, scene);
    expect.soft(refused.status, `${reader.name}: refused caller`).toBe(403);
    expect
      .soft(
        leaks(scene, refused.data),
        `${reader.name}: protected data in the refusal`,
      )
      .toEqual([]);
  }
};

test.describe("General APIs - a private room is invisible to callers who are not members", () => {
  for (const { label, type, key, setup } of OUTSIDERS) {
    test(`GET /files/* - ${label[0].toUpperCase()}${label.slice(1)} reads nothing about the room, its folders and files`, async ({
      apiSdk,
    }) => {
      test.setTimeout(240_000);
      const { owner, scene } = await ownerScene(apiSdk);
      const [manager, subject] = await addAccounts(apiSdk, [
        { type: "RoomAdmin", key: true },
        { type: type as UserType, key },
      ]);
      expect(
        (
          await inviteToRoom(
            owner,
            scene.roomId,
            manager.id,
            FileShare.RoomManager,
          )
        ).status,
      ).toBe(200);

      if (setup === "removed") {
        expect(
          (await inviteToRoom(owner, scene.roomId, subject.id, FileShare.Read))
            .status,
        ).toBe(200);
        // They really could read before: the refusal below is the removal's doing.
        const before = await subject.api.files.getFileInfo({
          fileId: scene.rootFile.id,
        });
        expect(before.status).toBe(200);
        await removeFromRoom(owner, scene.roomId, subject.id);
      }
      if (setup === "other") {
        const otherRoom = await createOwnerPrivateRoom(apiSdk);
        const otherFile = await uploadEncrypted(owner, otherRoom);
        expect(
          (
            await inviteToRoom(
              owner,
              otherRoom,
              subject.id,
              FileShare.ContentCreator,
            )
          ).status,
        ).toBe(200);
        // The caller can read their own private room and its file: the refusal is about THIS room.
        expect(
          (await subject.api.rooms.getRoomInfo({ id: otherRoom })).status,
        ).toBe(200);
        expect(
          (await subject.api.files.getFileInfo({ fileId: otherFile.id }))
            .status,
        ).toBe(200);
      }
      // The premise: the caller is not a member.
      expect([
        ...(await roomMemberAccess(owner, scene.roomId)).keys(),
      ]).not.toContain(subject.id);
      const before = await snapshot(owner, scene);

      await checkReaders(manager.api, subject.api, scene);
      for (const folderId of [scene.roomId, scene.innerId]) {
        const attempt = await folderAttempt(
          subject.api,
          folderId,
          "p3-planted",
        );
        expect.soft(attempt.status, `createFolder in ${folderId}`).toBe(403);
      }

      expect(
        await snapshot(owner, scene),
        "the room was changed by refused calls",
      ).toEqual(before);
      // The legitimate members still work with the objects afterwards.
      expect(
        (await manager.api.files.getFileInfo({ fileId: scene.deepFile.id }))
          .status,
      ).toBe(200);
      expect(
        (
          await manager.api.folders.getFolderByFolderId({
            folderId: scene.innerId,
          })
        ).status,
      ).toBe(200);
    });
  }

  test("GET /files/* - The Portal Owner who is not a member of a DocSpaceAdmin's private room reads nothing about it", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const owner = apiSdk.forRole("owner");
    const [admin] = await addAccounts(apiSdk, [
      { type: "DocSpaceAdmin", key: true },
    ]);
    const roomTitle = TITLE();
    const created = await admin.api.rooms.createRoom({
      createRoomRequestDto: {
        title: roomTitle,
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(created.status).toBe(200);
    const scene = await buildScene(
      admin.api,
      admin.token,
      created.data.response!.id!,
      roomTitle,
    );
    // The premise: the portal owner is not in the room.
    expect([
      ...(await roomMemberAccess(admin.api, scene.roomId)).keys(),
    ]).not.toContain((await owner.profiles.getSelfProfile()).data.response!.id);
    const before = await snapshot(admin.api, scene);

    await checkReaders(admin.api, owner, scene);
    for (const folderId of [scene.roomId, scene.innerId])
      expect
        .soft(
          (await folderAttempt(owner, folderId, "p3-planted")).status,
          `createFolder in ${folderId}`,
        )
        .toBe(403);

    expect(await snapshot(admin.api, scene)).toEqual(before);
  });

  test("GET /files/* - An anonymous caller reads nothing about the room, a folder or a file", async ({
    apiSdk,
  }) => {
    const { owner, scene } = await ownerScene(apiSdk);
    // Controls: the owner reads each of these.
    for (const [name, status] of [
      ["room", (await owner.rooms.getRoomInfo({ id: scene.roomId })).status],
      [
        "folder",
        (await owner.folders.getFolderInfo({ folderId: scene.innerId })).status,
      ],
      [
        "content",
        (await owner.folders.getFolderByFolderId({ folderId: scene.roomId }))
          .status,
      ],
      [
        "file",
        (await owner.files.getFileInfo({ fileId: scene.rootFile.id })).status,
      ],
      [
        "keys",
        (await owner.sharing.getEncryptionAccess({ fileId: scene.rootFile.id }))
          .status,
      ],
      [
        "address",
        (await owner.files.getPresignedUri({ fileId: scene.rootFile.id }))
          .status,
      ],
    ] as const)
      expect(status, `control: ${name}`).toBe(200);

    // The folder content route answers 403 where the others answer 401 (observed).
    const attempts: [string, string, number][] = [
      ["room info", `files/rooms/${scene.roomId}`, 401],
      ["folder info", `files/folder/${scene.innerId}`, 401],
      ["room content", `files/${scene.roomId}`, 403],
      ["subfolders", `files/${scene.outerId}/subfolders`, 401],
      ["file info", `files/file/${scene.rootFile.id}`, 401],
      ["file keys", `files/file/${scene.rootFile.id}/publickeys`, 401],
      ["download address", `files/file/${scene.rootFile.id}/presigneduri`, 401],
    ];
    for (const [name, path, expected] of attempts) {
      const res = await anonymousGet(apiSdk, path);
      expect.soft(res.status, name).toBe(expected);
      expect
        .soft(leaks(scene, res.text), `${name}: protected data in the refusal`)
        .toEqual([]);
    }
  });

  test("GET /files/file/:fileId/protectusers - An outsider gets no user of a private file, the owner gets the members", async ({
    apiSdk,
  }) => {
    const { owner, scene } = await ownerScene(apiSdk);
    const [outsider, member] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    expect(
      (await inviteToRoom(owner, scene.roomId, member.id, FileShare.Read))
        .status,
    ).toBe(200);

    const own = await owner.files.getProtectedFileUsers({
      fileId: scene.rootFile.id,
    });
    const theirs = await outsider.api.files.getProtectedFileUsers({
      fileId: scene.rootFile.id,
    });
    const unknown = await outsider.api.files.getProtectedFileUsers({
      fileId: 2147480001,
    });

    // The positive control: the list the outsider must not get names the room's member to the owner
    // (JSDoc: access inherited from the room counts).
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.data.response), "the owner's list").toContain(
      member.id,
    );
    // No data reaches the outsider; the JSDoc fixes neither the status nor the shape for them, but a crash is not an answer.
    expectNoServerError(
      theirs.status,
      "protectusers for a file the caller cannot open",
    );
    expectNoServerError(unknown.status, "protectusers for an unknown id");
    expect(JSON.stringify(theirs.data)).not.toContain(member.id);
    expect(theirs.data.response ?? []).toEqual([]);
    expect(leaks(scene, theirs.data)).toEqual([]);
    expect(
      (await outsider.api.files.getFileInfo({ fileId: scene.rootFile.id }))
        .status,
    ).toBe(403);
  });

  test("GET /files/* - A refusal carries no token, key or protected name", async ({
    apiSdk,
  }) => {
    const { owner, scene } = await ownerScene(apiSdk);
    const [outsider] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    expect((await owner.rooms.getRoomInfo({ id: scene.roomId })).status).toBe(
      200,
    );

    const refused = await outsider.api.rooms.getRoomInfo({ id: scene.roomId });

    expect(refused.status).toBe(403);
    const text = JSON.stringify(refused.data);
    expect(leaks(scene, text)).toEqual([]);
    expect(text).not.toMatch(
      /Bearer |stream_auth|privateKeyEnc|eyJ[A-Za-z0-9_-]{20,}/,
    );
  });
});

type Listing = { status: number; data: { response?: unknown; total?: number } };

/** Every page of a listing, as one text, read with a page size of 1. */
const allPages = async (page: (startIndex: number) => Promise<Listing>) => {
  let text = "";
  for (let start = 0; start < 50; start++) {
    const res = await page(start);
    expect(res.status, "listing page").toBe(200);
    const items =
      (
        (res.data.response as { folders?: unknown[]; files?: unknown[] })
          ?.folders ?? []
      ).length +
      (
        (res.data.response as { folders?: unknown[]; files?: unknown[] })
          ?.files ?? []
      ).length;
    text += JSON.stringify(res.data.response);
    const total =
      (res.data.response as { total?: number } | undefined)?.total ??
      res.data.total ??
      0;
    if (items === 0 || start + 1 >= total) break;
  }
  return text;
};

const ROOM_VIEWS = [
  { label: "default", area: undefined },
  { label: "Any", area: SearchArea.Any },
  { label: "Active", area: SearchArea.Active },
  { label: "PrivateRooms", area: SearchArea.PrivateRooms },
  { label: "Archive", area: SearchArea.Archive },
] as const;

test.describe("General APIs - lists and search never show a private room to a non-member", () => {
  for (const { label, type, key, setup } of OUTSIDERS) {
    test(`GET /files/rooms - ${label[0].toUpperCase()}${label.slice(1)} finds the room and its content in no list or search`, async ({
      apiSdk,
    }) => {
      test.setTimeout(240_000);
      const { owner, scene } = await ownerScene(apiSdk);
      const [manager, subject] = await addAccounts(apiSdk, [
        { type: "RoomAdmin", key: true },
        { type: type as UserType, key },
      ]);
      await inviteToRoom(
        owner,
        scene.roomId,
        manager.id,
        FileShare.RoomManager,
      );
      // A second private room for each, so a page size of 1 really pages.
      for (const who of key ? [manager, subject] : [manager]) {
        const own = await createOwnerPrivateRoom(apiSdk);
        await inviteToRoom(owner, own, who.id, FileShare.ContentCreator);
      }
      if (setup === "removed") {
        await inviteToRoom(owner, scene.roomId, subject.id, FileShare.Read);
        const seen = await allPages((s) =>
          subject.api.rooms.getRoomsFolder({
            searchArea: SearchArea.PrivateRooms,
            count: 1,
            startIndex: s,
          }),
        );
        expect(
          mentionsId(seen, scene.roomId),
          "control: listed while a member",
        ).toBe(true);
        await removeFromRoom(owner, scene.roomId, subject.id);
      }
      expect([
        ...(await roomMemberAccess(owner, scene.roomId)).keys(),
      ]).not.toContain(subject.id);

      const ids = [
        scene.roomId,
        scene.outerId,
        scene.innerId,
        scene.rootFile.id,
        scene.deepFile.id,
      ];
      const roomListing = (
        api: Api,
        area: SearchArea | undefined,
        filterValue?: string,
      ) =>
        allPages((s) =>
          api.rooms.getRoomsFolder({
            searchArea: area,
            filterValue,
            count: 1,
            startIndex: s,
          }),
        );

      // Positive controls: the manager finds the room in the private-rooms views, with and without a title search.
      for (const filterValue of [undefined, scene.roomTitle])
        expect(
          mentionsId(
            await roomListing(
              manager.api,
              SearchArea.PrivateRooms,
              filterValue,
            ),
            scene.roomId,
          ),
          `control: the manager lists the room (${filterValue ?? "no filter"})`,
        ).toBe(true);
      expect(
        mentionsId(
          await allPages((s) =>
            manager.api.folders.getPrivateRoomsFolder({
              count: 1,
              startIndex: s,
            }),
          ),
          scene.roomId,
        ),
        "control: the manager lists the room in the Private rooms folder",
      ).toBe(true);

      const seen: [string, string][] = [];
      for (const view of ROOM_VIEWS)
        for (const filterValue of [undefined, scene.roomTitle])
          seen.push([
            `getRoomsFolder(${view.label}, ${filterValue ? "title search" : "no filter"})`,
            await roomListing(subject.api, view.area, filterValue),
          ]);
      for (const filterValue of [undefined, scene.roomTitle])
        seen.push([
          `getPrivateRoomsFolder(${filterValue ? "title search" : "no filter"})`,
          await allPages((s) =>
            subject.api.folders.getPrivateRoomsFolder({
              filterValue,
              count: 1,
              startIndex: s,
            }),
          ),
        ]);
      seen.push([
        "getRootFolders",
        JSON.stringify(
          (await subject.api.folders.getRootFolders({})).data.response,
        ),
      ]);
      seen.push([
        "getRecentFolder",
        JSON.stringify(
          (await subject.api.folders.getRecentFolder({})).data.response,
        ),
      ]);
      seen.push([
        "getFavoritesFolder",
        JSON.stringify(
          (await subject.api.folders.getFavoritesFolder({})).data.response,
        ),
      ]);
      seen.push([
        "getTrashFolder",
        JSON.stringify(
          (await subject.api.folders.getTrashFolder({})).data.response,
        ),
      ]);
      seen.push([
        "searchRooms",
        JSON.stringify(
          (
            await subject.api.rooms.searchRooms({
              roomsMetadataSearchRequestDto: {},
            })
          ).data.response,
        ),
      ]);
      if (type !== "Guest")
        seen.push([
          "getMyFolder",
          JSON.stringify(
            (await subject.api.folders.getMyFolder({})).data.response,
          ),
        ]);

      for (const [name, text] of seen) {
        for (const id of ids)
          expect
            .soft(mentionsId(text, id), `${name}: lists object ${id}`)
            .toBe(false);
        // Without a search the response does not echo the title back, so the names can be looked for too.
        if (!name.includes("title search"))
          expect
            .soft(leaks(scene, text), `${name}: names of the protected objects`)
            .toEqual([]);
      }
    });
  }

  test("GET /files/favorites, /files/recent - A private file is never listed as a favorite or a recent one, even for a member (an ordinary file is the control)", async ({
    apiSdk,
  }) => {
    const { owner, scene } = await ownerScene(apiSdk);
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    expect(
      (await inviteToRoom(owner, scene.roomId, member.id, FileShare.Read))
        .status,
    ).toBe(200);

    // The positive control: the same calls on an ordinary file do show it in both sections.
    const plainRoom = await owner.rooms.createRoom({
      createRoomRequestDto: { title: TITLE(), roomType: RoomType.CustomRoom },
    });
    expect(plainRoom.status).toBe(200);
    const plainFile = await owner.files.createFile({
      folderId: plainRoom.data.response!.id!,
      createFileRequest: { title: "control.docx" },
    });
    expect(plainFile.status).toBe(200);
    const plainId = plainFile.data.response!.id!;
    expect(
      (
        await owner.files.toggleFileFavorite({
          fileId: plainId,
          favorite: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await owner.files.addFileToRecent({ fileId: plainId })).status,
    ).toBe(200);
    await expect
      .poll(async () =>
        mentionsId(
          (await owner.folders.getFavoritesFolder({})).data.response,
          plainId,
        ),
      )
      .toBe(true);
    await expect
      .poll(async () =>
        mentionsId(
          (await owner.folders.getRecentFolder({})).data.response,
          plainId,
        ),
      )
      .toBe(true);

    const toggled = await member.api.files.toggleFileFavorite({
      fileId: scene.rootFile.id,
      favorite: true,
    });
    const added = await owner.files.addFileToRecent({
      fileId: scene.rootFile.id,
    });
    const favorites = await member.api.folders.getFavoritesFolder({});
    const recent = await owner.folders.getRecentFolder({});

    // JSDoc: an encrypted file of a private room is answered normally but never recorded as recent.
    expect(added.status, "addFileToRecent").toBe(200);
    expectNoServerError(toggled.status, "toggleFileFavorite");
    expect(favorites.status).toBe(200);
    expect(recent.status).toBe(200);
    expect(mentionsId(favorites.data.response, scene.rootFile.id)).toBe(false);
    expect(mentionsId(recent.data.response, scene.rootFile.id)).toBe(false);
  });
});

test.describe("General APIs - file keys stay with their owners", () => {
  test("GET /files/file/:fileId/access - A member reads only their own file key and the public halves of the others", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const { owner, scene } = await ownerScene(apiSdk);
    const [a, b] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, scene.roomId, a.id, FileShare.Read);
    await inviteToRoom(owner, scene.roomId, b.id, FileShare.Read);
    await issueMarkedKeys(owner, scene, a.id);
    await issueMarkedKeys(owner, scene, b.id);

    for (const file of [scene.rootFile, scene.deepFile]) {
      const own = await a.api.files.getEncryptionInfo({ fileId: file.id });
      expect(own.status).toBe(200);
      // Exactly their own entry (the control), nobody else's.
      expect(own.data.response?.fileKeys?.map((k) => k.userId)).toEqual([a.id]);
      expect(own.data.response?.fileKeys?.[0].privateKeyEnc).toBe(
        KEY_MARKER + a.id.slice(0, 8),
      );
      expect(JSON.stringify(own.data)).not.toContain(
        KEY_MARKER + b.id.slice(0, 8),
      );
      // The account keys listed are the caller's own: the other member's key does not come along.
      expect(own.data.response?.userKeys?.map((k) => k.userId)).toEqual([a.id]);
    }
    const access = await getFilePublicKeys(apiSdk, a.token, scene.rootFile.id);
    expect(access.status).toBe(200);
    expect(access.entries.map((e) => e.userId)).toContain(b.id);
    expect(access.text).not.toContain(KEY_MARKER + b.id.slice(0, 8));
    // Another account's encrypted private key is not handed out: only the caller's own half is.
    expect(
      access.entries
        .filter((e) => e.userId !== a.id)
        .map((e) => e.privateKeyEnc ?? ""),
    ).toEqual(access.entries.filter((e) => e.userId !== a.id).map(() => ""));
  });
});
