import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { createTestImageBuffer } from "@/src/utils/test-image";

test.describe("POST /api/2.0/files/logos - access control", () => {
  const testLogoBuffer = createTestImageBuffer();

  test("POST /api/2.0/files/logos - Owner can upload logo image", async ({
    apiSdk,
  }) => {
    const result = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    expect(result.status).toBe(200);
    expect(result.data.response.success).toBe(true);
  });

  test("POST /api/2.0/files/logos - DocSpaceAdmin can upload logo image", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const result = await apiSdk.uploadRoomLogo("docSpaceAdmin", testLogoBuffer);
    expect(result.status).toBe(200);
    expect(result.data.response.success).toBe(true);
  });

  test("POST /api/2.0/files/logos - RoomAdmin can upload logo image", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const result = await apiSdk.uploadRoomLogo("roomAdmin", testLogoBuffer);
    expect(result.status).toBe(200);
    expect(result.data.response.success).toBe(true);
  });

  test("POST /api/2.0/files/logos - User cannot upload logo image", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const result = await apiSdk.uploadRoomLogo("user", testLogoBuffer);
    expect(result.status).toBe(403);
  });

  test("POST /api/2.0/files/logos - Guest cannot upload logo image", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const result = await apiSdk.uploadRoomLogo("guest", testLogoBuffer);
    expect(result.status).toBe(403);
  });

  test("POST /api/2.0/files/logos - Unauthenticated user cannot upload logo image", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().rooms.uploadRoomLogo();
    expect(status).toBe(401);
  });
});

test.describe("POST /files/rooms/:id/logo - access control", () => {
  const testLogoBuffer = createTestImageBuffer();

  test("POST /files/rooms/:id/logo - Owner can create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - DocSpaceAdmin cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: uploadResult.data.response.data as string },
      });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - RoomAdmin cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("roomAdmin").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - User cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - Guest cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("guest").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - Unauthenticated user cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forAnonymous().rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(401);
  });

  test("POST /files/rooms/:id/logo - DocSpaceAdmin with RoomManager access cannot create room logo using another user's tmpFile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo DocSpaceAdmin RoomManager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: uploadResult.data.response.data as string },
      });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - RoomAdmin with RoomManager access cannot create room logo using another user's tmpFile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo RoomAdmin RoomManager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("roomAdmin").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - DocSpaceAdmin with RoomManager access can create room logo using own tmpFile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo DocSpaceAdmin Own TmpFile",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo(
      "docSpaceAdmin",
      testLogoBuffer,
    );
    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: uploadResult.data.response.data as string },
      });
    expect(status).toBe(200);
  });

  test("POST /files/rooms/:id/logo - RoomAdmin with RoomManager access can create room logo using own tmpFile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo RoomAdmin Own TmpFile",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo(
      "roomAdmin",
      testLogoBuffer,
    );
    const { status } = await apiSdk.forRole("roomAdmin").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(200);
  });

  test("POST /files/rooms/:id/logo - DocSpaceAdmin can create logo in own room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");
    const { data: roomData } = await docSpaceAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo DocSpaceAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "docSpaceAdmin",
      testLogoBuffer,
    );
    const { data, status } = await docSpaceAdminApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - RoomAdmin can create logo in own room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo RoomAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "roomAdmin",
      testLogoBuffer,
    );
    const { data, status } = await roomAdminApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - User with Editor access cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User Editing Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - User with Viewer access cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User Viewer Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - User with Content Creator access cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User ContentCreator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.FillForms }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - User cannot create logo in DocSpaceAdmin's room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");
    const { data: roomData } = await docSpaceAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User In DocSpaceAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - User cannot create logo in RoomAdmin's room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User In RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - User with RoomManager access cannot create room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo User RoomManager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    const { status } = await apiSdk.forRole("user").rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(403);
  });
});

test.describe("DELETE /files/rooms/:id/logo - access control", () => {
  const testLogoBuffer = createTestImageBuffer();

  test("DELETE /files/rooms/:id/logo - Owner can delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - DocSpaceAdmin cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - RoomAdmin cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - User cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - Guest cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - Unauthenticated user cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(401);
  });

  test("DELETE /files/rooms/:id/logo - DocSpaceAdmin with RoomManager access can delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del DocSpaceAdmin RoomManager",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(200);
  });

  test("DELETE /files/rooms/:id/logo - RoomAdmin with RoomManager access can delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del RoomAdmin RoomManager",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(200);
  });

  test("DELETE /files/rooms/:id/logo - DocSpaceAdmin can delete logo from own room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");
    const { data: roomData } = await docSpaceAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del DocSpaceAdmin Own",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "docSpaceAdmin",
      testLogoBuffer,
    );
    await docSpaceAdminApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { status } = await docSpaceAdminApi.rooms.deleteRoomLogo({
      id: roomId,
    });
    expect(status).toBe(200);
  });

  test("DELETE /files/rooms/:id/logo - RoomAdmin can delete logo from own room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del RoomAdmin Own",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "roomAdmin",
      testLogoBuffer,
    );
    await roomAdminApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { status } = await roomAdminApi.rooms.deleteRoomLogo({
      id: roomId,
    });
    expect(status).toBe(200);
  });

  test("DELETE /files/rooms/:id/logo - User with Editor access cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User Editing Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - User with Viewer access cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User Viewer Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - User with Content Creator access cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User ContentCreator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.FillForms }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - User cannot delete logo in DocSpaceAdmin's room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");
    const { data: roomData } = await docSpaceAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User In DocSpaceAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "docSpaceAdmin",
      testLogoBuffer,
    );
    await docSpaceAdminApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - User cannot delete logo in RoomAdmin's room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User In RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "roomAdmin",
      testLogoBuffer,
    );
    await roomAdminApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });

  test("DELETE /files/rooms/:id/logo - User with RoomManager access cannot delete room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del User RoomManager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo("owner", testLogoBuffer);
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("user")
      .rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(403);
  });
});
