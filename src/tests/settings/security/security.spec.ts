import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/security/password - Get password settings", () => {
  test("GET /api/2.0/settings/security/password - Owner gets default password settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getPasswordSettings();

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.objectContaining({
        minLength: 8,
        upperCase: false,
        digits: false,
        specSymbols: false,
      }),
    );
    expect(data.response?.allowedCharactersRegexStr).toBeTruthy();
  });

  // Unlike loginSettings (Owner/DocSpaceAdmin-only, even for reads), password
  // settings are readable by any authenticated role - confirmed live, not
  // assumed from the sibling loginSettings endpoint's access model.
  test("GET /api/2.0/settings/security/password - User can read password settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.security.getPasswordSettings();

    expect(status).toBe(200);
    expect(data.response?.minLength).toBe(8);
  });
});

test.describe("PUT /api/2.0/settings/security/password - Update password settings", () => {
  test("PUT /api/2.0/settings/security/password - Owner updates password settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.updatePasswordSettings({
        passwordSettingsRequestsDto: {
          minLength: 12,
          upperCase: true,
          digits: true,
          specSymbols: true,
        },
      });

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.objectContaining({
        minLength: 12,
        upperCase: true,
        digits: true,
        specSymbols: true,
      }),
    );

    const { data: after } = await apiSdk
      .forRole("owner")
      .security.getPasswordSettings();
    expect(after.response?.minLength).toBe(12);
  });

  test("PUT /api/2.0/settings/security/password - DocSpaceAdmin updates password settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.security.updatePasswordSettings({
      passwordSettingsRequestsDto: { minLength: 15, upperCase: true },
    });

    expect(status).toBe(200);
    expect(data.response?.minLength).toBe(15);
    expect(data.response?.upperCase).toBe(true);
  });
});

test.describe("PUT /api/2.0/settings/security/password - Owner sends invalid values", () => {
  test("PUT /api/2.0/settings/security/password - an out-of-range minLength is rejected with a validation error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.updatePasswordSettings({
        passwordSettingsRequestsDto: { minLength: 999 },
      });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBe("MinLength");
  });

  test("PUT /api/2.0/settings/security/password - a negative minLength is rejected with a validation error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.updatePasswordSettings({
        passwordSettingsRequestsDto: { minLength: -5 },
      });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBe("MinLength");
  });
});

