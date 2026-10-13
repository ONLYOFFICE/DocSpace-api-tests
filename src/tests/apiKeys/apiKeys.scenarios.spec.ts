import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  DAY_MS,
  createKey,
  expectNear,
  findKey,
  toTime,
} from "@/src/helpers/api-keys";

test.describe("POST /api/2.0/keys - scenarios", () => {
  test("POST /api/2.0/keys - User API key with accounts permissions cannot access GET /api/2.0/people", async ({
    apiSdk,
  }) => {
    let apiKeyValue: string;

    await test.step("User creates an API key requesting accounts permissions", async () => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "Autotest User Accounts Key",
            permissions: ["accounts:write", "accounts:read"],
          },
        });

      expect(status).toBe(200);
      apiKeyValue = data.response!.key!;
    });

    await test.step("GET /api/2.0/people with that key returns 403", async () => {
      const { status } = await apiSdk
        .forApiKey(apiKeyValue!)
        .profiles.getAllProfiles();

      expect(status).toBe(403);
    });
  });

  test("BUG 81238: API key with files:read scope cannot create another API key", async ({
    apiSdk,
  }) => {
    let apiKeyValue: string;

    await test.step("Owner creates an API key with files:read only", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "read-only key",
            permissions: ["files:read"],
          },
        });

      expect(status).toBe(200);
      apiKeyValue = data.response!.key!;
    });

    await test.step("Request with that key to create a full-access key returns 403", async () => {
      const { status } = await apiSdk
        .forApiKey(apiKeyValue!)
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "full access key",
          },
        });

      expect(status).toBe(403);
    });
  });

  test("BUG 74914: GET /api/2.0/keys/@self - API key with scoped permissions can get own key info", async ({
    apiSdk,
  }) => {
    let apiKeyValue: string;
    let apiKeyId: string;

    await test.step("Owner creates an API key with scoped permissions", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "Autotest Scoped Key",
            permissions: ["files:read", "accounts:read"],
          },
        });

      expect(status).toBe(200);
      apiKeyId = data.response!.id!;
      apiKeyValue = data.response!.key!;
    });

    await test.step("GET /api/2.0/keys/@self with that key returns 200 and own key data", async () => {
      const { data, status } = await apiSdk
        .forApiKey(apiKeyValue!)
        .apiKeys.getApiKey();

      expect(status).toBe(200);
      expect(data.response?.id).toBe(apiKeyId);
      expect(data.response?.permissions).toContain("files:read");
      expect(data.response?.permissions).toContain("accounts:read");
    });
  });

  test("BUG 81239: API key with contacts:read scope cannot access rooms", async ({
    apiSdk,
  }) => {
    let roomId: number;
    let apiKeyValue: string;

    await test.step("Owner creates a room", async () => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.EditingRoom,
        },
      });

      expect(status).toBe(200);
      roomId = data.response!.id!;
    });

    await test.step("Owner creates a file in the room", async () => {
      const { status } = await apiSdk.forRole("owner").files.createFile({
        folderId: roomId!,
        createFileJsonElement: { title: "Autotest File.docx" },
      });

      expect(status).toBe(200);
    });

    await test.step("Owner creates an API key with contacts:read only", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "contacts-read key",
            permissions: ["accounts:read"],
          },
        });

      expect(status).toBe(200);
      apiKeyValue = data.response!.key!;
    });

    await test.step("Request room with that key returns 403", async () => {
      const { status } = await apiSdk
        .forApiKey(apiKeyValue!)
        .rooms.getRoomInfo({ id: roomId! });

      expect(status).toBe(403);
    });
  });
});

