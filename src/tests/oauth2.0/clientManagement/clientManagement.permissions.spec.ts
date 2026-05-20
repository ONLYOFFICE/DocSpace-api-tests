import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { readIconAsBase64 } from "@/src/utils/icon.utils";

type OAuthApi = ReturnType<
  (typeof import("@/src/services/api-sdk").ApiSDK.prototype)["forRole"]
>;

const LOGO = `data:image/png;base64,${readIconAsBase64("src/assets/mcp-icon.png")}`;

async function getSignature(api: OAuthApi) {
  const { data } = await api.oauth2.generateJwtToken();
  return (data as any).response as string;
}

const fullClientRequest = {
  redirect_uris: new Set(["https://example.com/callback"]),
  allowed_origins: new Set(["https://example.com"]),
  logo: LOGO,
  website_url: "https://example.com",
  terms_url: "https://example.com/terms",
  policy_url: "https://example.com/policy",
  logout_redirect_uri: "https://example.com/logout",
  scopes: new Set(["openid", "files:read"]),
};

test.describe("POST /api/2.0/clients - permissions", () => {
  test("POST /api/2.0/clients - Anonymous cannot create OAuth2 client", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientManagement.createClient({
        createClientRequest: {
          name: "Test OAuth Client",
          redirect_uris: new Set(["https://example.com/callback"]),
          allowed_origins: new Set(["https://example.com"]),
        },
      });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/clients - Guest cannot create OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .clientManagement.createClient({
        createClientRequest: {
          name: "Test OAuth Client",
          redirect_uris: new Set(["https://example.com/callback"]),
          allowed_origins: new Set(["https://example.com"]),
        },
      });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/clients - Cannot create client with name exceeding 256 characters", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "a".repeat(257),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name",
          code: "ErrorName",
          message:
            "client name length is expected to be between 3 and 256 characters",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client without scopes", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          scopes: new Set(),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "scopes",
          code: "EmptyFieldError",
          message: "scopes field can not be empty",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with name shorter than 3 characters", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "ab",
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name",
          code: "ErrorName",
          message:
            "client name length is expected to be between 3 and 256 characters",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with invalid redirect_uri", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          redirect_uris: new Set(["not-a-url"]),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "redirect_uris",
          code: "ErrorWrongURL",
          message: "url collection has invalid entries",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with invalid allowed_origins", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          allowed_origins: new Set(["not-a-url"]),
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "allowed_origins",
          code: "ErrorWrongURL",
          message: "url collection has invalid entries",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with invalid website_url", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          website_url: "not-a-url",
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "website_url",
          code: "ErrorWrongURL",
          message: "website url is expected to be passed as url",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with invalid terms_url", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          terms_url: "not-a-url",
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "terms_url",
          code: "ErrorWrongURL",
          message: "terms url is expected to be passed as url",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with invalid policy_url", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          policy_url: "not-a-url",
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "policy_url",
          code: "ErrorWrongURL",
          message: "policy url is expected to be passed as url",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client with invalid logout_redirect_uri", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          logout_redirect_uri: "not-a-url",
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "logout_redirect_uri",
          code: "ErrorWrongURL",
          message: "logout redirect uri is expected to be passed as url",
        }),
      ]),
    );
  });

  test("POST /api/2.0/clients - Cannot create client without logo", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { data, status } = await api.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Test OAuth Client",
          logo: undefined,
        },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
    expect((data as any).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "logo",
          code: "EmptyFieldError",
          message: "client logo must not be empty",
        }),
      ]),
    );
  });
});