// This DocSpace build has zero registered products in WebItemManager (the
// classic multi-product ASC architecture - CRM, Projects, Mail, etc. - isn't
// compiled in here). Confirmed live: getWebItemSettingsSecurityInfo() and
// getEnabledModules() both return an empty list with no ids given, and
// getWebItemSecurityInfo always returns false for any id since no real
// module can ever be found in WebItemManager. The security-settings store
// itself (setWebItemSecurity/setAccessToWebItems/getWebItemSettingsSecurityInfo-by-id)
// is decoupled from that registry though - it happily reads/writes an
// enabled/disabled flag for ANY well-formed GUID, real module or not.
test.describe("GET /api/2.0/settings/security/security - Get web items security info", () => {
  test("GET /api/2.0/settings/security/security - Owner gets an empty list when no ids are specified", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getWebItemSettingsSecurityInfo();

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /api/2.0/settings/security/security - User can read web-item security settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.security.getWebItemSettingsSecurityInfo();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // Fail-closed by default: a genuinely unknown id (no seeded row in the
  // security-settings store) comes back disabled, not enabled - confirmed
  // live. (A handful of well-known product GUIDs, e.g. Documents' own,
  // apparently do carry a seeded enabled:true row, but that's a property of
  // those specific ids, not the store's actual default for an unknown one.)
  test("GET /api/2.0/settings/security/security - an unknown id defaults to disabled", async ({
    apiSdk,
  }) => {
    const id = crypto.randomUUID();

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getWebItemSettingsSecurityInfo({ ids: [id] });

    expect(status).toBe(200);
    expect(data.response).toEqual([
      expect.objectContaining({ webItemId: id, enabled: false }),
    ]);
  });

  // BUG 83192/83193: this endpoint returns full user profiles (id, displayName,
  // avatar, profileUrl - which embeds the user's email in a search query)
  // for anyone listed in a web item's `subjects`, to ANY authenticated
  // caller including Guest and plain User. People API's own
  // getProfileByUserId denies both roles 403 "Access denied" for the same
  // lookup (see profiles.permissions.spec.ts) - a non-privileged member can
  // see a portal member's PII here that People itself explicitly refuses to
  // show them, just by knowing (or omitting) a webItemId that has that
  // member as a subject.
  test.fail(
    "BUG 83192: GET /api/2.0/settings/security/security - Guest sees another user's profile info here, which the People API itself blocks for Guest",
    async ({ apiSdk }) => {
      const id = crypto.randomUUID();
      const { data: target } = await apiSdk.addMember("owner", "User");
      const targetId = target.response!.id!;

      await apiSdk.forRole("owner").security.setWebItemSecurity({
        webItemSecurityRequestsDto: { id, enabled: true, subjects: [targetId] },
      });

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { data: securityView } =
        await guestApi.security.getWebItemSettingsSecurityInfo({ ids: [id] });
      const leakedUserIds = securityView.response?.[0].users?.map((u) => u.id);

      expect(leakedUserIds).not.toContain(targetId);
    },
  );

  test.fail(
    "BUG 83193: GET /api/2.0/settings/security/security - User sees another user's profile info here, which the People API itself blocks for User",
    async ({ apiSdk }) => {
      const id = crypto.randomUUID();
      const { data: target } = await apiSdk.addMember("owner", "User");
      const targetId = target.response!.id!;

      await apiSdk.forRole("owner").security.setWebItemSecurity({
        webItemSecurityRequestsDto: { id, enabled: true, subjects: [targetId] },
      });

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data: securityView } =
        await userApi.security.getWebItemSettingsSecurityInfo({ ids: [id] });
      const leakedUserIds = securityView.response?.[0].users?.map((u) => u.id);

      expect(leakedUserIds).not.toContain(targetId);
    },
  );
});

test.describe("GET /api/2.0/settings/security/{id} - Get a single web item's availability", () => {
  test("GET /api/2.0/settings/security/{id} - a nonexistent module id is never enabled", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getWebItemSecurityInfo({ id: crypto.randomUUID() });

    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("GET /api/2.0/settings/security/{id} - User can check a module's availability", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.security.getWebItemSecurityInfo({
      id: crypto.randomUUID(),
    });

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/settings/security/security - Set a web item's security", () => {
  test("PUT /api/2.0/settings/security/security - Owner disables a web item", async ({
    apiSdk,
  }) => {
    const id = crypto.randomUUID();

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.setWebItemSecurity({
        webItemSecurityRequestsDto: { id, enabled: false },
      });

    expect(status).toBe(200);
    expect(data.response).toEqual([
      expect.objectContaining({ webItemId: id, enabled: false }),
    ]);

    const { data: after } = await apiSdk
      .forRole("owner")
      .security.getWebItemSettingsSecurityInfo({ ids: [id] });
    expect(after.response?.[0].enabled).toBe(false);
  });

  test("PUT /api/2.0/settings/security/security - DocSpaceAdmin can also set a web item's security", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const id = crypto.randomUUID();

    const { data, status } = await adminApi.security.setWebItemSecurity({
      webItemSecurityRequestsDto: { id, enabled: false },
    });

    expect(status).toBe(200);
    expect(data.response?.[0].enabled).toBe(false);
  });
});

test.describe("PUT /api/2.0/settings/security/access - Bulk-set access to web items", () => {
  test("PUT /api/2.0/settings/security/access - Owner sets access for multiple web items at once", async ({
    apiSdk,
  }) => {
    const [firstId, secondId] = [crypto.randomUUID(), crypto.randomUUID()];

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.setAccessToWebItems({
        webItemsSecurityRequestsDto: {
          items: [
            { key: firstId, value: false },
            { key: secondId, value: true },
          ],
        },
      });

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ webItemId: firstId, enabled: false }),
        expect.objectContaining({ webItemId: secondId, enabled: true }),
      ]),
    );
  });
});

