import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomsApi,
  RoomType,
  FileShare,
  LinkType,
} from "@onlyoffice/docspace-api-sdk";
import { createAllRoomTypes } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomFromTemplate } from "@/src/helpers/wait-for-room-from-template";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";

function filterRoomsFolder(rooms: RoomsApi, filterValue: string) {
  return rooms.getRoomsFolder({
    filterValue,
  });
}

test.describe("API rooms methods", () => {
  test.describe("POST /files/rooms", () => {
    test("POST /files/rooms - Owner creates a Custom room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Custom Room",
          roomType: RoomType.CustomRoom,
        },
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
        createRoomRequestDto: {
          title: "Autotest Collaboration Room",
          roomType: RoomType.EditingRoom,
        },
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
        createRoomRequestDto: {
          title: "Autotest Form Filling Room",
          roomType: RoomType.FillingFormsRoom,
        },
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
        createRoomRequestDto: {
          title: "Autotest Public Room",
          roomType: RoomType.PublicRoom,
        },
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
        createRoomRequestDto: {
          title: "Autotest Virtual Data Room",
          roomType: RoomType.VirtualDataRoom,
        },
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
      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

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
      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.CustomRoom],
      });

      expect(status).toBe(200);
      expect(data.response!.total).toBe(1);
      // TODO(sdk): FolderContentDtoInteger.folders typed as FileEntryBaseDto[] - roomType field missing
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
        createRoomRequestDto: {
          title: "Autotest Room Before Update",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      await test.step("update title", async () => {
        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            title: "Autotest Room After Update",
          },
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Autotest Room After Update");
        expect(data.response!.id).toBe(roomId);
      });

      await test.step("GET /files/rooms/:id - confirms title changed", async () => {
        const { data, status } = await ownerApi.rooms.getRoomInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Autotest Room After Update");
      });
    });

    test("PUT /files/rooms/:id - Owner updates all allowed fields for VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest VDR Room",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const roomId = createData.response!.id!;

      await test.step("update all fields", async () => {
        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
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
          },
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Updated VDR Room");
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
        expect(data.response!.logo?.color).toBe("FF5733");
        expect(data.response!.lifetime?.period).toBe(0);
        expect(data.response!.lifetime?.value).toBe(30);
        expect(data.response!.lifetime?.deletePermanently).toBe(true);
        expect(data.response!.watermark?.additions).toBe(1);
        expect(data.response!.watermark?.text).toBe("Confidential");
        expect(data.response!.watermark?.rotate).toBe(0);
        expect(data.response!.watermark?.imageScale).toBe(100);
      });

      await test.step("GET /files/rooms/:id - verify all fields saved", async () => {
        const { data, status } = await ownerApi.rooms.getRoomInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Updated VDR Room");
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
        expect(data.response!.logo?.color).toBe("FF5733");
        expect(data.response!.lifetime?.period).toBe(0);
        expect(data.response!.lifetime?.value).toBe(30);
        expect(data.response!.watermark?.additions).toBe(1);
        expect(data.response!.watermark?.text).toBe("Confidential");
      });
    });

    // TODO: Need clarification - should API reject VDR-only fields on non-VDR rooms or is this expected behavior?
    test.skip("PUT /files/rooms/:id - Set VDR-only fields on CustomRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Custom Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
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
        },
      });
      expect(status).toBe(200);
      expect(data.response!.indexing).toBe(true);
      expect(data.response!.denyDownload).toBe(true);
    });

    test("PUT /files/rooms/:id - Update room with empty title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
          title: "",
        },
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
      const { data } = await ownerApi.rooms.updateRoom({
        id: 999999999,
        updateRoomRequest: {
          title: "Does Not Exist",
        },
      });

      expect(data.statusCode).toBe(403);
    });
  });

  test("PUT /files/rooms/:id/archive and unarchive", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Archive Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await test.step("archive room", async () => {
      const { status } = await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: {
          deleteAfter: false,
        },
      });
      const operation = await waitForOperation(ownerApi.operations);

      expect(status).toBe(200);
      expect(operation.finished).toBe(true);
    });

    await test.step("unarchive room", async () => {
      const { status } = await ownerApi.rooms.unarchiveRoom({
        id: roomId,
        archiveRoomRequest: {
          deleteAfter: false,
        },
      });
      const operation = await waitForOperation(ownerApi.operations);

      expect(status).toBe(200);
      expect(operation.finished).toBe(true);
    });
  });

  test("PUT /files/rooms/:id/pin and unpin", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await test.step("pin room", async () => {
      const { data, status } = await ownerApi.rooms.pinRoom({ id: roomId });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    await test.step("unpin room", async () => {
      const { data, status } = await ownerApi.rooms.unpinRoom({ id: roomId });

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
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("create room template", async () => {
        const { data, status } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId,
            title: "Autotest Template",
          },
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
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId,
          title: "Autotest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await test.step("GET /files/roomtemplate/:id/public - check default is false", async () => {
        const { data, status } = await ownerApi.rooms.getPublicSettings({
          id: templateId,
        });

        expect(status).toBe(200);
        expect(data.response).toBe(false);
      });

      await test.step("PUT /files/roomtemplate/public - set public to true", async () => {
        const { status } = await ownerApi.rooms.setPublicSettings({
          setPublicDto: {
            id: templateId,
            public: true,
          },
        });

        expect(status).toBe(200);
      });

      await test.step("GET /files/roomtemplate/:id/public - verify changed to true", async () => {
        const { data, status } = await ownerApi.rooms.getPublicSettings({
          id: templateId,
        });

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
        createTagRequestDto: {
          name: "Autotest Tag",
        },
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
        batchTagsRequestDto: {
          names: ["Autotest Tag"],
        },
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

  test("BUG 72499: DELETE /files/tags - DocSpaceAdmin deletes tag created by Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(200);
  });

  // tagName2 = path param ({tagName} in route), tagName = query param ([FromQuery] in DTO)
  test("GET /files/tags/haslinks - Tag not linked to any room returns false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "UnlinkedTag" },
    });

    const { data, status } = await ownerApi.rooms.hasTagLinks({
      tagName2: "UnlinkedTag",
      tagName: "UnlinkedTag",
    });

    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("GET /files/tags/haslinks - Tag linked to a room returns true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "LinkedTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room With Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: roomData.response!.id!,
      batchTagsRequestDto: { names: ["LinkedTag"] },
    });

    const { data, status } = await ownerApi.rooms.hasTagLinks({
      tagName2: "LinkedTag",
      tagName: "LinkedTag",
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test.describe("PUT /files/rooms/:id/share", () => {
    test("PUT /files/rooms/:id/share - Owner sets room access rights", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("set access rights for user", async () => {
        const { data, status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.Editing }],
            notify: false,
          },
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response!.members).toBeDefined();
        expect(data.response!.members!.length).toBe(1);
      });

      await test.step("GET /files/rooms/:id/share - verify access rights", async () => {
        const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response!.length).toBe(2);
        expect(data.response![1].sharedToUser?.id).toBe(userId);
      });
    });

    test("PUT /files/rooms/:id/share - Owner revokes room access rights", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      await test.step("revoke access rights", async () => {
        const { data, status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.None }],
            notify: false,
          },
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
      });

      await test.step("GET /files/rooms/:id/share - verify access revoked", async () => {
        const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.length).toBe(1);
        expect(data.response![0].sharedToUser?.id).not.toBe(userId);
      });
    });
  });

  test.describe("PUT /files/rooms/:id/share - FillingFormsRoom access levels", () => {
    // RoomManager cannot be set via PUT /files/rooms/:id/share - API rejects it for any room type
    test("PUT /files/rooms/:id/share - RoomManager is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.RoomManager },
          ],
          notify: false,
        },
      });

      expect(data.statusCode).toBe(403);
    });

    // Editing is not a valid access level for FillingFormsRoom - API rejects it
    test("PUT /files/rooms/:id/share - Editing is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      expect(data.statusCode).toBe(403);
    });

    test("PUT /files/rooms/:id/share - FillForms", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    // Read is not a valid access level for FillingFormsRoom - API rejects it
    test("PUT /files/rooms/:id/share - Read is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      expect(data.statusCode).toBe(403);
    });
  });

  test.describe("Room links", () => {
    test("GET /files/rooms/:id/links - Owner gets all links of a PublicRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Room",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.response![0].sharedLink?.id).toBeDefined();
      expect(data.response![0].sharedLink?.shareLink).toBeDefined();
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.External);
    });

    test("GET /files/rooms/:id/links/primary - Owner gets auto-created external link of a PublicRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Room",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomId,
        },
      );

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.sharedLink?.id).toBeDefined();
      expect(data.response!.sharedLink?.shareLink).toBeDefined();
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.External);
    });

    test("PUT /files/rooms/:id/links - Owner creates an invitation link for a room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Set Link Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Invitation Link",
          denyDownload: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.sharedLink?.id).toBeDefined();
      expect(data.response!.sharedLink?.shareLink).toBeDefined();
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.Invitation);
      expect(data.response!.sharedLink?.title).toBe("Autotest Invitation Link");
    });
  });

  test.describe("Room from template", () => {
    test("POST /files/rooms/fromtemplate - Owner creates a room from template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Template Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Template",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(roomId).toBeGreaterThan(0);

      const { data: roomInfo, status: roomStatus } =
        await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(roomStatus).toBe(200);
      expect(roomInfo.response!.title).toBe("Room From Template");
      expect(roomInfo.response!.roomType).toBe(RoomType.CustomRoom);
    });

    test("POST /files/rooms/fromtemplate - Owner creates VDR from template and inherits settings", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest VDR Source",
          roomType: RoomType.VirtualDataRoom,
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
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest VDR Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "VDR From Template",
        },
      });

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: roomInfo } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });

      expect(roomInfo.response!.title).toBe("VDR From Template");
      expect(roomInfo.response!.roomType).toBe(RoomType.VirtualDataRoom);
      // indexing and denyDownload are inherited; lifetime and watermark are not (by design)
      expect(roomInfo.response!.indexing).toBe(true);
      expect(roomInfo.response!.denyDownload).toBe(true);
    });

    test("GET /files/rooms/status - Owner gets room creating status after creating from template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Template Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Template",
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
    });
  });

  test.describe("Room index export", () => {
    test("POST /files/rooms/:id/indexexport - Owner starts and gets index export", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Room",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("POST /files/rooms/:id/indexexport - start export", async () => {
        const { data, status } = await ownerApi.rooms.startRoomIndexExport({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBeDefined();
        expect(data.response!.error).toBeFalsy();
      });

      await test.step("GET /files/rooms/indexexport - get export status", async () => {
        const { data, status } = await ownerApi.rooms.getRoomIndexExport();

        expect(status).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBeDefined();
      });

      await test.step("DELETE /files/rooms/indexexport - terminate export", async () => {
        const { status } = await ownerApi.rooms.terminateRoomIndexExport();

        expect(status).toBe(200);
      });
    });

    test("BUG 81110: GET /files/rooms/indexexport - Owner export completes without error", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Room",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { indexing: true },
      });
      await ownerApi.folders.getMyFolder({});

      await test.step("GET /files/rooms/indexexport - check no active export", async () => {
        const { status } = await ownerApi.rooms.getRoomIndexExport();
        expect(status).toBe(200);
      });

      await test.step("POST /files/rooms/:id/indexexport - start export", async () => {
        const { data, status } = await ownerApi.rooms.startRoomIndexExport({
          id: roomId,
        });
        expect(status).toBe(200);
        expect(data.response!.id).toBeDefined();
        expect(data.response!.error).toBeFalsy();
      });

      await test.step("GET /files/rooms/indexexport - poll until completed", async () => {
        let exportData: Awaited<
          ReturnType<typeof ownerApi.rooms.getRoomIndexExport>
        >;

        await expect(async () => {
          exportData = await ownerApi.rooms.getRoomIndexExport();
          expect(exportData.status).toBe(200);
          expect(exportData.data.response!.isCompleted).toBe(true);
          expect(exportData.data.response!.error).toBeFalsy();
        }).toPass({
          intervals: [2_000, 5_000, 10_000],
          timeout: 30_000,
        });

        expect(exportData!.data.response!.resultFileId).toBeTruthy();
      });
    });
  });

  // Could not trigger MarkAsNew via API - new items list is always empty. Contract test only.
  test.describe("Room new items", () => {
    test("GET /files/rooms/:id/newitems - Owner gets new items list for a room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest New Items Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getNewRoomItems({
        id: roomData.response!.id!,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(Array.isArray(data.response)).toBe(true);
    });
  });

  test.describe("Room reorder", () => {
    test("PUT /files/rooms/:id/reorder - Owner reorders file indexes inside an empty VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Empty Room",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.reorderRoom({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(roomId);
    });

    test("PUT /files/rooms/:id/reorder - Owner reorders file indexes inside a VDR room with folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Room With Content",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folderA } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder A" },
      });
      const { data: folderB } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder B" },
      });
      const { data: folderC } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder C" },
      });

      // Manually set non-sequential indexes with gaps
      await ownerApi.folders.setFolderOrder({
        folderId: folderA.response!.id!,
        orderRequestDto: { order: 10 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderB.response!.id!,
        orderRequestDto: { order: 50 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderC.response!.id!,
        orderRequestDto: { order: 30 },
      });

      const { data: contentBefore } =
        await ownerApi.folders.getFolderByFolderId({ folderId: roomId });
      const ordersBefore = contentBefore.response!.folders!.map((f) =>
        Number(f.order),
      );
      // Verify indexes have gaps (not sequential 1,2,3)
      expect(ordersBefore).not.toEqual([1, 2, 3]);

      const { data, status } = await ownerApi.rooms.reorderRoom({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(roomId);

      const { data: contentAfter } = await ownerApi.folders.getFolderByFolderId(
        { folderId: roomId },
      );
      // Reorder removes gaps
      expect(
        contentAfter.response!.folders!.map((f) => [f.title, Number(f.order)]),
      ).toEqual([
        ["Folder A", 1],
        ["Folder C", 2],
        ["Folder B", 3],
      ]);
    });
  });

  test.describe("Room invitations", () => {
    test("POST /files/rooms/:id/resend - Owner resends email invitations", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: {
          usersIds: [userId],
          resendAll: false,
        },
      });

      expect(status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - Resend to user not in room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      // Batch operation - non-member IDs are silently skipped (by design)
      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: {
          usersIds: [userId],
          resendAll: false,
        },
      });

      expect(status).toBe(200);
    });
  });

  test("PUT/DELETE /files/rooms/:id/tags - Owner adds and removes tags from a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Tag1" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Tag2" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room with Tags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await test.step("PUT /files/rooms/:id/tags - add tags to room", async () => {
      const { data, status } = await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: {
          names: ["Tag1", "Tag2"],
        },
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
      const { data, status } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: {
          names: ["Tag1"],
        },
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

test.describe("PUT /files/tags - Update tag", () => {
  test("PUT /files/tags - Owner renames a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Rename Old" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Rename Old",
        newName: "Autotest Rename New",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe("Autotest Rename New");
  });

  test("PUT /files/tags - Response has correct structure (statusCode, count, response)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Structure Old" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Structure Old",
        newName: "Autotest Structure New",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof (data.response as unknown as string)).toBe("string");
    expect(data.response as unknown as string).toBe("Autotest Structure New");
  });

  test("PUT /files/tags - Old tag name is no longer in tag list after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Old Name Gone" },
    });

    await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Old Name Gone",
        newName: "Autotest Old Name Replaced",
      },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    const tags = data.response as unknown as string[];
    expect(tags).not.toContain("Autotest Old Name Gone");
  });

  test("PUT /files/tags - New tag name appears in tag list after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest New Name Check Old" },
    });

    await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest New Name Check Old",
        newName: "Autotest New Name Check New",
      },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    const tags = data.response as unknown as string[];
    expect(tags).toContain("Autotest New Name Check New");
  });

  test("PUT /files/tags - Tag attached to a room reflects the new name after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Room Tag Old Name" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room With Renamed Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Room Tag Old Name"] },
    });

    await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Room Tag Old Name",
        newName: "Autotest Room Tag New Name",
      },
    });

    const { data: roomInfo, status } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });

    expect(status).toBe(200);
    const roomTags = (roomInfo as any).response?.tags as string[] | undefined;
    expect(roomTags).toBeDefined();
    expect(roomTags).not.toContain("Autotest Room Tag Old Name");
    expect(roomTags).toContain("Autotest Room Tag New Name");
  });

  test("PUT /files/tags - Renaming a non-existent tag returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest NonExistent Tag 99999",
        newName: "Autotest New Name For NonExistent",
      },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("The record could not be found");
  });

  // Business: renaming a tag to the same name is not allowed — API treats it as a duplicate
  test("PUT /files/tags - Renaming a tag to the same name returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Same Name Tag" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Same Name Tag",
        newName: "Autotest Same Name Tag",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "Tag with name 'Autotest Same Name Tag' already exists",
    );
  });

  // Business: renaming to the name of another existing tag is not allowed — names must be unique
  test("PUT /files/tags - Renaming to an already existing tag name returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Conflict Source" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Conflict Target" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Conflict Source",
        newName: "Autotest Conflict Target",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "Tag with name 'Autotest Conflict Target' already exists",
    );
  });

  test("PUT /files/tags - Empty newName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Empty New Name" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Empty New Name",
        newName: "",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The value cannot be an empty string. (Parameter 'newName')",
    );
  });
});

