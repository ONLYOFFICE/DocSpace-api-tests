import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  MetadataFieldType,
  RoomType,
  SearchArea,
} from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";
import { createRoomOfType, fileIds, folderIds } from "@/src/helpers/rooms";
import { getMyDocsFolderId } from "@/src/helpers/files";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import { waitForRoomsSearch } from "@/src/helpers/wait-for-rooms-search";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

/**
 * The two parts of the filter take different paths: the template assignment is
 * a row of the link table and is read straight away, while the conditions and
 * filterValue are narrowed by the metadata index first, so a value written a
 * moment ago can still be missing from it - hence the waiting on those alone.
 */

async function stageTemplate(api: Api, apiSdk: ApiSDK) {
  const { id, template } = await createTemplateWithFields(api, apiSdk, [
    { name: "Stage", type: MetadataFieldType.String },
    { name: "Amount", type: MetadataFieldType.Number },
  ]);
  const fieldId = (name: string) =>
    template.fields!.find((f) => f.name === name)!.id!;

  return { templateId: id, stage: fieldId("Stage"), amount: fieldId("Amount") };
}

async function roomWithValues(
  api: Api,
  apiSdk: ApiSDK,
  templateId: number,
  values: { fieldId: number; stringValue?: string; numberValue?: number }[],
  roomType: RoomType = RoomType.CustomRoom,
) {
  const roomId = await createRoomOfType(
    apiSdk,
    "owner",
    `Autotest search ${apiSdk.faker.generateString(6)}`,
    roomType,
  );

  const { status: assigned } = await api.metadata.assignFolderTemplates({
    folderId: roomId,
    assignMetadataTemplates: { templateIds: [templateId] },
  });
  expect(assigned).toBe(200);

  const { status: written } = await api.metadata.setFolderValues({
    folderId: roomId,
    setMetadataValues: { values },
  });
  expect(written).toBe(200);

  return roomId;
}

