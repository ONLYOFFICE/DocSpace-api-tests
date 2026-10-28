import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  MetadataFieldType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import {
  assignWithCascade,
  createTemplateWithFields,
  updateWithCascade,
} from "@/src/helpers/metadata";
import { getMyDocsFolderId } from "@/src/helpers/files";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

async function folderIn(api: Api, apiSdk: ApiSDK, parentId?: number) {
  const { data, status } = await api.folders.createFolder({
    folderId: parentId ?? (await getMyDocsFolderId(api)),
    createFolderRequest: {
      title: `Autotest gap ${apiSdk.faker.generateString(6)}`,
    },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

async function docIn(api: Api, apiSdk: ApiSDK, folderId: number) {
  const { data, status } = await api.files.createFile({
    folderId,
    createFileRequest: {
      title: `Autotest gap ${apiSdk.faker.generateString(6)}.docx`,
    },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

const valueOf = (
  meta: { templates?: Array<{ id?: number; fields?: any[] | null }> | null },
  templateId: number,
  fieldId: number,
) =>
  meta
    .templates!.find((t) => t.id === templateId)
    ?.fields!.find((f) => f.id === fieldId)?.value;

test.describe("Template DTO and authorship", () => {
  test("GET /files/metadata/templates/:id - DTO carries the author, dates and fields in display order", async ({
    apiSdk,
    api,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "first" },
      { name: "second", type: MetadataFieldType.Number },
    ]);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    const t = data.response!;
    expect(t.createBy!.id).toBe(api.adminUserId);
    expect(t.createBy!.displayName).toBeTruthy();
    expect(t.modifiedBy!.id).toBe(t.createBy!.id);
    expect(t.createOn).toBeTruthy();
    expect(t.modifiedOn).toBeTruthy();
    expect(t.visible).toBe(true);
    const orders = t.fields!.map((f) => f.order!);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(t.fields!.every((f) => f.templateId === id)).toBe(true);
  });

  test("PUT /files/metadata/templates/:id - A change by another admin is recorded in modifiedBy, the creator stays", async ({
    apiSdk,
    api,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    const { data: admin, api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.metadata.updateTemplate({
      templateId: id,
      updateMetadataTemplate: {
        name: `Autotest by admin ${apiSdk.faker.generateString(6)}`,
      },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.createBy!.id).toBe(api.adminUserId);
    expect(data.response!.modifiedBy!.id).toBe(admin.response!.id);
  });
});

test.describe("PUT /files/metadata/templates/:id/fields/:fieldId - options and order", () => {
  test("A new option gets an ID, existing options keep theirs, an option can be renamed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      {
        name: "c",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "a" }, { value: "b" }],
      },
    ]);
    const field = template.fields![0];
    const [a, b] = field.options!;

    const { data, status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: field.id!,
      updateMetadataFieldRequest: {
        options: [
          { id: a.id, value: "a renamed" },
          { id: b.id, value: "b" },
          { value: "c" },
        ],
      },
    });
    expect(status).toBe(200);
    const opts = data.response!.options!;
    expect(opts.map((o) => o.value)).toEqual(["a renamed", "b", "c"]);
    expect(opts[0].id).toBe(a.id);
    expect(opts[1].id).toBe(b.id);
    expect(opts[2].id).toBeTruthy();

    const { data: got } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    expect(got.response!.fields![0].options!.map((o) => o.value)).toEqual([
      "a renamed",
      "b",
      "c",
    ]);
  });

  test("An option in use cannot be removed, an unused one can", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      {
        name: "c",
        type: MetadataFieldType.SingleChoice,
        options: [{ value: "used" }, { value: "free" }],
      },
    ]);
    const field = template.fields![0];
    const [used, free] = field.options!;
    const folderId = await folderIn(ownerApi, apiSdk);
    await ownerApi.metadata.assignFolderTemplates({
      folderId,
      assignMetadataTemplates: { templateIds: [id] },
    });
    await ownerApi.metadata.setFolderValues({
      folderId,
      setMetadataValues: {
        values: [{ fieldId: field.id!, optionIds: [used.id!] }],
      },
    });

    const { status: inUse } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: field.id!,
      updateMetadataFieldRequest: { options: [{ id: free.id, value: "free" }] },
    });
    expect(inUse).toBe(400);
    const { data: kept } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    expect(kept.response!.fields![0].options!.map((o) => o.id)).toEqual([
      used.id,
      free.id,
    ]);
    const { data: meta } = await ownerApi.metadata.getFolderMetadata({
      folderId,
    });
    expect(valueOf(meta.response!, id, field.id!)!.optionIds).toEqual([
      used.id,
    ]);

    const { status: unused } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: field.id!,
      updateMetadataFieldRequest: { options: [{ id: used.id, value: "used" }] },
    });
    expect(unused).toBe(200);
    const { data: after } = await ownerApi.metadata.getTemplate({
      templateId: id,
    });
    expect(after.response!.fields![0].options!.map((o) => o.id)).toEqual([
      used.id,
    ]);
  });

  test("A new order moves the field; a rename keeps the options", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "a" },
      {
        name: "b",
        type: MetadataFieldType.MultiChoice,
        options: [{ value: "x" }],
      },
      { name: "c" },
    ]);
    const b = template.fields!.find((f) => f.name === "b")!;

    const { status } = await ownerApi.metadata.updateField({
      templateId: id,
      fieldId: b.id!,
      updateMetadataFieldRequest: { name: "b2", order: -5 },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.metadata.getTemplate({ templateId: id });
    expect(data.response!.fields!.map((f) => f.name)).toEqual(["b2", "a", "c"]);
    expect(data.response!.fields![0].options!.map((o) => o.value)).toEqual([
      "x",
    ]);
  });
});

