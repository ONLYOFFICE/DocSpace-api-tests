import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { faker } from "@faker-js/faker";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  DAY_MS,
  createKey,
  expectNear,
  findKey,
  listKeys,
  toTime,
} from "@/src/helpers/api-keys";

test.describe("POST /api/2.0/keys - permissions", () => {
  test("BUG 81236: POST /api/2.0/keys - Guest cannot create an API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "test key",
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe(
      "This operation unavailable for user with guest role",
    );
  });

  test("POST /api/2.0/keys - Anonymous cannot create an API key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.createApiKey({
      createApiKeyRequestDto: {
        name: "test key",
      },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with empty name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "",
        },
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.Name?.[0]).toBe(
      "The Name field is required.",
    );
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with whitespace name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "   ",
        },
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.Name?.[0]).toBe(
      "The Name field is required.",
    );
  });

  test("POST /api/2.0/keys - Owner cannot create an API key without name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {} as any,
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.["$"]?.[0]).toContain(
      "missing required properties including: 'name'",
    );
  });

  test("BUG 81237: POST /api/2.0/keys - Owner cannot create an API key with empty permissions array", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "test key",
          permissions: [],
        },
      });

    expect(status).toBe(400);
    expect((data as any)?.error?.message).toBe("Permissions are not valid.");
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with name longer than 30 characters", async ({
    apiSdk,
  }) => {
    const longName = apiSdk.faker.generateString(31);

    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: longName,
        },
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.Name?.[0]).toBe(
      "Incorrect name. Length must be less than 30",
    );
  });
});

test.describe("GET /api/2.0/keys/@self - permissions", () => {
  test("GET /api/2.0/keys/@self - Anonymous cannot get API key info", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getApiKey();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/keys/permissions - permissions", () => {
  test("GET /api/2.0/keys/permissions - Anonymous cannot get all permissions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getAllPermissions();

    expect(status).toBe(401);
  });

  test("BUG 81611: GET /api/2.0/keys/permissions - Guest cannot get all permissions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.getAllPermissions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/keys - permissions", () => {
  test("GET /api/2.0/keys - Anonymous cannot get API keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getApiKeys();

    expect(status).toBe(401);
  });

  test("BUG 81615: GET /api/2.0/keys - Guest cannot get API keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    await apiSdk.forRole("owner").apiKeys.createApiKey({
      createApiKeyRequestDto: { name: faker.lorem.words(3) },
    });

    const { data, status } = await apiSdk.forRole("guest").apiKeys.getApiKeys();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/keys/{keyId} - permissions", () => {
  let keyId: string;

  test.beforeEach(async ({ apiSdk }) => {
    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    keyId = created.response!.id!;
  });

  test("PUT /api/2.0/keys/{keyId} - Anonymous cannot update an API key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.updateApiKey({
      keyId,
      updateApiKeyRequest: { name: faker.lorem.words(3) },
    });

    expect(status).toBe(401);
  });

  test("BUG 81616: PUT /api/2.0/keys/{keyId} - RoomAdmin cannot update Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { name: faker.lorem.words(3) },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81616: PUT /api/2.0/keys/{keyId} - User cannot update Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk.forRole("user").apiKeys.updateApiKey({
      keyId,
      updateApiKeyRequest: { name: faker.lorem.words(3) },
    });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81616: PUT /api/2.0/keys/{keyId} - Guest cannot update Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { name: faker.lorem.words(3) },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/keys/{keyId} - permissions", () => {
  let keyId: string;

  test.beforeEach(async ({ apiSdk }) => {
    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    keyId = created.response!.id!;
  });

  test("DELETE /api/2.0/keys/{keyId} - Anonymous cannot delete an API key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(401);
  });

  test("BUG 81609: DELETE /api/2.0/keys/{keyId} - RoomAdmin cannot delete Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81609: DELETE /api/2.0/keys/{keyId} - User cannot delete Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81609: DELETE /api/2.0/keys/{keyId} - Guest cannot delete Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

// HTML in API key name (BUG 82910). Per the developer's resolution the name is
// NOT sanitized or rejected by the API — it is stored and returned verbatim;
// the fix HTML-encodes it only when rendering the "Your API key is expired"
// email. The email half is not observable here (the suite has no mailbox) and
// stays a manual check. What the API contract guarantees is checked below:
// the raw name round-trips unchanged through POST and GET. All payloads fit
// within the 30-char name limit.
test.describe("POST /api/2.0/keys - HTML in name is stored verbatim (escaped only in email)", () => {
  test("POST /api/2.0/keys - Phishing link in name is stored verbatim", async ({
    apiSdk,
  }) => {
    const payload = "<a href=//evil.com>LINK</a>"; // 26 chars
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: payload, expiresInDays: 1 },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(payload);

    const { data: keys, status: keysStatus } =
      await ownerApi.apiKeys.getApiKeys();
    expect(keysStatus).toBe(200);
    expect(keys.response!.find((k) => k.id === data.response!.id)?.name).toBe(
      payload,
    );
  });

  test("POST /api/2.0/keys - CSS injection in name is stored verbatim", async ({
    apiSdk,
  }) => {
    const payload = "<b style=color:red>TEST</b>"; // 27 chars
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: payload, expiresInDays: 1 },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(payload);

    const { data: keys, status: keysStatus } =
      await ownerApi.apiKeys.getApiKeys();
    expect(keysStatus).toBe(200);
    expect(keys.response!.find((k) => k.id === data.response!.id)?.name).toBe(
      payload,
    );
  });

  test("POST /api/2.0/keys - Tracking pixel in name is stored verbatim", async ({
    apiSdk,
  }) => {
    const payload = "<img src=//1.2.3.4>"; // 19 chars
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: payload, expiresInDays: 1 },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(payload);

    const { data: keys, status: keysStatus } =
      await ownerApi.apiKeys.getApiKeys();
    expect(keysStatus).toBe(200);
    expect(keys.response!.find((k) => k.id === data.response!.id)?.name).toBe(
      payload,
    );
  });
});