test.describe("API key as a credential", () => {
  test("GET /api/2.0/people/@self - API key authenticates as the user who created it", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    const { data: profile } = await user.profiles.getSelfProfile();

    const scoped = await createKey(user, {
      name: "Autotest scoped key",
      permissions: ["accounts.self:read"],
    });
    const unrestricted = await createKey(user, { name: "Autotest open key" });

    for (const key of [scoped, unrestricted]) {
      const { data, status } = await apiSdk
        .forApiKey(key.key!)
        .profiles.getSelfProfile();

      expect(status).toBe(200);
      expect(data.response?.id).toBe(profile.response!.id);
    }
  });

  test("DELETE /api/2.0/keys/{keyId} - Deleted API key stops authenticating and its secret is not revived", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const name = "Autotest deleted key";
    const key = await createKey(owner, {
      name,
      permissions: ["accounts.self:read"],
    });

    await test.step("The key works before deletion (positive control)", async () => {
      const { status } = await apiSdk
        .forApiKey(key.key!)
        .profiles.getSelfProfile();
      expect(status).toBe(200);
    });

    await test.step("Owner deletes the key", async () => {
      const { status, data } = await owner.apiKeys.deleteApiKey({
        keyId: key.id,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
      expect(await findKey(owner, key.id)).toBeUndefined();
    });

    await test.step("The deleted secret is rejected everywhere", async () => {
      const deleted = apiSdk.forApiKey(key.key!);
      expect((await deleted.profiles.getSelfProfile()).status).toBe(401);
      expect((await deleted.apiKeys.getApiKey()).status).toBe(401);
    });

    await test.step("A new key with the same name does not revive the old secret", async () => {
      const reissued = await createKey(owner, {
        name,
        permissions: ["accounts.self:read"],
      });
      expect(reissued.id).not.toBe(key.id);
      expect(reissued.key).not.toBe(key.key);

      expect(
        (await apiSdk.forApiKey(reissued.key!).profiles.getSelfProfile())
          .status,
      ).toBe(200);
      expect(
        (await apiSdk.forApiKey(key.key!).profiles.getSelfProfile()).status,
      ).toBe(401);
    });
  });

  test("PUT /api/2.0/keys/{keyId} - Deactivated API key stops authenticating and works again after reactivation", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, {
      name: "Autotest toggled key",
      permissions: ["accounts.self:read"],
    });
    const asKey = apiSdk.forApiKey(key.key!);

    await test.step("Active key works (positive control)", async () => {
      expect((await asKey.profiles.getSelfProfile()).status).toBe(200);
    });

    await test.step("Deactivated key is rejected but stays in the list", async () => {
      const { status, data } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { isActive: false },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);

      expect((await asKey.profiles.getSelfProfile()).status).toBe(401);
      expect((await asKey.apiKeys.getApiKey()).status).toBe(401);
      expect((await findKey(owner, key.id))?.isActive).toBe(false);
    });

    await test.step("Reactivated key works again with the same secret", async () => {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { isActive: true },
      });
      expect(status).toBe(200);

      expect((await asKey.profiles.getSelfProfile()).status).toBe(200);
      const { data, status: selfStatus } = await asKey.apiKeys.getApiKey();
      expect(selfStatus).toBe(200);
      expect(data.response?.id).toBe(key.id);
      expect(data.response?.isActive).toBe(true);
    });
  });
});

