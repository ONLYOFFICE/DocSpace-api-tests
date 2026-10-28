import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { MetadataFieldType } from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";

test.describe("POST /files/metadata/templates - Create template", () => {
  test("POST /files/metadata/templates - Owner creates a template with every field type and reads it back", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = `Autotest tpl ${apiSdk.faker.generateString(8)}`;

    const { data, status } = await ownerApi.metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name,
        visible: true,
        fields: [
          { name: "Title", type: MetadataFieldType.String },
          { name: "Due", type: MetadataFieldType.Date },
          { name: "Amount", type: MetadataFieldType.Number },
          {
            name: "Status",
            type: MetadataFieldType.SingleChoice,
            options: [{ value: "Open" }, { value: "Closed" }],
          },
          {
            name: "Tags",
            type: MetadataFieldType.MultiChoice,
            options: [{ value: "a" }, { value: "b" }],
          },
        ],
      },
    });

    expect(status).toBe(200);
    const created = data.response!;
    expect(created.id).toBeGreaterThan(0);
    expect(created.name).toBe(name);
    expect(created.visible).toBe(true);
    expect(created.fields).toHaveLength(5);

    const { data: got, status: getStatus } =
      await ownerApi.metadata.getTemplate({ templateId: created.id! });
    expect(getStatus).toBe(200);
    expect(got.response!.name).toBe(name);
    const byName = new Map(got.response!.fields!.map((f) => [f.name, f]));
    expect(byName.get("Due")!.type).toBe(MetadataFieldType.Date);
    expect(byName.get("Amount")!.type).toBe(MetadataFieldType.Number);
    const choice = byName.get("Status")!;
    expect(choice.options!.map((o) => o.value)).toEqual(["Open", "Closed"]);
    expect(choice.options!.every((o) => !!o.id)).toBe(true);
  });

  test("POST /files/metadata/templates - Created template appears once in getTemplates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);

    const { data, status } = await ownerApi.metadata.getTemplates({});
    expect(status).toBe(200);
    const ids = data.response!.map((t) => t.id);
    expect(ids.filter((i) => i === id)).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("POST /files/metadata/templates - Unicode, Cyrillic and special characters in the name are preserved", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const name of [
      "Шаблон договора",
      "模板 テンプレート",
      "A&B 'q' %20 ;",
    ]) {
      const { data, status } = await ownerApi.metadata.createTemplate({
        createMetadataTemplateRequestDto: { name },
      });
      expect(status, name).toBe(200);
      const { data: got } = await ownerApi.metadata.getTemplate({
        templateId: data.response!.id!,
      });
      expect(got.response!.name).toBe(name);
    }
  });

  test("POST /files/metadata/templates - Duplicate name is rejected case-insensitively and creates nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, name } = await createTemplateWithFields(ownerApi, apiSdk);

    const { status } = await ownerApi.metadata.createTemplate({
      createMetadataTemplateRequestDto: { name: name.toUpperCase() },
    });
    expect(status).toBe(400);

    const { data } = await ownerApi.metadata.getTemplates({});
    const same = data.response!.filter(
      (t) => t.name!.toLowerCase() === name.toLowerCase(),
    );
    expect(same.map((t) => t.id)).toEqual([id]);
  });

  test("POST /files/metadata/templates - Reserved name 'System' is rejected", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").metadata.createTemplate({
      createMetadataTemplateRequestDto: { name: "System" },
    });
    expect(status).toBe(400);
  });

  for (const [label, name] of [
    ["empty", ""],
    ["whitespace", "   "],
    ["null", null],
    ["over 255 chars", "x".repeat(256)],
  ] as const) {
    test(`POST /files/metadata/templates - Invalid name (${label}) is rejected and creates nothing`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: before } = await ownerApi.metadata.getTemplates({});

      const { status } = await ownerApi.metadata.createTemplate({
        createMetadataTemplateRequestDto: { name },
      });
      expect(status).toBe(400);

      const { data: after } = await ownerApi.metadata.getTemplates({});
      expect(after.response!.length).toBe(before.response!.length);
    });
  }

  test("POST /files/metadata/templates - Name of exactly 255 characters is accepted", async ({
    apiSdk,
  }) => {
    const name = "n".repeat(255);
    const { data, status } = await apiSdk
      .forRole("owner")
      .metadata.createTemplate({
        createMetadataTemplateRequestDto: { name },
      });
    expect(status).toBe(200);
    expect(data.response!.name).toBe(name);
  });

  test("POST /files/metadata/templates - A template with an invalid field is rejected atomically", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = `Autotest atomic ${apiSdk.faker.generateString(6)}`;

    const { status } = await ownerApi.metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name,
        fields: [
          { name: "ok", type: MetadataFieldType.String },
          // choice field without options
          { name: "bad", type: MetadataFieldType.SingleChoice },
        ],
      },
    });
    expect(status).toBe(400);

    const { data } = await ownerApi.metadata.getTemplates({});
    expect(data.response!.map((t) => t.name)).not.toContain(name);
  });

  test("POST /files/metadata/templates - Duplicate field names in one template are rejected", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name: `Autotest dupf ${apiSdk.faker.generateString(6)}`,
        fields: [
          { name: "Same", type: MetadataFieldType.String },
          { name: "same", type: MetadataFieldType.Number },
        ],
      },
    });
    expect(status).toBe(400);
  });

  test("POST /files/metadata/templates - A non-choice field with options is rejected", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name: `Autotest opt ${apiSdk.faker.generateString(6)}`,
        fields: [
          {
            name: "f",
            type: MetadataFieldType.String,
            options: [{ value: "x" }],
          },
        ],
      },
    });
    expect(status).toBe(400);
  });
});

