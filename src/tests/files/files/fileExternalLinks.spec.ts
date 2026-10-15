import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

// Contract (SDK): setFileExternalLink creates a link for an identifier that is not
// in use and rewrites an existing one, "so the whole set of parameters is applied
// every time and a field left out is reset"; access None revokes it and the answer
// is empty; a far expirationDate is refused; getFileLinks lists the links.
// In a VDR the link settings are not editable (internal is forced and updates are
// ignored), which the SDK does not mention; it is left out of the assertions.

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
] as const;

type LinkEntry = {
  access?: number;
  sharedLink?: {
    id?: string;
    title?: string;
    denyDownload?: boolean;
    shareLink?: string;
    primary?: boolean;
  };
};

async function roomFile(
  apiSdk: ApiSDK,
  roomType: RoomType,
  title = "Autotest Links Room",
) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  const roomId = roomData.response!.id!;
  const { data } = await ownerApi.files.createFile({
    folderId: roomId,
    createFileJsonElement: { title: "Autotest Linked.docx" },
  });
  return { ownerApi, roomId, fileId: data.response!.id! };
}

async function links(
  api: Api,
  id: number,
  paging?: { count?: number; startIndex?: number },
) {
  const { data, status } = await api.files.getFileLinks({ id, ...paging });
  return { status, entries: (data.response ?? []) as LinkEntry[] };
}

const set = (
  api: Api,
  id: number,
  request: {
    linkId?: string;
    access?: FileShare;
    title?: string;
    denyDownload?: boolean;
    expirationDate?: string;
    password?: string;
    primary?: boolean;
  },
) =>
  api.files.setFileExternalLink({
    id,
    fileLinkRequest: request as never,
  });

test.describe("PUT /files/file/:id/links - links of a room file", () => {
  for (const { label, roomType } of roomTypes) {
    test(`links - ${label} room: a link is created, listed and rewritten as a whole set`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId } = await roomFile(apiSdk, roomType);

      const created = await set(ownerApi, fileId, {
        access: FileShare.Read,
        title: "First",
        denyDownload: true,
      });
      expect(created.status).toBe(200);
      const link = created.data.response as LinkEntry;
      const linkId = link.sharedLink!.id!;
      expect(link.sharedLink!.title).toBe("First");
      expect(link.sharedLink!.denyDownload).toBe(true);
      expect(link.sharedLink!.shareLink).toBeTruthy();
      expect(link.sharedLink!.primary).toBe(false);

      const listed = (await links(ownerApi, fileId)).entries.filter(
        (e) => e.sharedLink?.id === linkId,
      );
      expect(listed).toHaveLength(1);
      expect(listed[0].sharedLink!.title).toBe("First");

      // The link is rewritten with only a title: the left-out denyDownload is reset.
      const rewritten = await set(ownerApi, fileId, {
        linkId,
        access: FileShare.Read,
        title: "Renamed",
      });
      expect(rewritten.status).toBe(200);
      const after = (await links(ownerApi, fileId)).entries.find(
        (e) => e.sharedLink?.id === linkId,
      );
      expect(after!.sharedLink!.title).toBe("Renamed");
      expect(after!.sharedLink!.denyDownload).toBe(false);
    });

    test(`links - ${label} room: access None revokes the link and it leaves the list`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId } = await roomFile(apiSdk, roomType);
      const created = await set(ownerApi, fileId, {
        access: FileShare.Read,
        title: "Temporary",
      });
      const linkId = (created.data.response as LinkEntry).sharedLink!.id!;

      const revoked = await set(ownerApi, fileId, {
        linkId,
        access: FileShare.None,
      });

      expect(revoked.status).toBe(200);
      expect(revoked.data.response).toBeUndefined();
      const { entries } = await links(ownerApi, fileId);
      expect(entries.map((e) => e.sharedLink?.id)).not.toContain(linkId);
    });
  }

  test("links - Several links keep their own identity and can be paged", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(apiSdk, RoomType.CustomRoom);
    const first = await set(ownerApi, fileId, {
      access: FileShare.Read,
      title: "One",
    });
    const second = await set(ownerApi, fileId, {
      access: FileShare.Editing,
      title: "Two",
    });
    const idOne = (first.data.response as LinkEntry).sharedLink!.id!;
    const idTwo = (second.data.response as LinkEntry).sharedLink!.id!;
    expect(idOne).not.toBe(idTwo);

    const all = await links(ownerApi, fileId);
    const pageOne = await links(ownerApi, fileId, { count: 1, startIndex: 0 });
    const pageTwo = await links(ownerApi, fileId, { count: 1, startIndex: 1 });

    expect(all.entries.map((e) => e.sharedLink?.id).sort()).toEqual(
      [idOne, idTwo].sort(),
    );
    expect(pageOne.entries).toHaveLength(1);
    expect(pageTwo.entries).toHaveLength(1);
    expect(pageOne.entries[0].sharedLink?.id).not.toBe(
      pageTwo.entries[0].sharedLink?.id,
    );
    // Each link carries its own rights.
    const byId = Object.fromEntries(
      all.entries.map((e) => [e.sharedLink?.id, e]),
    );
    expect(byId[idOne].access).toBe(FileShare.Read);
    expect(byId[idTwo].access).toBe(FileShare.Editing);
  });

  // Documented: an expirationDate "more than a few years ahead" is refused.
  test("links - A far expiration date is refused and no link appears", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(apiSdk, RoomType.CustomRoom);

    const { status } = await set(ownerApi, fileId, {
      access: FileShare.Read,
      expirationDate: "2099-01-01T00:00:00",
    });

    expect(status).toBe(400);
    expect((await links(ownerApi, fileId)).entries).toEqual([]);
  });

  test("links - A near expiration date is accepted and kept", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(apiSdk, RoomType.CustomRoom);
    const expires = new Date(Date.now() + 24 * 3600 * 1000);

    const { data, status } = await set(ownerApi, fileId, {
      access: FileShare.Read,
      title: "Expiring",
      expirationDate: expires.toISOString(),
    });

    expect(status).toBe(200);
    const linkId = (data.response as LinkEntry).sharedLink!.id!;
    const listed = (await links(ownerApi, fileId)).entries.find(
      (e) => e.sharedLink?.id === linkId,
    ) as { sharedLink?: { expirationDate?: string } };
    expect(
      Date.parse(String(listed.sharedLink?.expirationDate)),
    ).toBeGreaterThan(Date.now());
  });

  // Documented: "`primary=true` makes it the primary link of the file".
  test("links - primary=true makes the link the file's primary link", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(apiSdk, RoomType.CustomRoom);

    const { data, status } = await set(ownerApi, fileId, {
      access: FileShare.Read,
      title: "Main",
      primary: true,
    });

    expect(status).toBe(200);
    const linkId = (data.response as LinkEntry).sharedLink!.id!;
    const { data: primary } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });
    expect(primary.response?.sharedLink?.id).toBe(linkId);
  });
});