// POST /keys is throttled to 5 calls per user (rejected calls count too), so
// every validation test below makes at most 4 rejected calls and ends with one
// valid call as a positive control. A rejected call must leave no key behind.
test.describe("POST /api/2.0/keys - input validation", () => {
  test("POST /api/2.0/keys - Owner cannot create an API key with a non-string name", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const bodies = [
      { name: null },
      { name: 123 },
      { name: true },
      { name: ["a"] },
    ];

    const results = [];
    for (const body of bodies) {
      results.push(
        await owner.apiKeys.createApiKey({
          createApiKeyRequestDto: body as never,
        }),
      );
    }
    const control = await createKey(owner, { name: "Autotest control" });

    expect(await listKeys(owner)).toHaveLength(1);
    results.forEach(({ data, status }, i) => {
      expect(status, JSON.stringify(bodies[i])).toBe(400);
      const fields = Object.keys((data.response as any)?.errors ?? {});
      expect(fields.join(","), JSON.stringify(bodies[i])).toMatch(/name/i);
    });
    expect(control.name).toBe("Autotest control");
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with unknown or malformed scopes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const bodies = [["foo:read"], ["files:read", "foo"], ["FILES:READ"], [""]];

    const results = [];
    for (const permissions of bodies) {
      results.push(
        await owner.apiKeys.createApiKey({
          createApiKeyRequestDto: { name: "Autotest invalid", permissions },
        }),
      );
    }
    const control = await createKey(owner, {
      name: "Autotest control",
      permissions: ["files:read"],
    });

    // No key is created for a rejected call, not even a partial one
    const keys = await listKeys(owner);
    expect(keys.map((k) => k.id)).toEqual([control.id]);
    results.forEach(({ data, status }, i) => {
      expect(status, JSON.stringify(bodies[i])).toBe(400);
      expect((data as any)?.error?.message).toBe("Permissions are not valid.");
    });
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with permissions of the wrong type", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");

    const { data, status } = await owner.apiKeys.createApiKey({
      createApiKeyRequestDto: {
        name: "Autotest wrong type",
        permissions: "files:read" as never,
      },
    });
    const control = await createKey(owner, { name: "Autotest control" });

    expect((await listKeys(owner)).map((k) => k.id)).toEqual([control.id]);
    expect(status).toBe(400);
    expect(Object.keys((data.response as any)?.errors ?? {}).join(",")).toMatch(
      /permissions/i,
    );
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with an out-of-range or non-integer lifetime", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const lifetimes = [-1, 0, 366, 1.5];

    const results = [];
    for (const expiresInDays of lifetimes) {
      results.push(
        await owner.apiKeys.createApiKey({
          createApiKeyRequestDto: { name: "Autotest lifetime", expiresInDays },
        }),
      );
    }
    const control = await createKey(owner, { name: "Autotest control" });

    expect((await listKeys(owner)).map((k) => k.id)).toEqual([control.id]);
    results.forEach(({ status }, i) => {
      expect(status, `expiresInDays=${lifetimes[i]}`).toBe(400);
    });
  });

  test("POST /api/2.0/keys - Owner creates API keys with the shortest and the longest lifetime", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");

    for (const days of [1, 365]) {
      const before = Date.now();
      const key = await createKey(owner, {
        name: `Autotest ${days} days`,
        expiresInDays: days,
      });

      expectNear(toTime(key.expiresAt), before + days * DAY_MS);
      expectNear(
        toTime((await findKey(owner, key.id))?.expiresAt),
        before + days * DAY_MS,
      );
    }
  });

  test("POST /api/2.0/keys - Owner creates API keys with the shortest and the longest name and with non-Latin letters", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const names = ["a", apiSdk.faker.generateString(30), "Ключ тест 漢字"];

    const created = [];
    for (const name of names) {
      created.push(await createKey(owner, { name }));
    }

    const keys = await listKeys(owner);
    created.forEach((key, i) => {
      expect(key.name).toBe(names[i]);
      expect(keys.find((k) => k.id === key.id)?.name).toBe(names[i]);
    });
  });

  test("POST /api/2.0/keys - Owner creates unrestricted keys by omitting the scopes or passing *", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const star = await createKey(owner, {
      name: "Autotest star",
      permissions: ["*"],
    });
    const nullScopes = await createKey(owner, {
      name: "Autotest null",
      permissions: null,
    });

    for (const key of [star, nullScopes]) {
      // "An empty list means the key has no scope restrictions"
      expect(key.permissions).toEqual([]);
      expect((await findKey(owner, key.id))?.permissions).toEqual([]);

      const { status } = await apiSdk.forApiKey(key.key!).rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      expect(status).toBe(200);
    }
  });
});

