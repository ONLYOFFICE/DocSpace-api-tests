import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FileShare,
  EmployeeStatus,
  SearchArea,
  LinkType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";
import { waitForRoomFromTemplate } from "@/src/helpers/wait-for-room-from-template";
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

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Anonymous",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot create a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Disabled",
        roomType: RoomType.CustomRoom,
      },
    });

    expect(status).toBe(401);
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

  test("RoomAdmin (not owner of the room) cannot delete owner's room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Room For RoomAdmin Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { status } = await roomAdminApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
  });

  test("Anonymous cannot delete a room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Anonymous Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await apiSdk.forAnonymous().rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot delete a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Disabled User Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(401);
  });
});

// User/Guest invited to a room with any access level (Viewer/Commenter/Reviewer/Editor/ContentCreator)
// must not be able to delete the room. RoomManager access is rejected for User/Guest at invitation
// time, so that combination is skipped — see [[user_guest_no_roommanager_access]].
for (const userType of ["User", "Guest"] as const) {
  test.describe(`DELETE /files/rooms/:id - ${userType} invited to room`, () => {
    for (const { label, access } of roomAccesses) {
      if (access === FileShare.RoomManager) {
        continue;
      }

      test(`Room access: ${label} - cannot delete room`, async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Delete Access ${userType} ${label}`,
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

        const { data, status } = await memberApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe("Access denied");
      });
    }
  });
}

// RoomAdmin invited to another owner's room must not be able to delete it,
// regardless of access level — only the room's actual owner (or DocSpaceAdmin) can delete.
test.describe("DELETE /files/rooms/:id - RoomAdmin invited to owner's room", () => {
  for (const { label, access } of roomAccesses) {
    test(`Room access: ${label} - cannot delete room`, async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Delete RoomAdmin Access ${label}`,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access }],
          notify: false,
        },
      });

      const { status } = await roomAdminApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });

      expect(status).toBe(403);
    });
  }
});

test.describe("PUT /files/rooms/:id/archive - access control", () => {
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

  test("DocSpaceAdmin can archive own room", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: createData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin Own Room To Archive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await adminApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    const operation = await waitForOperation(adminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("RoomAdmin cannot archive owner's room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Room For RoomAdmin Archive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { status } = await roomAdminApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
  });

  test("User cannot archive owner's room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Room For User Archive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status } = await userApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
  });

  test("Guest cannot archive owner's room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Room For Guest Archive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { status } = await guestApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
  });

  test("Archiving room without authorization returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Anonymous Archive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await apiSdk.forAnonymous().rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(401);
  });

  test("BUG 81550: PUT /files/rooms/:id/archive - non-existent room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data } = await ownerApi.rooms.archiveRoom({
      id: 999999999,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(data.statusCode).toBe(404);
  });

  test("BUG 81550: PUT /files/rooms/:id/archive - deleted room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room To Delete Then Archive",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const deleteOp = await waitForOperation(ownerApi.operations);
    expect(deleteOp.finished).toBe(true);

    const { data } = await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(data.statusCode).toBe(404);
  });

  test("Archiving an already archived room is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Already Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    const firstOp = await waitForOperation(ownerApi.operations);
    expect(firstOp.finished).toBe(true);

    const { status } = await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    const secondOp = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(secondOp.finished).toBe(true);
    expect(secondOp.error).toBe("");
  });
});

