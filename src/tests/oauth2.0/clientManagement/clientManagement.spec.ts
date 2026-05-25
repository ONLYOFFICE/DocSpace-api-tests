import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { OAUTH_LOGO as LOGO, getSignature } from "@/src/helpers/oauth";

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

test.describe("PATCH /api/2.0/clients/{clientId}/activation", () => {
  test("PATCH /api/2.0/clients/{clientId}/activation - Owner deactivates OAuth2 client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.changeActivation(
      { clientId, changeClientActivationRequest: { status: false } },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PATCH /api/2.0/clients/{clientId}/activation - Owner reactivates OAuth2 client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    await api.clientManagement.changeActivation(
      { clientId, changeClientActivationRequest: { status: false } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.changeActivation(
      { clientId, changeClientActivationRequest: { status: true } },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PATCH /api/2.0/clients/{clientId}/activation - DocSpaceAdmin changes client activation", async ({
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

    const { status } = await api.clientManagement.changeActivation(
      { clientId, changeClientActivationRequest: { status: false } },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PATCH /api/2.0/clients/{clientId}/activation - RoomAdmin changes client activation", async ({
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

    const { status } = await api.clientManagement.changeActivation(
      { clientId, changeClientActivationRequest: { status: false } },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });

  test("PATCH /api/2.0/clients/{clientId}/activation - User changes activation of their own client", async ({
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

    const { status } = await api.clientManagement.changeActivation(
      { clientId, changeClientActivationRequest: { status: false } },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });
});

test.describe("DELETE /api/2.0/clients/tenant", () => {
  test("DELETE /api/2.0/clients/tenant - Owner deletes all tenant OAuth2 clients", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client 1" } },
      { headers: { "x-signature": signature } },
    );
    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client 2" } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.deleteTenantClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients/tenant - DocSpaceAdmin deletes all tenant OAuth2 clients", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.deleteTenantClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients/tenant - clients are gone after deletion", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client 1" } },
      { headers: { "x-signature": signature } },
    );
    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client 2" } },
      { headers: { "x-signature": signature } },
    );

    await api.clientManagement.deleteTenantClients({
      headers: { "x-signature": signature },
    });

    const signatureForGet = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": signatureForGet } },
    );

    expect(status).toBe(200);
    expect((data as any).data).toHaveLength(0);
  });

  test("DELETE /api/2.0/clients/tenant - returns 200 when no clients exist", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { status } = await api.clientManagement.deleteTenantClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });
});

test.describe("PATCH /api/2.0/clients/{clientId}/regenerate", () => {
  test("PATCH /api/2.0/clients/{clientId}/regenerate - Owner regenerates client secret", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;
    const originalSecret = created.client_secret!;

    const { data, status } = await api.clientManagement.regenerateSecret(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
    expect(data.client_secret).toBeTruthy();
    expect(data.client_secret).not.toBe(originalSecret);
  });

  test("PATCH /api/2.0/clients/{clientId}/regenerate - DocSpaceAdmin regenerates client secret", async ({
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

    const { data, status } = await api.clientManagement.regenerateSecret(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
    expect(data.client_secret).toBeTruthy();
  });

  test("PATCH /api/2.0/clients/{clientId}/regenerate - RoomAdmin regenerates client secret", async ({
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

    const { data, status } = await api.clientManagement.regenerateSecret(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
    expect(data.client_secret).toBeTruthy();
  });

  test("PATCH /api/2.0/clients/{clientId}/regenerate - User regenerates secret of their own client", async ({
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

    const { data, status } = await api.clientManagement.regenerateSecret(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
    expect(data.client_secret).toBeTruthy();
  });
});

test.describe("DELETE /api/2.0/clients", () => {
  test("DELETE /api/2.0/clients - Owner deletes all their OAuth2 clients", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.deleteUserClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients - DocSpaceAdmin deletes all their OAuth2 clients", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.deleteUserClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients - RoomAdmin deletes all their OAuth2 clients", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.deleteUserClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients - User deletes all their OAuth2 clients", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );

    const { status } = await api.clientManagement.deleteUserClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/clients - clients are gone after deletion", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client 1" } },
      { headers: { "x-signature": signature } },
    );
    await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client 2" } },
      { headers: { "x-signature": signature } },
    );

    await api.clientManagement.deleteUserClients({
      headers: { "x-signature": signature },
    });

    const signatureForGet = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": signatureForGet } },
    );

    expect(status).toBe(200);
    expect((data as any).data).toHaveLength(0);
  });

  test("DELETE /api/2.0/clients - returns 200 when no clients exist", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { status } = await api.clientManagement.deleteUserClients({
      headers: { "x-signature": signature },
    });

    expect(status).toBe(200);
  });
});

// Full testing of DELETE /api/2.0/clients/{clientId}/revoke requires an active OAuth2 consent
// obtained through the authorization code flow (browser redirect + consent screen).
// That flow cannot be automated via API — see src/tests/oauth2.0/authorization/authorization.spec.ts.
// Tests below cover only the cases that don't require a prior consent.
test.describe("DELETE /api/2.0/clients/{clientId}/revoke", () => {
  test("DELETE /api/2.0/clients/{clientId}/revoke - Revoke without prior consent returns 200", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data: created } = await api.clientManagement.createClient(
      { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
      { headers: { "x-signature": signature } },
    );
    const clientId = created.client_id!;

    const { status } = await api.clientManagement.revokeUserClient(
      { clientId },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(200);
  });
});
