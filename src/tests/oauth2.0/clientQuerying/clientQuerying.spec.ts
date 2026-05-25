import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { getSignature, createOAuthClient } from "@/src/helpers/oauth";

test.describe("GET /api/2.0/clients/{clientId}", () => {
  test("GET /api/2.0/clients/{clientId} - Owner retrieves their own client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClient Owner",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClient Owner");
    expect(data.website_url).toBe("https://example.com");
    expect(data.enabled).toBe(true);
    expect(data.client_secret).toBeTruthy();
    expect(data.scopes).toContain("accounts.self:read");
  });

  test("GET /api/2.0/clients/{clientId} - DocSpaceAdmin retrieves their own client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClient DSAdmin",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClient DSAdmin");
  });

  test("GET /api/2.0/clients/{clientId} - RoomAdmin retrieves their own client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClient RoomAdmin",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClient RoomAdmin");
  });

  test("GET /api/2.0/clients/{clientId} - User retrieves their own client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClient User",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClient User");
  });

  test("GET /api/2.0/clients/{clientId} - Owner can retrieve another user's client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSig = await getSignature(userApi);
    const clientId = await createOAuthClient(
      userApi,
      userSig,
      "Autotest GetClient Other User",
    );

    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const { data, status } = await ownerApi.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": ownerSig } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
  });
});

test.describe("GET /api/2.0/clients", () => {
  test("GET /api/2.0/clients - Owner sees their own clients in the list", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      sig,
      "Autotest GetClients Owner",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": sig2 } },
    );

    const clients = (data as any).data as any[];
    expect(status).toBe(200);
    expect(clients.some((c: any) => c.client_id === clientId)).toBe(true);
  });

  test("GET /api/2.0/clients - Response contains full client data including client_secret", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      sig,
      "Autotest GetClients Fields",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": sig2 } },
    );

    const clients = (data as any).data as any[];
    const client = clients.find((c: any) => c.client_id === clientId);
    expect(status).toBe(200);
    expect(client).toBeDefined();
    expect(client.name).toBe("Autotest GetClients Fields");
    expect(client.client_secret).toBeTruthy();
    expect(client.website_url).toBe("https://example.com");
    expect(client.scopes).toContain("accounts.self:read");
  });

  test("GET /api/2.0/clients - Returns empty list when user has no clients", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const sig = await getSignature(api);

    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": sig } },
    );

    const clients = (data as any).data as any[];
    expect(status).toBe(200);
    expect(clients).toHaveLength(0);
  });

  test("GET /api/2.0/clients - Multiple clients all appear in the list", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig1 = await getSignature(api);
    const clientId1 = await createOAuthClient(
      api,
      sig1,
      "Autotest GetClients Multi 1",
    );
    const sig2 = await getSignature(api);
    const clientId2 = await createOAuthClient(
      api,
      sig2,
      "Autotest GetClients Multi 2",
    );

    const sig3 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": sig3 } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).toContain(clientId1);
    expect(ids).toContain(clientId2);
  });

  test("GET /api/2.0/clients - Response includes pagination fields", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    await createOAuthClient(api, sig, "Autotest GetClients Pagination");

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect((data as any).limit).toBeDefined();
  });

  test("GET /api/2.0/clients - DocSpaceAdmin sees all tenant clients", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const ownerClientId = await createOAuthClient(
      ownerApi,
      ownerSig,
      "Autotest GetClients DSAdmin Visibility",
    );

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");
    const adminSig = await getSignature(adminApi);

    const { data, status } = await adminApi.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": adminSig } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).toContain(ownerClientId);
  });

  test("GET /api/2.0/clients - User only sees their own clients, not other users'", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const ownerClientId = await createOAuthClient(
      ownerApi,
      ownerSig,
      "Autotest GetClients Owner Only",
    );

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSig = await getSignature(userApi);

    const { data, status } = await userApi.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": userSig } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).not.toContain(ownerClientId);
  });
});

test.describe("GET /api/2.0/clients/info", () => {
  test("GET /api/2.0/clients/info - Owner sees their own clients in the list", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      sig,
      "Autotest GetClientsInfo Owner",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": sig2 } },
    );

    const clients = (data as any).data as any[];
    expect(status).toBe(200);
    expect(clients.some((c: any) => c.client_id === clientId)).toBe(true);
  });

  test("GET /api/2.0/clients/info - Response contains public client data without client_secret", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      sig,
      "Autotest GetClientsInfo Fields",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": sig2 } },
    );

    const clients = (data as any).data as any[];
    const client = clients.find((c: any) => c.client_id === clientId);
    expect(status).toBe(200);
    expect(client).toBeDefined();
    expect(client.name).toBe("Autotest GetClientsInfo Fields");
    expect(client.website_url).toBe("https://example.com");
    expect(client.scopes).toContain("accounts.self:read");
    expect(client.client_secret).toBeUndefined();
  });

  test("GET /api/2.0/clients/info - Returns empty list when user has no clients", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const sig = await getSignature(api);

    const { data, status } = await api.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": sig } },
    );

    const clients = (data as any).data as any[];
    expect(status).toBe(200);
    expect(clients).toHaveLength(0);
  });

  test("GET /api/2.0/clients/info - Multiple clients all appear in the list", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig1 = await getSignature(api);
    const clientId1 = await createOAuthClient(
      api,
      sig1,
      "Autotest GetClientsInfo Multi 1",
    );
    const sig2 = await getSignature(api);
    const clientId2 = await createOAuthClient(
      api,
      sig2,
      "Autotest GetClientsInfo Multi 2",
    );

    const sig3 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": sig3 } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).toContain(clientId1);
    expect(ids).toContain(clientId2);
  });

  test("GET /api/2.0/clients/info - Response includes pagination fields", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    await createOAuthClient(api, sig, "Autotest GetClientsInfo Pagination");

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect((data as any).limit).toBeDefined();
  });

  test("GET /api/2.0/clients/info - DocSpaceAdmin sees all tenant clients info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const ownerClientId = await createOAuthClient(
      ownerApi,
      ownerSig,
      "Autotest GetClientsInfo DSAdmin Visibility",
    );

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");
    const adminSig = await getSignature(adminApi);

    const { data, status } = await adminApi.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": adminSig } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).toContain(ownerClientId);
  });

  test("GET /api/2.0/clients/info - User only sees their own clients info, not other users'", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const ownerClientId = await createOAuthClient(
      ownerApi,
      ownerSig,
      "Autotest GetClientsInfo Owner Only",
    );

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSig = await getSignature(userApi);

    const { data, status } = await userApi.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": userSig } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).not.toContain(ownerClientId);
  });
});

