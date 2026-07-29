import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /api/2.0/settings/tfaapp - Owner updates TFA settings", () => {
  test("PUT /api/2.0/settings/tfaapp - Owner enables TFA App", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/settings/tfaapp - Owner disables TFA", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.None },
      });

    expect(status).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });
});

test.describe("PUT /api/2.0/settings/tfaapp - DocSpaceAdmin updates TFA settings", () => {
  test("PUT /api/2.0/settings/tfaapp - DocSpaceAdmin enables TFA App", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/settings/tfaapp - DocSpaceAdmin disables TFA", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.None },
      });

    expect(status).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });
});
