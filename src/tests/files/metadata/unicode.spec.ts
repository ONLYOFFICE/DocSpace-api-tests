import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { MetadataFieldType } from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";
import { getMyDocsFolderId } from "@/src/helpers/files";

/**
 * Diagnosis (see the audit notes): a character outside the Basic
 * Multilingual Plane survives the request and is echoed by the create/update
 * answer, but is stored as "?" (one "?" per code point). Every text that the
 * metadata API stores has the same behaviour. Characters inside the BMP are
 * stored intact.
 */
const ASTRAL = [
  ["emoji", "A \u{1F642} B"],
  ["regional-indicator flag", "\u{1F1E9}\u{1F1EA}"],
  ["mathematical script letter", "\u{1D4B3}"],
  ["CJK extension B ideograph", "\u{20BB7}"],
] as const;

test.describe("Metadata text - characters inside the BMP are stored intact", () => {
  test("POST /files/metadata/templates - Cyrillic, CJK, symbols and BMP emoji survive a round trip in names, options and values", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const text = "Привет 模板 ™ ✓ é ☃ ❤ ☺";
    const { data, status } = await api.metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name: `${apiSdk.faker.generateString(6)} ${text}`,
        fields: [
          { name: `f ${text}`, type: MetadataFieldType.String },
          {
            name: "c",
            type: MetadataFieldType.SingleChoice,
            options: [{ value: `o ${text}` }],
          },
        ],
      },
    });
    expect(status).toBe(200);

    const { data: got } = await api.metadata.getTemplate({
      templateId: data.response!.id!,
    });
    expect(got.response!.name).toContain(text);
    expect(got.response!.fields![0].name).toBe(`f ${text}`);
    expect(got.response!.fields![1].options![0].value).toBe(`o ${text}`);

    const folderId = await getMyDocsFolderId(api);
    const { data: file } = await api.files.createFile({
      folderId,
      createFileRequest: {
        title: `Autotest uni ${apiSdk.faker.generateString(6)}.docx`,
      },
    });
    const fileId = file.response!.id!;
    await api.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [data.response!.id!] },
    });
    await api.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [{ fieldId: got.response!.fields![0].id!, stringValue: text }],
      },
    });
    await api.metadata.setFileCustomFields({
      fileId,
      setCustomFields: { fields: [{ name: text, value: text }] },
    });

    const { data: meta } = await api.metadata.getFileMetadata({ fileId });
    expect(meta.response!.templates![0].fields![0].value!.stringValue).toBe(
      text,
    );
    expect(meta.response!.customFields).toEqual([{ name: text, value: text }]);
  });
});

test.describe("Metadata text - characters outside the BMP", () => {
  for (const [label, sample] of ASTRAL) {
    test.fail(
      `BUG XXXXX: POST /files/metadata/templates - ${label} in the template name is stored intact`,
      async ({ apiSdk }) => {
        const api = apiSdk.forRole("owner");
        const name = `${apiSdk.faker.generateString(6)} ${sample}`;
        const { data, status } = await api.metadata.createTemplate({
          createMetadataTemplateRequestDto: { name },
        });
        expect(status).toBe(200);
        // the create answer echoes the input ...
        expect(data.response!.name).toBe(name);
        // ... but the stored name differs
        const { data: got } = await api.metadata.getTemplate({
          templateId: data.response!.id!,
        });
        expect(got.response!.name).toBe(name);
      },
    );
  }

  test.fail(
    "BUG XXXXX: POST /files/metadata/templates/:id/fields - emoji in a field name and in an option value is stored intact",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");
      const { id } = await createTemplateWithFields(api, apiSdk, []);
      const { status } = await api.metadata.createField({
        templateId: id,
        metadataFieldRequest: {
          name: "field \u{1F642}",
          type: MetadataFieldType.SingleChoice,
          options: [{ value: "option \u{1F642}" }],
        },
      });
      expect(status).toBe(200);
      const { data } = await api.metadata.getTemplate({ templateId: id });
      expect(data.response!.fields![0].name).toBe("field \u{1F642}");
      expect(data.response!.fields![0].options![0].value).toBe(
        "option \u{1F642}",
      );
    },
  );

  test.fail(
    "BUG XXXXX: PUT /files/metadata/file/:id/values - emoji in a string value and in a custom field is stored intact",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");
      const { id, template } = await createTemplateWithFields(api, apiSdk);
      const folderId = await getMyDocsFolderId(api);
      const { data: file } = await api.files.createFile({
        folderId,
        createFileRequest: {
          title: `Autotest emo ${apiSdk.faker.generateString(6)}.docx`,
        },
      });
      const fileId = file.response!.id!;
      await api.metadata.assignFileTemplates({
        fileId,
        assignMetadataTemplates: { templateIds: [id] },
      });
      const text = "value \u{1F642}";

      await api.metadata.setFileValues({
        fileId,
        setMetadataValues: {
          values: [{ fieldId: template.fields![0].id!, stringValue: text }],
        },
      });
      await api.metadata.setFileCustomFields({
        fileId,
        setCustomFields: { fields: [{ name: "note", value: text }] },
      });

      const { data } = await api.metadata.getFileMetadata({ fileId });
      expect(data.response!.templates![0].fields![0].value!.stringValue).toBe(
        text,
      );
      expect(data.response!.customFields![0].value).toBe(text);
    },
  );
});
