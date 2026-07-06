import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";

test.describe("POST /api/2.0/security/csp", () => {
  test("POST /api/2.0/security/csp - Owner configures CSP domains", async ({
    apiSdk,
  }) => {
    const domain = faker.internet.url();

    const { data, status } = await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });

  test("POST /api/2.0/security/csp - DocSpaceAdmin configures CSP domains", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const domain = faker.internet.url();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .csp.configureCsp({
        cspRequestsDto: { domains: [domain] },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });
});

test.describe("GET /api/2.0/security/csp", () => {
  test("GET /api/2.0/security/csp - Owner gets CSP settings", async ({
    apiSdk,
  }) => {
    const domain = faker.internet.url();
    await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    const { data, status } = await apiSdk.forRole("owner").csp.getCspSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });

  test("GET /api/2.0/security/csp - DocSpaceAdmin gets CSP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const domain = faker.internet.url();
    await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .csp.getCspSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });

  test("GET /api/2.0/security/csp - RoomAdmin gets CSP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const domain = faker.internet.url();
    await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .csp.getCspSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });

  test("GET /api/2.0/security/csp - User gets CSP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const domain = faker.internet.url();
    await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    const { data, status } = await apiSdk.forRole("user").csp.getCspSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });

  test("GET /api/2.0/security/csp - Guest gets CSP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const domain = faker.internet.url();
    await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    const { data, status } = await apiSdk.forRole("guest").csp.getCspSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });

  test("GET /api/2.0/security/csp - Anonymous gets CSP settings", async ({
    apiSdk,
  }) => {
    const domain = faker.internet.url();
    await apiSdk.forRole("owner").csp.configureCsp({
      cspRequestsDto: { domains: [domain] },
    });

    const { data, status } = await apiSdk.forAnonymous().csp.getCspSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.domains)).toBe(true);
    expect(data.response?.domains).toContain(domain);
    expect(typeof data.response?.header).toBe("string");
  });
});