test.describe("POST /files/rooms/search - Search the rooms by metadata", () => {
  test("POST /files/rooms/search - metadataTemplateId alone keeps the rooms carrying the template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);

    const withTemplate = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: "Draft" },
    ]);
    const without = await createRoomOfType(
      apiSdk,
      "owner",
      `Autotest plain ${apiSdk.faker.generateString(6)}`,
      RoomType.CustomRoom,
    );

    const { data, status } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: { metadataTemplateId: templateId },
    });

    expect(status).toBe(200);
    expect(folderIds(data)).toEqual([withTemplate]);
    expect(folderIds(data)).not.toContain(without);
    expect(data.response?.files ?? []).toEqual([]);
  });

  test("POST /files/rooms/search - A condition on a string field keeps only the room holding that value", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);

    const draft = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: "Draft" },
    ]);
    const signed = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: "Signed" },
    ]);

    const { data } = await waitForRoomsSearch(
      () =>
        ownerApi.rooms.searchRooms({
          roomsMetadataSearchRequestDto: {
            metadataTemplateId: templateId,
            metadataFilters: [{ fieldId: stage, op: "eq", value: "Draft" }],
          },
        }),
      ({ data: found }) => expect(folderIds(found)).toContain(draft),
    );

    expect(folderIds(data)).not.toContain(signed);
    expect(data.response?.total).toBe(1);
  });

  test("POST /files/rooms/search - Conditions combine with AND", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage, amount } = await stageTemplate(ownerApi, apiSdk);

    const both = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: "Draft" },
      { fieldId: amount, numberValue: 10 },
    ]);
    const stageOnly = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: "Draft" },
      { fieldId: amount, numberValue: 99 },
    ]);

    const { data } = await waitForRoomsSearch(
      () =>
        ownerApi.rooms.searchRooms({
          roomsMetadataSearchRequestDto: {
            metadataTemplateId: templateId,
            metadataFilters: [
              { fieldId: stage, op: "eq", value: "Draft" },
              { fieldId: amount, op: "eq", value: "10" },
            ],
          },
        }),
      ({ data: found }) => expect(folderIds(found)).toContain(both),
    );

    // Satisfying the first condition and failing the second is not enough.
    expect(folderIds(data)).not.toContain(stageOnly);
  });

  test("POST /files/rooms/search - A number range keeps the rooms whose value lies within the bounds", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, amount } = await stageTemplate(ownerApi, apiSdk);

    const inside = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: amount, numberValue: 15 },
    ]);
    // One room under the lower bound and one over the upper one, so neither
    // bound can be dropped without the answer changing.
    const below = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: amount, numberValue: 5 },
    ]);
    const above = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: amount, numberValue: 500 },
    ]);

    const { data } = await waitForRoomsSearch(
      () =>
        ownerApi.rooms.searchRooms({
          roomsMetadataSearchRequestDto: {
            metadataTemplateId: templateId,
            metadataFilters: [
              { fieldId: amount, op: "range", from: "10", to: "20" },
            ],
          },
        }),
      ({ data: found }) => expect(folderIds(found)).toContain(inside),
    );

    expect(folderIds(data)).toEqual([inside]);
    expect(folderIds(data)).not.toContain(below);
    expect(folderIds(data)).not.toContain(above);
  });

  test("POST /files/rooms/search - filterValue finds a room by a metadata value and says which field matched", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);
    // Nothing else on the portal carries it, and the room titles are random,
    // so a hit can only be this room and only through its metadata.
    const needle = `metaneedle${apiSdk.faker.generateString(8)}`;

    const roomId = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: needle },
    ]);

    const { data } = await waitForRoomsSearch(
      () =>
        ownerApi.rooms.searchRooms({
          roomsMetadataSearchRequestDto: { filterValue: needle },
        }),
      ({ data: found }) => expect(folderIds(found)).toEqual([roomId]),
    );

    const match = (
      data.response!.folders as { metadataMatches?: { fieldId?: number }[] }[]
    )[0].metadataMatches;
    expect(match, JSON.stringify(data.response!.folders)).toHaveLength(1);
    expect(match![0]).toMatchObject({
      templateId,
      fieldId: stage,
      fieldName: "Stage",
      value: needle,
    });
  });

  test("POST /files/rooms/search - searchArea looks in the archive instead of the active rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);

    const roomId = await roomWithValues(ownerApi, apiSdk, templateId, [
      { fieldId: stage, stringValue: "Draft" },
    ]);
    await archiveRoomAndWait(apiSdk, roomId);

    const { data: active, status } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: { metadataTemplateId: templateId },
    });
    expect(status).toBe(200);
    expect(folderIds(active)).not.toContain(roomId);

    const { data: archived } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: {
        metadataTemplateId: templateId,
        searchArea: SearchArea.Archive,
      },
    });
    expect(folderIds(archived)).toEqual([roomId]);
  });

  test("POST /files/rooms/search - type narrows the search to the named room types", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);

    const custom = await roomWithValues(
      ownerApi,
      apiSdk,
      templateId,
      [{ fieldId: stage, stringValue: "Draft" }],
      RoomType.CustomRoom,
    );
    const pub = await roomWithValues(
      ownerApi,
      apiSdk,
      templateId,
      [{ fieldId: stage, stringValue: "Draft" }],
      RoomType.PublicRoom,
    );

    const { data, status } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: {
        metadataTemplateId: templateId,
        type: [RoomType.PublicRoom],
      },
    });

    expect(status).toBe(200);
    expect(folderIds(data)).toEqual([pub]);
    expect(folderIds(data)).not.toContain(custom);
  });

  test("POST /files/rooms/search - An empty body lists the section unfiltered", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoomOfType(
      apiSdk,
      "owner",
      `Autotest plain ${apiSdk.faker.generateString(6)}`,
      RoomType.CustomRoom,
    );

    const { data, status } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: {},
    });

    expect(status).toBe(200);
    // A room carrying no metadata is part of the answer, so an empty body is a
    // plain listing and not a filter that matches nothing.
    expect(folderIds(data)).toContain(roomId);
  });

  test("POST /files/rooms/search - An unknown metadata template is refused", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").rooms.searchRooms({
      roomsMetadataSearchRequestDto: { metadataTemplateId: 999999999 },
    });

    expect(status).toBe(400);
  });

  test("POST /files/rooms/search - A field outside the named template is refused", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId } = await stageTemplate(ownerApi, apiSdk);
    const other = await stageTemplate(ownerApi, apiSdk);

    const { status } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: {
        metadataTemplateId: templateId,
        metadataFilters: [{ fieldId: other.stage, op: "eq", value: "Draft" }],
      },
    });

    expect(status).toBe(400);
  });

  test("POST /files/rooms/search - More than twenty conditions are refused", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);
    const conditions = (count: number) =>
      Array.from({ length: count }, () => ({
        fieldId: stage,
        op: "eq",
        value: "Draft",
      }));

    const { status: atLimit } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: {
        metadataTemplateId: templateId,
        metadataFilters: conditions(20),
      },
    });
    expect(atLimit).toBe(200);

    const { status } = await ownerApi.rooms.searchRooms({
      roomsMetadataSearchRequestDto: {
        metadataTemplateId: templateId,
        metadataFilters: conditions(21),
      },
    });
    expect(status).toBe(400);
  });
});