// GET /files/rooms/:id/link — getRoomsPrimaryExternalLink.
// The endpoint is link-management scoped: only the room owner, portal admins
// (DocSpaceAdmin), or a member invited with link-management access (RoomManager /
// ContentCreator) get 200. Lower access levels (Editing / Read) and non-members get
// 403 even on a PublicRoom; anonymous requests get 401. This differs from getRoomLinks,
// which returns 200 + an empty list for non-members.
test.describe("GET /files/rooms/:id/link - access control", () => {
  test("Owner can get the primary external link of their own room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link Owner",
        roomType: RoomType.PublicRoom,
      },
    });

    const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
      id: roomData.response!.id!,
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink?.id).toBeDefined();
  });

  test("DocSpaceAdmin can get the primary external link of another owner's room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link Admin",
        roomType: RoomType.PublicRoom,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.rooms.getRoomsPrimaryExternalLink({
      id: roomData.response!.id!,
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink?.id).toBeDefined();
  });

  test("RoomAdmin not invited to the room gets 403", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link RoomAdmin NotInvited",
        roomType: RoomType.PublicRoom,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.rooms.getRoomsPrimaryExternalLink({
      id: roomData.response!.id!,
    });

    expect(data.statusCode).toBe(403);
  });

  // RoomManager / ContentCreator grant link-management; Editing does not.
  for (const { label, access, expectedStatus } of [
    {
      label: "RoomManager",
      access: FileShare.RoomManager,
      expectedStatus: 200,
    },
    {
      label: "ContentCreator",
      access: FileShare.ContentCreator,
      expectedStatus: 200,
    },
    { label: "Editing", access: FileShare.Editing, expectedStatus: 403 },
  ]) {
    test(`RoomAdmin invited with ${label} access gets ${expectedStatus}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Primary Link RoomAdmin ${label}`,
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: memberData.response!.id!, access }],
          notify: false,
        },
      });

      const { data } = await roomAdminApi.rooms.getRoomsPrimaryExternalLink({
        id: roomId,
      });

      expect(data.statusCode).toBe(expectedStatus);
    });
  }

  test("User invited with Read access gets 403", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link User Invited",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data } = await userApi.rooms.getRoomsPrimaryExternalLink({
      id: roomId,
    });

    expect(data.statusCode).toBe(403);
  });

  test("User not invited to the room gets 403", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link User NotInvited",
        roomType: RoomType.PublicRoom,
      },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.rooms.getRoomsPrimaryExternalLink({
      id: roomData.response!.id!,
    });

    expect(data.statusCode).toBe(403);
  });

  test("Guest not invited to the room gets 403", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link Guest NotInvited",
        roomType: RoomType.PublicRoom,
      },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.rooms.getRoomsPrimaryExternalLink({
      id: roomData.response!.id!,
    });

    expect(data.statusCode).toBe(403);
  });

  test("Anonymous request returns 401", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Primary Link Anonymous",
        roomType: RoomType.PublicRoom,
      },
    });

    const { status } = await apiSdk
      .forAnonymous()
      .rooms.getRoomsPrimaryExternalLink({ id: roomData.response!.id! });

    expect(status).toBe(401);
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

  test("RoomAdmin can create a tag", async ({ apiSdk }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data, status } = await roomAdminApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe("Autotest Tag");
    expect(data.count).toBe(1);
  });

  test("Anonymous cannot create a tag", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot create a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /files/tags - access control", () => {
  test("Owner can get the room tag list", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "OwnerVisibleTag" },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain("OwnerVisibleTag");
  });

  test("DocSpaceAdmin can get the room tag list", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "AdminVisibleTag" },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain("AdminVisibleTag");
  });

  test("RoomAdmin sees only tags visible to them - empty when no rooms with tags are visible", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "RoomAdminVisibleTag" },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toEqual([]);
  });

  test("User sees only tags visible to them - empty when no rooms with tags are visible", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "UserVisibleTag" },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toEqual([]);
  });

  test("Guest sees only tags visible to them - empty when no rooms with tags are visible", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "GuestVisibleTag" },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toEqual([]);
  });

  test("RoomAdmin sees tags from their own rooms but not from other admins' rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownTag = "RoomAdminOwnTag";
    const otherTag = "OwnerOnlyTag";

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: ownRoom } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RoomAdmin Own Tagged Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await roomAdminApi.rooms.addRoomTags({
      id: ownRoom.response!.id!,
      batchTagsRequestDto: { names: [ownTag] },
    });

    const { data: otherRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Tagged Room Hidden From RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: otherRoom.response!.id!,
      batchTagsRequestDto: { names: [otherTag] },
    });

    const { data, status } = await roomAdminApi.rooms.getRoomTagsInfo();
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(tags).toContain(ownTag);
    expect(tags).not.toContain(otherTag);
  });

  test("User sees tags only from rooms they are invited to", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const visibleTag = "UserSharedRoomTag";
    const hiddenTag = "UserHiddenRoomTag";

    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    const { data: sharedRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest User Shared Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const sharedRoomId = sharedRoom.response!.id!;
    await ownerApi.rooms.addRoomTags({
      id: sharedRoomId,
      batchTagsRequestDto: { names: [visibleTag] },
    });
    await ownerApi.rooms.setRoomSecurity({
      id: sharedRoomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: hiddenRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest User Hidden Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: hiddenRoom.response!.id!,
      batchTagsRequestDto: { names: [hiddenTag] },
    });

    const { data, status } = await userApi.rooms.getRoomTagsInfo();
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(tags).toContain(visibleTag);
    expect(tags).not.toContain(hiddenTag);
  });

  test("Guest sees tags only from rooms they are invited to", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const visibleTag = "GuestSharedRoomTag";
    const hiddenTag = "GuestHiddenRoomTag";

    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = memberData.response!.id!;

    const { data: sharedRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Guest Shared Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const sharedRoomId = sharedRoom.response!.id!;
    await ownerApi.rooms.addRoomTags({
      id: sharedRoomId,
      batchTagsRequestDto: { names: [visibleTag] },
    });
    await ownerApi.rooms.setRoomSecurity({
      id: sharedRoomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: hiddenRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Guest Hidden Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: hiddenRoom.response!.id!,
      batchTagsRequestDto: { names: [hiddenTag] },
    });

    const { data, status } = await guestApi.rooms.getRoomTagsInfo();
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(tags).toContain(visibleTag);
    expect(tags).not.toContain(hiddenTag);
  });

  test("Anonymous request returns 401", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().rooms.getRoomTagsInfo();

    expect(status).toBe(401);
  });
});

