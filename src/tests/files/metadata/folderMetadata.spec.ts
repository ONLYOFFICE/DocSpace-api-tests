import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  MetadataConflictResolveType,
  MetadataFieldType,
} from "@onlyoffice/docspace-api-sdk";
import {
  createTemplateWithFields,
  assignWithCascade,
  updateWithCascade,
  waitForCascade,
} from "@/src/helpers/metadata";
import { getMyDocsFolderId } from "@/src/helpers/files";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

async function createFolder(
  api: Api,
  apiSdk: ApiSDK,
  parentId?: number,
): Promise<number> {
  const { data, status } = await api.folders.createFolder({
    folderId: parentId ?? (await getMyDocsFolderId(api)),
    createFolderRequest: {
      title: `Autotest meta ${apiSdk.faker.generateString(6)}`,
    },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

async function createDoc(
  api: Api,
  apiSdk: ApiSDK,
  folderId: number,
): Promise<number> {
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
    .templates!.find((t) => t.id === templateId)
    ?.fields!.find((f) => f.id === fieldId)?.value;

test.describe("PUT /files/metadata/folder/:id/templates - Assign templates to a folder", () => {
  test("PUT /files/metadata/folder/:id/templates - Assigns without cascade: completed operation, content untouched", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    const fileId = await createDoc(ownerApi, apiSdk, folderId);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "a" },
      { name: "b", type: MetadataFieldType.Number },
    ]);

    const { data, status } = await ownerApi.metadata.assignFolderTemplates({
      folderId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    expect(status).toBe(200);
    expect(data.response!.isCompleted).toBe(true);
    expect(data.response!.id ?? null).toBeNull();

    const { data: meta } = await ownerApi.metadata.getFolderMetadata({
      folderId,
    });
    const t = meta.response!.templates!.find((x) => x.id === id)!;
    expect(t.cascade).toBe(false);
    expect(t.fields!.map((f) => f.id)).toEqual(
      template.fields!.map((f) => f.id),
    );

    const { data: fileMeta } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(fileMeta.response!.templates ?? []).toEqual([]);
  });

  test("PUT /files/metadata/folder/:id/templates - Assignment is additive and idempotent; unknown template returns 404 and assigns nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    const a = await createTemplateWithFields(ownerApi, apiSdk);
    const b = await createTemplateWithFields(ownerApi, apiSdk);

    for (const templateIds of [[a.id], [a.id], [b.id]]) {
      const { status } = await ownerApi.metadata.assignFolderTemplates({
        folderId,
        assignMetadataTemplates: { templateIds },
      });
      expect(status).toBe(200);
    }
    const { data } = await ownerApi.metadata.getFolderMetadata({ folderId });
    expect(data.response!.templates!.map((t) => t.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );

    const other = await createFolder(ownerApi, apiSdk);
    const { status } = await ownerApi.metadata.assignFolderTemplates({
      folderId: other,
      assignMetadataTemplates: { templateIds: [a.id, 99999999] },
    });
    expect(status).toBe(404);
    const { data: untouched } = await ownerApi.metadata.getFolderMetadata({
      folderId: other,
    });
    expect(untouched.response!.templates ?? []).toEqual([]);
  });

  test("PUT /files/metadata/folder/:id/templates - Unknown folder returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    const { status } = await ownerApi.metadata.assignFolderTemplates({
      folderId: 99999999,
      assignMetadataTemplates: { templateIds: [id] },
    });
    expect(status).toBe(404);
  });
});