test.describe("DELETE /api/2.0/clients/{clientId} - permissions", () => {
  test("DELETE /api/2.0/clients/{clientId} - Anonymous cannot delete OAuth2 client", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientManagement.deleteClient({ clientId: "non-existent-id" });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/clients/{clientId} - Guest cannot delete OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .clientManagement.deleteClient({ clientId: "non-existent-id" });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/clients/{clientId} - User cannot delete another user's client", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSignature = await getSignature(ownerApi);

    const { data: created } = await ownerApi.clientManagement.createClient(
      {
        createClientRequest: {
          ...fullClientRequest,
          name: "Owner Client",
        },
      },
      { headers: { "x-signature": ownerSignature } },
    );
    const clientId = created.client_id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSignature = await getSignature(userApi);

    const { status } = await userApi.clientManagement.deleteClient(
      { clientId },
      { headers: { "x-signature": userSignature } },
    );

    expect(status).toBe(404);
  });

  test("DELETE /api/2.0/clients/{clientId} - Delete non-existent client returns 404", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { status } = await api.clientManagement.deleteClient(
      { clientId: "00000000-0000-0000-0000-000000000000" },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(404);
  });
});

test.describe("PUT /api/2.0/clients/{clientId} - permissions", () => {
  test("PUT /api/2.0/clients/{clientId} - Anonymous cannot update OAuth2 client", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientManagement.updateClient({
        clientId: "00000000-0000-0000-0000-000000000000",
        updateClientRequest: { name: "Updated Client" },
      });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/clients/{clientId} - Guest cannot update OAuth2 client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .clientManagement.updateClient({
        clientId: "00000000-0000-0000-0000-000000000000",
        updateClientRequest: { name: "Updated Client" },
      });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/clients/{clientId} - User cannot update another user's client", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSignature = await getSignature(ownerApi);

    const { data: created } = await ownerApi.clientManagement.createClient(
      {
        createClientRequest: { ...fullClientRequest, name: "Owner Client" },
      },
      { headers: { "x-signature": ownerSignature } },
    );
    const clientId = created.client_id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSignature = await getSignature(userApi);

    const { status } = await userApi.clientManagement.updateClient(
      {
        clientId,
        updateClientRequest: {
          ...fullClientRequest,
          name: "Hacked Name",
        } as any,
      },
      { headers: { "x-signature": userSignature } },
    );

    expect(status).toBe(404);
  });

  test.fail(
    "BUG 81670: PUT /api/2.0/clients/{clientId} - Cannot update client with name exceeding 256 characters",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");
      const signature = await getSignature(api);

      const { data: created } = await api.clientManagement.createClient(
        { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
        { headers: { "x-signature": signature } },
      );
      const clientId = created.client_id!;

      const { data, status } = await api.clientManagement.updateClient(
        {
          clientId,
          updateClientRequest: {
            ...fullClientRequest,
            name: "a".repeat(257),
          } as any,
        },
        { headers: { "x-signature": signature } },
      );

      // BUG: server accepts name > 256 chars on update (returns 200), but rejects on create (400)
      expect(status).toBe(400);
      expect((data as any).errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "name" })]),
      );
    },
  );

  test.fail(
    "BUG 81670: PUT /api/2.0/clients/{clientId} - Cannot update client with name shorter than 3 characters",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");
      const signature = await getSignature(api);

      const { data: created } = await api.clientManagement.createClient(
        { createClientRequest: { ...fullClientRequest, name: "Test Client" } },
        { headers: { "x-signature": signature } },
      );
      const clientId = created.client_id!;

      const { data, status } = await api.clientManagement.updateClient(
        {
          clientId,
          updateClientRequest: { ...fullClientRequest, name: "ab" } as any,
        },
        { headers: { "x-signature": signature } },
      );

      // BUG: server accepts name < 3 chars on update (returns 200), but rejects on create (400)
      expect(status).toBe(400);
      expect((data as any).errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "name" })]),
      );
    },
  );

  test("PUT /api/2.0/clients/{clientId} - Cannot update client with invalid allowed_origins", async ({
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
          name: "Test Client",
          allowed_origins: new Set(["not-a-url"]),
        } as any,
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
  });

  test("PUT /api/2.0/clients/{clientId} - Update non-existent client returns 404", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { status } = await api.clientManagement.updateClient(
      {
        clientId: "00000000-0000-0000-0000-000000000000",
        updateClientRequest: { name: "Updated Client" },
      },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(400);
  });
});
