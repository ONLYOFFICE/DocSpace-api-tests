import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, StorageFilter } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";
import {
  connectNextcloud,
  createNextcloudRoom,
} from "@/src/helpers/third-party";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

// Third-party storage support in DocSpace: a "provider" is connected via
// POST /files/thirdparty (WebDav-family providers authenticate with
// login/password; OAuth providers like Box/GoogleDrive need a real OAuth
// token we don't have). A connected provider is a folder ("sbox-<id>") that
// PUT /files/rooms/thirdparty/{id} can turn into a room. Nextcloud is the
// only provider with real credentials available (config.NEXTCLOUD_*) and is
// reported back by the API under providerKey "WebDav" - it's a WebDAV
// server, "Nextcloud" is just a labelled connection preset for it.
//
// OAuth providers (Box, GoogleDrive, OneDrive, Dropbox) are covered only for
// contract/validation behavior below - no positive connect flow is possible
// without a real OAuth token.

test.describe("GET /files/thirdparty/providers - List third-party providers", () => {
  test("GET /files/thirdparty/providers - Owner gets the provider list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getAllProviders({});

    expect(status).toBe(200);
    const providers = data.response as any[];
    const names = providers.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Box",
        "Dropbox",
        "OneDrive",
        "kDrive",
        "WebDav",
        "Nextcloud",
        "ownCloud",
      ]),
    );

    for (const provider of providers) {
      expect(provider.name, JSON.stringify(provider)).toBeTruthy();
      expect(provider.key, JSON.stringify(provider)).toBeTruthy();
      expect(typeof provider.connected).toBe("boolean");
      expect(typeof provider.oauth).toBe("boolean");
    }
  });

  test("GET /files/thirdparty/providers - Nextcloud is reported under providerKey WebDav", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getAllProviders({});

    const nextcloud = (data.response as any[]).find(
      (p) => p.name === "Nextcloud",
    );
    expect(nextcloud).toBeDefined();
    expect(nextcloud.key).toBe("WebDav");
    expect(nextcloud.oauth).toBe(false);
  });

  test("GET /files/thirdparty/providers - OAuth providers expose a redirectUrl and clientId", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getAllProviders({});

    for (const name of ["Box", "Dropbox", "OneDrive"]) {
      const provider = (data.response as any[]).find((p) => p.name === name);
      expect(provider, name).toBeDefined();
      expect(provider.oauth).toBe(true);
      expect(provider.redirectUrl).toBeTruthy();
      expect(provider.clientId).toBeTruthy();
    }
  });

  test("GET /files/thirdparty/providers?excludewebdav=true - excludes every WebDAV-family provider", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getAllProviders({ excludewebdav: true });

    expect(status).toBe(200);
    const names = (data.response as any[]).map((p) => p.name);
    expect(names.sort()).toEqual(["Box", "Dropbox", "OneDrive"].sort());
  });

  test("GET /files/thirdparty/providers?excludewebdav=false - same as default", async ({
    apiSdk,
  }) => {
    const [withDefault, withFalse] = await Promise.all([
      apiSdk.forRole("owner").thirdPartyIntegration.getAllProviders({}),
      apiSdk
        .forRole("owner")
        .thirdPartyIntegration.getAllProviders({ excludewebdav: false }),
    ]);

    const namesDefault = (withDefault.data.response as any[])
      .map((p) => p.name)
      .sort();
    const namesFalse = (withFalse.data.response as any[])
      .map((p) => p.name)
      .sort();
    expect(namesFalse).toEqual(namesDefault);
  });
});

test.describe("GET /files/thirdparty/capabilities - Get available provider capabilities", () => {
  test("GET /files/thirdparty/capabilities - Owner gets capabilities without a 500", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getCapabilities();

    expect(status).toBe(200);
    const response = data.response as string[][];
    expect(Array.isArray(response)).toBe(true);
    const keys = response.map((entry) => entry[0]);
    expect(keys).toEqual(expect.arrayContaining(["WebDav", "kDrive", "Box"]));
  });
});