test.describe("PUT /api/2.0/keys/{keyId} - permissions are applied to requests", () => {
  test("PUT /api/2.0/keys/{keyId} - Revoking a scope closes access that was open", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data: room } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const key = await createKey(owner, {
      name: "Autotest revoked scope",
      permissions: ["rooms:read", "accounts.self:read"],
    });
    const asKey = apiSdk.forApiKey(key.key!);

    expect((await asKey.rooms.getRoomInfo({ id: roomId })).status).toBe(200);

    const { status } = await owner.apiKeys.updateApiKey({
      keyId: key.id,
      updateApiKeyRequest: { permissions: ["accounts.self:read"] },
    });
    expect(status).toBe(200);

    expect((await asKey.rooms.getRoomInfo({ id: roomId })).status).toBe(403);
    // The key itself is alive: only the revoked scope is gone
    expect((await asKey.profiles.getSelfProfile()).status).toBe(200);
    const { data: self } = await asKey.apiKeys.getApiKey();
    expect(self.response?.permissions).toEqual(["accounts.self:read"]);
  });

  test("PUT /api/2.0/keys/{keyId} - Granting and withdrawing a write scope changes what the key can do", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, {
      name: "Autotest write scope",
      permissions: ["rooms:read"],
    });
    const asKey = apiSdk.forApiKey(key.key!);
    const createRoom = (title: string) =>
      asKey.rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });

    await test.step("Read-only key cannot create a room", async () => {
      expect((await createRoom("Denied A")).status).toBe(403);
    });

    await test.step("After rooms:write is granted the room is created", async () => {
      await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { permissions: ["rooms:read", "rooms:write"] },
      });
      const { data, status } = await createRoom("Created by key");
      expect(status).toBe(200);

      const { data: info } = await owner.rooms.getRoomInfo({
        id: data.response!.id!,
      });
      expect(info.response?.title).toBe("Created by key");
    });

    await test.step("After rooms:write is withdrawn the old grant does not linger", async () => {
      await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { permissions: ["rooms:read"] },
      });
      expect((await createRoom("Denied B")).status).toBe(403);
    });
  });

  test("PUT /api/2.0/keys/{keyId} - Two keys of one user keep independent permissions", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data: room } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const roomsKey = await createKey(owner, {
      name: "Autotest rooms key",
      permissions: ["rooms:read"],
    });
    const selfKey = await createKey(owner, {
      name: "Autotest self key",
      permissions: ["accounts.self:read"],
    });
    const asRooms = apiSdk.forApiKey(roomsKey.key!);
    const asSelf = apiSdk.forApiKey(selfKey.key!);

    await test.step("Each key has only its own scope", async () => {
      expect((await asRooms.rooms.getRoomInfo({ id: roomId })).status).toBe(
        200,
      );
      expect((await asRooms.profiles.getSelfProfile()).status).toBe(403);
      expect((await asSelf.profiles.getSelfProfile()).status).toBe(200);
      expect((await asSelf.rooms.getRoomInfo({ id: roomId })).status).toBe(403);
    });

    await test.step("Widening one key does not touch the other", async () => {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: roomsKey.id,
        updateApiKeyRequest: {
          permissions: ["rooms:read", "accounts.self:read"],
        },
      });
      expect(status).toBe(200);

      expect((await asRooms.profiles.getSelfProfile()).status).toBe(200);
      expect((await asSelf.rooms.getRoomInfo({ id: roomId })).status).toBe(403);
      expect((await findKey(owner, selfKey.id))?.permissions).toEqual([
        "accounts.self:read",
      ]);
    });

    await test.step("Deleting one key does not touch the other", async () => {
      const { status } = await owner.apiKeys.deleteApiKey({
        keyId: roomsKey.id,
      });
      expect(status).toBe(200);
      expect((await asRooms.apiKeys.getApiKey()).status).toBe(401);
      expect((await asSelf.profiles.getSelfProfile()).status).toBe(200);
    });
  });
});

test.describe("API key never exceeds the rights of its owner", () => {
  test("GET /api/2.0/people - User's API key cannot do what the User cannot, while an Owner's key with the same scopes can", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    const owner = apiSdk.forRole("owner");

    const wide = await createKey(user, {
      name: "Autotest wide",
      permissions: ["*"],
    });
    const accounts = await createKey(user, {
      name: "Autotest accounts",
      permissions: ["accounts:read", "accounts:write"],
    });
    const ownerKey = await createKey(owner, {
      name: "Autotest owner accounts",
      permissions: ["accounts:read", "accounts:write"],
    });

    const newMember = () =>
      ({ ...apiSdk.faker.generateUser(), type: "User" }) as never;

    await test.step("Positive control: the Owner's key with accounts scopes works", async () => {
      const asOwnerKey = apiSdk.forApiKey(ownerKey.key!);
      expect((await asOwnerKey.profiles.getAllProfiles()).status).toBe(200);
      expect(
        (await asOwnerKey.profiles.addMember({ memberRequestDto: newMember() }))
          .status,
      ).toBe(200);
    });

    await test.step("The User has no such access with a regular login either", async () => {
      expect((await user.profiles.getAllProfiles()).status).toBe(403);
      expect(
        (await user.profiles.addMember({ memberRequestDto: newMember() }))
          .status,
      ).toBe(403);
    });

    await test.step("The same rights are denied through the User's keys", async () => {
      for (const key of [wide, accounts]) {
        const asKey = apiSdk.forApiKey(key.key!);
        expect((await asKey.profiles.getAllProfiles()).status).toBe(403);
        expect(
          (await asKey.profiles.addMember({ memberRequestDto: newMember() }))
            .status,
        ).toBe(403);
      }
    });
  });
});