test.describe("Cascade - assign with cascade and getCascadeProgress", () => {
  test("PUT /files/metadata/folder/:id/templates - Cascade copies the template and the folder's values to nested files and folders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    const sub = await createFolder(ownerApi, apiSdk, root);
    const deep = await createFolder(ownerApi, apiSdk, sub);
    const fileA = await createDoc(ownerApi, apiSdk, root);
    const fileB = await createDoc(ownerApi, apiSdk, deep);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;

    await ownerApi.metadata.assignFolderTemplates({
      folderId: root,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFolderValues({
      folderId: root,
      setMetadataValues: { values: [{ fieldId, stringValue: "from root" }] },
    });

    // Before the cascade nothing below the root carries the template
    for (const [kind, entryId] of [
      ["file", fileA],
      ["file", fileB],
      ["folder", sub],
      ["folder", deep],
    ] as const) {
      const { data } =
        kind === "file"
          ? await ownerApi.metadata.getFileMetadata({ fileId: entryId })
          : await ownerApi.metadata.getFolderMetadata({ folderId: entryId });
      expect(data.response!.templates ?? [], `${kind} ${entryId}`).toEqual([]);
    }

    const { data: op, status } = await ownerApi.metadata.assignFolderTemplates({
      folderId: root,
      assignMetadataTemplates: {
        templateIds: [id],
        cascade: true,
        conflictResolveType: MetadataConflictResolveType.Overwrite,
      },
    });
    expect(status).toBe(200);
    expect(op.response!.templateIds).toEqual([id]);
    expect(op.response!.id).toBeTruthy();

    const done = await waitForCascade(ownerApi, root, {
      operationId: op.response!.id,
    });
    expect(done.isCompleted).toBe(true);

    for (const [kind, entryId] of [
      ["file", fileA],
      ["file", fileB],
      ["folder", sub],
      ["folder", deep],
    ] as const) {
      const { data } =
        kind === "file"
          ? await ownerApi.metadata.getFileMetadata({ fileId: entryId })
          : await ownerApi.metadata.getFolderMetadata({ folderId: entryId });
      expect(
        fieldValue(data.response!, id, fieldId)?.stringValue,
        `${kind} ${entryId}`,
      ).toBe("from root");
    }

    const { data: rootMeta } = await ownerApi.metadata.getFolderMetadata({
      folderId: root,
    });
    const rootTemplate = rootMeta.response!.templates!.find(
      (t) => t.id === id,
    )!;
    expect(rootTemplate.cascade).toBe(true);
    expect(rootTemplate.conflictResolveType).toBe(
      MetadataConflictResolveType.Overwrite,
    );
  });

  test("PUT /files/metadata/folder/:id/templates - Skip keeps an existing value below and fills the empty ones, Overwrite replaces all", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    const withValue = await createDoc(ownerApi, apiSdk, root);
    const empty = await createDoc(ownerApi, apiSdk, root);
    const subWithValue = await createFolder(ownerApi, apiSdk, root);
    const subEmpty = await createFolder(ownerApi, apiSdk, root);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    const setValues = (v: string) => ({
      setMetadataValues: { values: [{ fieldId, stringValue: v }] },
    });

    // Arrange: the root and two children hold their own value, two hold none
    for (const folderId of [root, subWithValue, subEmpty]) {
      expect(
        (
          await ownerApi.metadata.assignFolderTemplates({
            folderId,
            assignMetadataTemplates: { templateIds: [id] },
          })
        ).status,
      ).toBe(200);
    }
    for (const fileId of [withValue, empty]) {
      expect(
        (
          await ownerApi.metadata.assignFileTemplates({
            fileId,
            assignMetadataTemplates: { templateIds: [id] },
          })
        ).status,
      ).toBe(200);
    }
    await ownerApi.metadata.setFolderValues({
      folderId: root,
      ...setValues("folder"),
    });
    await ownerApi.metadata.setFileValues({
      fileId: withValue,
      ...setValues("file"),
    });
    await ownerApi.metadata.setFolderValues({
      folderId: subWithValue,
      ...setValues("sub"),
    });

    const read = async () => {
      const get = async (kind: "file" | "folder", entryId: number) => {
        const { data } =
          kind === "file"
            ? await ownerApi.metadata.getFileMetadata({ fileId: entryId })
            : await ownerApi.metadata.getFolderMetadata({ folderId: entryId });
        return fieldValue(data.response!, id, fieldId)?.stringValue ?? null;
      };
      return {
        withValue: await get("file", withValue),
        empty: await get("file", empty),
        subWithValue: await get("folder", subWithValue),
        subEmpty: await get("folder", subEmpty),
      };
    };

    const before = await read();
    expect(before).toEqual({
      withValue: "file",
      empty: null,
      subWithValue: "sub",
      subEmpty: null,
    });

    // Skip: existing values stay, empty fields receive the folder's value
    await assignWithCascade(
      ownerApi,
      root,
      [id],
      MetadataConflictResolveType.Skip,
    );
    expect(await read()).toEqual({
      withValue: "file",
      empty: "folder",
      subWithValue: "sub",
      subEmpty: "folder",
    });

    // Overwrite: everything below takes the folder's value
    await updateWithCascade(
      ownerApi,
      root,
      id,
      MetadataConflictResolveType.Overwrite,
    );
    expect(await read()).toEqual({
      withValue: "folder",
      empty: "folder",
      subWithValue: "folder",
      subEmpty: "folder",
    });
  });

  test("GET /files/metadata/folder/:id/templates/progress - A folder that never cascaded reports a completed operation without id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);

    const { data, status } = await ownerApi.metadata.getCascadeProgress({
      folderId,
    });
    expect(status).toBe(200);
    expect(data.response!.isCompleted).toBe(true);
    expect(data.response!.id ?? null).toBeNull();
    expect(data.response!.templateIds ?? []).toEqual([]);
  });

  test("GET /files/metadata/folder/:id/templates/progress - Progress DTO of a cascade is well-formed and ends at 100%", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    for (let i = 0; i < 3; i++) await createDoc(ownerApi, apiSdk, root);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);

    const { data: started } = await ownerApi.metadata.assignFolderTemplates({
      folderId: root,
      assignMetadataTemplates: { templateIds: [id], cascade: true },
    });
    const operationId = started.response!.id;
    expect(operationId).toBeTruthy();
    expect(started.response!.templateIds).toEqual([id]);

    const done = await waitForCascade(ownerApi, root, { operationId });
    expect(done.progress).toBe(100);

    // The finished pass stays reported, with the same identity
    const { data } = await ownerApi.metadata.getCascadeProgress({
      folderId: root,
    });
    expect(data.response!.id).toBe(operationId);
    expect(data.response!.templateIds).toEqual([id]);
    expect(data.response!.isCompleted).toBe(true);
    expect(data.response!.error || null).toBeNull();
  });

  test("GET /files/metadata/folder/:id/templates/progress - Unknown folder returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .metadata.getCascadeProgress({ folderId: 99999999 });
    expect(status).toBe(404);
  });

  test("PUT /files/metadata/folder/:id/templates - A file created after a cascading assignment inherits the template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    await assignWithCascade(ownerApi, root, [id]);

    const fileId = await createDoc(ownerApi, apiSdk, root);
    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(data.response!.templates!.map((t) => t.id)).toContain(id);
  });
});

