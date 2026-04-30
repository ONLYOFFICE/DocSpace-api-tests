import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";

// The following endpoints cannot be automated without email interception infrastructure (e.g. Mailhog/Mailpit):
//
// PUT  /api/2.0/portal/suspend  (suspendPortal)  — deactivates the portal using a confirmation token from the email
// PUT  /api/2.0/portal/continue (continuePortal) — resumes a suspended portal using a confirmation token from the email
// DELETE /api/2.0/portal/delete (deletePortal)   — deletes the portal using a confirmation token from the email
//
// The flow requires two steps:
//   1. POST /api/2.0/portal/suspend|delete — sends an email with a confirmation link containing a one-time token
//   2. PUT|DELETE — called with that token (extracted from the link in the email)
// Without access to the mailbox, the token cannot be retrieved and these endpoints always return 403.

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const EMPTY_DATE = "0001-01-01T00:00:00";

test.describe("GET /api/2.0/portal", () => {
  test("GET /api/2.0/portal - Owner gets full portal information", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .portalSettings.getPortalInformation();

    expect(status).toBe(200);

    const portal = data.response!;
    expect(portal.tenantId).toBeDefined();
    expect(portal.tenantAlias).toBeDefined();
    expect(portal.ownerId).not.toBe(EMPTY_UUID);
    expect(portal.language).toBeDefined();
    expect(portal.timeZone).toBeDefined();
    expect(portal.region).toBeDefined();
    expect(portal.creationDateTime).not.toBe(EMPTY_DATE);
    expect(portal.lastModified).not.toBe(EMPTY_DATE);
  });

  test("GET /api/2.0/portal - DocSpaceAdmin gets full portal information", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .portalSettings.getPortalInformation();

    expect(status).toBe(200);

    const portal = data.response!;
    expect(portal.tenantId).toBeDefined();
    expect(portal.tenantAlias).toBeDefined();
    expect(portal.ownerId).not.toBe(EMPTY_UUID);
    expect(portal.language).toBeDefined();
    expect(portal.timeZone).toBeDefined();
    expect(portal.region).toBeDefined();
    expect(portal.creationDateTime).not.toBe(EMPTY_DATE);
    expect(portal.lastModified).not.toBe(EMPTY_DATE);
  });

  test("GET /api/2.0/portal - RoomAdmin gets limited portal information", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .portalSettings.getPortalInformation();

    expect(status).toBe(200);

    const portal = data.response!;
    expect(portal.tenantId).toBeDefined();
    expect(portal.calls).toBe(false);
    expect(portal.ownerId).toBe(EMPTY_UUID);
    expect(portal.creationDateTime).toBe(EMPTY_DATE);
    expect(portal.lastModified).toBe(EMPTY_DATE);
  });

  test("GET /api/2.0/portal - User gets limited portal information", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .portalSettings.getPortalInformation();

    expect(status).toBe(200);

    const portal = data.response!;
    expect(portal.tenantId).toBeDefined();
    expect(portal.calls).toBe(false);
    expect(portal.ownerId).toBe(EMPTY_UUID);
    expect(portal.creationDateTime).toBe(EMPTY_DATE);
    expect(portal.lastModified).toBe(EMPTY_DATE);
  });

  test("GET /api/2.0/portal - Guest gets limited portal information", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .portalSettings.getPortalInformation();

    expect(status).toBe(200);

    const portal = data.response!;
    expect(portal.tenantId).toBeDefined();
    expect(portal.calls).toBe(false);
    expect(portal.ownerId).toBe(EMPTY_UUID);
    expect(portal.creationDateTime).toBe(EMPTY_DATE);
    expect(portal.lastModified).toBe(EMPTY_DATE);
  });
});

test.describe("POST /api/2.0/portal/suspend", () => {
  test("POST /api/2.0/portal/suspend - Owner sends suspension instructions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .portalSettings.sendSuspendInstructions();

    expect(status).toBe(200);
  });
});

test.describe("GET /api/2.0/portal/path", () => {
  test("GET /api/2.0/portal/path - Owner gets full URL with virtualPath", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .portalSettings.getPortalPath({ virtualPath: "/rooms" });

    expect(status).toBe(200);
    expect(data.response).toMatch(/^https?:\/\/.+\/rooms$/);
  });

  test("GET /api/2.0/portal/path - Owner gets base portal URL without virtualPath", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .portalSettings.getPortalPath({});

    expect(status).toBe(200);
    expect(data.response).toMatch(/^https?:\/\/.+/);
  });

  test("GET /api/2.0/portal/path - DocSpaceAdmin can get portal path", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .portalSettings.getPortalPath({});

    expect(status).toBe(200);
  });

  test("GET /api/2.0/portal/path - RoomAdmin can get portal path", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .portalSettings.getPortalPath({});

    expect(status).toBe(200);
  });

  test("GET /api/2.0/portal/path - User can get portal path", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .portalSettings.getPortalPath({});

    expect(status).toBe(200);
  });

  test("GET /api/2.0/portal/path - Guest can get portal path", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .portalSettings.getPortalPath({});

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/portal/delete", () => {
  test("POST /api/2.0/portal/delete - Owner sends deletion instructions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .portalSettings.sendDeleteInstructions();

    expect(status).toBe(200);
  });
});