test.describe("DELETE /files/tags - access control", () => {
  test("RoomAdmin cannot delete a custom tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data, status } = await roomAdminApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("User cannot delete a custom tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data, status } = await userApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("Guest cannot delete a custom tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data, status } = await guestApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("Anonymous cannot delete a custom tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { status } = await apiSdk.forAnonymous().rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot delete a custom tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /files/tags/:tagName/haslinks - access control", () => {
  // Only Owner and DocSpaceAdmin may read tag-linkage info. RoomAdmin/User/Guest get 403,
  // anonymous gets 401. Note: RoomAdmin is forbidden here, unlike POST /files/tags
  // (createRoomTag), where RoomAdmin is allowed.
  const seedLinkedTag = async (apiSdk: any, tagName: string) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: tagName },
    });
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest HasLinks Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: roomData.response!.id!,
      batchTagsRequestDto: { names: [tagName] },
    });
  };

  test("Owner can check tag links", async ({ apiSdk }) => {
    await seedLinkedTag(apiSdk, "OwnerHasLinksTag");

    const { data, status } = await apiSdk.forRole("owner").rooms.hasTagLinks({
      tagName2: "OwnerHasLinksTag",
      tagName: "OwnerHasLinksTag",
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DocSpaceAdmin can check tag links", async ({ apiSdk }) => {
    await seedLinkedTag(apiSdk, "AdminHasLinksTag");

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data, status } = await adminApi.rooms.hasTagLinks({
      tagName2: "AdminHasLinksTag",
      tagName: "AdminHasLinksTag",
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("RoomAdmin cannot check tag links", async ({ apiSdk }) => {
    await seedLinkedTag(apiSdk, "RoomAdminHasLinksTag");

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { status } = await roomAdminApi.rooms.hasTagLinks({
      tagName2: "RoomAdminHasLinksTag",
      tagName: "RoomAdminHasLinksTag",
    });

    expect(status).toBe(403);
  });

  test("User cannot check tag links", async ({ apiSdk }) => {
    await seedLinkedTag(apiSdk, "UserHasLinksTag");

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status } = await userApi.rooms.hasTagLinks({
      tagName2: "UserHasLinksTag",
      tagName: "UserHasLinksTag",
    });

    expect(status).toBe(403);
  });

  test("Guest cannot check tag links", async ({ apiSdk }) => {
    await seedLinkedTag(apiSdk, "GuestHasLinksTag");

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { status } = await guestApi.rooms.hasTagLinks({
      tagName2: "GuestHasLinksTag",
      tagName: "GuestHasLinksTag",
    });

    expect(status).toBe(403);
  });

  test("Anonymous request returns 401", async ({ apiSdk }) => {
    await seedLinkedTag(apiSdk, "AnonHasLinksTag");

    const { status } = await apiSdk.forAnonymous().rooms.hasTagLinks({
      tagName2: "AnonHasLinksTag",
      tagName: "AnonHasLinksTag",
    });

    expect(status).toBe(401);
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

  test("BUG 79020: PUT /files/rooms/:id/share - Owner invites disabled user with notify:true - disabled user is silently skipped", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

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
        invitations: [{ id: userId }],
        notify: true,
        force: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.members).toStrictEqual([]);
  });

  test("BUG 79361: PUT /files/rooms/:id/share - RoomAdmin cannot invite a Guest belonging to another user", async ({
    apiSdk,
  }) => {
    // Guest created by owner — does not belong to RoomAdmin
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await roomAdminApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.members).toStrictEqual([]);
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

  test("DELETE /api/2.0/files/tags - Empty names array does not delete any tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "KeepMeTag" },
    });

    const { data: listBefore } = await ownerApi.rooms.getRoomTagsInfo();
    const tagsBefore = listBefore.response as unknown as string[];

    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: [] },
    });

    const { data: listAfter } = await ownerApi.rooms.getRoomTagsInfo();
    const tagsAfter = listAfter.response as unknown as string[];
    expect(tagsAfter).toEqual(tagsBefore);
    expect([200, 400]).toContain(status);
  });

  test("DELETE /api/2.0/files/tags - Missing batchTagsRequestDto body returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: {} as any,
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/2.0/files/tags - names: null returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: null } as any,
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/2.0/files/tags - names as string (not an array) returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: "Tag1" } as any,
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/2.0/files/tags - names array contains non-string value returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Tag1", 123] } as any,
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/2.0/files/tags - names array contains empty string returns 400", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 81689: empty string in names array is silently accepted (200) instead of validation error (400)",
    );
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: [""] },
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/2.0/files/tags - names array contains spaces-only string returns 400", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 81689: spaces-only string in names array is silently accepted (200) instead of validation error (400)",
    );
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["   "] },
    });
    expect(status).toBe(400);
  });

  test("DELETE /api/2.0/files/tags - names array containing null returns 400 (no 500)", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 81689: null inside names array is silently accepted (200) instead of validation error (400)",
    );
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: [null] } as any,
    });
    expect(status).toBe(400);
  });
});

