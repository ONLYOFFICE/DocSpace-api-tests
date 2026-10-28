import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  MetadataFieldRequest,
  MetadataFieldType,
} from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";

test.describe("POST /files/metadata/templates/:id/fields - Create field", () => {
  test("POST /files/metadata/templates/:id/fields - Creates a field of every type and reads it back", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk, []);

    const cases = [
      { name: "s", type: MetadataFieldType.String },
      { name: "d", type: MetadataFieldType.Date },
      { name: "n", type: MetadataFieldType.Number },
      {
        name: "sc",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "one" }, { value: "two" }],
      },
      {
        name: "mc",
        type: MetadataFieldType.MultiChoice,
        options: [{ value: "x" }],
      },
    ];
    for (const metadataFieldRequest of cases) {
      const { data, status } = await ownerApi.metadata.createField({
        templateId: id,
        metadataFieldRequest,
      });
      expect(status, metadataFieldRequest.name).toBe(200);
      expect(data.response!.id).toBeGreaterThan(0);
      expect(data.response!.templateId).toBe(id);
      expect(data.response!.type).toBe(metadataFieldRequest.type);
    }

    const { data: got } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    expect(got.response!.fields!.map((f) => f.name)).toEqual(
      cases.map((c) => c.name),
    );
    const sc = got.response!.fields!.find((f) => f.name === "sc")!;
    expect(sc.options!.map((o) => o.value)).toEqual(["one", "two"]);
    expect(sc.options!.every((o) => !!o.id)).toBe(true);
  });

  test("POST /files/metadata/templates/:id/fields - A field without order is placed after the last one; explicit order is respected", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "first" },
    ]);
    await ownerApi.metadata.createField({
      templateId: id,
      metadataFieldRequest: { name: "last", type: MetadataFieldType.String },
    });
    await ownerApi.metadata.createField({
      templateId: id,
      metadataFieldRequest: {
        name: "top",
        type: MetadataFieldType.String,
        order: -10,
      },
    });

    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields!.map((f) => f.name)).toEqual([
      "top",
      "first",
      "last",
    ]);
  });

  test("POST /files/metadata/templates/:id/fields - Duplicate name (case-insensitive) is rejected and adds nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "Name" },
    ]);
    const { status } = await ownerApi.metadata.createField({
      templateId: id,
      metadataFieldRequest: { name: "NAME", type: MetadataFieldType.Number },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields).toHaveLength(1);
  });

  const invalidFields: Array<[string, MetadataFieldRequest]> = [
    ["empty name", { name: "", type: MetadataFieldType.String }],
    ["whitespace name", { name: "  ", type: MetadataFieldType.String }],
    [
      "over-long name",
      { name: "x".repeat(256), type: MetadataFieldType.String },
    ],
    [
      "choice field without options",
      { name: "c", type: MetadataFieldType.SingleChoice },
    ],
    [
      "choice field with duplicate options",
      {
        name: "c",
        type: MetadataFieldType.MultiChoice,
        options: [{ value: "a" }, { value: "a" }],
      },
    ],
    [
      "options on a number field",
      {
        name: "n",
        type: MetadataFieldType.Number,
        options: [{ value: "a" }],
      },
    ],
    ["unknown type", { name: "u", type: 99 as MetadataFieldType }],
  ];
  for (const [label, request] of invalidFields) {
    test(`POST /files/metadata/templates/:id/fields - Invalid field (${label}) is rejected and adds nothing`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { id } = await createTemplateWithFields(ownerApi, apiSdk, []);

      const { status } = await ownerApi.metadata.createField({
        templateId: id,
        metadataFieldRequest: request,
      });
      expect(status).toBe(400);

      const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
      expect(data.response!.fields).toHaveLength(0);
    });
  }

  test("POST /files/metadata/templates/:id/fields - Returns 404 for a non-existent template", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").metadata.createField({
      templateId: 99999999,
      metadataFieldRequest: { name: "x", type: MetadataFieldType.String },
    });
    expect(status).toBe(404);
  });
});

