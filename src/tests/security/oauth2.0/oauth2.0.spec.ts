import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

function assertJwtToken(data: { response?: string | null }) {
  expect(typeof data.response).toBe("string");
  const parts = data.response!.split(".");
  expect(parts.length).toBe(3);
  expect(data.response).toMatch(/^eyJ/);
}

test.describe("GET /api/2.0/security/oauth2/token", () => {
  test("GET /api/2.0/security/oauth2/token - Owner generates JWT token", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .oauth2.generateJwtToken();

    expect(status).toBe(200);
    assertJwtToken(data);
  });

  test("GET /api/2.0/security/oauth2/token - DocSpaceAdmin generates JWT token", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .oauth2.generateJwtToken();

    expect(status).toBe(200);
    assertJwtToken(data);
  });

  test("GET /api/2.0/security/oauth2/token - RoomAdmin generates JWT token", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .oauth2.generateJwtToken();

    expect(status).toBe(200);
    assertJwtToken(data);
  });

  test("GET /api/2.0/security/oauth2/token - User generates JWT token", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .oauth2.generateJwtToken();

    expect(status).toBe(200);
    assertJwtToken(data);
  });

  test("GET /api/2.0/security/oauth2/token - Guest generates JWT token", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .oauth2.generateJwtToken();

    expect(status).toBe(200);
    assertJwtToken(data);
  });
});