test.describe("PUT /files/rooms/:id/tags - access control", () => {
  test("PUT /files/rooms/:id/tags - Owner can add tag to own room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Owner AddTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner AddTag Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Owner AddTag"] },
    });

    expect(status).toBe(200);
    expect(data.response!.tags as string[]).toContain("Autotest Owner AddTag");
  });

  test("PUT /files/rooms/:id/tags - DocSpaceAdmin can add tag to own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    await adminApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Admin AddTag" },
    });

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin AddTag Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await adminApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Admin AddTag"] },
    });

    expect(status).toBe(200);
    expect(data.response!.tags as string[]).toContain("Autotest Admin AddTag");
  });

  test("PUT /files/rooms/:id/tags - User not in room cannot add tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest User Outside Tag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest User Outside Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest User Outside Tag"] },
    });

    expect(data.statusCode).toBe(403);
  });

  test("PUT /files/rooms/:id/tags - Guest not in room cannot add tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Guest Outside Tag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Guest Outside Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Guest Outside Tag"] },
    });

    expect(data.statusCode).toBe(403);
  });

  test("PUT /files/rooms/:id/tags - Unauthenticated user cannot add tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Anon AddTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Anon AddTag Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk.forAnonymous().rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Anon AddTag"] },
    });

    expect(status).toBe(401);
  });
});

for (const userType of ["RoomAdmin", "User", "Guest"] as const) {
  test.describe(`PUT /files/rooms/:id/tags - ${userType} invited to room`, () => {
    for (const { label, access } of roomAccesses) {
      // Only RoomAdmin can be assigned RoomManager access — API rejects this access level for User/Guest
      if (
        access === FileShare.RoomManager &&
        (userType === "User" || userType === "Guest")
      ) {
        continue;
      }

      test(`Room access: ${label}`, async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");

        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: `Autotest Tag ${userType} ${label}` },
        });

        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Room ${userType} ${label}`,
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

        const { data, status } = await memberApi.rooms.addRoomTags({
          id: roomId,
          batchTagsRequestDto: { names: [`Autotest Tag ${userType} ${label}`] },
        });

        // Only RoomManager has permission to manage room metadata (tags)
        if (access === FileShare.RoomManager) {
          expect(status).toBe(200);
          expect(data.response!.tags as string[]).toContain(
            `Autotest Tag ${userType} ${label}`,
          );
        } else {
          expect(status).toBe(403);
        }
      });
    }
  });
}

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

test.describe("POST /files/roomtemplate - access control", () => {
  test("Owner can create a template from own room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl Owner Source",
        roomType: RoomType.CustomRoom,
      },
    });

    const { status } = await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Autotest CreateTmpl Owner Template",
      },
    });
    expect(status).toBe(200);
    const templateId = await waitForRoomTemplate(ownerApi.rooms);
    expect(templateId).toBeGreaterThan(0);
  });

  test("DocSpaceAdmin can create a template from own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl Admin Source",
        roomType: RoomType.CustomRoom,
      },
    });

    const { status } = await adminApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Autotest CreateTmpl Admin Template",
      },
    });
    expect(status).toBe(200);
    const templateId = await waitForRoomTemplate(adminApi.rooms);
    expect(templateId).toBeGreaterThan(0);
  });

  test("RoomAdmin can create a template from own room", async ({ apiSdk }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl RoomAdmin Source",
        roomType: RoomType.CustomRoom,
      },
    });

    const { status } = await roomAdminApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Autotest CreateTmpl RoomAdmin Template",
      },
    });
    expect(status).toBe(200);
    const templateId = await waitForRoomTemplate(roomAdminApi.rooms);
    expect(templateId).toBeGreaterThan(0);
  });

  test.fail(
    "BUG 81693: DocSpaceAdmin cannot create a template from someone else's room they have no access to",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CreateTmpl OtherOwner Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const templateTitle = "Admin No-Access Template";
      const { data } = await adminApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: templateTitle,
        },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain(templateTitle);
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 81693: User cannot create a template (no source room access)",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CreateTmpl UserNoAccess Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const templateTitle = "User No-Access Template";
      const { data } = await userApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: templateTitle,
        },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain(templateTitle);
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail("BUG 81693: Guest cannot create a template", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl Guest Source",
        roomType: RoomType.CustomRoom,
      },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const templateTitle = "Guest Template";
    const { data } = await guestApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: templateTitle,
      },
    });

    const { data: list } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Templates,
    });
    const titles = (list.response!.folders ?? []).map(
      (f) => (f as any).title as string,
    );
    expect(titles).not.toContain(templateTitle);
    expect(data.statusCode).toBe(403);
  });

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl Anon Source",
        roomType: RoomType.CustomRoom,
      },
    });

    const { status } = await apiSdk.forAnonymous().rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Anonymous Template",
      },
    });
    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot create a template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl Disabled Source",
        roomType: RoomType.CustomRoom,
      },
    });

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await adminApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Disabled Template",
      },
    });
    expect(status).toBe(401);
  });

  // Access-level matrix: only Editor/ContentCreator/RoomManager grant write rights;
  // Viewer/Commenter/Reviewer should be insufficient to create a template.
  // User+RoomManager combination is not allowed by the API (see memory: user_guest_no_roommanager_access).
  for (const { label, access } of roomAccesses) {
    if (label === "RoomManager") continue;

    test.fail(
      `BUG 81693: User with ${label} access to source room cannot create template`,
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest CreateTmpl User-${label} Source`,
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { data: memberData, api: userApi } =
          await apiSdk.addAuthenticatedMember("owner", "User");
        await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberData.response!.id!, access }],
            notify: false,
          },
        });

        const templateTitle = `User ${label} Template`;
        const { data } = await userApi.rooms.createRoomTemplate({
          roomTemplateDto: { roomId, title: templateTitle },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(templateTitle);
        expect(data.statusCode).toBe(403);
      },
    );
  }

  test("RoomAdmin with RoomManager access to another's room can create template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CreateTmpl RoomManager Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { status } = await roomAdminApi.rooms.createRoomTemplate({
      roomTemplateDto: { roomId, title: "RoomManager Template" },
    });
    expect(status).toBe(200);
    const templateId = await waitForRoomTemplate(roomAdminApi.rooms);
    expect(templateId).toBeGreaterThan(0);
  });
});