test.describe("PUT /files/metadata/folder/:id/templates/:templateId - Update assignment", () => {
  test("PUT /files/metadata/folder/:id/templates/:templateId - Cascade off keeps the template and values on the folder and below", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    const fileId = await createDoc(ownerApi, apiSdk, root);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    await ownerApi.metadata.assignFolderTemplates({
      folderId: root,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFolderValues({
      folderId: root,
      setMetadataValues: { values: [{ fieldId, stringValue: "v" }] },
    });
    await assignWithCascade(ownerApi, root, [id]);

    const { data: op, status } = await ownerApi.metadata.updateFolderTemplate({
      folderId: root,
      templateId: id,
      updateFolderMetadataTemplateRequest: { cascade: false },
    });
    expect(status).toBe(200);
    expect(op.response!.isCompleted).toBe(true);
    expect(op.response!.id ?? null).toBeNull();

    const { data: rootMeta } = await ownerApi.metadata.getFolderMetadata({
      folderId: root,
    });
    const t = rootMeta.response!.templates!.find((x) => x.id === id)!;
    expect(t.cascade).toBe(false);
    expect(fieldValue(rootMeta.response!, id, fieldId)!.stringValue).toBe("v");

    const { data: fileMeta } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(fieldValue(fileMeta.response!, id, fieldId)!.stringValue).toBe("v");

    // cascade already off stays off
    const { status: again } = await ownerApi.metadata.updateFolderTemplate({
      folderId: root,
      templateId: id,
      updateFolderMetadataTemplateRequest: { cascade: false },
    });
    expect(again).toBe(200);
  });

  test("PUT /files/metadata/folder/:id/templates/:templateId - A template the folder does not carry or an unknown one returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);

    const { status: notCarried } = await ownerApi.metadata.updateFolderTemplate(
      {
        folderId,
        templateId: id,
        updateFolderMetadataTemplateRequest: { cascade: true },
      },
    );
    const { status: unknown } = await ownerApi.metadata.updateFolderTemplate({
      folderId,
      templateId: 99999999,
      updateFolderMetadataTemplateRequest: { cascade: true },
    });
    expect([notCarried, unknown]).toEqual([404, 404]);
  });
});

