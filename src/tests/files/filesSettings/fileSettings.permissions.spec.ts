import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("PUT /api/2.0/files/settings/defaulttemplate - permissions", () => {
  test("BUG 81953: PUT /api/2.0/files/settings/defaulttemplate - DocSpaceAdmin cannot set Owner's file as default template", async ({
    apiSdk,
  }) => {
    const { data: fileData } = await apiSdk
      .forRole("owner")
      .files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Default Template File.docx" },
      });
    const fileId = fileData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.setDefaultTemplate({
        defaultTemplateSettingsRequestDto: {
          selectedFile: fileId,
          fileExtension: ".docx",
        },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });
});