test.describe("Template changes against assigned entries", () => {
  test("PUT /files/metadata/templates/:id - Renaming an assigned template keeps its values on the file and the folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    const folderId = await folderIn(ownerApi, apiSdk);
    const fileId = await docIn(ownerApi, apiSdk, folderId);
    for (const call of [
      ownerApi.metadata.assignFolderTemplates({
        folderId,
        assignMetadataTemplates: { templateIds: [id] },
      }),
      ownerApi.metadata.assignFileTemplates({
        fileId,
        assignMetadataTemplates: { templateIds: [id] },
      }),
    ])
      expect((await call).status).toBe(200);
    await ownerApi.metadata.setFolderValues({
      folderId,
      setMetadataValues: { values: [{ fieldId, stringValue: "f" }] },
    });
    await ownerApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId, stringValue: "g" }] },
    });

    const newName = `Autotest renamed ${apiSdk.faker.generateString(6)}`;
    expect(
      (
        await ownerApi.metadata.updateTemplate({
          templateId: id,
          updateMetadataTemplate: { name: newName },
        })
      ).status,
    ).toBe(200);

    const { data: file } = await ownerApi.metadata.getFileMetadata({ fileId });
    const { data: folder } = await ownerApi.metadata.getFolderMetadata({
      folderId,
    });
    expect(file.response!.templates![0].name).toBe(newName);
    expect(folder.response!.templates![0].name).toBe(newName);
    expect(valueOf(file.response!, id, fieldId)!.stringValue).toBe("g");
    expect(valueOf(folder.response!, id, fieldId)!.stringValue).toBe("f");
  });

  test("DELETE /files/metadata/templates/:id and /fields/:fieldId - Folder loses the template, or the field's value, and keeps the rest", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const keep = await createTemplateWithFields(ownerApi, apiSdk, [
      { name: "a" },
      { name: "b" },
    ]);
    const drop = await createTemplateWithFields(ownerApi, apiSdk);
    const [a, b] = keep.template.fields!.map((f) => f.id!);
    const folderId = await folderIn(ownerApi, apiSdk);
    await ownerApi.metadata.assignFolderTemplates({
      folderId,
      assignMetadataTemplates: { templateIds: [keep.id, drop.id] },
    });
    await ownerApi.metadata.setFolderValues({
      folderId,
      setMetadataValues: {
        values: [
          { fieldId: a, stringValue: "1" },
          { fieldId: b, stringValue: "2" },
          { fieldId: drop.template.fields![0].id!, stringValue: "3" },
        ],
      },
    });

    expect(
      (await ownerApi.metadata.deleteField({ templateId: keep.id, fieldId: a }))
        .status,
    ).toBe(200);
    expect(
      (await ownerApi.metadata.deleteTemplate({ templateId: drop.id })).status,
    ).toBe(200);

    const { data } = await ownerApi.metadata.getFolderMetadata({ folderId });
    expect(data.response!.templates!.map((t) => t.id)).toEqual([keep.id]);
    expect(data.response!.templates![0].fields!.map((f) => f.id)).toEqual([b]);
    expect(valueOf(data.response!, keep.id, b)!.stringValue).toBe("2");
  });
});