test.describe("GET /files/thirdparty - List connected third-party accounts", () => {
  test("GET /files/thirdparty - Empty when no accounts are connected", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getThirdPartyAccounts();

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /files/thirdparty - Connected Nextcloud account is listed with no leaked secrets", async ({
    apiSdk,
  }) => {
    await connectNextcloud(apiSdk, "owner", "Autotest List Nextcloud");

    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getThirdPartyAccounts();

    expect(status).toBe(200);
    const accounts = data.response as any[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0].customer_title).toBe("Autotest List Nextcloud");
    expect(accounts[0].provider_key).toBe("WebDav");
    expect(typeof accounts[0].provider_id).toBe("number");

    const raw = JSON.stringify(accounts[0]);
    expect(raw).not.toContain(config.NEXTCLOUD_PASSWORD);
    expect(raw).not.toContain(config.NEXTCLOUD_LOGIN);
    expect(accounts[0].auth_data).toBeUndefined();
  });
});

test.describe("POST /files/thirdparty - Connect Nextcloud (positive flow)", () => {
  test("POST /files/thirdparty - Connects successfully and returns a third-party folder", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest Connect Nextcloud",
          providerKey: "Nextcloud",
        },
      });

    expect(status).toBe(200);
    expect(data.response!.id).toMatch(/^sbox-\d+$/);
    expect((data.response as any).providerId).toBeGreaterThan(0);
    expect((data.response as any).providerKey).toBe("WebDav");
    expect(data.response!.title).toBe("Autotest Connect Nextcloud");
  });

  test("POST /files/thirdparty - Connecting the same Nextcloud account twice creates two separate accounts", async ({
    apiSdk,
  }) => {
    const first = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Duplicate Conn",
    );
    const second = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Duplicate Conn",
    );

    expect(second.providerId).not.toBe(first.providerId);
    expect(second.folderId).not.toBe(first.folderId);

    const { data } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getThirdPartyAccounts();
    const ids = (data.response as any[]).map((a) => a.provider_id);
    expect(ids).toEqual(
      expect.arrayContaining([first.providerId, second.providerId]),
    );
  });
});

test.describe("POST /files/thirdparty - Required field validation", () => {
  test("POST /files/thirdparty - Missing providerKey returns 400, no account created", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest No ProviderKey",
      } as any,
    });

    expect(status).toBe(400);
    const { data: after } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    expect(after.response).toEqual([]);
  });

  test("POST /files/thirdparty - Unknown providerKey returns 400, not 500", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Unknown Provider",
        providerKey: "NotAProvider",
      },
    });

    expect(status).toBe(400);
    const { data: after } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    expect(after.response).toEqual([]);
  });

  test("POST /files/thirdparty - Missing customerTitle returns 400", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          providerKey: "Nextcloud",
        } as any,
      });

    expect(status).toBe(400);
  });

  test("POST /files/thirdparty - Empty customerTitle returns 403 Incorrect title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "",
        providerKey: "Nextcloud",
      },
    });

    expect(status).toBe(403);
    const { data: after } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    expect(after.response).toEqual([]);
  });
});