test.describe("DELETE /files/metadata/folder/:id/templates/:templateId - Unassign", () => {
  test("DELETE /files/metadata/folder/:id/templates/:templateId - Removes the template and values from the folder only; cascaded content keeps its own copy", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    const fileId = await createDoc(ownerApi, apiSdk, root);
    const keep = await createTemplateWithFields(ownerApi, apiSdk);
    const drop = await createTemplateWithFields(ownerApi, apiSdk);
    const dropField = drop.template.fields![0].id!;
    await ownerApi.metadata.assignFolderTemplates({
      folderId: root,
      assignMetadataTemplates: { templateIds: [keep.id, drop.id] },
    });
    await ownerApi.metadata.setFolderValues({
      folderId: root,
      setMetadataValues: { values: [{ fieldId: dropField, stringValue: "d" }] },
    });
    await assignWithCascade(ownerApi, root, [drop.id]);

    const { status } = await ownerApi.metadata.unassignFolderTemplate({
      folderId: root,
      templateId: drop.id,
    });
    expect(status).toBe(200);

    const { data: rootMeta } = await ownerApi.metadata.getFolderMetadata({
      folderId: root,
    });
    expect(rootMeta.response!.templates!.map((t) => t.id)).toEqual([keep.id]);

    const { data: fileMeta } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(
      fieldValue(fileMeta.response!, drop.id, dropField)!.stringValue,
    ).toBe("d");
  });

  test("DELETE /files/metadata/folder/:id/templates/:templateId - Unknown folder and unknown template return 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    const { status: noFolder } = await ownerApi.metadata.unassignFolderTemplate(
      { folderId: 99999999, templateId: id },
    );
    const { status: noTemplate } =
      await ownerApi.metadata.unassignFolderTemplate({
        folderId,
        templateId: 99999999,
      });
    expect([noFolder, noTemplate]).toEqual([404, 404]);
  });
});

