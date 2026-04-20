import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { roomAccesses } from "@/src/helpers/rooms";

test.describe("POST /files/rooms - access control", () => {
  test("Owner can create a room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(200);
  });

  test("DocSpaceAdmin can create a room", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { status } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(200);
  });

  test("User cannot create a room", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status } = await userApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(403);
  });

  test("Guest cannot create a room", async ({ apiSdk }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain(
      "You don't have enough permission to create",
    );
  });
});

test.describe("PUT /files/rooms/:id - access control", () => {
  test("Owner can update own room", async ({ apiSdk }) => {
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
        title: "Updated Room",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Updated Room");
  });

  test("DocSpaceAdmin can update own room", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: createData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data, status } = await adminApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Updated Room",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Updated Room");
  });

  test("DocSpaceAdmin cannot update other's room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Updated Room",
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("User without room access cannot update room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Updated by User",
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("Guest without room access cannot update room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Updated by Guest",
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain(
      "You don't have permission to edit the room",
    );
  });

  test("Updating room without authorization", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await anonApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Updated without auth",
      },
    });

    expect(status).toBe(401);
  });
});

// DELETE /files/rooms/:id works asynchronously:
// 1. Controller has NO permission checks
// 2. HTTP always returns 200 (operation queued)
// 3. Permission check happens later in FileDeleteOperation.cs
// 4. If access denied, error appears in GET /fileops result.error field
test.describe("DELETE /files/rooms/:id - access control", () => {
  test("Owner can delete a room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room to Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const operation = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DocSpaceAdmin can delete a room", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: createData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room to Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await adminApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const operation = await waitForOperation(adminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("User cannot delete a room", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room to Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data, status } = await userApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("Guest cannot delete a room", async ({ apiSdk }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room to Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data, status } = await guestApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /files/fileops/move - access control", () => {
  test("BUG 80938: Owner can archive room created by DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // DocSpaceAdmin creates a room
    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    // DocSpaceAdmin creates a file inside the room
    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "DocSpaceAdmin Document",
      },
    });

    expect(fileData.statusCode).toBe(200);
    expect(fileData.response!.id!).toBeGreaterThan(0);

    // Owner archives the room
    const { status } = await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(200);

    // Wait for the asynchronous operation to complete
    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });
});

test.describe("POST /files/tags - access control", () => {
  test("Owner can create a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe("Autotest Tag");
    expect(data.count).toBe(1);
  });

  test("DocSpaceAdmin can create a tag", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data, status } = await adminApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe("Autotest Tag");
    expect(data.count).toBe(1);
  });

  test("User cannot create a tag", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("Guest cannot create a tag", async ({ apiSdk }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });
});

test.describe("PUT /files/rooms/:id/share - access control", () => {
  test("Owner can set room access rights", async ({ apiSdk }) => {
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
    expect(data.response!.members!.length).toBeGreaterThan(0);
  });

  test("DocSpaceAdmin can set access rights on own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Share Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await adminApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.members).toBeDefined();
  });

  test("DocSpaceAdmin cannot set access rights on other's room", async ({
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

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("User cannot set room access rights", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Share Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    const { data } = await userApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("Guest cannot set room access rights", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Share Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = memberData.response!.id!;

    const { data } = await guestApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain(
      "You don't have enough permission to view the folder content",
    );
  });
});

for (const userType of ["RoomAdmin", "User", "Guest"] as const) {
  test.describe(`DELETE /files/tags - ${userType} invited to room cannot delete a tag`, () => {
    for (const { label, access } of roomAccesses) {
      test(`BUG 72499: Room access: ${label}`, async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");

        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: "Autotest Tag" },
        });

        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Room",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { api: memberApi, data: memberData } =
          await apiSdk.addAuthenticatedMember("owner", userType);
        const userId = memberData.response!.id!;

        await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access }],
            notify: false,
          },
        });

        const { data, status } = await memberApi.rooms.deleteCustomTags({
          batchTagsRequestDto: { names: ["Autotest Tag"] },
        });

        expect(status).toBe(403);
        expect((data as any).error.message).toContain("Access denied");
      });
    }
  });
}

test.describe("DELETE /api/2.0/files/tags - Input validation", () => {
  test("BUG 80046: DELETE /api/2.0/files/tags - returns 500 when body uses 'name' instead of 'names'", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Test" },
    });

    const { data, status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { name: ["Test"] } as any,
    });

    expect(status).toBe(400);
    expect((data as any).response.errors.Names[0]).toBe(
      "The Names field is required.",
    );
  });
});

test.describe("PUT /files/tags - access control", () => {
  test("PUT /files/tags - Owner can rename a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Owner Rename Tag" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Owner Rename Tag",
        newName: "Autotest Owner Rename Tag Updated",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe(
      "Autotest Owner Rename Tag Updated",
    );
  });

  test("PUT /files/tags - DocSpaceAdmin can rename a tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Admin Rename Tag" },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Admin Rename Tag",
        newName: "Autotest Admin Rename Tag Updated",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe(
      "Autotest Admin Rename Tag Updated",
    );
  });

  test("PUT /files/tags - RoomAdmin cannot rename a tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest RoomAdmin Rename Tag" },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest RoomAdmin Rename Tag",
        newName: "Autotest RoomAdmin Rename Tag Updated",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("PUT /files/tags - User cannot rename a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest User Rename Tag" },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest User Rename Tag",
        newName: "Autotest User Rename Tag Updated",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("PUT /files/tags - Guest cannot rename a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Guest Rename Tag" },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Guest Rename Tag",
        newName: "Autotest Guest Rename Tag Updated",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("PUT /files/tags - Unauthenticated user cannot rename a tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Anon Rename Tag" },
    });

    const { status } = await apiSdk.forAnonymous().rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Anon Rename Tag",
        newName: "Autotest Anon Rename Tag Updated",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /files/fileops/duplicate - access control", () => {
  test.fail(
    "POST /files/fileops/duplicate - DocSpaceAdmin can duplicate another user's room",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Owner Room For Admin Duplicate",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { status } = await adminApi.operations.duplicateBatchItems({
        duplicateRequestDto: {
          folderIds: [roomId as any],
        },
      });

      expect(status).toBe(200);

      const operation = await waitForOperation(adminApi.operations);
      expect(operation.finished).toBe(true);
      // Currently fails with: "You don't have enough permission to copy the folder"
      expect(operation.error).toBeNull();
    },
  );
});