test.describe("POST /files/thirdparty - Nextcloud credential validation", () => {
  test("POST /files/thirdparty - Missing url returns 400", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest No Url",
          providerKey: "Nextcloud",
        },
      });

    expect(status).toBe(400);
  });

  test("POST /files/thirdparty - Wrong password returns 403 Access denied, not 500", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } =
      await ownerApi.thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: "definitely-wrong-password",
          customerTitle: "Autotest Wrong Password",
          providerKey: "Nextcloud",
        },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  // In isolation this is fully deterministic: 403 "Access denied", verified
  // directly against the Nextcloud server too (PROPFIND with a wrong
  // password always 401s there). If you see a 200 here while running the
  // full suite in parallel, that's not this test being flaky - it's
  // BUG XXXXX: see [[bug_third_party_concurrent_auth_cross_contamination]].
  // Concurrent saveThirdParty calls against the same external host can swap
  // auth results between unrelated requests (a wrong-password call gets 200,
  // a correct-password call gets 403), because the connection is only ever
  // usable when actually correct - a "200 wrong password" folder 404s on
  // access - don't chase it as this test's bug, it belongs to the
  // concurrency-race finding, not to single-request validation.
  // Sequential (not concurrent) reproduction of the session-reuse bug: connect
  // with correct credentials, then immediately connect the SAME host again
  // with a wrong password. The WebDAV client is expected to isolate
  // connections per credentials, but it reuses the still-open authenticated
  // session from the first call, so the wrong-password call piggybacks on it
  // and gets 200 instead of 403. This is deterministic (no --workers>=6 or
  // multi-tenant race needed) and is what actually happens in CI - see
  // [[bug_third_party_concurrent_auth_cross_contamination]] for the related
  // concurrent-request variant found earlier.
  test("BUG XXXXX: POST /files/thirdparty - Wrong password right after a correct connection to the same host returns 200, not 403", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG XXXXX: the WebDAV client does not isolate connections to a host by " +
        "credentials - it reuses the previous request's authenticated session " +
        "instead of opening a fresh one for the new login/password. Connecting " +
        "a correct Nextcloud account, then immediately connecting the same host " +
        "with a wrong password, returns 200 (piggybacking on the still-open " +
        "correct session) instead of 403.",
    );

    const ownerApi = apiSdk.forRole("owner");

    await connectNextcloud(apiSdk, "owner", "Autotest Session Reuse Correct");

    const { data, status } =
      await ownerApi.thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: "definitely-wrong-password",
          customerTitle: "Autotest Session Reuse Wrong",
          providerKey: "Nextcloud",
        },
      });

    const { data: accounts } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    const wrongPasswordAccount = (accounts.response as any[]).find(
      (a) => a.customer_title === "Autotest Session Reuse Wrong",
    );
    expect(wrongPasswordAccount, JSON.stringify(data)).toBeUndefined();

    expect(status).toBe(403);
  });

  test("POST /files/thirdparty - No url/login/password/token at all returns 400", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          customerTitle: "Autotest No Credentials",
          providerKey: "Nextcloud",
        },
      });

    expect(status).toBe(400);
  });
});

test.describe("POST /files/thirdparty - OAuth provider contract (no real OAuth token available)", () => {
  test("POST /files/thirdparty - GoogleDrive with a fake token returns a controlled 403, not 500", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          customerTitle: "Autotest GoogleDrive Fake Token",
          providerKey: "GoogleDrive",
          token: "fake-oauth-token",
        },
      });

    expect(status).toBe(403);
  });

  test("BUG 83265: POST /files/thirdparty - Box with a fake token 500s instead of returning a controlled error", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 83265: saveThirdParty with providerKey=Box and an invalid token throws " +
        "System.NullReferenceException in FileStorageService.SaveThirdPartyAsync (500) " +
        "instead of a 400/401/403",
    );

    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          customerTitle: "Autotest Box Fake Token",
          providerKey: "Box",
          token: "fake-oauth-token",
        },
      });

    expect(status).toBeLessThan(500);
  });
});

