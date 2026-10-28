import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { MetadataFieldType } from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";
import { getMyDocsFolderId } from "@/src/helpers/files";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

async function createDoc(api: Api, apiSdk: ApiSDK): Promise<number> {
  const folderId = await getMyDocsFolderId(api);
  const { data, status } = await api.files.createFile({
    folderId,
    createFileRequest: {
      title: `Autotest meta ${apiSdk.faker.generateString(6)}.docx`,
    },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

const fieldValue = (
  meta: { templates?: Array<{ id?: number; fields?: any[] | null }> | null },
  templateId: number,
  fieldId: number,
) =>
  meta
    .templates!.find((t) => t.id === templateId)!
    .fields!.find((f) => f.id === fieldId)!.value;

test.describe("PUT /files/metadata/file/:id/templates - Assign templates to a file", () => {
  test("PUT /files/metadata/file/:id/templates - Assigns a template and getFileMetadata shows it with empty values", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "A" },
      { name: "B", type: MetadataFieldType.Number },
    ]);

    const { data: before } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(before.response!.templates ?? []).toEqual([]);
    expect(before.response!.customFields ?? []).toEqual([]);

    const { status } = await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    expect(status).toBe(200);

    const { data: after } = await ownerApi.metadata.getFileMetadata({ fileId });
    const t = after.response!.templates!.find((x) => x.id === id)!;
    expect(t.cascade).toBe(false);
    expect(t.fields!.map((f) => f.id)).toEqual(
      template.fields!.map((f) => f.id),
    );
    expect(t.fields!.every((f) => f.value == null)).toBe(true);
  });

  test("PUT /files/metadata/file/:id/templates - Assignment is idempotent and additive; an empty list changes nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const a = await createTemplateWithFields(ownerApi, apiSdk);
    const b = await createTemplateWithFields(ownerApi, apiSdk);

    for (const templateIds of [[a.id], [a.id], [b.id], []]) {
      const { status } = await ownerApi.metadata.assignFileTemplates({
        fileId,
        assignMetadataTemplates: { templateIds },
      });
      expect(status, JSON.stringify(templateIds)).toBe(200);
    }

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.templates!.map((t) => t.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  test("PUT /files/metadata/file/:id/templates - Unknown template returns 404 and assigns nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);

    const { status } = await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id, 99999999] },
    });
    expect(status).toBe(404);

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.templates ?? []).toEqual([]);
  });

  test("PUT /files/metadata/file/:id/templates - Unknown file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    const { status } = await ownerApi.metadata.assignFileTemplates({
      fileId: 99999999,
      assignMetadataTemplates: { templateIds: [id] },
    });
    expect(status).toBe(404);
  });

  test("DELETE /files/metadata/file/:id/templates/:templateId - Unassign removes the template and its values, keeps the others", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const a = await createTemplateWithFields(ownerApi, apiSdk);
    const b = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [a.id, b.id] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [
          { fieldId: a.template.fields![0].id!, stringValue: "va" },
          { fieldId: b.template.fields![0].id!, stringValue: "vb" },
        ],
      },
    });

    const { status } = await ownerApi.metadata.unassignFileTemplate({
      fileId,
      templateId: a.id,
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.templates!.map((t) => t.id)).toEqual([b.id]);
    expect(
      fieldValue(data.response!, b.id, b.template.fields![0].id!)!.stringValue,
    ).toBe("vb");

    // Re-assigning brings the template back without the old value
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [a.id] },
    });
    const { data: again } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(
      fieldValue(again.response!, a.id, a.template.fields![0].id!) ?? null,
    ).toBeNull();
  });

  test("DELETE /files/metadata/file/:id/templates/:templateId - Unassigning a template the file does not carry changes nothing; a missing template returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const carried = await createTemplateWithFields(ownerApi, apiSdk);
    const other = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [carried.id] },
    });

    const { status: notAssigned } =
      await ownerApi.metadata.unassignFileTemplate({
        fileId,
        templateId: other.id,
      });
    expect(notAssigned).toBe(200);
    const { status: missing } = await ownerApi.metadata.unassignFileTemplate({
      fileId,
      templateId: 99999999,
    });
    expect(missing).toBe(404);

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.templates!.map((t) => t.id)).toEqual([carried.id]);
  });
});