test.describe("GET /files/roomtemplate/{id}/public - access control", () => {
  async function createTemplate(
    api: any,
    title: string,
    isPublic: boolean,
  ): Promise<number> {
    const { data: roomData } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `${title} Source`,
        roomType: RoomType.CustomRoom,
      },
    });
    await api.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title,
        public: isPublic,
      },
    });
    return waitForRoomTemplate(api.rooms);
  }

  test("Owner can read public flag of own private template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const templateId = await createTemplate(
      ownerApi,
      "Autotest GetPublic Owner Private",
      false,
    );

    const { data, status } = await ownerApi.rooms.getPublicSettings({
      id: templateId,
    });
    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("Owner can read public flag of own public template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const templateId = await createTemplate(
      ownerApi,
      "Autotest GetPublic Owner Public",
      true,
    );

    const { data, status } = await ownerApi.rooms.getPublicSettings({
      id: templateId,
    });
    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("RoomAdmin can read public flag of own private template", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const templateId = await createTemplate(
      roomAdminApi,
      "Autotest GetPublic RoomAdmin Own",
      false,
    );

    const { data, status } = await roomAdminApi.rooms.getPublicSettings({
      id: templateId,
    });
    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  for (const role of ["DocSpaceAdmin", "RoomAdmin"] as const) {
    test(`${role} can read public flag of someone else's public template`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createTemplate(
        ownerApi,
        `Autotest GetPublic ${role} OthersPublic`,
        true,
      );

      const { api } = await apiSdk.addAuthenticatedMember("owner", role);
      const { data, status } = await api.rooms.getPublicSettings({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });
  }

  test("DocSpaceAdmin cannot read public flag of someone else's private template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const templateId = await createTemplate(
      ownerApi,
      "Autotest GetPublic Admin OthersPrivate",
      false,
    );

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.rooms.getPublicSettings({
      id: templateId,
    });
    expect(data.statusCode).toBe(403);
  });

  test("RoomAdmin cannot read public flag of someone else's private template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const templateId = await createTemplate(
      ownerApi,
      "Autotest GetPublic RoomAdmin OthersPrivate",
      false,
    );

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.rooms.getPublicSettings({
      id: templateId,
    });
    expect(data.statusCode).toBe(403);
  });

  test("Owner can read public flag of template owned by DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const templateId = await createTemplate(
      adminApi,
      "Autotest GetPublic OwnerReadsAdmin",
      true,
    );

    const { data, status } = await ownerApi.rooms.getPublicSettings({
      id: templateId,
    });
    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  for (const role of ["User", "Guest"] as const) {
    test(`${role} cannot read public flag of public template`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createTemplate(
        ownerApi,
        `Autotest GetPublic ${role} Public`,
        true,
      );

      const { api } = await apiSdk.addAuthenticatedMember("owner", role);
      const { data } = await api.rooms.getPublicSettings({ id: templateId });
      expect(data.statusCode).toBe(403);
    });

    test(`${role} cannot read public flag of private template`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createTemplate(
        ownerApi,
        `Autotest GetPublic ${role} Private`,
        false,
      );

      const { api } = await apiSdk.addAuthenticatedMember("owner", role);
      const { data } = await api.rooms.getPublicSettings({ id: templateId });
      expect(data.statusCode).toBe(403);
    });
  }

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const templateId = await createTemplate(
      ownerApi,
      "Autotest GetPublic Anon",
      true,
    );

    const { status } = await apiSdk.forAnonymous().rooms.getPublicSettings({
      id: templateId,
    });
    expect(status).toBe(401);
  });
});