test.describe("PUT /api/2.0/keys/{keyId} - input validation", () => {
  test("PUT /api/2.0/keys/{keyId} - Invalid updates are rejected and leave the key unchanged", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, {
      name: "Autotest original",
      permissions: ["accounts.self:read"],
    });

    const invalid = [
      { name: apiSdk.faker.generateString(31) },
      { name: 123 },
      { permissions: [] },
      { permissions: ["foo"] },
      { permissions: ["accounts.self:read", "foo"] },
      { permissions: "accounts.self:read" },
      { isActive: "yes" },
    ];

    for (const body of invalid) {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: body as never,
      });

      // Side effects first: nothing may have been applied
      const kept = await findKey(owner, key.id);
      expect(kept?.name, JSON.stringify(body)).toBe("Autotest original");
      expect(kept?.permissions, JSON.stringify(body)).toEqual([
        "accounts.self:read",
      ]);
      expect(kept?.isActive, JSON.stringify(body)).toBe(true);

      expect(status, JSON.stringify(body)).toBe(400);
    }

    // The key still authenticates with its original scope
    expect(
      (await apiSdk.forApiKey(key.key!).profiles.getSelfProfile()).status,
    ).toBe(200);
  });

  test("PUT /api/2.0/keys/{keyId} - A name of exactly 30 characters is accepted", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, { name: "Autotest original" });
    const name = apiSdk.faker.generateString(30);

    const { status } = await owner.apiKeys.updateApiKey({
      keyId: key.id,
      updateApiKeyRequest: { name },
    });

    expect(status).toBe(200);
    expect((await findKey(owner, key.id))?.name).toBe(name);
  });
});

