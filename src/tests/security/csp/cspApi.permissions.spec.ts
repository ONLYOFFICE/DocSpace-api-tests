import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";

test.describe("POST /api/2.0/security/csp - permissions", () => {
  test("POST /api/2.0/security/csp - Anonymous cannot configure CSP", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().csp.configureCsp({
      cspRequestsDto: { domains: [faker.internet.url()] },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/security/csp - RoomAdmin cannot configure CSP", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .csp.configureCsp({
        cspRequestsDto: { domains: [faker.internet.url()] },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/csp - User cannot configure CSP", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk.forRole("user").csp.configureCsp({
      cspRequestsDto: { domains: [faker.internet.url()] },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/csp - Guest cannot configure CSP", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk.forRole("guest").csp.configureCsp({
      cspRequestsDto: { domains: [faker.internet.url()] },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
