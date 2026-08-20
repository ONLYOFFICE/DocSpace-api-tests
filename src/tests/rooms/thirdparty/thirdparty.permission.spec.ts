import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";
import {
  connectNextcloud,
  createNextcloudRoom,
} from "@/src/helpers/third-party";

// Permission surface of third-party storage: who can connect a provider,
// read the connected-accounts list, disconnect one, and turn a connection
// into a room. Owner-side setup always runs before any member is
// authenticated (authenticateMember shares apiSdk's request context, so
// calling it too early - before the owner has done anything else - can
// itself intermittently 401; doing a bit of owner-side work first avoids
// that and matches how the rest of the suite is paced).

test.describe("POST /files/thirdparty - access control", () => {
  test("Owner can connect a third-party account", async ({ apiSdk }) => {
    await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest Perm Owner",
          providerKey: "Nextcloud",
        },
      });

    expect(status).toBe(200);
  });

  test("DocSpaceAdmin can connect a third-party account", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Perm DocSpaceAdmin",
        providerKey: "Nextcloud",
      },
    });

    expect(status).toBe(200);
  });

  test("RoomAdmin can connect a third-party account", async ({ apiSdk }) => {
    await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Perm RoomAdmin",
        providerKey: "Nextcloud",
      },
    });

    expect(status).toBe(200);
  });

  test("User cannot connect a third-party account", async ({ apiSdk }) => {
    await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Perm User",
        providerKey: "Nextcloud",
      },
    });

    expect(status).toBe(403);
  });

  test("Guest cannot connect a third-party account", async ({ apiSdk }) => {
    await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Perm Guest",
        providerKey: "Nextcloud",
      },
    });

    expect(status).toBe(403);
  });

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest Perm Anonymous",
          providerKey: "Nextcloud",
        },
      });

    expect(status).toBe(401);
  });
});

test.describe("GET /files/thirdparty - read access is scoped, not simply denied", () => {
  test("A User reads an empty list rather than the owner's connected accounts", async ({
    apiSdk,
  }) => {
    await connectNextcloud(apiSdk, "owner", "Autotest Scoped Read Owner Conn");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.thirdPartyIntegration.getThirdPartyAccounts();

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyIntegration.getThirdPartyAccounts();

    expect(status).toBe(401);
  });
});

test.describe("GET /files/thirdparty/providers, /capabilities - read access requires auth", () => {
  test("Unauthenticated getAllProviders returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyIntegration.getAllProviders({});
    expect(status).toBe(401);
  });

  test("Unauthenticated getCapabilities returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyIntegration.getCapabilities();
    expect(status).toBe(401);
  });
});

test.describe("DELETE /files/thirdparty/{providerId} - only the connecting side can disconnect", () => {
  test("An unrelated User cannot delete another user's still-connected account", async ({
    apiSdk,
  }) => {
    const { providerId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Delete IDOR",
    );
    const { userData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { status } = await userApi.thirdPartyIntegration.deleteThirdParty({
      providerId,
    });

    expect(status).toBe(403);

    const { data } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getThirdPartyAccounts();
    expect(
      (data.response as any[]).some((a) => a.provider_id === providerId),
    ).toBe(true);
  });

  test("Unauthenticated delete returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyIntegration.deleteThirdParty({ providerId: 1 });

    expect(status).toBe(401);
  });
});

test.describe("PUT /files/rooms/thirdparty/{id} - access control", () => {
  test("DocSpaceAdmin can create a room from their own connected account", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: conn } = await adminApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Perm Admin TP Room",
        providerKey: "Nextcloud",
      },
    });

    const { status } = await adminApi.rooms.createRoomThirdParty({
      id: (conn as any).response.id,
      createThirdPartyRoom: {
        title: "Autotest Perm Admin TP Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(200);
  });

  test("BUG XXXXX: a plain User can create a room from ANOTHER user's still-unused connection", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG XXXXX: createRoomThirdParty has no ownership/role check - a plain User " +
        "(who gets 403 from both saveThirdParty and the regular POST /files/rooms) " +
        "can successfully (200) convert an Owner's still-unused third-party " +
        "connection into a room they don't even have access to afterwards " +
        "(the response comes back with every security flag false). " +
        "deleteThirdParty correctly checks ownership (403) for the same actor; " +
        "createRoomThirdParty does not. Guest hits the same gap - see the next test.",
    );

    const { folderId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest User TP Room IDOR",
    );
    const { userData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { status } = await userApi.rooms.createRoomThirdParty({
      id: folderId,
      createThirdPartyRoom: {
        title: "Autotest User TP Room IDOR",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(403);
  });

  test("BUG XXXXX: a Guest can also create a room from someone else's still-unused connection", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG XXXXX: same missing ownership/role check as createRoomThirdParty's " +
        "User case above - a Guest (who gets 403 from saveThirdParty and from " +
        "the regular POST /files/rooms) can still successfully (200) turn " +
        "someone else's unused third-party connection into a room.",
    );

    const { folderId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Guest TP Room Attempt",
    );
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.rooms.createRoomThirdParty({
      id: folderId,
      createThirdPartyRoom: {
        title: "Autotest Guest TP Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(403);
  });

  test("Unauthenticated createRoomThirdParty returns 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().rooms.createRoomThirdParty({
      id: "sbox-1",
      createThirdPartyRoom: {
        title: "Autotest Anon TP Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("Existing connections and rooms survive disabling third-party access", () => {
  test("Disabling enableThirdParty does not tear down an existing connection or room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { providerId, roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest Access Toggle Room",
    );

    await ownerApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: false },
    });

    const { data: accounts, status: accountsStatus } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    expect(accountsStatus).toBe(200);
    expect(
      (accounts.response as any[]).some((a) => a.provider_id === providerId),
    ).toBe(true);

    const { status: roomStatus } = await ownerApi.rooms.getRoomInfo({
      id: roomId as any,
    });
    expect(roomStatus).toBe(200);
  });
});