test.describe("keyId handling", () => {
  test("PUT /api/2.0/keys/{keyId} - Malformed keyId is not found and existing keys are untouched", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, { name: "Autotest bystander" });

    for (const keyId of ["abc", "0", "x".repeat(300)]) {
      const update = await owner.apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { name: "changed" },
      });
      const del = await owner.apiKeys.deleteApiKey({ keyId });

      expect((await findKey(owner, key.id))?.name).toBe("Autotest bystander");
      expect(update.status, `update ${keyId.slice(0, 10)}`).toBe(404);
      expect(del.status, `delete ${keyId.slice(0, 10)}`).toBe(404);
    }
  });

  const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

  test.fail(
    "BUG 84482: PUT /api/2.0/keys/{keyId} - Update of a well-formed unknown keyId is a client error, not a 500",
    async ({ apiSdk }) => {
      const { status } = await apiSdk.forRole("owner").apiKeys.updateApiKey({
        keyId: UNKNOWN_ID,
        updateApiKeyRequest: { name: "changed" },
      });

      expect(status).toBe(404);
    },
  );

  test.fail(
    "BUG 84483: DELETE /api/2.0/keys/{keyId} - Delete of a well-formed unknown keyId is a client error, not a 500",
    async ({ apiSdk }) => {
      const { status } = await apiSdk.forRole("owner").apiKeys.deleteApiKey({
        keyId: UNKNOWN_ID,
      });

      expect(status).toBe(404);
    },
  );

  test.fail(
    "BUG 84483: DELETE /api/2.0/keys/{keyId} - Repeated delete of the same key is a client error, not a 500",
    async ({ apiSdk }) => {
      const owner = apiSdk.forRole("owner");
      const key = await createKey(owner, { name: "Autotest twice" });
      expect((await owner.apiKeys.deleteApiKey({ keyId: key.id })).status).toBe(
        200,
      );

      const { status } = await owner.apiKeys.deleteApiKey({ keyId: key.id });

      expect(status).toBe(404);
    },
  );

  test.fail(
    "BUG 84482: PUT /api/2.0/keys/{keyId} - Update of an already deleted key is a client error, not a 500",
    async ({ apiSdk }) => {
      const owner = apiSdk.forRole("owner");
      const key = await createKey(owner, { name: "Autotest deleted" });
      expect((await owner.apiKeys.deleteApiKey({ keyId: key.id })).status).toBe(
        200,
      );

      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { name: "changed" },
      });

      expect(status).toBe(404);
    },
  );
});

test.describe("Bearer credentials that are not API keys", () => {
  test("GET /api/2.0/keys/@self - Unknown, malformed and empty API keys are rejected", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, { name: "Autotest control" });
    const unknown = `sk-${"0".repeat(64)}`;

    // Positive control: a real key is accepted
    expect((await apiSdk.forApiKey(key.key!).apiKeys.getApiKey()).status).toBe(
      200,
    );

    for (const secret of ["garbage", unknown, "", " "]) {
      const asKey = apiSdk.forApiKey(secret);
      expect(
        (await asKey.apiKeys.getApiKey()).status,
        `@self '${secret.slice(0, 8)}'`,
      ).toBe(401);
      expect(
        (await asKey.apiKeys.getApiKeys()).status,
        `list '${secret.slice(0, 8)}'`,
      ).toBe(401);
    }
  });
});

test.describe("Names with non-Latin characters", () => {
  const NAMES_BMP = ["Ключ", "漢字", "Ελληνικά", "مفتاح", "✓ ★ ©"];

  test("POST /api/2.0/keys - Names with Cyrillic, CJK, Greek, Arabic and symbols are stored unchanged", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const created = [];
    for (const name of NAMES_BMP) {
      created.push(await createKey(owner, { name }));
    }

    const keys = await listKeys(owner);
    for (const [i, key] of created.entries()) {
      expect(key.name).toBe(NAMES_BMP[i]);
      expect(keys.find((k) => k.id === key.id)?.name).toBe(NAMES_BMP[i]);
      const { data } = await apiSdk.forApiKey(key.key!).apiKeys.getApiKey();
      expect(data.response?.name).toBe(NAMES_BMP[i]);
    }
  });

  // Characters outside the Basic Multilingual Plane (emoji, rare CJK) are
  // answered by POST as sent, but stored with every such character replaced
  // by "?" (one "?" per code point) and shown that way by GET /keys and
  // GET /keys/@self.
  const NAMES_ASTRAL = ["🔑", "a🔑b", "😀😀", "𠀋 𝒳"];

  test.fail(
    "BUG 84484: POST /api/2.0/keys - Characters outside the BMP (emoji) in the name are stored unchanged",
    async ({ apiSdk }) => {
      const owner = apiSdk.forRole("owner");
      const created = [];
      for (const name of NAMES_ASTRAL) {
        created.push(await createKey(owner, { name }));
      }

      const keys = await listKeys(owner);
      for (const [i, key] of created.entries()) {
        expect(keys.find((k) => k.id === key.id)?.name).toBe(NAMES_ASTRAL[i]);
        const { data } = await apiSdk.forApiKey(key.key!).apiKeys.getApiKey();
        expect(data.response?.name).toBe(NAMES_ASTRAL[i]);
      }
    },
  );

  test.fail(
    "BUG 84484: PUT /api/2.0/keys/{keyId} - Characters outside the BMP (emoji) in the new name are stored unchanged",
    async ({ apiSdk }) => {
      const owner = apiSdk.forRole("owner");
      const key = await createKey(owner, { name: "Autotest original" });

      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { name: "a🔑b" },
      });

      expect(status).toBe(200);
      expect((await findKey(owner, key.id))?.name).toBe("a🔑b");
    },
  );
});