test.describe("PUT /files/metadata/templates/:id/fields/:fieldId - Update field", () => {
  test("PUT /files/metadata/templates/:id/fields/:fieldId - Renames a field and keeps type and order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "Old", type: MetadataFieldType.Number },
    ]);
    const field = template.fields![0];

    const { data, status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: field.id!,
      updateMetadataFieldRequest: { name: "New" },
    });
    expect(status).toBe(200);
    expect(data.response!.name).toBe("New");

    const { data: got } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    const after = got.response!.fields![0];
    expect(after.id).toBe(field.id);
    expect(after.name).toBe("New");
    expect(after.type).toBe(MetadataFieldType.Number);
    expect(after.order).toBe(field.order);
  });

  test("PUT /files/metadata/templates/:id/fields/:fieldId - Type can change while the field has no values", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);

    const { status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: template.fields![0].id!,
      updateMetadataFieldRequest: { type: MetadataFieldType.Date },
    });
    expect(status).toBe(200);
    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields![0].type).toBe(MetadataFieldType.Date);
  });

  test("PUT /files/metadata/templates/:id/fields/:fieldId - Renaming to a sibling's name is rejected", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "A" },
      { name: "B" },
    ]);
    const b = template.fields!.find((f) => f.name === "B")!;

    const { status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: b.id!,
      updateMetadataFieldRequest: { name: "a" },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields!.map((f) => f.name).sort()).toEqual([
      "A",
      "B",
    ]);
  });

  test("PUT /files/metadata/templates/:id/fields/:fieldId - A field reached through another template's route returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const a = await createTemplateWithFields(ownerApi, apiSdk, [{ name: "A" }]);
    const b = await createTemplateWithFields(ownerApi, apiSdk, [{ name: "B" }]);

    const { status } = await ownerApi.metadata.updateField({
      templateId: b.id,
      fieldId: a.template.fields![0].id!,
      updateMetadataFieldRequest: { name: "hijack" },
    });
    expect(status).toBe(404);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: a.id });
    expect(data.response!.fields![0].name).toBe("A");
  });

  test("PUT /files/metadata/templates/:id/fields/:fieldId - Returns 404 for a non-existent field", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    const { status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: 99999999,
      updateMetadataFieldRequest: { name: "x" },
    });
    expect(status).toBe(404);
  });
});

test.describe("DELETE /files/metadata/templates/:id/fields/:fieldId - Delete field", () => {
  test("DELETE /files/metadata/templates/:id/fields/:fieldId - Removes only the requested field", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ]);
    const b = template.fields!.find((f) => f.name === "B")!;

    const { status } = await ownerApi.metadata.deleteField({
      templateId: id,
      fieldId: b.id!,
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields!.map((f) => f.name)).toEqual(["A", "C"]);
  });

  test("DELETE /files/metadata/templates/:id/fields/:fieldId - Repeated delete and foreign-template field return 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const a = await createTemplateWithFields(ownerApi, apiSdk, [{ name: "A" }]);
    const b = await createTemplateWithFields(ownerApi, apiSdk, [{ name: "B" }]);
    const aField = a.template.fields![0].id!;

    const { status: foreign } = await ownerApi.metadata.deleteField({
      templateId: b.id,
      fieldId: aField,
    });
    expect(foreign).toBe(404);
    const { data: still } = await ownerApi.metadata.getTemplate({
      templateId: a.id,
    });
    expect(still.response!.fields).toHaveLength(1);

    expect(
      (
        await ownerApi.metadata.deleteField({
          templateId: a.id,
          fieldId: aField,
        })
      ).status,
    ).toBe(200);
    const { status: again } = await ownerApi.metadata.deleteField({
      templateId: a.id,
      fieldId: aField,
    });
    expect(again).toBe(404);
  });
});