test.describe("PUT /files/rooms/thirdparty/{id} - Create a room on third-party storage", () => {
  test("PUT /files/rooms/thirdparty/{id} - Creates a Custom room from a connected Nextcloud folder", async ({
    apiSdk,
  }) => {
    const { folderId, roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Custom Room",
    );

    const { data, status } = await apiSdk.forRole("owner").rooms.getRoomInfo({
      id: roomId as any,
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest TP Custom Room");
    expect(data.response!.roomType).toBe(RoomType.CustomRoom);
    expect(data.response!.id).toBe(folderId);
    expect((data.response as any).providerKey).toBe("WebDav");
  });

  test("PUT /files/rooms/thirdparty/{id} - Created room is listed in GET /files/rooms", async ({
    apiSdk,
  }) => {
    const { roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Room In List",
    );

    const { data } = await apiSdk.forRole("owner").rooms.getRoomsFolder({});
    const ids = (data.response?.folders ?? []).map((f: any) => f.id);
    expect(ids).toContain(roomId);
  });

  test("PUT /files/rooms/thirdparty/{id} - A folder already backing a room cannot back a second one", async ({
    apiSdk,
  }) => {
    const { folderId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Reused Folder",
    );

    const { status } = await apiSdk
      .forRole("owner")
      .rooms.createRoomThirdParty({
        id: folderId,
        createThirdPartyRoom: {
          title: "Autotest TP Second Room Attempt",
          roomType: RoomType.EditingRoom,
        },
      });

    expect(status).toBe(403);
  });

  for (const [label, roomType] of [
    ["Custom", RoomType.CustomRoom],
    ["Collaboration", RoomType.EditingRoom],
    ["Public", RoomType.PublicRoom],
    ["FormFilling", RoomType.FillingFormsRoom],
    ["VDR", RoomType.VirtualDataRoom],
  ] as const) {
    test(`PUT /files/rooms/thirdparty/{id} - Supports creating a ${label} room`, async ({
      apiSdk,
    }) => {
      const { roomId } = await createNextcloudRoom(
        apiSdk,
        "owner",
        `Autotest TP ${label}`,
        roomType,
      );

      const { data, status } = await apiSdk.forRole("owner").rooms.getRoomInfo({
        id: roomId as any,
      });
      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(roomType);
    });
  }

  test("PUT /files/rooms/thirdparty/{id} - Missing title returns 400", async ({
    apiSdk,
  }) => {
    const { folderId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest No Title",
    );

    const { status } = await apiSdk
      .forRole("owner")
      .rooms.createRoomThirdParty({
        id: folderId,
        createThirdPartyRoom: { roomType: RoomType.CustomRoom } as any,
      });

    expect(status).toBe(400);
  });

  test("PUT /files/rooms/thirdparty/{id} - Missing roomType returns 400", async ({
    apiSdk,
  }) => {
    const { folderId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest No RoomType",
    );

    const { status } = await apiSdk
      .forRole("owner")
      .rooms.createRoomThirdParty({
        id: folderId,
        createThirdPartyRoom: { title: "Autotest No RoomType Body" } as any,
      });

    expect(status).toBe(400);
  });

  test("PUT /files/rooms/thirdparty/{id} - An id that doesn't match any known selector returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rooms.createRoomThirdParty({
        id: "not-a-real-provider-folder",
        createThirdPartyRoom: {
          title: "Autotest Bad TP Id",
          roomType: RoomType.CustomRoom,
        },
      });

    expect(status).toBe(404);
  });

  test("BUG 83301: PUT /files/rooms/thirdparty/{id} - An internal folder id 500s instead of returning 400/404", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 83301: createRoomThirdParty throws System.NullReferenceException (500) " +
        "when given a plain internal folder id instead of a 'sbox-*' third-party selector",
    );

    const { data: myDocs } = await apiSdk
      .forRole("owner")
      .folders.getMyFolder();
    const internalFolderId = myDocs.response!.current!.id!;

    const { status } = await apiSdk
      .forRole("owner")
      .rooms.createRoomThirdParty({
        id: String(internalFolderId),
        createThirdPartyRoom: {
          title: "Autotest Internal Id As TP Id",
          roomType: RoomType.CustomRoom,
        },
      });

    expect(status).toBeLessThan(500);
  });

  test("BUG 83301: PUT /files/rooms/thirdparty/{id} - A well-formed but non-existent sbox-* id 500s instead of returning 404", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 83301: createRoomThirdParty 500s (System.InvalidOperationException: " +
        "'Sequence contains no elements') for an id that matches the 'sbox-<n>' " +
        "selector pattern but doesn't correspond to any connected provider, " +
        "instead of the clean 404 a completely unrecognized id gets",
    );

    const { status } = await apiSdk
      .forRole("owner")
      .rooms.createRoomThirdParty({
        id: "sbox-999999999",
        createThirdPartyRoom: {
          title: "Autotest Bad Sbox Id",
          roomType: RoomType.CustomRoom,
        },
      });

    expect(status).toBeLessThan(500);
  });
});

