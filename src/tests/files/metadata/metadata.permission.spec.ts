import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  MetadataFieldType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";
import { ApiSDK } from "@/src/services/api-sdk";

type MemberType = "DocSpaceAdmin" | "RoomAdmin" | "User" | "Guest";

test.describe("Metadata templates - management is DocSpace admin only", () => {
  const writers: Array<[MemberType, number]> = [
    ["DocSpaceAdmin", 200],
    ["RoomAdmin", 403],
    ["User", 403],
    ["Guest", 403],
  ];

  for (const [type, expected] of writers) {
    test(`POST /files/metadata/templates - ${type} gets ${expected}`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", type);
      const name = `Autotest perm ${apiSdk.faker.generateString(8)}`;

      const { status } = await api.metadata.createTemplate({
        createMetadataTemplateRequestDto: { name },
      });
      expect(status).toBe(expected);

      const { data } = await apiSdk.forRole("owner").metadata.getTemplates({});
      const created = data.response!.some((t) => t.name === name);
      expect(created).toBe(expected === 200);
    });

    test(`PUT/DELETE template and fields - ${type} gets ${expected} and a refusal changes nothing`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { id, name, template } = await createTemplateWithFields(
        ownerApi,
        apiSdk,
        [{ name: "keep" }],
      );
      const fieldId = template.fields![0].id!;
      const { api } = await apiSdk.addAuthenticatedMember("owner", type);

      const results = {
        update: (
          await api.metadata.updateTemplate({
            templateId: id,
            updateMetadataTemplate: { visible: false },
          })
        ).status,
        createField: (
          await api.metadata.createField({
            templateId: id,
            metadataFieldRequest: {
              name: "added",
              type: MetadataFieldType.String,
            },
          })
        ).status,
        updateField: (
          await api.metadata.updateField({
            templateId: id,
            fieldId,
            updateMetadataFieldRequest: { name: "renamed" },
          })
        ).status,
      };
      expect(results).toEqual({
        update: expected,
        createField: expected,
        updateField: expected,
      });

      if (expected === 403) {
        const { status: delField } = await api.metadata.deleteField({
          templateId: id,
          fieldId,
        });
        const { status: delTemplate } = await api.metadata.deleteTemplate({
          templateId: id,
        });
        expect([delField, delTemplate]).toEqual([403, 403]);

        const { data } = await ownerApi.metadata.getTemplate({
          templateId: id,
        });
        expect(data.response!.name).toBe(name);
        expect(data.response!.visible).toBe(true);
        expect(data.response!.fields!.map((f) => f.name)).toEqual(["keep"]);
      } else {
        const { status: delTemplate } = await api.metadata.deleteTemplate({
          templateId: id,
        });
        expect(delTemplate).toBe(200);
        const { status } = await ownerApi.metadata.getTemplate({
          templateId: id,
        });
        expect(status).toBe(404);
      }
    });
  }

  for (const type of ["RoomAdmin", "User"] as const) {
    test(`GET /files/metadata/templates - ${type} can read the template dictionary`, async ({
      apiSdk,
    }) => {
      const { id } = await createTemplateWithFields(
        apiSdk.forRole("owner"),
        apiSdk,
      );
      const { api } = await apiSdk.addAuthenticatedMember("owner", type);

      const { data: list, status } = await api.metadata.getTemplates({});
      expect(status).toBe(200);
      expect(list.response!.map((t) => t.id)).toContain(id);

      const { data: one, status: oneStatus } = await api.metadata.getTemplate({
        templateId: id,
      });
      expect(oneStatus).toBe(200);
      expect(one.response!.id).toBe(id);
    });
  }

  test("Metadata templates - anonymous callers get 401 on every template route", async ({
    apiSdk,
  }) => {
    const { id, template } = await createTemplateWithFields(
      apiSdk.forRole("owner"),
      apiSdk,
    );
    const anon = apiSdk.forAnonymous().metadata;
    const fieldId = template.fields![0].id!;

    const statuses = [
      (await anon.getTemplates({})).status,
      (await anon.getTemplate({ templateId: id })).status,
      (
        await anon.createTemplate({
          createMetadataTemplateRequestDto: { name: "anon" },
        })
      ).status,
      (
        await anon.updateTemplate({
          templateId: id,
          updateMetadataTemplate: { name: "anon" },
        })
      ).status,
      (await anon.deleteTemplate({ templateId: id })).status,
      (
        await anon.createField({
          templateId: id,
          metadataFieldRequest: { name: "x", type: MetadataFieldType.String },
        })
      ).status,
      (
        await anon.updateField({
          templateId: id,
          fieldId,
          updateMetadataFieldRequest: { name: "x" },
        })
      ).status,
      (await anon.deleteField({ templateId: id, fieldId })).status,
    ];
    expect(statuses).toEqual(Array(statuses.length).fill(401));

    const { status } = await apiSdk
      .forRole("owner")
      .metadata.getTemplate({ templateId: id });
    expect(status).toBe(200);
  });
});

