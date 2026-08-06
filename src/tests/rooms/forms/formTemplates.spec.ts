import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FolderType,
  RoomType,
  SearchArea,
  SortOrder,
} from "@onlyoffice/docspace-api-sdk";
import {
  createRoomOfType,
  folderIds,
  folderRoomTypes,
} from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomFromTemplate } from "@/src/helpers/wait-for-room-from-template";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

/**
 * Templates for form filling rooms are separated from ordinary room templates.
 * Both live under the same Templates root (FolderType.RoomTemplates, 30) and are
 * told apart by search area on GET /files/rooms:
 *   - searchArea=4 (SearchArea.Templates)     -> ordinary room templates only
 *   - searchArea=9 (SearchArea.FormTemplates) -> form templates only
 * Verified live: the two areas never return each other's entries, even when the
 * template titles overlap.
 */

/** Creates a template from a room and returns the new template id. */
async function createTemplate(
  apiSdk: ApiSDK,
  role: Role,
  roomId: number,
  title: string,
): Promise<number> {
  const api = apiSdk.forRole(role);
  const { status } = await api.rooms.createRoomTemplate({
    roomTemplateDto: { roomId, title },
  });
  if (status !== 200) {
    throw new Error(`createRoomTemplate(${title}) failed with ${status}`);
  }
  return waitForRoomTemplate(api.rooms);
}

/** A room template plus a form template, with deliberately overlapping titles. */
async function seedBothTemplateKinds(apiSdk: ApiSDK, prefix = "Shared Beta") {
  const customRoomId = await createRoomOfType(
    apiSdk,
    "owner",
    `${prefix} Custom Source`,
    RoomType.CustomRoom,
  );
  const formRoomId = await createRoomOfType(
    apiSdk,
    "owner",
    `${prefix} Form Source`,
    RoomType.FillingFormsRoom,
  );
  const roomTemplateId = await createTemplate(
    apiSdk,
    "owner",
    customRoomId,
    `${prefix} Room Template`,
  );
  const formTemplateId = await createTemplate(
    apiSdk,
    "owner",
    formRoomId,
    `${prefix} Form Template`,
  );
  return { customRoomId, formRoomId, roomTemplateId, formTemplateId };
}

