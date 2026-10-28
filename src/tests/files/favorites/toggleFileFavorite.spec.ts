import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

async function favoriteIds(api: Api) {
  const { data } = await api.folders.getFavoritesFolder({});
  return (data.response?.files ?? []).map((f) => (f as { id: number }).id);
}

// The favorites listing is read through the search index, so a change is polled
// for instead of read once.
const expectFavorite = (api: Api, fileId: number, present: boolean) =>
  expect
    .poll(async () => (await favoriteIds(api)).includes(fileId), {
      timeout: 60_000,
    })
    .toBe(present);

async function roomFile(apiSdk: ApiSDK, roomType: RoomType, title: string) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  const roomId = roomData.response!.id!;
  // A docx on purpose: the favorites listing leaves HTML files out even though they
  // carry the favorite flag.
  const { data } = await ownerApi.files.createFile({
    folderId: roomId,
    createFileRequest: { title: "Autotest Favorite.docx" },
  });
  return { ownerApi, roomId, fileId: data.response!.id! };
}

test.describe("GET /files/favorites/:fileId - Set the file favorite status", () => {
  for (const { label, roomType } of roomTypes) {
    test(`GET /files/favorites/:fileId - ${label} room file is added to and removed from favorites and stays in the room`, async ({
      apiSdk,
    }) => {
      const { ownerApi, roomId, fileId } = await roomFile(
        apiSdk,
        roomType,
        `Autotest Favorite ${label}`,
      );

      const { data: added, status: addStatus } =
        await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });
      expect(addStatus).toBe(200);
      expect(added.response).toBe(true);
      await expectFavorite(ownerApi, fileId, true);
      const { data: marked } = await ownerApi.files.getFileInfo({ fileId });
      expect((marked.response as { isFavorite?: boolean }).isFavorite).toBe(
        true,
      );

      const { data: removed, status: removeStatus } =
        await ownerApi.files.toggleFileFavorite({ fileId, favorite: false });
      expect(removeStatus).toBe(200);
      expect(removed.response).toBe(false);
      await expectFavorite(ownerApi, fileId, false);

      const { data: info } = await ownerApi.files.getFileInfo({ fileId });
      expect(info.response?.folderId).toBe(roomId);
    });
  }

  // Documented: "repeating it with the same value changes nothing further".
  test("GET /files/favorites/:fileId - Repeating the same value changes nothing further", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Favorite Repeat",
    );

    for (let i = 0; i < 2; i++) {
      const { data, status } = await ownerApi.files.toggleFileFavorite({
        fileId,
        favorite: true,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    }
    await expectFavorite(ownerApi, fileId, true);
    expect(
      (await favoriteIds(ownerApi)).filter((id) => id === fileId),
    ).toHaveLength(1);

    for (let i = 0; i < 2; i++) {
      const { data, status } = await ownerApi.files.toggleFileFavorite({
        fileId,
        favorite: false,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    }
    await expectFavorite(ownerApi, fileId, false);
  });

  // Documented: "The mark is personal, no other member sees it". Read access is
  // enough, "so a room member with view-only rights and a guest may call it".
  for (const member of [
    { label: "User Read", type: "User" as const },
    { label: "Guest Read", type: "Guest" as const },
  ]) {
    test(`GET /files/favorites/:fileId - ${member.label} member favorites the file and the owner does not see it`, async ({
      apiSdk,
    }) => {
      const { ownerApi, roomId, fileId } = await roomFile(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Favorite Personal",
      );
      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        member.type,
      );
      const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Read },
          ],
          notify: false,
        },
      });
      expect(inviteStatus).toBe(200);

      const { data, status } = await api.files.toggleFileFavorite({
        fileId,
        favorite: true,
      });

      expect(status).toBe(200);
      expect(data.response).toBe(true);
      await expectFavorite(api, fileId, true);
      expect(await favoriteIds(ownerApi)).not.toContain(fileId);
    });
  }

  // Documented: "an identifier that resolves to nothing and a file the caller
  // cannot read are skipped without a word, ... and the requested value still
  // comes back".
  test("GET /files/favorites/:fileId - Unknown id echoes the value and marks nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Favorite Unknown",
    );

    const { data, status } = await ownerApi.files.toggleFileFavorite({
      fileId: 999999999,
      favorite: true,
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(await favoriteIds(ownerApi)).not.toContain(fileId);
    expect(await favoriteIds(ownerApi)).not.toContain(999999999);
  });

  test("GET /files/favorites/:fileId - File the caller cannot read echoes the value and is not marked", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Favorite No Access",
    );
    // Positive control: the owner can favorite the same file.
    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });
    await expectFavorite(ownerApi, fileId, true);
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await api.files.toggleFileFavorite({
      fileId,
      favorite: true,
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(await favoriteIds(api)).toEqual([]);
    expect(await favoriteIds(ownerApi)).toContain(fileId);
  });
});
