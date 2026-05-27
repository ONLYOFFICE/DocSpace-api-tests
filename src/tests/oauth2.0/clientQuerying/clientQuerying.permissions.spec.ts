import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { getSignature, createOAuthClient } from "@/src/helpers/oauth";

test.describe("GET /api/2.0/clients/{clientId} - permissions", () => {
  test("GET /api/2.0/clients/{clientId} - Anonymous returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(ownerApi, sig);

    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getClient({ clientId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients/{clientId} - Guest returns 403", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const ownerApi = apiSdk.forRole("owner");
    const sig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(ownerApi, sig);

    const guestApi = apiSdk.forRole("guest");
    const guestSig = await getSignature(guestApi);
    const { status } = await guestApi.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": guestSig } },
    );

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients/{clientId} - Non-existent clientId returns 404", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { status } = await api.clientQuerying.getClient(
      { clientId: "00000000-0000-0000-0000-000000000000" },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(404);
  });

  test("GET /api/2.0/clients/{clientId} - User cannot retrieve another user's client returns 404", async ({
    apiSdk,
  }) => {
    const { data: user1Data, userData: user1Credentials } =
      await apiSdk.addMember("owner", "User");
    void user1Data;
    const { data: user2Data, userData: user2Credentials } =
      await apiSdk.addMember("owner", "User");
    void user2Data;

    const user1Api = await apiSdk.authenticateMember(user1Credentials, "User");
    const user1Sig = await getSignature(user1Api);
    const clientId = await createOAuthClient(user1Api, user1Sig);

    const user2Api = await apiSdk.authenticateMember(user2Credentials, "User");
    const user2Sig = await getSignature(user2Api);
    const { status } = await user2Api.clientQuerying.getClient(
      { clientId },
      { headers: { "x-signature": user2Sig } },
    );

    expect(status).toBe(404);
  });
});

test.describe("GET /api/2.0/clients/{clientId}/info - permissions", () => {
  test("GET /api/2.0/clients/{clientId}/info - Anonymous returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(ownerApi, sig);

    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getClientInfo({ clientId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients/{clientId}/info - Guest returns 403", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const ownerApi = apiSdk.forRole("owner");
    const sig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(ownerApi, sig);

    const guestApi = apiSdk.forRole("guest");
    const guestSig = await getSignature(guestApi);
    const { status } = await guestApi.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": guestSig } },
    );

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients/{clientId}/info - Non-existent clientId returns 404", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const signature = await getSignature(api);

    const { status } = await api.clientQuerying.getClientInfo(
      { clientId: "00000000-0000-0000-0000-000000000000" },
      { headers: { "x-signature": signature } },
    );

    expect(status).toBe(404);
  });

  test("GET /api/2.0/clients/{clientId}/info - User cannot retrieve info for another user's client returns 404", async ({
    apiSdk,
  }) => {
    const { data: user1Data, userData: user1Credentials } =
      await apiSdk.addMember("owner", "User");
    void user1Data;
    const { data: user2Data, userData: user2Credentials } =
      await apiSdk.addMember("owner", "User");
    void user2Data;

    const user1Api = await apiSdk.authenticateMember(user1Credentials, "User");
    const user1Sig = await getSignature(user1Api);
    const clientId = await createOAuthClient(user1Api, user1Sig);

    const user2Api = await apiSdk.authenticateMember(user2Credentials, "User");
    const user2Sig = await getSignature(user2Api);
    const { status } = await user2Api.clientQuerying.getClientInfo(
      { clientId },
      { headers: { "x-signature": user2Sig } },
    );

    expect(status).toBe(404);
  });
});

test.describe("GET /api/2.0/clients - permissions", () => {
  test("GET /api/2.0/clients - Anonymous returns 403", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getClients({ limit: 50 });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients - Guest returns 403", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const guestApi = apiSdk.forRole("guest");
    const guestSig = await getSignature(guestApi);
    const { status } = await guestApi.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": guestSig } },
    );

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients - RoomAdmin sees only their own clients", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const ownerClientId = await createOAuthClient(ownerApi, ownerSig);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const roomAdminSig = await getSignature(roomAdminApi);

    const { data, status } = await roomAdminApi.clientQuerying.getClients(
      { limit: 50 },
      { headers: { "x-signature": roomAdminSig } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).not.toContain(ownerClientId);
  });
});

test.describe("GET /api/2.0/clients/info - permissions", () => {
  test("GET /api/2.0/clients/info - Anonymous returns 403", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getClientsInfo({ limit: 50 });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients/info - Guest returns 403", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const guestApi = apiSdk.forRole("guest");
    const guestSig = await getSignature(guestApi);
    const { status } = await guestApi.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": guestSig } },
    );

    expect(status).toBe(403);
  });

  test("GET /api/2.0/clients/info - RoomAdmin sees only their own clients info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerSig = await getSignature(ownerApi);
    const ownerClientId = await createOAuthClient(ownerApi, ownerSig);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const roomAdminSig = await getSignature(roomAdminApi);

    const { data, status } = await roomAdminApi.clientQuerying.getClientsInfo(
      { limit: 50 },
      { headers: { "x-signature": roomAdminSig } },
    );

    const ids = ((data as any).data as any[]).map((c: any) => c.client_id);
    expect(status).toBe(200);
    expect(ids).not.toContain(ownerClientId);
  });
});

test.describe("GET /api/2.0/clients/consents - permissions", () => {
  test("GET /api/2.0/clients/consents - Anonymous returns 403", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getConsents({ limit: 50 });

    expect(status).toBe(403);
  });
});

// GET /api/2.0/clients/{clientId}/public/info is intentionally open — no auth required.
// It is used by the OAuth2 consent screen to show the app name, logo, and scopes to the user.
test.describe("GET /api/2.0/clients/{clientId}/public/info - permissions", () => {
  test("GET /api/2.0/clients/{clientId}/public/info - Anonymous can access public info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(ownerApi, sig);

    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getPublicClientInfo({ clientId });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/clients/{clientId}/public/info - Guest can access public info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sig = await getSignature(ownerApi);
    const clientId = await createOAuthClient(ownerApi, sig);

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { status } = await guestApi.clientQuerying.getPublicClientInfo({
      clientId,
    });

    expect(status).toBe(200);
  });

  test("BUG 81728: GET /api/2.0/clients/{clientId}/public/info - Non-existent clientId returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .clientQuerying.getPublicClientInfo({
        clientId: "00000000-0000-0000-0000-000000000000",
      });

    expect(status).toBe(404);
  });
});
