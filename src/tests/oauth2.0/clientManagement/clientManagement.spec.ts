import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { readIconAsBase64 } from "@/src/utils/icon.utils";

const LOGO = `data:image/png;base64,${readIconAsBase64("src/assets/mcp-icon.png")}`;

type OAuthApi = ReturnType<
  (typeof import("@/src/services/api-sdk").ApiSDK.prototype)["forRole"]
>;

async function getSignature(api: OAuthApi) {
  const { data } = await api.oauth2.generateJwtToken();
  return (data as any).response as string;
}

test.describe("POST /api/2.0/clients", () => {
  test("POST /api/2.0/clients - Owner creates OAuth2 client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          name: "Test OAuth Client",
          description: "Test OAuth client description",
          logo: LOGO,
          website_url: "https://example.com",
          terms_url: "https://example.com/terms",
          policy_url: "https://example.com/policy",
          redirect_uris: new Set(["https://example.com/callback"]),
          allowed_origins: new Set(["https://example.com"]),
          logout_redirect_uri: "https://example.com/logout",
          is_public: true,
          allow_pkce: true,
          scopes: new Set([
            "accounts.self:read",
            "accounts.self:write",
            "accounts:read",
            "accounts:write",
            "rooms:read",
            "rooms:write",
            "files:read",
            "files:write",
            "openid",
          ]),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(201);
    expect(data.client_id).toBeTruthy();
    expect(data.client_secret).toBeTruthy();
    expect(data.name).toBe("Test OAuth Client");
    expect(data.description).toBe("Test OAuth client description");
    expect(data.website_url).toBe("https://example.com");
    expect(data.terms_url).toBe("https://example.com/terms");
    expect(data.policy_url).toBe("https://example.com/policy");
    expect(data.enabled).toBe(true);
    expect(data.is_public).toBe(true);
    expect(typeof data.tenant).toBe("number");
    expect(data.redirect_uris).toContain("https://example.com/callback");
    expect(data.allowed_origins).toContain("https://example.com");
    expect(data.logout_redirect_uris).toContain("https://example.com/logout");
    expect(data.scopes).toEqual(
      expect.arrayContaining([
        "openid",
        "files:read",
        "files:write",
        "rooms:read",
        "rooms:write",
        "accounts:read",
        "accounts:write",
        "accounts.self:read",
        "accounts.self:write",
      ]),
    );
    expect(Array.isArray(data.authentication_methods)).toBe(true);
    expect(data.created_on).toBeTruthy();
    expect(data.created_by).toBeTruthy();
  });

  test("POST /api/2.0/clients - DocSpaceAdmin creates OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          name: "Test OAuth Client",
          description: "Test OAuth client description",
          logo: LOGO,
          website_url: "https://example.com",
          terms_url: "https://example.com/terms",
          policy_url: "https://example.com/policy",
          redirect_uris: new Set(["https://example.com/callback"]),
          allowed_origins: new Set(["https://example.com"]),
          logout_redirect_uri: "https://example.com/logout",
          is_public: true,
          allow_pkce: true,
          scopes: new Set([
            "accounts.self:read",
            "accounts.self:write",
            "accounts:read",
            "accounts:write",
            "rooms:read",
            "rooms:write",
            "files:read",
            "files:write",
            "openid",
          ]),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(201);
    expect(data.client_id).toBeTruthy();
    expect(data.client_secret).toBeTruthy();
    expect(data.name).toBe("Test OAuth Client");
    expect(data.description).toBe("Test OAuth client description");
    expect(data.website_url).toBe("https://example.com");
    expect(data.terms_url).toBe("https://example.com/terms");
    expect(data.policy_url).toBe("https://example.com/policy");
    expect(data.enabled).toBe(true);
    expect(data.is_public).toBe(true);
    expect(typeof data.tenant).toBe("number");
    expect(data.redirect_uris).toContain("https://example.com/callback");
    expect(data.allowed_origins).toContain("https://example.com");
    expect(data.logout_redirect_uris).toContain("https://example.com/logout");
    expect(data.scopes).toEqual(
      expect.arrayContaining([
        "openid",
        "files:read",
        "files:write",
        "rooms:read",
        "rooms:write",
        "accounts:read",
        "accounts:write",
        "accounts.self:read",
        "accounts.self:write",
      ]),
    );
    expect(Array.isArray(data.authentication_methods)).toBe(true);
    expect(data.created_on).toBeTruthy();
    expect(data.created_by).toBeTruthy();
  });

  test("POST /api/2.0/clients - RoomAdmin creates OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          name: "Test OAuth Client",
          description: "Test OAuth client description",
          logo: LOGO,
          website_url: "https://example.com",
          terms_url: "https://example.com/terms",
          policy_url: "https://example.com/policy",
          redirect_uris: new Set(["https://example.com/callback"]),
          allowed_origins: new Set(["https://example.com"]),
          logout_redirect_uri: "https://example.com/logout",
          is_public: true,
          allow_pkce: true,
          scopes: new Set([
            "accounts.self:read",
            "accounts.self:write",
            "accounts:read",
            "accounts:write",
            "rooms:read",
            "rooms:write",
            "files:read",
            "files:write",
            "openid",
          ]),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(201);
    expect(data.client_id).toBeTruthy();
    expect(data.client_secret).toBeTruthy();
    expect(data.name).toBe("Test OAuth Client");
    expect(data.description).toBe("Test OAuth client description");
    expect(data.website_url).toBe("https://example.com");
    expect(data.terms_url).toBe("https://example.com/terms");
    expect(data.policy_url).toBe("https://example.com/policy");
    expect(data.enabled).toBe(true);
    expect(data.is_public).toBe(true);
    expect(typeof data.tenant).toBe("number");
    expect(data.redirect_uris).toContain("https://example.com/callback");
    expect(data.allowed_origins).toContain("https://example.com");
    expect(data.logout_redirect_uris).toContain("https://example.com/logout");
    expect(data.scopes).toEqual(
      expect.arrayContaining([
        "openid",
        "files:read",
        "files:write",
        "rooms:read",
        "rooms:write",
        "accounts:read",
        "accounts:write",
        "accounts.self:read",
        "accounts.self:write",
      ]),
    );
    expect(Array.isArray(data.authentication_methods)).toBe(true);
    expect(data.created_on).toBeTruthy();
    expect(data.created_by).toBeTruthy();
  });

  test("POST /api/2.0/clients - User creates OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          name: "Test OAuth Client",
          description: "Test OAuth client description",
          logo: LOGO,
          website_url: "https://example.com",
          terms_url: "https://example.com/terms",
          policy_url: "https://example.com/policy",
          redirect_uris: new Set(["https://example.com/callback"]),
          allowed_origins: new Set(["https://example.com"]),
          logout_redirect_uri: "https://example.com/logout",
          is_public: true,
          allow_pkce: true,
          scopes: new Set([
            "accounts.self:read",
            "accounts.self:write",
            "accounts:read",
            "accounts:write",
            "rooms:read",
            "rooms:write",
            "files:read",
            "files:write",
            "openid",
          ]),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(201);
    expect(data.client_id).toBeTruthy();
    expect(data.client_secret).toBeTruthy();
    expect(data.name).toBe("Test OAuth Client");
    expect(data.description).toBe("Test OAuth client description");
    expect(data.website_url).toBe("https://example.com");
    expect(data.terms_url).toBe("https://example.com/terms");
    expect(data.policy_url).toBe("https://example.com/policy");
    expect(data.enabled).toBe(true);
    expect(data.is_public).toBe(true);
    expect(typeof data.tenant).toBe("number");
    expect(data.redirect_uris).toContain("https://example.com/callback");
    expect(data.allowed_origins).toContain("https://example.com");
    expect(data.logout_redirect_uris).toContain("https://example.com/logout");
    expect(data.scopes).toEqual(
      expect.arrayContaining([
        "openid",
        "files:read",
        "files:write",
        "rooms:read",
        "rooms:write",
        "accounts:read",
        "accounts:write",
        "accounts.self:read",
        "accounts.self:write",
      ]),
    );
    expect(Array.isArray(data.authentication_methods)).toBe(true);
    expect(data.created_on).toBeTruthy();
    expect(data.created_by).toBeTruthy();
  });
});