test.describe("GET /api/2.0/clients/{clientId}/info", () => {
  test("GET /api/2.0/clients/{clientId}/info - Owner retrieves public info for their own client", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClientInfo Owner",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClientInfo Owner");
    expect(data.website_url).toBe("https://example.com");
    expect(data.scopes).toContain("accounts.self:read");
    // client_secret is not present in ClientInfoResponse
    expect((data as any).client_secret).toBeUndefined();
  });

  test("GET /api/2.0/clients/{clientId}/info - DocSpaceAdmin retrieves public info for their own client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const api = apiSdk.forRole("docSpaceAdmin");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClientInfo DSAdmin",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClientInfo DSAdmin");
  });

  test("GET /api/2.0/clients/{clientId}/info - RoomAdmin retrieves public info for their own client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClientInfo RoomAdmin",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClientInfo RoomAdmin");
  });

  test("GET /api/2.0/clients/{clientId}/info - User retrieves public info for their own client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");
    const signature = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      signature,
      "Autotest GetClientInfo User",
    );

    const sig2 = await getSignature(api);
    const { data, status } = await api.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": sig2 } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetClientInfo User");
  });

  test("GET /api/2.0/clients/{clientId}/info - Owner can retrieve public info for another user's client", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSig = await getSignature(userApi);
    const clientId = await createOAuthClient(
      userApi,
      userSig,
      "Autotest GetClientInfo Other User",
    );

    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const { data, status } = await ownerApi.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": ownerSig } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
  });
});

// GET /api/2.0/clients/consents returns the list of OAuth2 consents granted by the current user
// (i.e. which apps the user has authorized access to their account).
// Full testing requires a live consent obtained via the authorization code flow:
// browser redirect → user consent screen → POST submitConsent. That flow cannot be automated
// via API — see src/tests/oauth2.0/authorization/authorization.spec.ts.
// Tests below cover only cases that don't require a prior consent.
test.describe("GET /api/2.0/clients/consents", () => {
  test("GET /api/2.0/clients/consents - Returns empty list when user has no consents", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);

    const { data, status } = await api.clientQuerying.getConsents(
      { limit: 50 },
      { headers: { "x-signature": sig } },
    );

    const consents = (data as any).data as any[];
    expect(status).toBe(200);
    expect(Array.isArray(consents)).toBe(true);
    expect(consents).toHaveLength(0);
  });

  test("GET /api/2.0/clients/consents - Response includes pagination fields", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);

    const { data, status } = await api.clientQuerying.getConsents(
      { limit: 50 },
      { headers: { "x-signature": sig } },
    );

    expect(status).toBe(200);
    expect((data as any).limit).toBeDefined();
  });
});

test.describe("GET /api/2.0/clients/{clientId}/public/info", () => {
  test("GET /api/2.0/clients/{clientId}/public/info - Returns public info without client_secret", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      sig,
      "Autotest GetPublicClientInfo Fields",
    );

    const { data, status } = await api.clientQuerying.getPublicClientInfo({
      clientId,
    });

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
    expect(data.name).toBe("Autotest GetPublicClientInfo Fields");
    expect(data.website_url).toBe("https://example.com");
    expect(data.scopes).toContain("accounts.self:read");
    expect((data as any).client_secret).toBeUndefined();
  });

  test("GET /api/2.0/clients/{clientId}/public/info - Anonymous can retrieve public info", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const sig = await getSignature(api);
    const clientId = await createOAuthClient(
      api,
      sig,
      "Autotest GetPublicClientInfo Anonymous",
    );

    const { data, status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getPublicClientInfo({ clientId });

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
  });

  test("GET /api/2.0/clients/{clientId}/public/info - User can retrieve another user's public info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(
      ownerApi,
      ownerSig,
      "Autotest GetPublicClientInfo Other User",
    );

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");
    const userSig = await getSignature(userApi);

    const { data, status } = await userApi.clientQuerying.getPublicClientInfo(
      { clientId },
      { headers: { "x-signature": userSig } },
    );

    expect(status).toBe(200);
    expect(data.client_id).toBe(clientId);
  });
});