test.describe("POST /files/rooms/fromtemplate - access control", () => {
  test("DocSpaceAdmin can create a room from a public template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FromTmpl Admin Source",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Autotest FromTmpl Admin Template",
      },
    });
    const templateId = await waitForRoomTemplate(ownerApi.rooms);
    await ownerApi.rooms.setPublicSettings({
      setPublicDto: { id: templateId, public: true },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { status } = await adminApi.rooms.createRoomFromTemplate({
      createRoomFromTemplateDto: { templateId, title: "Admin Room" },
    });
    expect(status).toBe(200);

    const createdId = await waitForRoomFromTemplate(adminApi.rooms);
    expect(createdId).toBeGreaterThan(0);
  });

  test.fail(
    "BUG 81662: User cannot create a room from template (no create-room permission)",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FromTmpl User Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest FromTmpl User Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const { data } = await userApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "User Room" },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain("User Room");
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 81663: Guest cannot create a room from template",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FromTmpl Guest Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest FromTmpl Guest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );
      const { data } = await guestApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Guest Room" },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain("Guest Room");
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 81664: DocSpaceAdmin cannot create a room from a non-public template they don't own",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FromTmpl NoAccess Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest FromTmpl NoAccess Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const { data } = await adminApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Should Fail" },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain("Should Fail");
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 81662: User with source-room access but no template access cannot create room",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FromTmpl SrcOnly Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      const { data: memberData, api: userApi } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: sourceRoomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest FromTmpl SrcOnly Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data } = await userApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Should Fail" },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain("Should Fail");
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 81662: User with template access still cannot create room without create-room permission",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FromTmpl TmplOnly Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest FromTmpl TmplOnly Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      // Make template public so any user can see/read it.
      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const { data } = await userApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "User Room TmplOnly",
        },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain("User Room TmplOnly");
      expect(data.statusCode).toBe(403);
    },
  );

  test("Disabled (terminated) user cannot create a room from template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FromTmpl Disabled Source",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Autotest FromTmpl Disabled Template",
      },
    });
    const templateId = await waitForRoomTemplate(ownerApi.rooms);
    await ownerApi.rooms.setPublicSettings({
      setPublicDto: { id: templateId, public: true },
    });

    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await adminApi.rooms.createRoomFromTemplate({
      createRoomFromTemplateDto: { templateId, title: "Disabled Room" },
    });
    expect(status).toBe(401);
  });

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FromTmpl Anon Source",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: roomData.response!.id!,
        title: "Autotest FromTmpl Anon Template",
      },
    });
    const templateId = await waitForRoomTemplate(ownerApi.rooms);

    const { status } = await apiSdk
      .forAnonymous()
      .rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Anonymous Room" },
      });
    expect(status).toBe(401);
  });
});

test.describe("DELETE /files/rooms/:id/tags - access control", () => {
  test("DELETE /files/rooms/:id/tags - Owner can detach tag from own room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner DetachTag Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Owner DetachTag"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Owner DetachTag"] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain(
      "Autotest Owner DetachTag",
    );
  });

  test("DELETE /files/rooms/:id/tags - DocSpaceAdmin can detach tag from own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin DetachTag Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await adminApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Admin DetachTag"] },
    });

    const { data, status } = await adminApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Admin DetachTag"] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain(
      "Autotest Admin DetachTag",
    );
  });

  test("DELETE /files/rooms/:id/tags - User not in room cannot detach tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest User Outside Detach Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest User Outside Detach Tag"] },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest User Outside Detach Tag"] },
    });

    expect(data.statusCode).toBe(403);
  });

  test("DELETE /files/rooms/:id/tags - Guest not in room cannot detach tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Guest Outside Detach Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Guest Outside Detach Tag"] },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Guest Outside Detach Tag"] },
    });

    expect(data.statusCode).toBe(403);
  });

  test("DELETE /files/rooms/:id/tags - Unauthenticated user cannot detach tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Anon Detach Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Anon Detach Tag"] },
    });

    const { status } = await apiSdk.forAnonymous().rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Anon Detach Tag"] },
    });

    expect(status).toBe(401);
  });

  test("DELETE /files/rooms/:id/tags - Disabled (terminated) user cannot detach tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Disabled Detach Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Disabled Detach Tag"] },
    });

    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Disabled Detach Tag"] },
    });

    expect(status).toBe(401);
  });
});

