import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";
import { linkTfaApp } from "@/src/helpers/tfa";

test.describe("PUT /api/2.0/settings/tfaapp - access control", () => {
  test("PUT /api/2.0/settings/tfaapp - Anonymous cannot update TFA settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/tfaapp - RoomAdmin cannot update TFA settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/tfaapp - User cannot update TFA settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/tfaapp - Guest cannot update TFA settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/tfaapp - access control", () => {
  test("GET /api/2.0/settings/tfaapp - Anonymous cannot get TFA settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().tfaSettings.getTfaSettings();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/settings/tfaappwithlink - access control", () => {
  test("PUT /api/2.0/settings/tfaappwithlink - Anonymous cannot update TFA settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.updateTfaSettingsLink({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/tfaappwithlink - RoomAdmin cannot update TFA settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .tfaSettings.updateTfaSettingsLink({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/tfaappwithlink - User cannot update TFA settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .tfaSettings.updateTfaSettingsLink({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/tfaappwithlink - Guest cannot update TFA settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .tfaSettings.updateTfaSettingsLink({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/tfaapp/setup - access control", () => {
  test("GET /api/2.0/settings/tfaapp/setup - Anonymous cannot generate a setup code", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.tfaAppGenerateSetupCode();

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/settings/tfaapp/validate - access control", () => {
  test("POST /api/2.0/settings/tfaapp/validate - Anonymous cannot validate a TFA code", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.tfaValidateAuthCode({
        tfaValidateRequestsDto: { code: "000000" },
      });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/tfaapp/confirm - access control", () => {
  test("GET /api/2.0/settings/tfaapp/confirm - Anonymous cannot get confirmation data", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.getTfaConfirmData();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/tfaappcodes - access control", () => {
  test("GET /api/2.0/settings/tfaappcodes - Anonymous cannot get backup codes", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().tfaSettings.getTfaAppCodes();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/settings/tfaappnewcodes - access control", () => {
  test("PUT /api/2.0/settings/tfaappnewcodes - Anonymous cannot regenerate backup codes", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.updateTfaAppCodes();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/settings/tfaappnewapp - access control", () => {
  test("PUT /api/2.0/settings/tfaappnewapp - Anonymous cannot unlink a TFA app", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .tfaSettings.unlinkTfaApp({ tfaRequestsDto: {} });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/tfaappnewapp - RoomAdmin cannot unlink another user's TFA app", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    // The target doesn't need to actually have TFA linked - a permission
    // check should reject the caller before any target-state business logic
    // runs. Skipping it also keeps this test under DocSpace's brute-force
    // login-attempt threshold (each linkTfaApp call makes 2 login requests).
    const target = await apiSdk.addMember("owner", "User");
    const targetId = target.data.response!.id!;

    const roomAdmin = await apiSdk.addMember("owner", "RoomAdmin");
    await linkTfaApp(apiSdk, "roomAdmin", {
      userName: roomAdmin.userData.email,
      password: roomAdmin.userData.password,
    });

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .tfaSettings.unlinkTfaApp({ tfaRequestsDto: { id: targetId } });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "No permissions to perform this action",
    );
  });
});