test.describe("Third-party rooms support the same room actions as internal Custom rooms", () => {
  test("PUT /files/rooms/:id - Owner updates the title of a third-party room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Title Before",
    );

    await test.step("update title", async () => {
      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId as any,
        updateRoomRequest: { title: "Autotest TP Title After" },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest TP Title After");
      expect(data.response!.id).toBe(roomId);
    });

    await test.step("GET /files/rooms/:id - confirms title changed", async () => {
      const { data, status } = await ownerApi.rooms.getRoomInfo({
        id: roomId as any,
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest TP Title After");
    });
  });

  test("PUT /files/rooms/:id/cover - Owner changes cover and color of a third-party room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Cover Room",
    );

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId as any,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("FF5733");

    const { data: infoData, status: infoStatus } =
      await ownerApi.rooms.getRoomInfo({ id: roomId as any });
    expect(infoStatus).toBe(200);
    expect(infoData.response!.logo?.cover?.id).toBe(coverId);
    expect(infoData.response!.logo?.color).toBe("FF5733");
  });

  test("PUT /files/rooms/:id/cover - Cover on a third-party room survives archive/unarchive", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Cover Archive Cycle Room",
    );

    await ownerApi.rooms.changeRoomCover({
      id: roomId as any,
      coverRequestDto: { color: "1A2B3C", cover: coverId },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId as any,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    await ownerApi.rooms.unarchiveRoom({
      id: roomId as any,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId as any });
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("1A2B3C");
  });

  test("PUT /files/rooms/:id/tags - Owner adds tags to a third-party room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Tags Room",
    );

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId as any,
      batchTagsRequestDto: { names: ["AutotestTPTag"] },
    });

    expect(status).toBe(200);
    expect(data.response!.tags).toContain("AutotestTPTag");

    const { data: infoData } = await ownerApi.rooms.getRoomInfo({
      id: roomId as any,
    });
    expect(infoData.response!.tags).toContain("AutotestTPTag");
  });

  test("PUT /files/rooms/:id/pin - Owner pins and unpins a third-party room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Pin Room",
    );

    await test.step("pin room", async () => {
      const { status } = await ownerApi.rooms.pinRoom({ id: roomId as any });
      expect(status).toBe(200);

      const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId as any });
      expect(data.response!.pinned).toBe(true);
    });

    await test.step("unpin room", async () => {
      const { status } = await ownerApi.rooms.unpinRoom({ id: roomId as any });
      expect(status).toBe(200);

      const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId as any });
      expect(data.response!.pinned).toBe(false);
    });
  });

  test("POST /files/group - Owner creates a room group containing both a third-party room and an internal room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: internalRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TP Group Internal Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const internalRoomId = internalRoom.response!.id!;

    const { roomId: tpRoomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Group ThirdParty Room",
    );

    const { data, status } = await ownerApi.groups.addRoomGroup({
      roomGroupRequestDto: {
        name: "Autotest TP Mixed Group",
        icon: "star",
        rooms: [internalRoomId, tpRoomId],
      },
    });

    expect(status).toBe(200);
    expect(data.response!.totalRooms).toBe(2);
    const titles = data.response!.rooms!.map((r) => r.title);
    expect(titles).toContain("Autotest TP Group Internal Room");
    expect(titles).toContain("Autotest TP Group ThirdParty Room");

    const { data: verify, status: getStatus } =
      await ownerApi.groups.getRoomGroupInfo({ id: data.response!.id! });
    expect(getStatus).toBe(200);
    expect(verify.response!.totalRooms).toBe(2);
  });
});

test.describe("saveThirdParty with providerId - updating an existing connection", () => {
  test("BUG 83303: POST /files/thirdparty - Re-saving with an existing providerId returns 200 but does not rename the account", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 83303: saveThirdParty called again with providerId set and a new " +
        "customerTitle returns 200 (implying success) but getThirdPartyAccounts " +
        "still shows the original title - the update is silently a no-op",
    );

    const ownerApi = apiSdk.forRole("owner");
    const { providerId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Rename Before",
    );

    await ownerApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest Rename After",
        providerKey: "Nextcloud",
        providerId,
      },
    });

    const { data } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    const account = (data.response as any[]).find(
      (a) => a.provider_id === providerId,
    );
    expect(account.customer_title).toBe("Autotest Rename After");
  });

  test("POST /files/thirdparty - Non-existent providerId returns a controlled 403, not 500", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest Invalid ProviderId Update",
          providerKey: "Nextcloud",
          providerId: 999999999,
        },
      });

    expect(status).toBe(403);
  });
});

