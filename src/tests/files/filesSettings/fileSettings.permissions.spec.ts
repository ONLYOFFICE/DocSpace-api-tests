import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("PUT /api/2.0/files/settings/defaulttemplate - permissions", () => {
  test("BUG NNNNN: PUT /api/2.0/files/settings/defaulttemplate - DocSpaceAdmin cannot set Owner's file as default template", async ({
    apiSdk,
  }) => {
     const { data: fileData } = await apiSdk
      .forRole("owner")
      .files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Default Template File" },
      });
    const fileId = fileData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.setDefaultTemplate({
        defaultTemplateSettingsRequestDto: {
          selectedFile: fileId,
          fileExtension: null,
        },
      });

    expect(status).toBe(404);
    expect((data as any).error?.message).toBeDefined();
  });
});
