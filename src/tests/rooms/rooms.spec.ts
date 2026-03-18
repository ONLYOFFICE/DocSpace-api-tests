import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomsApi, RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import { createAllRoomTypes } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";

function filterRoomsFolder(rooms: RoomsApi, filterValue: string) {
  // TODO(sdk): getRoomsFolder has 15 positional params — filterValue is the last one.
  // Fix: set useSingleRequestParameter=true in the openapi-generator config to generate an options object instead.
  return rooms.getRoomsFolder(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    filterValue,
  );
}

test.describe("API rooms methods", () => {
  test.describe("POST /files/rooms", () => {
    test("POST /files/rooms - Owner creates a Custom room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        title: "Autotest Custom Room",
        roomType: RoomType.CustomRoom,
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Custom Room");
      expect(data.response!.roomType).toBe(RoomType.CustomRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Collaboration room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        title: "Autotest Collaboration Room",
        roomType: RoomType.EditingRoom,
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Collaboration Room");
      expect(data.response!.roomType).toBe(RoomType.EditingRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        title: "Autotest Form Filling Room",
        roomType: RoomType.FillingFormsRoom,
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Form Filling Room");
      expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Public room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        title: "Autotest Public Room",
        roomType: RoomType.PublicRoom,
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Public Room");
      expect(data.response!.roomType).toBe(RoomType.PublicRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Virtual data room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        title: "Autotest Virtual Data Room",
        roomType: RoomType.VirtualDataRoom,
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Virtual Data Room");
      expect(data.response!.roomType).toBe(RoomType.VirtualDataRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });
  });

  test("GET /files/rooms - Owner gets rooms list", async ({ api, apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await createAllRoomTypes(apiSdk, "owner");

    await test.step("returns all created rooms with correct count", async () => {
      const { data, status } = await ownerApi.rooms.getRoomsFolder();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.folders!.length).toBe(5);
      expect((data.response!.files as unknown[]).length).toBe(0);
      expect(data.response!.count).toBe(5);
      expect(data.response!.total).toBe(5);
      expect(data.response!.startIndex).toBe(0);
      expect(data.response!.folders![0].ownedBy!.id).toBe(api.adminUserId);
    });

    await test.step("filter by type returns only matching rooms", async () => {
      const { data, status } = await ownerApi.rooms.getRoomsFolder([
        RoomType.CustomRoom,
      ]);

      expect(status).toBe(200);
      expect(data.response!.total).toBe(1);
      // TODO(sdk): FolderContentDtoInteger.folders typed as FileEntryBaseDto[] — roomType field missing
      expect((data.response!.folders as any[])[0].roomType).toBe(
        RoomType.CustomRoom,
      );
    });

    await test.step("filterValue search by title", async () => {
      const { data, status } = await filterRoomsFolder(
        ownerApi.rooms,
        "Autotest VDR",
      );

      expect(status).toBe(200);
      expect(data.response!.count).toBe(1);
      expect(data.response!.folders![0].title as string).toContain(
        "Autotest VDR",
      );
    });
  });

  test.describe("PUT /files/rooms/:id", () => {
    test("PUT /files/rooms/:id - Owner updates room title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        title: "Autotest Room Before Update",
        roomType: RoomType.CustomRoom,
      });
      const roomId = createData.response!.id!;

      await test.step("update title", async () => {
        const { data, status } = await ownerApi.rooms.updateRoom(roomId, {
          title: "Autotest Room After Update",
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Autotest Room After Update");
        expect(data.response!.id).toBe(roomId);
      });

      await test.step("GET /files/rooms/:id - confirms title changed", async () => {
        const { data, status } = await ownerApi.rooms.getRoomInfo(roomId);

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Autotest Room After Update");
      });
    });

    test("PUT /files/rooms/:id - Owner updates all allowed fields for VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        title: "Autotest VDR Room",
        roomType: RoomType.VirtualDataRoom,
      });
      const roomId = createData.response!.id!;

      await test.step("update all fields", async () => {
        const { data, status } = await ownerApi.rooms.updateRoom(roomId, {
          title: "Updated VDR Room",
          indexing: true,
          denyDownload: true,
          lifetime: {
            deletePermanently: true,
            period: 0,
            value: 30,
            enabled: true,
          },
          watermark: {
            enabled: true,
            additions: 1,
            text: "Confidential",
            rotate: 0,
            imageScale: 100,
          },
          color: "FF5733",
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Updated VDR Room");
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
        // TODO(sdk): FolderDto.logo, .lifetime, .watermark typed as object — nested fields missing
        const logo = data.response!.logo as unknown as Record<string, unknown>;
        expect(logo.color).toBe("FF5733");
        const lifetime = data.response!.lifetime as Record<string, unknown>;
        expect(lifetime.period).toBe(0);
        expect(lifetime.value).toBe(30);
        expect(lifetime.deletePermanently).toBe(true);
        const watermark = data.response!.watermark as unknown as Record<
          string,
          unknown
        >;
        expect(watermark.additions).toBe(1);
        expect(watermark.text).toBe("Confidential");
        expect(watermark.rotate).toBe(0);
        expect(watermark.imageScale).toBe(100);
      });

      await test.step("GET /files/rooms/:id - verify all fields saved", async () => {
        const { data, status } = await ownerApi.rooms.getRoomInfo(roomId);

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Updated VDR Room");
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
        // TODO(sdk): FolderDto.logo, .lifetime, .watermark typed as object — nested fields missing
        const logo = data.response!.logo as unknown as Record<string, unknown>;
        expect(logo.color).toBe("FF5733");
        const lifetime = data.response!.lifetime as Record<string, unknown>;
        expect(lifetime.period).toBe(0);
        expect(lifetime.value).toBe(30);
        const watermark = data.response!.watermark as unknown as Record<
          string,
          unknown
        >;
        expect(watermark.additions).toBe(1);
        expect(watermark.text).toBe("Confidential");
      });
    });

    // TODO: Need clarification — should API reject VDR-only fields on non-VDR rooms or is this expected behavior?
    test.fail(
      "PUT /files/rooms/:id - Set VDR-only fields on CustomRoom",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: createData } = await ownerApi.rooms.createRoom({
          title: "Autotest Custom Room",
          roomType: RoomType.CustomRoom,
        });
        const roomId = createData.response!.id!;

        const { data, status } = await ownerApi.rooms.updateRoom(roomId, {
          indexing: true,
          denyDownload: true,
          lifetime: {
            deletePermanently: true,
            period: 0,
            value: 30,
            enabled: true,
          },
          watermark: {
            enabled: true,
            additions: 1,
            text: "Confidential",
            rotate: 0,
            imageScale: 100,
          },
        });
        expect(status).toBe(200);
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
      },
    );

    test("PUT /files/rooms/:id - Update room with empty title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      });
      const roomId = createData.response!.id!;

      const { data, status } = await ownerApi.rooms.updateRoom(roomId, {
        title: "",
      });

      // API ignores empty title and keeps the original value
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Room");
    });

    // Room IDs are globally unique, so the API returns 403 instead of 404
    // to prevent enumeration of existing room IDs
    test("PUT /files/rooms/:id - Update non-existent room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.updateRoom(999999999, {
        title: "Does Not Exist",
      });

      expect(data.statusCode).toBe(403);
    });
  });

  test("PUT /files/rooms/:id/archive and unarchive", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      title: "Autotest Archive Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = createData.response!.id!;

    await test.step("archive room", async () => {
      const { status } = await ownerApi.rooms.archiveRoom(roomId, {
        deleteAfter: false,
      });
      const operation = await waitForOperation(ownerApi.operations);

      expect(status).toBe(200);
      expect(operation.finished).toBe(true);
    });

    await test.step("unarchive room", async () => {
      const { status } = await ownerApi.rooms.unarchiveRoom(roomId, {
        deleteAfter: false,
      });
      const operation = await waitForOperation(ownerApi.operations);

      expect(status).toBe(200);
      expect(operation.finished).toBe(true);
    });
  });

  test("PUT /files/rooms/:id/pin and unpin", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      title: "Autotest Pin Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = createData.response!.id!;

    await test.step("pin room", async () => {
      const { data, status } = await ownerApi.rooms.pinRoom(roomId);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    await test.step("unpin room", async () => {
      const { data, status } = await ownerApi.rooms.unpinRoom(roomId);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });
  });

  test.describe("POST /files/roomtemplate", () => {
    test("POST /files/roomtemplate - Owner creates a room template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      });
      const roomId = roomData.response!.id!;

      await test.step("create room template", async () => {
        const { data, status } = await ownerApi.rooms.createRoomTemplate({
          roomId,
          title: "Autotest Template",
        });

        expect(status).toBe(200);
        expect(data.response!.error).toBeFalsy();
      });

      await test.step("GET /files/roomtemplate/status - check template status", async () => {
        await expect(async () => {
          const { data, status } =
            await ownerApi.rooms.getRoomTemplateCreatingStatus();
          expect(status).toBe(200);
          expect(data.response!.isCompleted).toBe(true);
        }).toPass({
          intervals: [1_000, 2_000, 5_000],
          timeout: 30_000,
        });

        const { data } = await ownerApi.rooms.getRoomTemplateCreatingStatus();
        expect(data.response!.templateId!).toBeGreaterThan(0);
        expect(data.response!.error).toBeFalsy();
      });
    });

    test("POST /files/roomtemplate - Owner sets and gets room template public settings", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.createRoomTemplate({
        roomId,
        title: "Autotest Template",
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await test.step("GET /files/roomtemplate/:id/public - check default is false", async () => {
        const { data, status } =
          await ownerApi.rooms.getPublicSettings(templateId);

        expect(status).toBe(200);
        expect(data.response).toBe(false);
      });

      await test.step("PUT /files/roomtemplate/public - set public to true", async () => {
        const { status } = await ownerApi.rooms.setPublicSettings({
          id: templateId,
          public: true,
        });

        expect(status).toBe(200);
      });

      await test.step("GET /files/roomtemplate/:id/public - verify changed to true", async () => {
        const { data, status } =
          await ownerApi.rooms.getPublicSettings(templateId);

        expect(status).toBe(200);
        expect(data.response).toBe(true);
      });
    });
  });

  test("POST /files/tags - Owner creates and deletes tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await test.step("POST /files/tags - create a tag", async () => {
      const { data, status } = await ownerApi.rooms.createRoomTag({
        name: "Autotest Tag",
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response as unknown as string).toBe("Autotest Tag");
      expect(data.count).toBe(1);
    });

    await test.step("GET /files/tags - verify tag exists", async () => {
      const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response as unknown as string[]).toContain("Autotest Tag");
    });

    await test.step("DELETE /files/tags - delete a tag", async () => {
      const { status } = await ownerApi.rooms.deleteCustomTags({
        names: ["Autotest Tag"],
      });

      expect(status).toBe(200);
    });

    await test.step("GET /files/tags - verify tag deleted", async () => {
      const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response as unknown as string[]).not.toContain(
        "Autotest Tag",
      );
    });
  });

  test.describe("PUT /files/rooms/:id/share", () => {
    test("PUT /files/rooms/:id/share - Owner sets room access rights", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest Share Room",
        roomType: RoomType.CustomRoom,
      });
      const roomId = roomData.response!.id!;

      await test.step("set access rights for user", async () => {
        const { data, status } = await ownerApi.rooms.setRoomSecurity(roomId, {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response!.members).toBeDefined();
        expect(data.response!.members!.length).toBe(1);
      });

      await test.step("GET /files/rooms/:id/share - verify access rights", async () => {
        const { data, status } =
          await ownerApi.rooms.getRoomSecurityInfo(roomId);

        expect(status).toBe(200);
        // TODO(sdk): getRoomSecurityInfo returns untyped response — ArrayWrapper<RoomSecurityDto> missing
        expect((data as any).statusCode).toBe(200);
        const response = (data as any).response as Array<{
          sharedToUser: { id: string };
        }>;
        expect(response.length).toBe(2);
        expect(response[1].sharedToUser.id).toBe(userId);
      });
    });

    test("PUT /files/rooms/:id/share - Owner revokes room access rights", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest Share Room",
        roomType: RoomType.CustomRoom,
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity(roomId, {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      });

      await test.step("revoke access rights", async () => {
        const { data, status } = await ownerApi.rooms.setRoomSecurity(roomId, {
          invitations: [{ id: userId, access: FileShare.None }],
          notify: false,
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
      });

      await test.step("GET /files/rooms/:id/share - verify access revoked", async () => {
        const { data, status } =
          await ownerApi.rooms.getRoomSecurityInfo(roomId);

        expect(status).toBe(200);
        // TODO(sdk): getRoomSecurityInfo returns untyped response — ArrayWrapper<RoomSecurityDto> missing
        const response = (data as any).response as Array<{
          sharedToUser: { id: string };
        }>;
        expect(response.length).toBe(1);
        expect(response[0].sharedToUser.id).not.toBe(userId);
      });
    });
  });

  test.describe("PUT /files/rooms/:id/share - FillingFormsRoom access levels", () => {
    // RoomManager cannot be set via PUT /files/rooms/:id/share — API rejects it for any room type
    test("PUT /files/rooms/:id/share - RoomManager is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest FillingForms Room",
        roomType: RoomType.FillingFormsRoom,
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity(
        roomData.response!.id!,
        {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.RoomManager },
          ],
          notify: false,
        },
      );

      expect(data.statusCode).toBe(403);
    });

    // Editing is not a valid access level for FillingFormsRoom — API rejects it
    test("PUT /files/rooms/:id/share - Editing is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest FillingForms Room",
        roomType: RoomType.FillingFormsRoom,
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity(
        roomData.response!.id!,
        {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Editing },
          ],
          notify: false,
        },
      );

      expect(data.statusCode).toBe(403);
    });

    test("PUT /files/rooms/:id/share - FillForms", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest FillingForms Room",
        roomType: RoomType.FillingFormsRoom,
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data, status } = await ownerApi.rooms.setRoomSecurity(
        roomData.response!.id!,
        {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      );

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    // Read is not a valid access level for FillingFormsRoom — API rejects it
    test("PUT /files/rooms/:id/share - Read is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        title: "Autotest FillingForms Room",
        roomType: RoomType.FillingFormsRoom,
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity(
        roomData.response!.id!,
        {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Read },
          ],
          notify: false,
        },
      );

      expect(data.statusCode).toBe(403);
    });
  });

  test("PUT/DELETE /files/rooms/:id/tags - Owner adds and removes tags from a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({ name: "Tag1" });
    await ownerApi.rooms.createRoomTag({ name: "Tag2" });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room with Tags",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    await test.step("PUT /files/rooms/:id/tags - add tags to room", async () => {
      const { data, status } = await ownerApi.rooms.addRoomTags(roomId, {
        names: ["Tag1", "Tag2"],
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.id).toBe(roomId);
      expect(data.response!.title).toBe("Autotest Room with Tags");
      expect((data.response!.tags as string[]).length).toBe(2);
      expect(data.response!.tags as string[]).toContain("Tag1");
      expect(data.response!.tags as string[]).toContain("Tag2");
    });

    await test.step("DELETE /files/rooms/:id/tags - remove tag from room", async () => {
      const { data, status } = await ownerApi.rooms.deleteRoomTags(roomId, {
        names: ["Tag1"],
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.id).toBe(roomId);
      expect((data.response!.tags as string[]).length).toBe(1);
      expect(data.response!.tags as string[]).not.toContain("Tag1");
      expect(data.response!.tags as string[]).toContain("Tag2");
    });
  });
});