test.describe("PUT /files/metadata/file/:id/values - Set file values", () => {
  test("PUT /files/metadata/file/:id/values - Writes a value of every type and returns the whole metadata", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "s", type: MetadataFieldType.String },
      { name: "n", type: MetadataFieldType.Number },
      { name: "d", type: MetadataFieldType.Date },
      {
        name: "sc",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "one" }, { value: "two" }],
      },
      {
        name: "mc",
        type: MetadataFieldType.MultiChoice,
        options: [{ value: "x" }, { value: "y" }, { value: "z" }],
      },
    ]);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    const f = Object.fromEntries(template.fields!.map((x) => [x.name, x]));
    const opt = (name: string, value: string) =>
      f[name].options!.find(
        (o: { value?: string | null }) => o.value === value,
      )!.id!;

    const { data, status } = await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [
          { fieldId: f.s.id!, stringValue: "Привет 你好" },
          { fieldId: f.n.id!, numberValue: 42 },
          { fieldId: f.d.id!, dateValue: "2026-03-04T05:06:07Z" },
          { fieldId: f.sc.id!, optionIds: [opt("sc", "two")] },
          { fieldId: f.mc.id!, optionIds: [opt("mc", "x"), opt("mc", "z")] },
        ],
      },
    });
    expect(status).toBe(200);

    const { data: got } = await ownerApi.metadata.getFileMetadata({ fileId });
    for (const meta of [data.response!, got.response!]) {
      expect(fieldValue(meta, id, f.s.id!)!.stringValue).toBe("Привет 你好");
      expect(fieldValue(meta, id, f.n.id!)!.numberValue).toBe(42);
      expect(
        new Date(fieldValue(meta, id, f.d.id!)!.dateValue!).toISOString(),
      ).toBe("2026-03-04T05:06:07.000Z");
      expect(fieldValue(meta, id, f.sc.id!)!.optionIds).toEqual([
        opt("sc", "two"),
      ]);
      expect([...fieldValue(meta, id, f.mc.id!)!.optionIds!].sort()).toEqual(
        [opt("mc", "x"), opt("mc", "z")].sort(),
      );
    }
  });

  test("PUT /files/metadata/file/:id/values - Partial write keeps other values; an empty value clears the field", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "a" },
      { name: "b" },
    ]);
    const [a, b] = template.fields!.map((x) => x.id!);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [
          { fieldId: a, stringValue: "1" },
          { fieldId: b, stringValue: "2" },
        ],
      },
    });

    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId: a, stringValue: "changed" }] },
    });
    let { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(fieldValue(data.response!, id, a)!.stringValue).toBe("changed");
    expect(fieldValue(data.response!, id, b)!.stringValue).toBe("2");

    const { status } = await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId: a, stringValue: "" }] },
    });
    expect(status).toBe(200);
    ({ data } = await ownerApi.metadata.getFileMetadata({ fileId }));
    expect(fieldValue(data.response!, id, a)?.stringValue ?? "").toBe("");
    expect(fieldValue(data.response!, id, b)!.stringValue).toBe("2");
  });

  test("PUT /files/metadata/file/:id/values - String value of 8000 characters is accepted, 8001 is rejected", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });

    const ok = "v".repeat(8000);
    const { status: okStatus } = await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId, stringValue: ok }] },
    });
    expect(okStatus).toBe(200);

    const { status } = await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [{ fieldId, stringValue: "v".repeat(8001) }],
      },
    });
    expect(status).toBe(400);

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(fieldValue(data.response!, id, fieldId)!.stringValue).toBe(ok);
  });

  test("PUT /files/metadata/file/:id/values - Rejected writes leave the existing values untouched", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const mine = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "str" },
      { name: "num", type: MetadataFieldType.Number },
    ]);
    const other = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [mine.id] },
    });
    const [str, num] = mine.template.fields!.map((x) => x.id!);
    const otherField = other.template.fields![0].id!;
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId: str, stringValue: "keep" }] },
    });

    const attempts: Array<[string, number, any[]]> = [
      [
        "number field with a string value",
        400,
        [
          { fieldId: str, stringValue: "changed" },
          { fieldId: num, stringValue: "x" },
        ],
      ],
      [
        "field of a template the file does not carry",
        400,
        [
          { fieldId: str, stringValue: "changed" },
          { fieldId: otherField, stringValue: "x" },
        ],
      ],
      [
        "same field listed twice",
        400,
        [
          { fieldId: str, stringValue: "1" },
          { fieldId: str, stringValue: "2" },
        ],
      ],
      [
        "non-existent field",
        404,
        [
          { fieldId: str, stringValue: "changed" },
          { fieldId: 99999999, stringValue: "x" },
        ],
      ],
    ];
    for (const [label, expected, values] of attempts) {
      const { status } = await ownerApi.metadata.setFileValues({
        fileId,
        setMetadataValues: { values },
      });
      expect(status, label).toBe(expected);
      const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
      expect(fieldValue(data.response!, mine.id, str)!.stringValue, label).toBe(
        "keep",
      );
    }
  });

  test("PUT /files/metadata/file/:id/values - A choice field rejects an option ID of another field", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      {
        name: "c1",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "a" }],
      },
      {
        name: "c2",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "b" }],
      },
    ]);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    const [c1, c2] = template.fields!;

    const { status } = await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [{ fieldId: c1.id!, optionIds: [c2.options![0].id!] }],
      },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(fieldValue(data.response!, id, c1.id!) ?? null).toBeNull();
  });
});