test.describe("Rooms and inheritance", () => {
  test("PUT /files/metadata/folder/:id/templates - A room takes templates, values and custom fields like a folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest meta room ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;

    expect(
      (
        await ownerApi.metadata.assignFolderTemplates({
          folderId: roomId,
          assignMetadataTemplates: { templateIds: [id] },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ownerApi.metadata.setFolderValues({
          folderId: roomId,
          setMetadataValues: { values: [{ fieldId, stringValue: "room" }] },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ownerApi.metadata.setFolderCustomFields({
          folderId: roomId,
          setCustomFields: { fields: [{ name: "k", value: "v" }] },
        })
      ).status,
    ).toBe(200);

    const { data } = await ownerApi.metadata.getFolderMetadata({
      folderId: roomId,
    });
    expect(valueOf(data.response!, id, fieldId)!.stringValue).toBe("room");
    expect(data.response!.customFields).toEqual([{ name: "k", value: "v" }]);

    // cascade from a room reaches the files inside
    const fileId = await docIn(ownerApi, apiSdk, roomId);
    await assignWithCascade(ownerApi, roomId, [id]);
    const { data: file } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(file.response!.templates!.map((t) => t.id)).toContain(id);
  });

  test("DELETE /files/metadata/file/:id/templates/:templateId - An inherited template can be taken off a file and a later cascade assigns it again", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await folderIn(ownerApi, apiSdk);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    await assignWithCascade(ownerApi, root, [id]);
    const fileId = await docIn(ownerApi, apiSdk, root);

    const { data: inherited } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(inherited.response!.templates!.map((t) => t.id)).toEqual([id]);

    expect(
      (await ownerApi.metadata.unassignFileTemplate({ fileId, templateId: id }))
        .status,
    ).toBe(200);
    const { data: removed } = await ownerApi.metadata.getFileMetadata({
      fileId,
    });
    expect(removed.response!.templates ?? []).toEqual([]);

    await updateWithCascade(ownerApi, root, id);
    const { data: again } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(again.response!.templates!.map((t) => t.id)).toEqual([id]);
  });

  test("PUT /files/metadata/folder/:id/templates/:templateId - Cascading from an inherited subfolder makes the assignment its own", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const root = await folderIn(ownerApi, apiSdk);
    const sub = await folderIn(ownerApi, apiSdk, root);
    const { id } = await createTemplateWithFields(ownerApi, apiSdk);
    await assignWithCascade(ownerApi, root, [id]);

    const { data: before } = await ownerApi.metadata.getFolderMetadata({
      folderId: sub,
    });
    expect(before.response!.templates!.find((t) => t.id === id)!.cascade).toBe(
      false,
    );

    await updateWithCascade(ownerApi, sub, id);
    const { data: after } = await ownerApi.metadata.getFolderMetadata({
      folderId: sub,
    });
    expect(after.response!.templates!.find((t) => t.id === id)!.cascade).toBe(
      true,
    );
    const { data: rootMeta } = await ownerApi.metadata.getFolderMetadata({
      folderId: root,
    });
    expect(
      rootMeta.response!.templates!.find((t) => t.id === id)!.cascade,
    ).toBe(true);
  });
});

test.describe("Entry access by other roles", () => {
  test("A User with the Editing right on the room can write file metadata", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest meta room ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const fileId = await docIn(ownerApi, apiSdk, roomId);
    const { id, template } = await createTemplateWithFields(ownerApi, apiSdk);
    const fieldId = template.fields![0].id!;
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [id] },
    });

    const { data: user, api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    expect(
      (
        await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [
              { id: user.response!.id!, access: FileShare.Editing },
            ],
            notify: false,
          },
        })
      ).status,
    ).toBe(200);

    const { status } = await userApi.metadata.setFileValues({
      fileId,
      setMetadataValues: { values: [{ fieldId, stringValue: "editor" }] },
    });
    expect(status).toBe(200);
    const { data } = await ownerApi.metadata.getFileMetadata({ fileId });
    expect(valueOf(data.response!, id, fieldId)!.stringValue).toBe("editor");
  });
});