test.describe("File links - permissions and isolation in a Custom room", () => {
  type MemberType = "RoomAdmin" | "User";
  const callers: Array<{
    label: string;
    type: MemberType;
    access: FileShare | null;
    canManage: boolean;
  }> = [
    {
      label: "RoomAdmin RoomManager",
      type: "RoomAdmin",
      access: FileShare.RoomManager,
      canManage: true,
    },
    {
      label: "User ContentCreator",
      type: "User",
      access: FileShare.ContentCreator,
      canManage: false,
    },
    {
      label: "User Editing",
      type: "User",
      access: FileShare.Editing,
      canManage: false,
    },
    {
      label: "User Read",
      type: "User",
      access: FileShare.Read,
      canManage: false,
    },
    {
      label: "User without room access",
      type: "User",
      access: null,
      canManage: false,
    },
  ];

  for (const caller of callers) {
    // Documented: "The caller needs the right to share the file and is otherwise
    // refused" and the list is for "its creator, the room admin and a DocSpace
    // admin acting as room manager"; a member without that right sees no links.
    test(`links - ${caller.label} ${caller.canManage ? "can" : "cannot"} manage the file's links`, async ({
      apiSdk,
    }) => {
      const { ownerApi, roomId, fileId } = await roomFile(
        apiSdk,
        RoomType.CustomRoom,
      );
      const seeded = await set(ownerApi, fileId, {
        access: FileShare.Editing,
        title: "Seeded by the owner",
      });
      const seededId = (seeded.data.response as LinkEntry).sharedLink!.id!;
      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        caller.type,
      );
      if (caller.access !== null) {
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [
              { id: memberData.response!.id!, access: caller.access },
            ],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);
      }

      const attempt = await set(api, fileId, {
        linkId: seededId,
        access: FileShare.Read,
        title: "Rewritten by the member",
      });
      const listing = await links(api, fileId);

      // The seeded link is exactly as the owner made it unless a manager changed it.
      const stored = (await links(ownerApi, fileId)).entries.find(
        (e) => e.sharedLink?.id === seededId,
      );
      if (caller.canManage) {
        expect(attempt.status).toBe(200);
        expect(listing.entries.map((e) => e.sharedLink?.id)).toContain(
          seededId,
        );
        expect(stored!.sharedLink!.title).toBe("Rewritten by the member");
      } else {
        expect(stored!.sharedLink!.title).toBe("Seeded by the owner");
        expect(stored!.access).toBe(FileShare.Editing);
        expect(attempt.status).toBe(403);
        // A member without the right never sees the link or its address.
        expect(listing.entries).toEqual([]);
      }
    });
  }

  test("links - A room manager of room A cannot change a link of a file in room B", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomA = await roomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Links Room A",
    );
    const roomB = await roomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Links Room B",
    );
    const linkB = await set(ownerApi, roomB.fileId, {
      access: FileShare.Read,
      title: "Link of B",
    });
    const linkBId = (linkB.data.response as LinkEntry).sharedLink!.id!;
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomA.roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    // Positive control: the same member manages links of room A.
    const control = await set(api, roomA.fileId, {
      access: FileShare.Read,
      title: "Own",
    });
    expect(control.status).toBe(200);

    const direct = await set(api, roomB.fileId, {
      linkId: linkBId,
      access: FileShare.Editing,
      title: "Taken over",
    });
    const viaOtherFile = await set(api, roomA.fileId, {
      linkId: linkBId,
      access: FileShare.Editing,
      title: "Taken over",
    });

    expect(direct.status).toBe(403);
    expect(viaOtherFile.status).toBe(200);
    const stored = (await links(ownerApi, roomB.fileId)).entries.find(
      (e) => e.sharedLink?.id === linkBId,
    );
    expect(stored!.sharedLink!.title).toBe("Link of B");
    expect(stored!.access).toBe(FileShare.Read);
    expect((await links(api, roomB.fileId)).entries).toEqual([]);
  });
});