test.describe("POST /files/:folderId/search - Search a folder by metadata", () => {
  async function createDoc(api: Api, apiSdk: ApiSDK, folderId: number) {
    const { data, status } = await api.files.createFile({
      folderId,
      createFileRequest: {
        title: `Autotest search ${apiSdk.faker.generateString(6)}.docx`,
      },
    });
    expect(status).toBe(200);
    return data.response!.id!;
  }

  test("POST /files/:folderId/search - metadataTemplateId keeps the entries carrying the template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const myDocs = await getMyDocsFolderId(ownerApi);
    const { templateId } = await stageTemplate(ownerApi, apiSdk);

    const tagged = await createDoc(ownerApi, apiSdk, myDocs);
    const plain = await createDoc(ownerApi, apiSdk, myDocs);
    const { status: assigned } = await ownerApi.metadata.assignFileTemplates({
      fileId: tagged,
      assignMetadataTemplates: { templateIds: [templateId] },
    });
    expect(assigned).toBe(200);

    const { data, status } = await ownerApi.folders.searchFolder({
      folderId: myDocs,
      folderMetadataSearch: { metadataTemplateId: templateId },
    });

    expect(status).toBe(200);
    expect(fileIds(data)).toEqual([tagged]);
    expect(fileIds(data)).not.toContain(plain);
    expect(data.response?.current?.id).toBe(myDocs);
  });

  test("POST /files/:folderId/search - A condition keeps only the file holding that value", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const myDocs = await getMyDocsFolderId(ownerApi);
    const { templateId, stage } = await stageTemplate(ownerApi, apiSdk);

    const draft = await createDoc(ownerApi, apiSdk, myDocs);
    const signed = await createDoc(ownerApi, apiSdk, myDocs);
    for (const [fileId, value] of [
      [draft, "Draft"],
      [signed, "Signed"],
    ] as const) {
      await ownerApi.metadata.assignFileTemplates({
        fileId,
        assignMetadataTemplates: { templateIds: [templateId] },
      });
      await ownerApi.metadata.setFileValues({
        fileId,
        setMetadataValues: { values: [{ fieldId: stage, stringValue: value }] },
      });
    }

    const { data } = await waitForRoomsSearch(
      () =>
        ownerApi.folders.searchFolder({
          folderId: myDocs,
          folderMetadataSearch: {
            metadataTemplateId: templateId,
            metadataFilters: [{ fieldId: stage, op: "eq", value: "Draft" }],
          },
        }),
      ({ data: found }) => expect(fileIds(found)).toContain(draft),
    );

    expect(fileIds(data)).not.toContain(signed);
  });

  test("POST /files/:folderId/search - withSubFolders false keeps the search to the direct children", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const myDocs = await getMyDocsFolderId(ownerApi);
    const { templateId } = await stageTemplate(ownerApi, apiSdk);

    const { data: sub, status: subStatus } =
      await ownerApi.folders.createFolder({
        folderId: myDocs,
        createFolderRequest: {
          title: `Autotest sub ${apiSdk.faker.generateString(6)}`,
        },
      });
    expect(subStatus).toBe(200);

    const atRoot = await createDoc(ownerApi, apiSdk, myDocs);
    const nested = await createDoc(ownerApi, apiSdk, sub.response!.id!);
    for (const fileId of [atRoot, nested]) {
      await ownerApi.metadata.assignFileTemplates({
        fileId,
        assignMetadataTemplates: { templateIds: [templateId] },
      });
    }

    const { data: whole, status } = await ownerApi.folders.searchFolder({
      folderId: myDocs,
      folderMetadataSearch: { metadataTemplateId: templateId },
    });
    expect(status).toBe(200);
    // The subtree is searched by default, which makes the narrowed answer
    // below a consequence of the flag and not of a missing file.
    expect(fileIds(whole).sort()).toEqual([atRoot, nested].sort());

    const { data: direct } = await ownerApi.folders.searchFolder({
      folderId: myDocs,
      folderMetadataSearch: {
        metadataTemplateId: templateId,
        withSubFolders: false,
      },
    });
    expect(fileIds(direct)).toEqual([atRoot]);
  });

  test("POST /files/:folderId/search - filterValue matches a custom field value and says which field matched", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const myDocs = await getMyDocsFolderId(ownerApi);
    const needle = `metaneedle${apiSdk.faker.generateString(8)}`;

    const fileId = await createDoc(ownerApi, apiSdk, myDocs);
    const { status: written } = await ownerApi.metadata.setFileCustomFields({
      fileId,
      setCustomFields: { fields: [{ name: "Counterparty", value: needle }] },
    });
    expect(written).toBe(200);

    const { data } = await waitForRoomsSearch(
      () =>
        ownerApi.folders.searchFolder({
          folderId: myDocs,
          folderMetadataSearch: { filterValue: needle },
        }),
      ({ data: found }) => expect(fileIds(found)).toEqual([fileId]),
    );

    const match = (
      data.response!.files as {
        metadataMatches?: {
          templateId?: number | null;
          fieldId?: number | null;
          fieldName?: string;
        }[];
      }[]
    )[0].metadataMatches;
    expect(match, JSON.stringify(data.response!.files)).toHaveLength(1);
    expect(match![0]).toMatchObject({
      fieldName: "Counterparty",
      value: needle,
    });
    // A custom field belongs to no template, so it carries no identifiers -
    // which the answer says by leaving the two fields out rather than nulling
    // them, so read them through a default.
    expect(match![0].templateId ?? null).toBeNull();
    expect(match![0].fieldId ?? null).toBeNull();
  });

  test("POST /files/:folderId/search - An unknown metadata template is refused", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const myDocs = await getMyDocsFolderId(ownerApi);

    const { status } = await ownerApi.folders.searchFolder({
      folderId: myDocs,
      folderMetadataSearch: { metadataTemplateId: 999999999 },
    });

    expect(status).toBe(400);
  });
});