// Which key-management calls a key may make depends on its scopes. A key
// narrowed to one area cannot manage keys (BUG 81238 is the create case of the
// same rule); a read-only wildcard can look but not change; `*` can do all.
type KeyManagementExpectation = {
  self: number;
  list: number;
  permissions: number;
  create: number;
  update: number;
  delete: number;
};

const NARROW_KEY: KeyManagementExpectation = {
  self: 200,
  list: 403,
  permissions: 403,
  create: 403,
  update: 403,
  delete: 403,
};

const KEY_MANAGEMENT_MATRIX: {
  label: string;
  permissions: string[];
  expected: KeyManagementExpectation;
}[] = [
  { label: "files:read", permissions: ["files:read"], expected: NARROW_KEY },
  {
    label: "accounts.self read+write",
    permissions: ["accounts.self:read", "accounts.self:write"],
    expected: NARROW_KEY,
  },
  {
    label: "*:read",
    permissions: ["*:read"],
    expected: {
      self: 200,
      list: 200,
      permissions: 200,
      create: 403,
      update: 403,
      delete: 403,
    },
  },
  {
    label: "* (unrestricted)",
    permissions: ["*"],
    expected: {
      self: 200,
      list: 200,
      permissions: 200,
      create: 200,
      update: 200,
      delete: 200,
    },
  },
];

test.describe("Key-management calls made with an API key", () => {
  for (const { label, permissions, expected } of KEY_MANAGEMENT_MATRIX) {
    test(`/api/2.0/keys - Key with ${label} scope manages keys as expected`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const key = await createKey(owner, {
        name: "Autotest matrix",
        permissions,
      });
      const asKey = apiSdk.forApiKey(key.key!);

      expect((await asKey.apiKeys.getApiKey()).status).toBe(expected.self);
      expect((await asKey.apiKeys.getApiKeys()).status).toBe(expected.list);
      expect((await asKey.apiKeys.getAllPermissions()).status).toBe(
        expected.permissions,
      );
      expect(
        (
          await asKey.apiKeys.createApiKey({
            createApiKeyRequestDto: { name: "Autotest child" },
          })
        ).status,
      ).toBe(expected.create);
      expect(
        (
          await asKey.apiKeys.updateApiKey({
            keyId: key.id,
            updateApiKeyRequest: { name: "Autotest renamed" },
          })
        ).status,
      ).toBe(expected.update);

      // Side effect: a denied update must not have renamed the key
      expect((await findKey(owner, key.id))?.name).toBe(
        expected.update === 200 ? "Autotest renamed" : "Autotest matrix",
      );

      expect((await asKey.apiKeys.deleteApiKey({ keyId: key.id })).status).toBe(
        expected.delete,
      );
      expect(Boolean(await findKey(owner, key.id))).toBe(
        expected.delete !== 200,
      );
    });
  }
});