test.describe("PUT /files/fileops/duplicate", () => {
  test("PUT /files/fileops/duplicate - Owner duplicates their own room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room To Duplicate",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: {
        folderIds: [roomId as any],
      },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test.fail(
    "BUG 81232: PUT /files/fileops/duplicate - Owner duplicates DocSpaceAdmin's room",
    async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Admin Room For Owner Duplicate",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const ownerApi = apiSdk.forRole("owner");

      await test.step("PUT /files/fileops/duplicate", async () => {
        const { status } = await ownerApi.operations.duplicateBatchItems({
          duplicateRequestDto: {
            folderIds: [roomId as any],
          },
        });
        expect(status).toBe(200);
      });

      await test.step("GET /files/fileops", async () => {
        const operation = await waitForOperation(ownerApi.operations);
        expect(operation.finished).toBe(true);
        // Currently fails with: "You don't have enough permission to copy the folder"
        expect(operation.error).toBe("");
      });

      await test.step("GET /files/rooms - duplicate room appears in list", async () => {
        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const titles = data.response!.folders!.map((f) => f.title);
        expect(
          titles.some((t) =>
            t?.includes("Autotest Admin Room For Owner Duplicate"),
          ),
        ).toBe(true);
      });
    },
  );
});

test.describe("PUT /files/fileops/delete - Room deletion with open file", () => {
  test.fail(
    "BUG 81287: PUT /files/fileops/delete - deleting a room with an open file partially removes other files instead of rolling back atomically",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Room With Open File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: f1 } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "file1" },
      });
      const { data: f2 } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "file2" },
      });
      const { data: openedFile } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "opened-file" },
      });

      const file1Id = f1.response!.id!;
      const file2Id = f2.response!.id!;
      const openedFileId = openedFile.response!.id!;

      const { data: editConfig } = await ownerApi.files.openEditFile({
        fileId: openedFileId,
      });
      const docKey = editConfig.response!.document!.key!;
      await ownerApi.files.trackEditFile({
        fileId: openedFileId,
        tabId: crypto.randomUUID(),
        docKeyForTrack: docKey,
        isFinish: false,
      });

      await test.step("PUT /files/fileops/delete - start room deletion", async () => {
        const { status } = await ownerApi.operations.deleteBatchItems({
          deleteBatchRequestDto: {
            folderIds: [roomId],
            immediately: true,
          },
        });
        expect(status).toBe(200);
      });

      await test.step("GET /files/fileops - verify operation failed with open file error", async () => {
        const operation = await waitForOperation(ownerApi.operations);
        expect(operation.finished).toBe(true);
        expect(operation.error).toContain("opened for editing");
      });

      await test.step("GET /files/rooms/:id - verify room still exists", async () => {
        const { status } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(status).toBe(200);
      });

      await test.step("GET /files/file/:id - verify all files still exist", async () => {
        for (const fileId of [file1Id, file2Id, openedFileId]) {
          const { status } = await ownerApi.files.getFileInfo({ fileId });
          expect(status).toBe(200);
        }
      });
    },
  );
});