// A malformed (non-GUID) id crashes these three endpoints with an unhandled
// 500 (System.FormatException: "Unrecognized Guid format") instead of a
// clean 400 - confirmed live and reproducible. getWebItemSecurityInfo is NOT
// affected: its id is bound as a typed Guid route parameter, so ASP.NET's
// own model binding rejects a malformed id with 404 before the controller
// method ever runs - the other three take the id as a plain string and only
// parse it manually inside WebItemSecurity.GetSecurityInfoAsync, uncaught.
test.describe("Malformed web-item ids crash instead of returning a validation error", () => {
  test.fail(
    "BUG 83186: GET /api/2.0/settings/security/security - a malformed id should return 400, not crash with 500",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .security.getWebItemSettingsSecurityInfo({ ids: ["not-a-guid"] });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG 83187: PUT /api/2.0/settings/security/security - a malformed id should return 400, not crash with 500",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .security.setWebItemSecurity({
          webItemSecurityRequestsDto: { id: "not-a-guid", enabled: false },
        });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG 83190: PUT /api/2.0/settings/security/access - a malformed id should return 400, not crash with 500",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .security.setAccessToWebItems({
          webItemsSecurityRequestsDto: {
            items: [{ key: "not-a-guid", value: true }],
          },
        });

      expect(status).toBe(400);
    },
  );
});

const PRODUCT_ID_ALL = "00000000-0000-0000-0000-000000000000";

// Same empty-registry reason as the web-items group above: this DocSpace
// build has no WebItemManager products, so there's nothing to enumerate.
test.describe("GET /api/2.0/settings/security/modules - Get the enabled modules", () => {
  test("GET /api/2.0/settings/security/modules - Owner gets an empty list of enabled modules", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getEnabledModules();

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });
});

test.describe("GET /api/2.0/settings/security/administrator/{productid} - Get product administrators", () => {
  test("GET /api/2.0/settings/security/administrator/{productid} - Owner is included by default as an ALL-product administrator", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getProductAdministrators({ productid: PRODUCT_ID_ALL });

    expect(status).toBe(200);
    expect(data.response?.map((e) => e.id)).toEqual([ownerId]);
  });

  test("GET /api/2.0/settings/security/administrator/{productid} - the list grows after promoting a DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const { data: promoted } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const promotedId = promoted.response!.id!;

    await apiSdk.forRole("owner").security.setProductAdministrator({
      securityRequestsDto: {
        productId: PRODUCT_ID_ALL,
        userId: promotedId,
        administrator: true,
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getProductAdministrators({ productid: PRODUCT_ID_ALL });

    expect(status).toBe(200);
    expect(data.response?.map((e) => e.id)).toContain(promotedId);
  });
});

test.describe("GET /api/2.0/settings/security/administrator - Check a product administrator", () => {
  test("GET /api/2.0/settings/security/administrator - Owner is a product administrator by default", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getIsProductAdministrator({
        productid: PRODUCT_ID_ALL,
        userid: ownerId,
      });

    expect(status).toBe(200);
    expect(data.response?.administrator).toBe(true);
  });

  test("GET /api/2.0/settings/security/administrator - a plain User is not a product administrator", async ({
    apiSdk,
  }) => {
    const { data: created } = await apiSdk.addMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getIsProductAdministrator({
        productid: PRODUCT_ID_ALL,
        userid: created.response!.id!,
      });

    expect(status).toBe(200);
    expect(data.response?.administrator).toBe(false);
  });

  test("GET /api/2.0/settings/security/administrator - a promoted DocSpaceAdmin is confirmed as a product administrator", async ({
    apiSdk,
  }) => {
    const { data: promoted } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const promotedId = promoted.response!.id!;

    await apiSdk.forRole("owner").security.setProductAdministrator({
      securityRequestsDto: {
        productId: PRODUCT_ID_ALL,
        userId: promotedId,
        administrator: true,
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .security.getIsProductAdministrator({
        productid: PRODUCT_ID_ALL,
        userid: promotedId,
      });

    expect(status).toBe(200);
    expect(data.response?.administrator).toBe(true);
  });
});