test.describe("Key lifecycle", () => {
  test("POST /api/2.0/keys - Full lifecycle of an API key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    let key: Awaited<ReturnType<typeof createKey>>;

    await test.step("Requested scopes come from GET /keys/permissions", async () => {
      const { data } = await owner.apiKeys.getAllPermissions();
      expect(data.response).toContain("rooms:read");
      expect(data.response).toContain("accounts.self:read");
    });

    await test.step("Create, list and authenticate", async () => {
      key = await createKey(owner, {
        name: "Autotest lifecycle",
        permissions: ["rooms:read", "accounts.self:read"],
      });
      const listed = await findKey(owner, key.id);
      expect(listed?.name).toBe("Autotest lifecycle");
      expect(listed?.permissions).toEqual(["rooms:read", "accounts.self:read"]);

      const { data, status } = await apiSdk
        .forApiKey(key.key!)
        .apiKeys.getApiKey();
      expect(status).toBe(200);
      expect(data.response?.id).toBe(key.id);
    });

    await test.step("Rename and narrow the scopes", async () => {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: {
          name: "Autotest renamed",
          permissions: ["accounts.self:read"],
        },
      });
      expect(status).toBe(200);

      const listed = await findKey(owner, key.id);
      expect(listed?.name).toBe("Autotest renamed");
      expect(listed?.permissions).toEqual(["accounts.self:read"]);
      const { data } = await apiSdk.forApiKey(key.key!).apiKeys.getApiKey();
      expect(data.response?.name).toBe("Autotest renamed");
      expect(data.response?.permissions).toEqual(["accounts.self:read"]);
    });

    await test.step("The narrowed scopes are what is enforced", async () => {
      const asKey = apiSdk.forApiKey(key.key!);
      expect((await asKey.profiles.getSelfProfile()).status).toBe(200);
      const { data: room } = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      expect(
        (await asKey.rooms.getRoomInfo({ id: room.response!.id! })).status,
      ).toBe(403);
    });

    await test.step("Delete the key", async () => {
      expect((await owner.apiKeys.deleteApiKey({ keyId: key.id })).status).toBe(
        200,
      );
      expect(await findKey(owner, key.id)).toBeUndefined();
      expect(
        (await apiSdk.forApiKey(key.key!).apiKeys.getApiKey()).status,
      ).toBe(401);
    });
  });

  test("POST /api/2.0/keys - Key created with expiresInDays: 1 works now and reports a correct expiry", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const before = Date.now();
    const key = await createKey(owner, {
      name: "Autotest short-lived",
      permissions: ["accounts.self:read"],
      expiresInDays: 1,
    });

    expectNear(toTime(key.expiresAt), before + DAY_MS);
    expect(key.isActive).toBe(true);

    const asKey = apiSdk.forApiKey(key.key!);
    expect((await asKey.profiles.getSelfProfile()).status).toBe(200);

    const { data } = await asKey.apiKeys.getApiKey();
    // Reads return the expiry rounded to whole seconds, create does not
    const created = toTime(key.expiresAt);
    expect(Math.abs(toTime(data.response?.expiresAt) - created)).toBeLessThan(
      1000,
    );
    expect(
      Math.abs(toTime((await findKey(owner, key.id))?.expiresAt) - created),
    ).toBeLessThan(1000);
  });

  test("PUT /api/2.0/keys/{keyId} - Users cannot change each other's keys, and the denied key stays intact", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await apiSdk.addAuthenticatedMember("owner", "User");
    const roomAdmin = apiSdk.forRole("roomAdmin");
    const user = apiSdk.forRole("user");

    const raKey = await createKey(roomAdmin, {
      name: "Autotest RA key",
      permissions: ["accounts.self:read"],
    });
    const userKey = await createKey(user, {
      name: "Autotest user key",
      permissions: ["accounts.self:read"],
    });

    await test.step("User cannot update or delete the RoomAdmin's key", async () => {
      const update = await user.apiKeys.updateApiKey({
        keyId: raKey.id,
        updateApiKeyRequest: { name: "hijacked", isActive: false },
      });
      const del = await user.apiKeys.deleteApiKey({ keyId: raKey.id });

      // Side effects first: the key must be untouched and usable
      const kept = await findKey(roomAdmin, raKey.id);
      expect(kept?.name).toBe("Autotest RA key");
      expect(kept?.isActive).toBe(true);
      expect(
        (await apiSdk.forApiKey(raKey.key!).profiles.getSelfProfile()).status,
      ).toBe(200);

      expect(update.status).toBe(403);
      expect(del.status).toBe(403);
    });

    await test.step("RoomAdmin cannot update or delete the User's key", async () => {
      const update = await roomAdmin.apiKeys.updateApiKey({
        keyId: userKey.id,
        updateApiKeyRequest: { name: "hijacked" },
      });
      const del = await roomAdmin.apiKeys.deleteApiKey({ keyId: userKey.id });

      expect((await findKey(user, userKey.id))?.name).toBe("Autotest user key");
      expect(update.status).toBe(403);
      expect(del.status).toBe(403);
    });

    await test.step("The portal Owner may manage the User's key (positive control)", async () => {
      const update = await owner.apiKeys.updateApiKey({
        keyId: userKey.id,
        updateApiKeyRequest: { name: "Autotest by owner" },
      });
      expect(update.status).toBe(200);
      expect((await findKey(user, userKey.id))?.name).toBe("Autotest by owner");
    });
  });
});
