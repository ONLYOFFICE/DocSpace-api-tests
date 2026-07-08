import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  s3AuthServiceDto,
  invalidMysqlSettings,
} from "@/src/helpers/auth-services";

// TODO: add tests for other auth services (Box, Dropbox, Google Drive, OneDrive, etc.)

// TODO: add positive test for testExternalDatabaseConnection (success: true) —
// requires a real MySQL/SQLite instance accessible from the portal host.
test.describe("POST /api/2.0/settings/authservice/externaldb/test", () => {
  test("POST /api/2.0/settings/authservice/externaldb/test - Owner tests connection with invalid credentials returns success: false", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsAuthorization.testExternalDatabaseConnection({
        externalDatabaseSettings: invalidMysqlSettings,
      });

    expect(status).toBe(200);
    expect(data.response?.success).toBe(false);
    expect(typeof data.response?.error).toBe("string");
    expect(data.response!.error!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/settings/authservice/externaldb/test - DocSpaceAdmin tests connection with invalid credentials returns success: false", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsAuthorization.testExternalDatabaseConnection({
        externalDatabaseSettings: invalidMysqlSettings,
      });

    expect(status).toBe(200);
    expect(data.response?.success).toBe(false);
    expect(typeof data.response?.error).toBe("string");
    expect(data.response!.error!.length).toBeGreaterThan(0);
  });
});

test.describe("GET /api/2.0/settings/authservice", () => {
  test("GET /api/2.0/settings/authservice - Owner gets auth services after saving S3 keys", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    await apiSdk.forRole("owner").settingsAuthorization.saveAuthKeys({
      authServiceRequestsDto: s3AuthServiceDto,
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsAuthorization.getAuthServices();

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);

    const service = data.response![0];
    expect(typeof service.name).toBe("string");
    expect(typeof service.title).toBe("string");
    expect(typeof service.canSet).toBe("boolean");
    expect(typeof service.paid).toBe("boolean");

    const serviceNames = data.response!.map((s) => s.name);
    for (const name of [
      "s3",
      "dropbox",
      "box",
      "google",
      "googlecloud",
      "telegram",
    ]) {
      expect(serviceNames).toContain(name);
    }

    const s3Service = data.response!.find((s) => s.name === "s3");
    const accessKey = s3Service!.props!.find((p) => p.name === "acesskey");
    expect(accessKey!.value).toBe(s3AuthServiceDto.props[0].value);
  });

  test("GET /api/2.0/settings/authservice - DocSpaceAdmin gets auth services after saving S3 keys", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk.forRole("owner").settingsAuthorization.saveAuthKeys({
      authServiceRequestsDto: s3AuthServiceDto,
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsAuthorization.getAuthServices();

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);

    const serviceNames = data.response!.map((s) => s.name);
    for (const name of [
      "s3",
      "dropbox",
      "box",
      "google",
      "googlecloud",
      "telegram",
    ]) {
      expect(serviceNames).toContain(name);
    }

    const s3Service = data.response!.find((s) => s.name === "s3");
    const accessKey = s3Service!.props!.find((p) => p.name === "acesskey");
    expect(accessKey!.value).toBe(s3AuthServiceDto.props[0].value);
  });
});

test.describe("POST /api/2.0/settings/authservice", () => {
  test("POST /api/2.0/settings/authservice - Owner saves S3 auth keys", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: s3AuthServiceDto,
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("POST /api/2.0/settings/authservice - DocSpaceAdmin saves S3 auth keys", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: s3AuthServiceDto,
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });
});