const fullClientRequest = {
  redirect_uris: new Set(["https://example.com/callback"]),
  allowed_origins: new Set(["https://example.com"]),
  logo: LOGO,
  website_url: "https://example.com",
  terms_url: "https://example.com/terms",
  policy_url: "https://example.com/policy",
  logout_redirect_uri: "https://example.com/logout",
  is_public: true,
  allow_pkce: true,
  scopes: new Set([
    "accounts.self:read",
    "accounts.self:write",
    "accounts:read",
    "accounts:write",
    "rooms:read",
    "rooms:write",
    "files:read",
    "files:write",
    "openid",
  ]),
};

test.describe("DELETE /api/2.0/clients/{clientId}", () => {
  test("DELETE /api/2.0/clients/{clientId} - Owner can delete their own OAuth2 client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.deleteClient(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients/{clientId} - DocSpaceAdmin can delete their own OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.deleteClient(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients/{clientId} - RoomAdmin can delete their own OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.deleteClient(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients/{clientId} - User can delete their own OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.deleteClient(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/clients/{clientId}", () => {
  test("PUT /api/2.0/clients/{clientId} - Owner updates OAuth2 client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.updateClient(
      {
        clientId,
        updateClientRequest: {
          ...fullClientRequest,
          name: "Updated OAuth Client",
          description: "Updated description",
        } as any,
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/clients/{clientId} - DocSpaceAdmin updates OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.updateClient(
      {
        clientId,
        updateClientRequest: {
          ...fullClientRequest,
          name: "Updated OAuth Client",
        } as any,
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/clients/{clientId} - RoomAdmin updates OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.updateClient(
      {
        clientId,
        updateClientRequest: {
          ...fullClientRequest,
          name: "Updated OAuth Client",
        } as any,
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/clients/{clientId} - User updates their own OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.updateClient(
      {
        clientId,
        updateClientRequest: {
          ...fullClientRequest,
          name: "Updated OAuth Client",
        } as any,
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });
});