test.describe("Folder values and custom fields", () => {
  test("PUT /files/metadata/folder/:id/values - Writes values of every type, partial write keeps the rest, empty clears", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "s" },
      { name: "n", type: MetadataFieldType.Number },
      { name: "d", type: MetadataFieldType.Date },
      {
        name: "c",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "one" }, { value: "two" }],
      },
    ]);
    const f = Object.fromEntries(template.fields!.map((x) => [x.name, x]));
    await ownerApi.metadata.assignFolderTemplates({
      folderId,
      assignMetadataTemplates: { templateIds: [id] },
    });

    const { data, status } = await ownerApi.metadata.setFolderValues({
      folderId,
      setMetadataValues: {
        values: [
          { fieldId: f.s.id!, stringValue: "текст" },
          { fieldId: f.n.id!, numberValue: 7 },
          { fieldId: f.d.id!, dateValue: "2026-01-02T03:04:05Z" },
          { fieldId: f.c.id!, optionIds: [f.c.options![1].id!] },
        ],
      },
    });
    expect(status).toBe(200);
    expect(fieldValue(data.response!, id, f.s.id!)!.stringValue).toBe("текст");

    await ownerApi.metadata.setFolderValues({
      folderId,
      setMetadataValues: { values: [{ fieldId: f.s.id!, stringValue: "" }] },
    });
    const { data: got } = await ownerApi.metadata.getFolderMetadata({
      folderId,
    });
    expect(fieldValue(got.response!, id, f.s.id!)?.stringValue ?? "").toBe("");
    expect(fieldValue(got.response!, id, f.n.id!)!.numberValue).toBe(7);
    expect(fieldValue(got.response!, id, f.c.id!)!.optionIds).toEqual([
      f.c.options![1].id,
    ]);
  });

  test("PUT /files/metadata/folder/:id/values - A field of a template the folder does not carry is rejected and writes nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    const mine = await createTemplateWithFields(ownerApi, apiSdk);
    const other = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.assignFolderTemplates({
      folderId,
      assignMetadataTemplates: { templateIds: [mine.id] },
    });
    const mineField = mine.template.fields![0].id!;

    const { status } = await ownerApi.metadata.setFolderValues({
      folderId,
      setMetadataValues: {
        values: [
          { fieldId: mineField, stringValue: "x" },
          { fieldId: other.template.fields![0].id!, stringValue: "y" },
        ],
      },
    });
    expect(status).toBe(400);
    const { data } = await ownerApi.metadata.getFolderMetadata({ folderId });
    expect(fieldValue(data.response!, mine.id, mineField) ?? null).toBeNull();
  });

  test("PUT /files/metadata/folder/:id/customfields - Sets and removes custom fields and they never cascade to the content", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await createFolder(ownerApi, apiSdk);
    const fileId = await createDoc(ownerApi, apiSdk, root);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);

    const { data, status } = await ownerApi.metadata.setFolderCustomFields({
      folderId: root,
      setCustomFields: {
        fields: [
          { name: "Project", value: "Alpha" },
          { name: "Temp", value: "t" },
        ],
      },
    });
    expect(status).toBe(200);
    expect(data.response!.map((f) => f.name).sort()).toEqual([
      "Project",
      "Temp",
    ]);

    await ownerApi.metadata.setFolderCustomFields({
      folderId: root,
      setCustomFields: { fields: [{ name: "temp", value: null }] },
    });
    await assignWithCascade(ownerApi, root, [id]);

    const { data: rootMeta } = await ownerApi.metadata.getFolderMetadata({
      folderId: root,
    });
    expect(rootMeta.response!.customFields!.map((f) => f.name)).toEqual([
      "Project",
    ]);
    const { data: fileMeta } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(fileMeta.response!.customFields ?? []).toEqual([]);
  });

  test("PUT /files/metadata/folder/:id/customfields - Invalid requests are rejected and change nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);
    await ownerApi.metadata.setFolderCustomFields({
      folderId,
      setCustomFields: { fields: [{ name: "keep", value: "me" }] },
    });

    const invalid: Array<[string, any[]]> = [
      ["empty list", []],
      ["blank name", [{ name: " ", value: "x" }]],
      [
        "repeated name",
        [
          { name: "a", value: "1" },
          { name: "A", value: "2" },
        ],
      ],
      ["over-long value", [{ name: "ok", value: "v".repeat(8001) }]],
    ];
    for (const [label, fields] of invalid) {
      const { status } = await ownerApi.metadata.setFolderCustomFields({
        folderId,
        setCustomFields: { fields },
      });
      expect(status, label).toBe(400);
    }
    const { data } = await ownerApi.metadata.getFolderMetadata({ folderId });
    expect(data.response!.customFields!.map((f) => [f.name, f.value])).toEqual([
      ["keep", "me"],
    ]);
  });

  test("GET /files/metadata/folder/:id - Unknown folder returns 404; a folder without metadata returns empty lists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const folderId = await createFolder(ownerApi, apiSdk);

    const { data, status } = await ownerApi.metadata.getFolderMetadata({
      folderId,
    });
    expect(status).toBe(200);
    expect(data.response!.templates ?? []).toEqual([]);
    expect(data.response!.customFields ?? []).toEqual([]);

    const { status: missing } = await ownerApi.metadata.getFolderMetadata({
      folderId: 99999999,
    });
    expect(missing).toBe(404);
  });
});