test.describe("Entry metadata - access follows the right on the file or folder", () => {
  async function setup(
    apiSdk: ApiSDK,
    type: MemberType,
    access: FileShare | null,
  ) {
    const ownerApi = apiSdk.forRole("owner");
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest meta room ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const { data: file } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: {
        title: `Autotest meta ${apiSdk.faker.generateString(6)}.docx`,
      },
    });
    const fileId = file.response!.id!;
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolderRequest: { title: "Autotest meta folder" },
    });
    const folderId = folder.response!.id!;
    const tpl = await createTemplateWithFields(ownerApi, apiSdk);
    await ownerApi.metadata.assignFileTemplates({
      fileId,
      assignMetadataTemplates: { templateIds: [tpl.id] },
    });
    await ownerApi.metadata.assignFolderTemplates({
      folderId,
      assignMetadataTemplates: { templateIds: [tpl.id] },
    });

    const { data: member, api } = await apiSdk.addAuthenticatedMember(
      "owner",
      type,
    );
    if (access !== null) {
      const { status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: member.response!.id!, access }],
          notify: false,
        },
      });
      // the matrix rests on the invitation having been applied
      expect(status).toBe(200);
    }
    return {
      ownerApi,
      api,
      fileId,
      folderId,
      templateId: tpl.id,
      fieldId: tpl.template.fields![0].id!,
    };
  }

  test("RoomManager (Room admin) can read and write metadata of the room's file and folder", async ({
    apiSdk,
  }) => {
    const s = await setup(apiSdk, "RoomAdmin", FileShare.RoomManager);

    expect(
      (await s.api.metadata.getFileMetadata({ fileId: s.fileId })).status,
    ).toBe(200);
    expect(
      (await s.api.metadata.getFolderMetadata({ folderId: s.folderId })).status,
    ).toBe(200);

    expect(
      (
        await s.api.metadata.setFileValues({
          fileId: s.fileId,
          setMetadataValues: {
            values: [{ fieldId: s.fieldId, stringValue: "by manager" }],
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await s.api.metadata.setFolderValues({
          folderId: s.folderId,
          setMetadataValues: {
            values: [{ fieldId: s.fieldId, stringValue: "by manager" }],
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await s.api.metadata.setFileCustomFields({
          fileId: s.fileId,
          setCustomFields: { fields: [{ name: "k", value: "v" }] },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await s.api.metadata.setFolderCustomFields({
          folderId: s.folderId,
          setCustomFields: { fields: [{ name: "k", value: "v" }] },
        })
      ).status,
    ).toBe(200);

    const { data } = await s.ownerApi.metadata.getFileMetadata({
      fileId: s.fileId,
    });
    expect(data.response!.templates![0].fields![0].value!.stringValue).toBe(
      "by manager",
    );
  });

  test("A Read-only room member can read metadata but every write is refused with 403 and changes nothing", async ({
    apiSdk,
  }) => {
    const s = await setup(apiSdk, "User", FileShare.Read);

    const { status: readFile, data: fileMeta } =
      await s.api.metadata.getFileMetadata({ fileId: s.fileId });
    expect(readFile).toBe(200);
    expect(
      fileMeta.response!.templates!.map((t: { id?: number }) => t.id),
    ).toEqual([s.templateId]);
    expect(
      (await s.api.metadata.getFolderMetadata({ folderId: s.folderId })).status,
    ).toBe(200);

    const other = await createTemplateWithFields(s.ownerApi, apiSdk);
    const writes = {
      assignFile: (
        await s.api.metadata.assignFileTemplates({
          fileId: s.fileId,
          assignMetadataTemplates: { templateIds: [other.id] },
        })
      ).status,
      unassignFile: (
        await s.api.metadata.unassignFileTemplate({
          fileId: s.fileId,
          templateId: s.templateId,
        })
      ).status,
      setFileValues: (
        await s.api.metadata.setFileValues({
          fileId: s.fileId,
          setMetadataValues: {
            values: [{ fieldId: s.fieldId, stringValue: "nope" }],
          },
        })
      ).status,
      setFileCustom: (
        await s.api.metadata.setFileCustomFields({
          fileId: s.fileId,
          setCustomFields: { fields: [{ name: "k", value: "v" }] },
        })
      ).status,
      assignFolder: (
        await s.api.metadata.assignFolderTemplates({
          folderId: s.folderId,
          assignMetadataTemplates: { templateIds: [other.id] },
        })
      ).status,
      updateFolder: (
        await s.api.metadata.updateFolderTemplate({
          folderId: s.folderId,
          templateId: s.templateId,
          updateFolderMetadataTemplateRequest: { cascade: true },
        })
      ).status,
      unassignFolder: (
        await s.api.metadata.unassignFolderTemplate({
          folderId: s.folderId,
          templateId: s.templateId,
        })
      ).status,
      setFolderValues: (
        await s.api.metadata.setFolderValues({
          folderId: s.folderId,
          setMetadataValues: {
            values: [{ fieldId: s.fieldId, stringValue: "nope" }],
          },
        })
      ).status,
      setFolderCustom: (
        await s.api.metadata.setFolderCustomFields({
          folderId: s.folderId,
          setCustomFields: { fields: [{ name: "k", value: "v" }] },
        })
      ).status,
    };
    expect(Object.values(writes)).toEqual(Array(9).fill(403));

    const { data: file } = await s.ownerApi.metadata.getFileMetadata({
      fileId: s.fileId,
    });
    const { data: folder } = await s.ownerApi.metadata.getFolderMetadata({
      folderId: s.folderId,
    });
    for (const meta of [file.response!, folder.response!]) {
      expect(meta.templates!.map((t: { id?: number }) => t.id)).toEqual([
        s.templateId,
      ]);
      expect(meta.templates![0].fields![0].value ?? null).toBeNull();
      expect(meta.customFields ?? []).toEqual([]);
    }
  });

  test("A user without access to the room cannot read or write its metadata", async ({
    apiSdk,
  }) => {
    const s = await setup(apiSdk, "User", null);

    const reads = [
      (await s.api.metadata.getFileMetadata({ fileId: s.fileId })).status,
      (await s.api.metadata.getFolderMetadata({ folderId: s.folderId })).status,
      (await s.api.metadata.getCascadeProgress({ folderId: s.folderId }))
        .status,
    ];
    expect(reads).toEqual([403, 403, 403]);

    const { status } = await s.api.metadata.setFileValues({
      fileId: s.fileId,
      setMetadataValues: {
        values: [{ fieldId: s.fieldId, stringValue: "nope" }],
      },
    });
    expect(status).toBe(403);

    const { data } = await s.ownerApi.metadata.getFileMetadata({
      fileId: s.fileId,
    });
    expect(data.response!.templates![0].fields![0].value ?? null).toBeNull();
  });

  test("Anonymous callers without a link get 401 on file and folder metadata", async ({
    apiSdk,
  }) => {
    const s = await setup(apiSdk, "User", null);
    const anon = apiSdk.forAnonymous().metadata;

    const statuses = [
      (await anon.getFileMetadata({ fileId: s.fileId })).status,
      (await anon.getFolderMetadata({ folderId: s.folderId })).status,
      (
        await anon.setFileValues({
          fileId: s.fileId,
          setMetadataValues: {
            values: [{ fieldId: s.fieldId, stringValue: "nope" }],
          },
        })
      ).status,
    ];
    expect(statuses).toEqual([401, 401, 401]);
  });
});
