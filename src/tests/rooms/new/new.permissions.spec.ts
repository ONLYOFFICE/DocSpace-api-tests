import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  RoomType,
  type NewItemsDtoRoomNewItemsDto,
} from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/files/rooms/:id/news - access control", () => {
  test("GET /files/rooms/:id/news - anonymous user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Anon",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.rooms.getNewRoomItems({ id: roomId });

    expect(status).toBe(401);
  });

  test("GET /files/rooms/:id/news - user without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rooms.getNewRoomItems({ id: roomId });

    expect(status).toBe(403);
  });

  test("GET /files/rooms/:id/news - guest without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Guest No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.rooms.getNewRoomItems({ id: roomId });

    expect(status).toBe(403);
  });

  test("GET /files/rooms/:id/news - user with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - user with Comment access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User Comment",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Comment }],
        notify: false,
      },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - user with Review access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User Review",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Review }],
        notify: false,
      },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - user with Editing access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User Editing",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - user with ContentCreator access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User ContentCreator",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await userApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - guest with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Guest Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - RoomAdmin invited as RoomManager gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - DocSpaceAdmin gets 200 for any room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/:id/news - RoomAdmin not member of someone else's room gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News RoomAdmin No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.rooms.getNewRoomItems({
      id: roomId,
    });

    expect(status).toBe(403);
  });
});

// GET /files/rooms/news is membership-scoped for every account type: an
// invited member sees the new files of the rooms they were invited to and
// nothing from the rooms they were not. Each case carries its own positive
// control (the visible file must be present) so that an empty answer from a
// failed invite cannot pass the "hidden file is absent" check.
test.describe("GET /api/2.0/files/rooms/news - access control", () => {
  function titlesIn(groups: NewItemsDtoRoomNewItemsDto[] | null | undefined) {
    return (groups ?? [])
      .flatMap((g) => g.items ?? [])
      .flatMap((r) => r.items ?? [])
      .map((e) => e.title);
  }

  function roomTitlesIn(
    groups: NewItemsDtoRoomNewItemsDto[] | null | undefined,
  ) {
    return (groups ?? [])
      .flatMap((g) => g.items ?? [])
      .map((r) => r.room?.title);
  }

  for (const userType of ["RoomAdmin", "DocSpaceAdmin", "Guest"] as const) {
    test(`GET /files/rooms/news - ${userType} invited to one room sees only that room's new files`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const visibleTitle = `Autotest RoomsNews ${userType} Visible Room`;
      const hiddenTitle = `Autotest RoomsNews ${userType} Hidden Room`;
      const visibleFile = `Autotest RoomsNews ${userType} Visible.docx`;
      const hiddenFile = `Autotest RoomsNews ${userType} Hidden.docx`;

      const { data: visible } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: visibleTitle,
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: hidden } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: hiddenTitle,
          roomType: RoomType.CustomRoom,
        },
      });
      const visibleId = visible.response!.id!;
      const hiddenId = hidden.response!.id!;

      const { api, data: member } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );
      const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
        id: visibleId,
        roomInvitationRequest: {
          invitations: [{ id: member.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });
      expect(inviteStatus).toBe(200);

      await ownerApi.files.createFile({
        folderId: visibleId,
        createFileJsonElement: { title: visibleFile },
      });
      await ownerApi.files.createFile({
        folderId: hiddenId,
        createFileJsonElement: { title: hiddenFile },
      });

      const { data, status } = await api.rooms.getRoomsNewItems();

      expect(status).toBe(200);
      expect(titlesIn(data.response)).toContain(visibleFile);
      expect(roomTitlesIn(data.response)).toContain(visibleTitle);
      expect(titlesIn(data.response)).not.toContain(hiddenFile);
      expect(roomTitlesIn(data.response)).not.toContain(hiddenTitle);
    });
  }

  test("GET /files/rooms/news - RoomAdmin outside every room gets 200 and an empty report", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RoomsNews Outsider Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.files.createFile({
      folderId: room.response!.id!,
      createFileJsonElement: { title: "Autotest RoomsNews Outsider.docx" },
    });

    const { api } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data, status } = await api.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    expect(titlesIn(data.response)).not.toContain(
      "Autotest RoomsNews Outsider.docx",
    );
    expect(roomTitlesIn(data.response)).not.toContain(
      "Autotest RoomsNews Outsider Room",
    );
  });

  test("GET /files/rooms/news - Several new files in one room are each reported exactly once", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RoomsNews Dup Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const { api, data: member } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: member.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);

    // files created after the invite are the ones that are new for the member
    const fileTitles = [1, 2, 3].map((n) => `Autotest RoomsNews Dup ${n}.docx`);
    for (const title of fileTitles) {
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title },
      });
    }

    const { data, status } = await api.rooms.getRoomsNewItems();

    expect(status).toBe(200);
    const titles = titlesIn(data.response);
    for (const title of fileTitles) {
      expect(titles.filter((t) => t === title)).toHaveLength(1);
    }
    expect(
      roomTitlesIn(data.response).filter(
        (t) => t === "Autotest RoomsNews Dup Room",
      ),
    ).toHaveLength(1);
  });
});