test.describe("PUT /files/metadata/file/:id/customfields - Custom fields", () => {
  test("PUT /files/metadata/file/:id/customfields - Sets, updates case-insensitively and removes custom fields; unlisted names are left alone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);

    const { data: first, status } = await ownerApi.metadata.setFileCustomFields(
      {
        fileId,
        setCustomFields: {
          fields: [
            { name: "Owner", value: "Анна" },
            { name: "Dept", value: "QA" },
          ],
        },
      },
    );
    expect(status).toBe(200);
    expect(first.response!.map((f) => [f.name, f.value]).sort()).toEqual([
      ["Dept", "QA"],
      ["Owner", "Анна"],
    ]);

    await ownerApi.metadata.setFileCustomFields({
      fileId,
      setCustomFields: { fields: [{ name: "OWNER", value: "Boris" }] },
    });
    let { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    const map = () =>
      Object.fromEntries(
        data.response!.customFields!.map((f) => [
          f.name!.toLowerCase(),
          f.value,
        ]),
      );
    expect(map()).toEqual({ owner: "Boris", dept: "QA" });

    await ownerApi.metadata.setFileCustomFields({
      fileId,
      setCustomFields: { fields: [{ name: "dept", value: "" }] },
    });
    ({ data } = await ownerApi.metadata.getFileMetadata({ fileId }));
    expect(map()).toEqual({ owner: "Boris" });
  });

  test("PUT /files/metadata/file/:id/customfields - Custom fields do not disturb template values", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId, stringValue: "tpl" }] },
    });

    await ownerApi.metadata.setFileCustomFields({
      fileId,
      setCustomFields: { fields: [{ name: "free", value: "text" }] },
    });

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(fieldValue(data.response!, id, fieldId)!.stringValue).toBe("tpl");
    expect(data.response!.customFields!.map((f) => f.name)).toEqual(["free"]);
  });

  const invalid: Array<[string, any[]]> = [
    ["empty list", []],
    ["blank name", [{ name: "  ", value: "x" }]],
    [
      "repeated name (case-insensitive)",
      [
        { name: "a", value: "1" },
        { name: "A", value: "2" },
      ],
    ],
    ["over-long name", [{ name: "n".repeat(256), value: "x" }]],
    ["over-long value", [{ name: "ok", value: "v".repeat(8001) }]],
  ];
  for (const [label, fields] of invalid) {
    test(`PUT /files/metadata/file/:id/customfields - Rejects ${label} and changes nothing`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const fileId = await createDoc(ownerApi, apiSdk);
      await ownerApi.metadata.setFileCustomFields({
        fileId,
        setCustomFields: { fields: [{ name: "keep", value: "me" }] },
      });

      const { status } = await ownerApi.metadata.setFileCustomFields({
        fileId,
        setCustomFields: { fields },
      });
      expect(status).toBe(400);

      const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
      expect(
        data.response!.customFields!.map((f) => [f.name, f.value]),
      ).toEqual([["keep", "me"]]);
    });
  }

  test("PUT /files/metadata/file/:id/customfields - A file holds at most 50 custom fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `f${i}`, value: "v" }));

    const { status: ok } = await ownerApi.metadata.setFileCustomFields({
      fileId,
      setCustomFields: { fields: make(50) },
    });
    expect(ok).toBe(200);
    const { status } = await ownerApi.metadata.setFileCustomFields({
      fileId,
      setCustomFields: {
        fields: make(51).map((f, i) => ({ ...f, name: `g${i}` })),
      },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.customFields).toHaveLength(50);
  });

  test("PUT /files/metadata/file/:id/customfields - Unknown file returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .metadata.setFileCustomFields({
        fileId: 99999999,
        setCustomFields: { fields: [{ name: "a", value: "b" }] },
      });
    expect(status).toBe(404);
  });
});

test.describe("DELETE templates/fields - effect on file metadata", () => {
  test("DELETE /files/metadata/templates/:id - Deleting an assigned template removes it and its values from the file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const keep = await createTemplateWithFields(ownerApi, apiSdk);
    const drop = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [keep.id, drop.id] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [{ fieldId: keep.template.fields![0].id!, stringValue: "k" }],
      },
    });

    const { status } = await ownerApi.metadata.deleteTemplate({
      templateId: drop.id,
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.templates!.map((t) => t.id)).toEqual([keep.id]);
    expect(
      fieldValue(data.response!, keep.id, keep.template.fields![0].id!)!
        .stringValue,
    ).toBe("k");
  });

  test("DELETE /files/metadata/templates/:id/fields/:fieldId - Deleting a field drops its values from the file and keeps the other fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "a" },
      { name: "b" },
    ]);
    const [a, b] = template.fields!.map((x) => x.id!);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: {
        values: [
          { fieldId: a, stringValue: "1" },
          { fieldId: b, stringValue: "2" },
        ],
      },
    });

    const { status } = await ownerApi.metadata.deleteField({
      templateId: id,
      fieldId: a,
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    const t = data.response!.templates!.find((x) => x.id === id)!;
    expect(t.fields!.map((f) => f.id)).toEqual([b]);
    expect(t.fields![0].value!.stringValue).toBe("2");
  });

  test("PUT /files/metadata/templates/:id/fields/:fieldId - Type change is rejected once a value exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = await createDoc(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId, stringValue: "v" }] },
    });

    const { status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId,
      updateMetadataFieldRequest: { type: MetadataFieldType.Number },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields![0].type).toBe(MetadataFieldType.String);
  });
});