for (const userType of ["RoomAdmin", "User", "Guest"] as const) {
  test.describe(`DELETE /files/rooms/:id/tags - ${userType} invited to room`, () => {
    for (const { label, access } of roomAccesses) {
      // Only RoomAdmin can be assigned RoomManager access — API rejects this access level for User/Guest
      if (
        access === FileShare.RoomManager &&
        (userType === "User" || userType === "Guest")
      ) {
        continue;
      }

      test(`Room access: ${label}`, async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const tagName = `Autotest Detach ${userType} ${label}`;

        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Detach Room ${userType} ${label}`,
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        await ownerApi.rooms.addRoomTags({
          id: roomId,
          batchTagsRequestDto: { names: [tagName] },
        });

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

        const { data, status } = await memberApi.rooms.deleteRoomTags({
          id: roomId,
          batchTagsRequestDto: { names: [tagName] },
        });

        // Only RoomManager has permission to manage room metadata (tags)
        if (access === FileShare.RoomManager) {
          expect(status).toBe(200);
          expect((data.response!.tags ?? []) as string[]).not.toContain(
            tagName,
          );
        } else {
          expect(status).toBe(403);
        }
      });
    }
  });
}

test.describe("GET /files/rooms/:id - access control", () => {
  test("Owner can get own room info", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Owner Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = created.response!.id!;

    const { status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(200);
  });

  test("DocSpaceAdmin can get any room info", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { status } = await adminApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(200);
  });

  test("User without room access cannot get room info", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest User No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.rooms.getRoomInfo({ id: roomId });

    expect(data.statusCode).toBe(403);
  });

  test("Guest without room access cannot get room info", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Guest No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.rooms.getRoomInfo({ id: roomId });

    expect(data.statusCode).toBe(403);
  });

  test("Unauthenticated request returns 401", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Anon Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = created.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot get room info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Disabled Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    // Grant access first, otherwise 403 from missing access would mask the 401 we want to assert.
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(401);
  });
});

// User/Guest invited to a room with any access level (Viewer/Commenter/Reviewer/Editor/ContentCreator)
// can read room info. RoomManager is rejected for User/Guest at invitation time — skip it
// (see [[user_guest_no_roommanager_access]]).
for (const userType of ["User", "Guest"] as const) {
  test.describe(`GET /files/rooms/:id - ${userType} invited to room`, () => {
    for (const { label, access } of roomAccesses) {
      if (access === FileShare.RoomManager) {
        continue;
      }

      test(`Room access: ${label} - can read room info`, async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Read Access ${userType} ${label}`,
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

        const { data, status } = await memberApi.rooms.getRoomInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.id).toBe(roomId);
      });
    }
  });
}

// RoomAdmin invited to another owner's room can read it at any access level — including RoomManager,
// which only User/Guest are barred from being granted.
test.describe("GET /files/rooms/:id - RoomAdmin invited to owner's room", () => {
  for (const { label, access } of roomAccesses) {
    test(`Room access: ${label} - can read room info`, async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Read RoomAdmin Access ${label}`,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access }],
          notify: false,
        },
      });

      const { data, status } = await roomAdminApi.rooms.getRoomInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.id).toBe(roomId);
    });
  }
});

// Pinning is a per-user action (each user has independent pin state). Verified behavior
// (see memory pin_room_behavior):
// - Owner and DocSpaceAdmin can pin any room (DocSpaceAdmin even without being invited).
// - ANY invited member can pin regardless of access level - security.Pin is true for
//   Viewer/Commenter/Reviewer/Editor/ContentCreator/RoomManager, for User and Guest alike.
//   So a low-access member pinning a room returning 200 is intended, NOT a bug.
// - Only NON-members are rejected with 403 "You can't pin a room".
// - Anonymous -> 401; terminated user -> 401.
test.describe("PUT /files/rooms/:id/pin - access control", () => {
  test("Owner can pin own room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Owner",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status, data } = await ownerApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.pinned).toBe(true);
  });

  test("DocSpaceAdmin can pin own room", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Admin Own",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status, data } = await adminApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.pinned).toBe(true);
  });

  test("DocSpaceAdmin can pin owner's room without being invited", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Owner Room For Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { status } = await adminApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(200);
  });

  test("RoomAdmin invited with RoomManager access can pin the room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin RoomAdmin Manager",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { status } = await roomAdminApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(200);
  });

  test("User not invited to room cannot pin it", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin NonInvited User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status, data } = await userApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("You can't pin a room");
  });

  test("Guest not invited to room cannot pin it", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin NonInvited Guest",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { status, data } = await guestApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("You can't pin a room");
  });

  test("Anonymous cannot pin a room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Anonymous",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk.forAnonymous().rooms.pinRoom({
      id: roomId,
    });

    expect(status).toBe(401);
  });

  test("Disabled (terminated) user cannot pin a room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Terminated",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    // Invite first, then terminate - so the rejection is due to the disabled
    // account, not lack of membership.
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.rooms.pinRoom({ id: roomId });

    expect(status).toBe(401);
  });
});

// Any invited member can pin the room regardless of access level. RoomManager access
// is rejected for User/Guest at invitation time, so that combination is skipped -
// see [[user_guest_no_roommanager_access]].
for (const userType of ["User", "Guest"] as const) {
  test.describe(`PUT /files/rooms/:id/pin - ${userType} invited to room`, () => {
    for (const { label, access } of roomAccesses) {
      if (access === FileShare.RoomManager) {
        continue;
      }

      test(`Room access: ${label} - can pin room`, async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Pin Access ${userType} ${label}`,
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { api: memberApi, data: memberData } =
          await apiSdk.addAuthenticatedMember("owner", userType);

        await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberData.response!.id!, access }],
            notify: false,
          },
        });

        const { status, data } = await memberApi.rooms.pinRoom({ id: roomId });

        expect(status).toBe(200);
        expect(data.response!.pinned).toBe(true);
      });
    }
  });
}