test.describe("DELETE /files/thirdparty/{providerId} - Disconnect a third-party account", () => {
  test("DELETE /files/thirdparty/{providerId} - Removes the account from the connected list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { providerId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Delete Me",
    );

    const { status } = await ownerApi.thirdPartyIntegration.deleteThirdParty({
      providerId,
    });
    expect(status).toBe(200);

    const { data } =
      await ownerApi.thirdPartyIntegration.getThirdPartyAccounts();
    expect(data.response).toEqual([]);
  });

  test("DELETE /files/thirdparty/{providerId} - Non-existent providerId returns a controlled error, not 500", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.deleteThirdParty({ providerId: 999999999 });

    expect(status).toBeLessThan(500);
  });

  test("DELETE /files/thirdparty/{providerId} - Deleting an already-deleted account is idempotent-ish (no 500 on repeat)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { providerId } = await connectNextcloud(
      apiSdk,
      "owner",
      "Autotest Double Delete",
    );

    await ownerApi.thirdPartyIntegration.deleteThirdParty({ providerId });
    const { status } = await ownerApi.thirdPartyIntegration.deleteThirdParty({
      providerId,
    });

    expect(status).toBeLessThan(500);
  });

  test("BUG 83305: DELETE /files/thirdparty/{providerId} - Deleting the provider behind an active room breaks the room instead of being blocked", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 83305: deleteThirdParty succeeds (200) even though a room still uses the " +
        "connection. The room then silently disappears from getRoomsFolder and " +
        "getRoomInfo on it throws System.InvalidOperationException (500) instead of " +
        "either blocking the delete or returning a clean 404 for the orphaned room.",
    );

    const ownerApi = apiSdk.forRole("owner");
    const { providerId, roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest TP Room Then Delete Provider",
    );

    const del = await ownerApi.thirdPartyIntegration.deleteThirdParty({
      providerId,
    });
    expect(del.status).toBe(200);

    const { status } = await ownerApi.rooms.getRoomInfo({ id: roomId as any });
    expect(status).toBe(200);
  });
});

test.describe("GET /files/group - Dangling third-party room reference", () => {
  test("BUG 83264: GET /files/group?includeMembers=false - 500s when a room group holds a room whose provider was disconnected", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 83264: connect Nextcloud, create a room on it, add that room to a " +
        "room group, then DELETE the provider account (DELETE " +
        "/files/thirdparty/{providerId}) - the group keeps a dangling reference " +
        "to the room and GET /files/group throws " +
        "System.InvalidOperationException ('Sequence contains no elements') in " +
        "ProviderAccountDao.GetProviderInfoAsync, taking down the entire group " +
        "list instead of just the affected group/room",
    );

    const ownerApi = apiSdk.forRole("owner");
    const { providerId, roomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      "Autotest Dangling TP Group Room",
    );

    const { data: group, status: createStatus } =
      await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Autotest Dangling TP Group",
          icon: "star",
          rooms: [roomId],
        },
      });
    expect(createStatus, "group setup should succeed").toBe(200);
    expect(group.response!.rooms!.map((r) => r.title)).toContain(
      "Autotest Dangling TP Group Room",
    );

    const { status: deleteStatus } =
      await ownerApi.thirdPartyIntegration.deleteThirdParty({ providerId });
    expect(deleteStatus).toBe(200);

    const { status } = await ownerApi.groups.getRoomGroups({
      id: 0,
      includeMembers: false,
    });

    expect(status).toBe(200);
  });
});

test.describe("GET /files/rooms - storageFilter distinguishes internal from third-party rooms", () => {
  test("storageFilter separates an internal room from a third-party room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const internalTitle = "Autotest StorageFilter Internal";
    const tpTitle = "Autotest StorageFilter ThirdParty";

    const { data: internalRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: internalTitle,
        roomType: RoomType.CustomRoom,
      },
    });
    const { roomId: tpRoomId } = await createNextcloudRoom(
      apiSdk,
      "owner",
      tpTitle,
    );

    const titlesFor = async (storageFilter: StorageFilter) => {
      const { data } = await ownerApi.rooms.getRoomsFolder({ storageFilter });
      return (data.response?.folders ?? []).map((f: any) => f.title);
    };

    const none = await titlesFor(StorageFilter.None);
    expect(none).toEqual(expect.arrayContaining([internalTitle, tpTitle]));

    const internalOnly = await titlesFor(StorageFilter.Internal);
    expect(internalOnly).toContain(internalTitle);
    expect(internalOnly).not.toContain(tpTitle);

    const thirdPartyOnly = await titlesFor(StorageFilter.ThirdParty);
    expect(thirdPartyOnly).toContain(tpTitle);
    expect(thirdPartyOnly).not.toContain(internalTitle);

    expect(internalRoom.response!.title).toBe(internalTitle);
    expect(tpRoomId).toBeTruthy();
  });
});

test.describe("GET /files/thirdparty/common - Legacy Common-section connections", () => {
  test("GET /files/thirdparty/common - Returns 200 with an empty list, no 500", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.getCommonThirdPartyFolders();

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });
});