test.describe("Room templates and form templates are separate collections", () => {
  test.describe("GET /files/rooms?searchArea=Templates - ordinary room templates", () => {
    test("GET /files/rooms - Templates area returns the room template and not the form template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomTemplateId, formTemplateId } =
        await seedBothTemplateKinds(apiSdk);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([roomTemplateId]);
      expect(folderIds(data)).not.toContain(formTemplateId);
      expect(folderRoomTypes(data)).toEqual([RoomType.CustomRoom]);
      expect(data.response!.total).toBe(1);
      expect(data.response!.current!.rootFolderType).toBe(
        FolderType.RoomTemplates,
      );
    });

    test("GET /files/rooms - Templates search on a shared prefix returns only the room template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomTemplateId, formTemplateId } =
        await seedBothTemplateKinds(apiSdk);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
        filterValue: "Shared Beta",
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([roomTemplateId]);
      expect(folderIds(data)).not.toContain(formTemplateId);
    });

    test("GET /files/rooms - Templates search for a form template title returns empty", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomTemplateId } = await seedBothTemplateKinds(apiSdk);

      // positive control on the same area
      const { data: control } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
        filterValue: "Shared Beta Room Template",
      });
      expect(folderIds(control)).toEqual([roomTemplateId]);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
        filterValue: "Shared Beta Form Template",
      });
      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([]);
      expect(data.response!.total).toBe(0);
    });

    test("GET /files/rooms - Templates pagination and sorting never page in a form template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Paged Custom Source",
        RoomType.CustomRoom,
      );
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Paged Form Source",
        RoomType.FillingFormsRoom,
      );
      const aTemplate = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        "AAA Room Template",
      );
      const zTemplate = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        "ZZZ Room Template",
      );
      // a form template that would sort between them
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "MMM Form Template",
      );

      const { data: asc } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
      });
      expect(folderIds(asc)).toEqual([aTemplate, zTemplate]);
      expect(folderIds(asc)).not.toContain(formTemplateId);

      const seen: number[] = [];
      for (let startIndex = 0; startIndex < 2; startIndex++) {
        const { data } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
          sortBy: "AZ",
          sortOrder: SortOrder.Ascending,
          count: 1,
          startIndex,
        });
        expect(data.response!.total).toBe(2);
        expect(data.response!.startIndex).toBe(startIndex);
        seen.push(...folderIds(data));
      }
      expect(seen).toEqual([aTemplate, zTemplate]);
    });

    test("GET /files/rooms - Identically titled templates are still separated by area", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const title = "Identical Template Title";
      const customRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Same Title Custom Source",
        RoomType.CustomRoom,
      );
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Same Title Form Source",
        RoomType.FillingFormsRoom,
      );
      const roomTemplateId = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        title,
      );
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        title,
      );

      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
        filterValue: title,
      });
      expect(folderIds(rooms)).toEqual([roomTemplateId]);

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
        filterValue: title,
      });
      expect(folderIds(forms)).toEqual([formTemplateId]);
    });
  });

  test.describe("GET /files/rooms?searchArea=FormTemplates - form templates", () => {
    test("GET /files/rooms - FormTemplates area returns the form template and not the room template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomTemplateId, formTemplateId } =
        await seedBothTemplateKinds(apiSdk);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([formTemplateId]);
      expect(folderIds(data)).not.toContain(roomTemplateId);
      expect(folderRoomTypes(data)).toEqual([RoomType.FillingFormsRoom]);
      expect(data.response!.total).toBe(1);
      // both areas are views over the same Templates root
      expect(data.response!.current!.rootFolderType).toBe(
        FolderType.RoomTemplates,
      );
    });

    test("GET /files/rooms - FormTemplates finds a template by full and partial title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Search Form Source",
        RoomType.FillingFormsRoom,
      );
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Searchable Form Template",
      );
      await createTemplate(apiSdk, "owner", formRoomId, "Other Form Template");

      for (const filterValue of [
        "Searchable Form Template",
        "Searchable",
        "searchable form",
      ]) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.FormTemplates,
          filterValue,
        });
        expect(status, filterValue).toBe(200);
        expect(folderIds(data), filterValue).toEqual([formTemplateId]);
      }
    });

    test("GET /files/rooms - FormTemplates sorting and pagination keep total at the area size", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Sorted Form Source",
        RoomType.FillingFormsRoom,
      );
      const customRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Sorted Custom Source",
        RoomType.CustomRoom,
      );
      const aTemplate = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "AAA Form Template",
      );
      const zTemplate = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "ZZZ Form Template",
      );
      const roomTemplateId = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        "MMM Room Template",
      );

      const { data: asc } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
      });
      expect(folderIds(asc)).toEqual([aTemplate, zTemplate]);
      expect(folderIds(asc)).not.toContain(roomTemplateId);

      const { data: desc } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
        sortBy: "AZ",
        sortOrder: SortOrder.Descending,
      });
      expect(folderIds(desc)).toEqual([zTemplate, aTemplate]);

      const { data: page, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
        count: 1,
        startIndex: 1,
      });
      expect(status).toBe(200);
      expect(folderIds(page)).toEqual([zTemplate]);
      // total counts the filtered area, not the page and not both areas
      expect(page.response!.total).toBe(2);
      expect(page.response!.count).toBe(1);
      expect(page.response!.startIndex).toBe(1);
    });

    test("GET /files/rooms - FormTemplates returns an empty list when only room templates exist", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Only Room Tpl Source",
        RoomType.CustomRoom,
      );
      const roomTemplateId = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        "Only Room Template",
      );

      // control: the Templates area is not empty, so an empty FormTemplates
      // result cannot be a failing read
      const { data: control } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      expect(folderIds(control)).toEqual([roomTemplateId]);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([]);
      expect(data.response!.total).toBe(0);
      expect(data.response!.count).toBe(0);
    });

    test("GET /files/rooms - A deleted form template is no longer returned by FormTemplates", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Deleted Tpl Source",
        RoomType.FillingFormsRoom,
      );
      const doomed = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Doomed Form Template",
      );
      const kept = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Kept Form Template",
      );

      const { status } = await ownerApi.rooms.deleteRoom({
        id: doomed,
        deleteRoomRequest: { deleteAfter: false },
      });
      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data, status: listStatus } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(listStatus).toBe(200);
      expect(folderIds(data)).toEqual([kept]);
      expect(folderIds(data)).not.toContain(doomed);
      expect(data.response!.total).toBe(1);
    });

    test("GET /files/rooms - Another user's form templates are not returned", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { formTemplateId, roomTemplateId } =
        await seedBothTemplateKinds(apiSdk);

      const admin = await apiSdk.addMember("owner", "DocSpaceAdmin");
      const adminApi = await apiSdk.authenticateMember(
        admin.userData,
        "DocSpaceAdmin",
      );

      // the owner still sees their own template - the read itself works
      const { data: mine } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(mine)).toEqual([formTemplateId]);

      const { data: theirs, status } = await adminApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(status).toBe(200);
      expect(folderIds(theirs)).toEqual([]);
      expect(theirs.response!.total).toBe(0);

      const { data: theirRooms } = await adminApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      expect(folderIds(theirRooms)).not.toContain(roomTemplateId);
    });

    test("GET /files/rooms - A public form template becomes visible to a DocSpaceAdmin in FormTemplates only", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Public Tpl Source",
        RoomType.FillingFormsRoom,
      );
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Public Form Template",
      );

      const admin = await apiSdk.addMember("owner", "DocSpaceAdmin");
      const plainUser = await apiSdk.addMember("owner", "User");
      const adminApi = await apiSdk.authenticateMember(
        admin.userData,
        "DocSpaceAdmin",
      );
      const userApi = await apiSdk.authenticateMember(
        plainUser.userData,
        "User",
      );

      const { status } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: formTemplateId, public: true },
      });
      expect(status).toBe(200);

      const { data: adminForms } = await adminApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(adminForms)).toEqual([formTemplateId]);

      // sharing it did not move it into the ordinary Templates area
      const { data: adminRooms } = await adminApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      expect(folderIds(adminRooms)).toEqual([]);

      // and a plain User still does not see it
      const { data: userForms } = await userApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(userForms)).toEqual([]);
    });
  });

  test.describe("GET /files/rooms - template area and type filter combinations", () => {
    test("GET /files/rooms - FormTemplates with type=FillingFormsRoom returns the form template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { formTemplateId } = await seedBothTemplateKinds(apiSdk);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
        type: [RoomType.FillingFormsRoom],
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([formTemplateId]);
    });

    test("GET /files/rooms - Contradictory area and type combinations return nothing instead of leaking a template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomTemplateId, formTemplateId } =
        await seedBothTemplateKinds(apiSdk);

      // controls: both templates are readable in their own area
      const { data: formsControl } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(formsControl)).toEqual([formTemplateId]);
      const { data: roomsControl } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      expect(folderIds(roomsControl)).toEqual([roomTemplateId]);

      const { data: formsWithCustom, status: s1 } =
        await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.FormTemplates,
          type: [RoomType.CustomRoom],
        });
      expect(s1).toBe(200);
      expect(folderIds(formsWithCustom)).toEqual([]);
      expect(formsWithCustom.response!.total).toBe(0);

      const { data: roomsWithForm, status: s2 } =
        await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
          type: [RoomType.FillingFormsRoom],
        });
      expect(s2).toBe(200);
      expect(folderIds(roomsWithForm)).toEqual([]);
      expect(roomsWithForm.response!.total).toBe(0);
    });

    // Enum names bind case-insensitively, so these are live aliases for area 9.
    for (const alias of ["FormTemplates", "formtemplates"]) {
      test(`GET /files/rooms - searchArea="${alias}" resolves to the form templates area`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { formTemplateId, roomTemplateId } =
          await seedBothTemplateKinds(apiSdk);

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: alias as never,
        });

        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([formTemplateId]);
        expect(folderIds(data)).not.toContain(roomTemplateId);
      });
    }

    const rejectedAreas: { label: string; value: unknown }[] = [
      { label: "out-of-range 99", value: 99 },
      { label: "non-numeric string", value: "abc" },
      { label: "boolean", value: true },
      { label: "negative", value: -1 },
      { label: "fractional", value: 1.5 },
      { label: "Int32 overflow", value: Number.MAX_SAFE_INTEGER },
      { label: "over-long string", value: "T".repeat(300) },
    ];

    for (const { label, value } of rejectedAreas) {
      test(`GET /files/rooms - Template listing rejects searchArea ${label} with 400, not 500`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await seedBothTemplateKinds(apiSdk);

        const { status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: value as never,
        });
        expect(status).toBe(400);
      });
    }

    // Empty values bind to the enum default (Active), which contains no
    // templates at all - so an unrecognised area cannot disclose templates.
    const emptyAreas: { label: string; value: unknown }[] = [
      { label: "empty string", value: "" },
      { label: "whitespace string", value: "   " },
      { label: "null", value: null },
      { label: "object", value: { area: 9 } },
      { label: "array", value: [] },
    ];

    for (const { label, value } of emptyAreas) {
      test(`GET /files/rooms - searchArea ${label} falls back to Active and discloses no template`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { roomTemplateId, formTemplateId, customRoomId } =
          await seedBothTemplateKinds(apiSdk);

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: value as never,
        });

        expect(status).toBe(200);
        expect(folderIds(data)).not.toContain(roomTemplateId);
        expect(folderIds(data)).not.toContain(formTemplateId);
        // the Active area is what actually came back
        expect(folderIds(data)).toContain(customRoomId);
        expect(data.response!.current!.rootFolderType).toBe(
          FolderType.VirtualRooms,
        );
      });
    }
  });

  test.describe("POST /files/rooms/fromtemplate - creating rooms after the template split", () => {
    test("POST /files/rooms/fromtemplate - A form template creates a form filling room in the Forms section", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "From Tpl Form Source",
        RoomType.FillingFormsRoom,
      );
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "From Tpl Form Template",
      );

      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: formTemplateId,
          title: "Room From Form Template",
        },
      });
      expect(status).toBe(200);
      const newRoomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(newRoomId).toBeGreaterThan(0);

      const { data: info, status: infoStatus } =
        await ownerApi.rooms.getRoomInfo({ id: newRoomId });
      expect(infoStatus).toBe(200);
      expect(info.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(info.response!.title).toBe("Room From Form Template");

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toContain(newRoomId);

      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).not.toContain(newRoomId);
    });

    test("POST /files/rooms/fromtemplate - A room template creates an ordinary room in the Rooms section", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "From Tpl Custom Source",
        RoomType.CustomRoom,
      );
      const roomTemplateId = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        "From Tpl Room Template",
      );

      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: roomTemplateId,
          title: "Room From Room Template",
        },
      });
      expect(status).toBe(200);
      const newRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: newRoomId,
      });
      expect(info.response!.roomType).toBe(RoomType.CustomRoom);

      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).toContain(newRoomId);

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).not.toContain(newRoomId);
    });

    test("POST /files/rooms/fromtemplate - The template's type wins over a conflicting roomType in the request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Override Custom Source",
        RoomType.CustomRoom,
      );
      const roomTemplateId = await createTemplate(
        apiSdk,
        "owner",
        customRoomId,
        "Override Room Template",
      );

      // asking a room template to produce a form filling room
      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: roomTemplateId,
          title: "Overridden Room",
          roomType: RoomType.FillingFormsRoom,
        } as never,
      });
      expect(status).toBe(200);
      const newRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

      // the override is ignored: the room keeps the template's type and lands in
      // the Rooms section, so it cannot leak into Forms
      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: newRoomId,
      });
      expect(info.response!.roomType).toBe(RoomType.CustomRoom);

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).not.toContain(newRoomId);

      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).toContain(newRoomId);
    });

    test("POST /files/rooms/fromtemplate - A form template's settings are inherited by the new room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Inherit Form Source",
        RoomType.FillingFormsRoom,
      );
      const { status: updateStatus } = await ownerApi.rooms.updateRoom({
        id: formRoomId,
        updateRoomRequest: { indexing: true, denyDownload: true },
      });
      expect(updateStatus).toBe(200);

      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Inherit Form Template",
      );

      // the template itself carries the settings across
      const { data: template } = await ownerApi.rooms.getRoomInfo({
        id: formTemplateId,
      });
      expect(template.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(template.response!.indexing).toBe(true);
      expect(template.response!.denyDownload).toBe(true);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: formTemplateId,
          title: "Inherited Form Room",
        },
      });
      const newRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: newRoomId,
      });
      expect(info.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(info.response!.indexing).toBe(true);
      expect(info.response!.denyDownload).toBe(true);

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toContain(newRoomId);
    });

    // A form template stores its tags (createRoomTemplate copies whatever is
    // passed in `tags`), but creating a room from it drops them.
    test.fail(
      "BUG XXXXX: POST /files/rooms/fromtemplate - A form template's tags are not applied to the new room",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const formRoomId = await createRoomOfType(
          apiSdk,
          "owner",
          "Tagged Form Source",
          RoomType.FillingFormsRoom,
        );

        const { status: tagStatus } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: formRoomId,
            title: "Tagged Form Template",
            tags: ["FormTemplateTag"],
          },
        });
        expect(tagStatus).toBe(200);
        const formTemplateId = await waitForRoomTemplate(ownerApi.rooms);

        // premise: the template really does hold the tag
        const { data: template } = await ownerApi.rooms.getRoomInfo({
          id: formTemplateId,
        });
        expect(template.response!.tags).toContain("FormTemplateTag");

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId: formTemplateId,
            title: "Room From Tagged Form Template",
          },
        });
        const newRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { data: info } = await ownerApi.rooms.getRoomInfo({
          id: newRoomId,
        });
        // the room is created with the right type but an empty tag list
        expect(info.response!.roomType).toBe(RoomType.FillingFormsRoom);
        expect(info.response!.tags).toContain("FormTemplateTag");
      },
    );

    test("POST /files/rooms/fromtemplate - A deleted form template no longer produces a room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Removed Tpl Source",
        RoomType.FillingFormsRoom,
      );
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Removed Form Template",
      );

      await ownerApi.rooms.deleteRoom({
        id: formTemplateId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const formsBefore = folderIds(
        (
          await ownerApi.rooms.getRoomsFolder({
            searchArea: SearchArea.Forms,
          })
        ).data,
      );

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: formTemplateId,
          title: "Room From Deleted Form Template",
        },
      });

      // No room is produced. The status route keeps reporting roomId -1, so the
      // observable contract is "nothing new appears in the Forms section".
      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms).sort()).toEqual([...formsBefore].sort());
      const titles = (
        (forms.response!.folders ?? []) as { title: string }[]
      ).map((f) => f.title);
      expect(titles).not.toContain("Room From Deleted Form Template");
    });

    const badTemplateIds: { label: string; value: unknown }[] = [
      { label: "non-numeric string", value: "abc" },
      { label: "fractional", value: 1.5 },
      { label: "boolean", value: true },
      { label: "object", value: { id: 1 } },
    ];

    for (const { label, value } of badTemplateIds) {
      test(`POST /files/rooms/fromtemplate - templateId of ${label} returns 400 and creates no room`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await createRoomOfType(
          apiSdk,
          "owner",
          "Bad Tpl Control Form",
          RoomType.FillingFormsRoom,
        );
        const before = folderIds(
          (
            await ownerApi.rooms.getRoomsFolder({
              searchArea: SearchArea.Forms,
            })
          ).data,
        );

        const { status } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId: value as never,
            title: `Bad Template ${label}`,
          },
        });
        expect(status).toBe(400);

        const { data: forms } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
        });
        expect(folderIds(forms).sort()).toEqual([...before].sort());
      });
    }

    test("POST /files/rooms/fromtemplate - Another user's form template does not create a room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Foreign Tpl Source",
        RoomType.FillingFormsRoom,
      );
      const formTemplateId = await createTemplate(
        apiSdk,
        "owner",
        formRoomId,
        "Foreign Form Template",
      );

      const admin = await apiSdk.addMember("owner", "DocSpaceAdmin");
      const adminApi = await apiSdk.authenticateMember(
        admin.userData,
        "DocSpaceAdmin",
      );

      await adminApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: formTemplateId,
          title: "Stolen Form Room",
        },
      });

      // nothing is created for the caller, and the template is not disclosed
      const { data: adminForms } = await adminApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      const adminTitles = (
        (adminForms.response!.folders ?? []) as { title: string }[]
      ).map((f) => f.title);
      expect(adminTitles).not.toContain("Stolen Form Room");

      const { data: adminTemplates } = await adminApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(adminTemplates)).not.toContain(formTemplateId);

      // and the owner's Forms section is untouched
      const { data: ownerForms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      const ownerTitles = (
        (ownerForms.response!.folders ?? []) as { title: string }[]
      ).map((f) => f.title);
      expect(ownerTitles).not.toContain("Stolen Form Room");
    });
  });
});