test.describe("Inconsistent or failing responses", () => {
  test.fail(
    "BUG 84485: PUT /api/2.0/keys/{keyId} - Whitespace-only name is rejected like it is by POST",
    async ({ apiSdk }) => {
      const owner = apiSdk.forRole("owner");
      const key = await createKey(owner, { name: "Autotest original" });

      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { name: "   " },
      });

      // Side effect first: POST rejects this name, so PUT must not store it
      expect((await findKey(owner, key.id))?.name).toBe("Autotest original");
      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG 84486: GET /api/2.0/keys/@self - Regular login (not an API key) does not cause a server error",
    async ({ apiSdk }) => {
      const { status } = await apiSdk.forRole("owner").apiKeys.getApiKey();

      // The operation is documented as unusable for such a session; any
      // client error is acceptable, a 5xx never is.
      expect(status).not.toBe(500);
    },
  );
});

// Companions to the "BUG ..." tests above: those assert the status and the
// message of a denied call, but not that the call was really a no-op. These
// verify the state of the key / the key list after the denied calls.
test.describe("Denied key operations leave no side effects", () => {
  // One authenticated member per test: several addAuthenticatedMember calls in
  // one test make the later logins flaky (401).
  for (const { role, type } of [
    { role: "roomAdmin", type: "RoomAdmin" },
    { role: "user", type: "User" },
    { role: "guest", type: "Guest" },
  ] as const) {
    test(`PUT|DELETE /api/2.0/keys/{keyId} - ${type} cannot change or remove the Owner's key`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const key = await createKey(owner, {
        name: "Autotest owner key",
        permissions: ["accounts.self:read"],
      });
      await apiSdk.addAuthenticatedMember("owner", type);
      const api = apiSdk.forRole(role);

      const update = await api.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: {
          name: "hijacked",
          permissions: ["*"],
          isActive: false,
        },
      });
      const del = await api.apiKeys.deleteApiKey({ keyId: key.id });

      // State first: the key exists, is unchanged and still authenticates
      const kept = await findKey(owner, key.id);
      expect(kept?.name).toBe("Autotest owner key");
      expect(kept?.permissions).toEqual(["accounts.self:read"]);
      expect(kept?.isActive).toBe(true);
      expect(
        (await apiSdk.forApiKey(key.key!).profiles.getSelfProfile()).status,
      ).toBe(200);

      expect(update.status).toBe(403);
      expect(del.status).toBe(403);
    });
  }

  test("POST /api/2.0/keys - Rejected creations (Guest, empty scopes, narrow-scope key) create no key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const guest = await apiSdk
      .forRole("guest")
      .apiKeys.createApiKey({ createApiKeyRequestDto: { name: "by guest" } });
    const empty = await owner.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: "empty scopes", permissions: [] },
    });
    const narrow = await createKey(owner, {
      name: "Autotest files:read",
      permissions: ["files:read"],
    });
    const viaKey = await apiSdk.forApiKey(narrow.key!).apiKeys.createApiKey({
      createApiKeyRequestDto: { name: "full access key" },
    });

    // The Owner's list shows every key of the portal: only the narrow one
    expect((await listKeys(owner)).map((k) => k.id)).toEqual([narrow.id]);
    expect(guest.status).toBe(403);
    expect(empty.status).toBe(400);
    expect(viaKey.status).toBe(403);
  });
});
