import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

async function getSignature(
  api: ReturnType<
    (typeof import("@/src/services/api-sdk").ApiSDK.prototype)["forRole"]
  >,
) {
  const { data } = await api.oauth2.generateJwtToken();
  return (data as any).response as string;
}

test.describe("GET /api/2.0/scopes", () => {
  test("GET /api/2.0/scopes - Owner gets list of available OAuth2 scopes", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.scopeManagement.getScopes({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data as any).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "openid",
          group: "openid",
          type: "openid",
        }),
        expect.objectContaining({
          name: "files:read",
          group: "files",
          type: "read",
        }),
        expect.objectContaining({
          name: "files:write",
          group: "files",
          type: "write",
        }),
        expect.objectContaining({
          name: "rooms:read",
          group: "rooms",
          type: "read",
        }),
        expect.objectContaining({
          name: "rooms:write",
          group: "rooms",
          type: "write",
        }),
        expect.objectContaining({
          name: "accounts:read",
          group: "accounts",
          type: "read",
        }),
        expect.objectContaining({
          name: "accounts:write",
          group: "accounts",
          type: "write",
        }),
      ]),
    );
  });

  test("GET /api/2.0/scopes - DocSpaceAdmin gets list of available OAuth2 scopes", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);

    const { data, status } = await api.scopeManagement.getScopes({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data as any).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "openid",
          group: "openid",
          type: "openid",
        }),
        expect.objectContaining({
          name: "files:read",
          group: "files",
          type: "read",
        }),
        expect.objectContaining({
          name: "files:write",
          group: "files",
          type: "write",
        }),
        expect.objectContaining({
          name: "rooms:read",
          group: "rooms",
          type: "read",
        }),
        expect.objectContaining({
          name: "rooms:write",
          group: "rooms",
          type: "write",
        }),
        expect.objectContaining({
          name: "accounts:read",
          group: "accounts",
          type: "read",
        }),
        expect.objectContaining({
          name: "accounts:write",
          group: "accounts",
          type: "write",
        }),
      ]),
    );
  });

  test("GET /api/2.0/scopes - RoomAdmin gets list of available OAuth2 scopes", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);

    const { data, status } = await api.scopeManagement.getScopes({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data as any).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "openid",
          group: "openid",
          type: "openid",
        }),
        expect.objectContaining({
          name: "files:read",
          group: "files",
          type: "read",
        }),
        expect.objectContaining({
          name: "files:write",
          group: "files",
          type: "write",
        }),
        expect.objectContaining({
          name: "rooms:read",
          group: "rooms",
          type: "read",
        }),
        expect.objectContaining({
          name: "rooms:write",
          group: "rooms",
          type: "write",
        }),
        expect.objectContaining({
          name: "accounts:read",
          group: "accounts",
          type: "read",
        }),
        expect.objectContaining({
          name: "accounts:write",
          group: "accounts",
          type: "write",
        }),
      ]),
    );
  });

  test("GET /api/2.0/scopes - User gets list of available OAuth2 scopes", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);

    const { data, status } = await api.scopeManagement.getScopes({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data as any).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "openid",
          group: "openid",
          type: "openid",
        }),
        expect.objectContaining({
          name: "files:read",
          group: "files",
          type: "read",
        }),
        expect.objectContaining({
          name: "files:write",
          group: "files",
          type: "write",
        }),
        expect.objectContaining({
          name: "rooms:read",
          group: "rooms",
          type: "read",
        }),
        expect.objectContaining({
          name: "rooms:write",
          group: "rooms",
          type: "write",
        }),
        expect.objectContaining({
          name: "accounts:read",
          group: "accounts",
          type: "read",
        }),
        expect.objectContaining({
          name: "accounts:write",
          group: "accounts",
          type: "write",
        }),
      ]),
    );
  });
});
