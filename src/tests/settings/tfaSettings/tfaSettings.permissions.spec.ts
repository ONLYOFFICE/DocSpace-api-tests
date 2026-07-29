import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";

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