test.describe("GET /files/metadata/templates - List and filter", () => {
  test("GET /files/metadata/templates - visible filter narrows the list to visible or hidden templates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: v } = await ownerApi.metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name: `Autotest vis ${apiSdk.faker.generateString(6)}`,
        visible: true,
      },
    });
    const { data: h } = await ownerApi.metadata.createTemplate({
      createMetadataTemplateRequestDto: {
        name: `Autotest hid ${apiSdk.faker.generateString(6)}`,
        visible: false,
      },
    });
    const visibleId = v.response!.id!;
    const hiddenId = h.response!.id!;

    const { data: onlyVisible } = await ownerApi.metadata.getTemplates({
      visible: true,
    });
    const { data: onlyHidden } = await ownerApi.metadata.getTemplates({
      visible: false,
    });
    const { data: all } = await ownerApi.metadata.getTemplates({});

    const ids = (d: typeof all) => d.response!.map((t) => t.id);
    expect(ids(onlyVisible)).toContain(visibleId);
    expect(ids(onlyVisible)).not.toContain(hiddenId);
    expect(ids(onlyHidden)).toContain(hiddenId);
    expect(ids(onlyHidden)).not.toContain(visibleId);
    expect(ids(all)).toEqual(expect.arrayContaining([visibleId, hiddenId]));
  });

  test("GET /files/metadata/templates - Templates come back in creation order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const a = await createTemplateWithFields(ownerApi, apiSdk);
    const b = await createTemplateWithFields(ownerApi, apiSdk);

    const { data } = await ownerApi.metadata.getTemplates({});
    const ids = data.response!.map((t) => t.id!);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });
});

test.describe("GET /files/metadata/templates/:id - Get template", () => {
  for (const [label, id] of [
    ["non-existent", 99999999],
    ["zero", 0],
    ["negative", -1],
  ] as const) {
    test(`GET /files/metadata/templates/:id - Returns 404 for a ${label} template ID`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.forRole("owner").metadata.getTemplate({
        templateId: id,
      });
      expect(status).toBe(404);
    });
  }
});

test.describe("PUT /files/metadata/templates/:id - Update template", () => {
  test("PUT /files/metadata/templates/:id - Renames and hides a template, fields untouched", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "A" },
      { name: "B", type: MetadataFieldType.Number },
    ]);
    const newName = `Autotest renamed ${apiSdk.faker.generateString(6)}`;

    const { data, status } = await ownerApi.metadata.updateTemplate({
      templateId: id,
      updateMetadataTemplate: { name: newName, visible: false },
    });
    expect(status).toBe(200);
    expect(data.response!.name).toBe(newName);

    const { data: got } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    expect(got.response!.name).toBe(newName);
    expect(got.response!.visible).toBe(false);
    expect(got.response!.fields!.map((f) => f.id)).toEqual(
      template.fields!.map((f) => f.id),
    );

    const { data: list } = await ownerApi.metadata.getTemplates({});
    expect(list.response!.find((t) => t.id === id)!.name).toBe(newName);
  });

  test("PUT /files/metadata/templates/:id - Partial update keeps the omitted properties", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, name } = await createTemplateWithFields(ownerApi, apiSdk);

    const { status } = await ownerApi.metadata.updateTemplate({
      templateId: id,
      updateMetadataTemplate: { visible: false },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.name).toBe(name);
  });

  test("PUT /files/metadata/templates/:id - Renaming to a taken name is rejected and keeps the old name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const a = await createTemplateWithFields(ownerApi, apiSdk);
    const b = await createTemplateWithFields(ownerApi, apiSdk);

    const { status } = await ownerApi.metadata.updateTemplate({
      templateId: b.id,
      updateMetadataTemplate: { name: a.name.toLowerCase() },
    });
    expect(status).toBe(400);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: b.id });
    expect(data.response!.name).toBe(b.name);
  });

  test("PUT /files/metadata/templates/:id - Renaming a template to its own name is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, name } = await createTemplateWithFields(ownerApi, apiSdk);
    const { status } = await ownerApi.metadata.updateTemplate({
      templateId: id,
      updateMetadataTemplate: { name },
    });
    expect(status).toBe(200);
  });

  test("PUT /files/metadata/templates/:id - Over-long name is rejected and keeps the old name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, name } = await createTemplateWithFields(ownerApi, apiSdk);
    const { status } = await ownerApi.metadata.updateTemplate({
      templateId: id,
      updateMetadataTemplate: { name: "x".repeat(256) },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.name).toBe(name);
  });

  test("PUT /files/metadata/templates/:id - Returns 404 for a non-existent template", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").metadata.updateTemplate({
      templateId: 99999999,
      updateMetadataTemplate: { name: "x" },
    });
    expect(status).toBe(404);
  });
});

test.describe("DELETE /files/metadata/templates/:id - Delete template", () => {
  test("DELETE /files/metadata/templates/:id - Deleted template is gone from getTemplate and getTemplates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);

    const { status } = await ownerApi.metadata.deleteTemplate({
      templateId: id,
    });
    expect(status).toBe(200);

    const { status: getStatus } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    expect(getStatus).toBe(404);
    const { data } = await ownerApi.metadata.getTemplates({});
    expect(data.response!.map((t) => t.id)).not.toContain(id);
  });

  test("DELETE /files/metadata/templates/:id - Repeated delete returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.deleteTemplate({ templateId: id });
    const { status } = await ownerApi.metadata.deleteTemplate({
      templateId: id,
    });
    expect(status).toBe(404);
  });

  test("DELETE /files/metadata/templates/:id - Deleting a non-existent template returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").metadata.deleteTemplate({
      templateId: 99999999,
    });
    expect(status).toBe(404);
  });
});