// RoomAdmin invited to another owner's room can pin it at any access level.
test.describe("PUT /files/rooms/:id/pin - RoomAdmin invited to owner's room", () => {
  for (const { label, access } of roomAccesses) {
    test(`Room access: ${label} - can pin room`, async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Pin RoomAdmin Access ${label}`,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: memberData.response!.id!, access }],
          notify: false,
        },
      });

      const { status } = await roomAdminApi.rooms.pinRoom({ id: roomId });

      expect(status).toBe(200);
    });
  }
});

test.describe("PUT /api/2.0/files/rooms/{id}/links - external sharing restriction", () => {
  test(
    "BUG 81840: PUT /api/2.0/files/rooms/{id}/links - Owner cannot create new external link when external sharing is restricted with Allow existing links",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest External Link Restriction Room",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("Enable external sharing restriction with Allow existing links", async () => {
        await ownerApi.filesSettings.changeExternalSharingSettings({
          externalSharingSettingsRequestDto: {
            externalShare: false,
            externalShareApplyToRooms: true,
            blockExistingLinksOnRestrict: false,
          },
        });
      });

      await test.step("Attempt to create new external link — expect 403", async () => {
        const { data, status } = await ownerApi.rooms.setRoomLink({
          id: roomId,
          roomLinkRequest: {
            internal: false,
            linkType: LinkType.External,
            access: FileShare.Read,
          },
        });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe("Access denied");
      });
    },
  );
});

// PUT /files/rooms/:id/reorder — reorderRoom. Reordering the room index is a
// room-management action: only the room owner, portal admins (DocSpaceAdmin) or a
// member invited with management access (RoomManager) may run it. Lower access
// levels and non-members get 403; anonymous requests get 401.
test.describe("PUT /files/rooms/:id/reorder - access control", () => {
  test("Owner can reorder their own indexed room", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reorder Perm Owner",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
    expect(status).toBe(200);
  });

  // Unlike PUT /archive (which a DocSpaceAdmin may run on any room), reorder is
  // membership-scoped: a portal admin who is not a member of the room cannot reorder it
  // and gets the same 403 "folder not found" as any other non-member.
  test("DocSpaceAdmin not invited to owner's room cannot reorder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reorder Perm Admin",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { status } = await adminApi.rooms.reorderRoom({ id: roomId });
    expect(status).toBe(403);
  });

  test("RoomAdmin not invited to owner's room cannot reorder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reorder Perm RoomAdmin Outside",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { status } = await roomAdminApi.rooms.reorderRoom({ id: roomId });
    expect(status).toBe(403);
  });

  // RoomAdmin invited to the room: only management access (RoomManager) grants the
  // ability to reorder the index; lower access levels are forbidden.
  for (const { label, access } of roomAccesses) {
    const allowed = access === FileShare.RoomManager;
    test(`RoomAdmin invited as ${label} ${
      allowed ? "can" : "cannot"
    } reorder the room`, async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Reorder Perm Invited ${label}`,
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access }],
          notify: false,
        },
      });

      const { status } = await roomAdminApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(allowed ? 200 : 403);
    });
  }

  test("User invited to room cannot reorder", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reorder Perm User",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await userApi.rooms.reorderRoom({ id: roomId });
    expect(status).toBe(403);
  });

  test("Guest invited to room cannot reorder", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reorder Perm Guest",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.rooms.reorderRoom({ id: roomId });
    expect(status).toBe(403);
  });

  test("Reordering a room without authorization returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reorder Perm Anonymous",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk.forAnonymous().rooms.reorderRoom({
      id: roomId,
    });
    expect(status).toBe(401);
  });
});
