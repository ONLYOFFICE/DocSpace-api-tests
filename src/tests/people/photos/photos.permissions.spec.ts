import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { createTestImageBuffer } from "@/src/utils/test-image";

test.describe("POST /people/:userid/photo - Permissions", () => {
  test("POST /people/:userid/photo - Owner cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const image = createTestImageBuffer();

    await test.step("Owner uploads avatar to DocSpaceAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "owner",
        adminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Owner uploads avatar to RoomAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "owner",
        roomAdminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Owner uploads avatar to User", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "owner",
        userId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Owner uploads avatar to Guest", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "owner",
        guestId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });
  });

  test("POST /people/:userid/photo - DocSpace admin cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const image = createTestImageBuffer();

    await test.step("DocSpace admin uploads avatar to Owner", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        ownerId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("DocSpace admin uploads avatar to RoomAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        roomAdminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("DocSpace admin uploads avatar to User", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        userId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("DocSpace admin uploads avatar to Guest", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        guestId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });
  });

  test("POST /people/:userid/photo - Room admin cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const image = createTestImageBuffer();

    await test.step("Room admin uploads avatar to Owner", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        ownerId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Room admin uploads avatar to DocSpaceAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        adminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Room admin uploads avatar to User", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        userId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Room admin uploads avatar to Guest", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        guestId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });
  });

  test("POST /people/:userid/photo - User cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const image = createTestImageBuffer();

    await test.step("User uploads avatar to Owner", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "user",
        ownerId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("User uploads avatar to DocSpaceAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "user",
        adminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("User uploads avatar to RoomAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "user",
        roomAdminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("User uploads avatar to Guest", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "user",
        guestId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });
  });

  test("POST /people/:userid/photo - Guest cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const image = createTestImageBuffer();

    await test.step("Guest uploads avatar to Owner", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "guest",
        ownerId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Guest uploads avatar to DocSpaceAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "guest",
        adminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Guest uploads avatar to RoomAdmin", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "guest",
        roomAdminId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Guest uploads avatar to User", async () => {
      const { data, status } = await apiSdk.uploadMemberPhoto(
        "guest",
        userId,
        image,
      );
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });
  });
});

test.describe("DELETE /people/:userid/photo - Permissions", () => {
  test("DELETE /people/:userid/photo - Owner cannot delete other users photo", async ({
    apiSdk,
  }) => {
    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await test.step("Owner deletes DocSpaceAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .photos.deleteMemberPhoto({ userId: adminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Owner deletes RoomAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .photos.deleteMemberPhoto({ userId: roomAdminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Owner deletes User photo", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .photos.deleteMemberPhoto({ userId: userId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Owner deletes Guest photo", async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .photos.deleteMemberPhoto({ userId: guestId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("DELETE /people/:userid/photo - DocSpace admin cannot delete other users photo", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await test.step("DocSpace admin deletes Owner photo", async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.deleteMemberPhoto({ userId: ownerId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("DocSpace admin deletes RoomAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.deleteMemberPhoto({ userId: roomAdminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("DocSpace admin deletes User photo", async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.deleteMemberPhoto({ userId: userId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("DocSpace admin deletes Guest photo", async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.deleteMemberPhoto({ userId: guestId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("DELETE /people/:userid/photo - Room admin cannot delete other users photo", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    await test.step("Room admin deletes Owner photo", async () => {
      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .photos.deleteMemberPhoto({ userId: ownerId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Room admin deletes DocSpaceAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .photos.deleteMemberPhoto({ userId: adminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Room admin deletes User photo", async () => {
      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .photos.deleteMemberPhoto({ userId: userId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Room admin deletes Guest photo", async () => {
      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .photos.deleteMemberPhoto({ userId: guestId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("DELETE /people/:userid/photo - User cannot delete other users photo", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    await test.step("User deletes Owner photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.deleteMemberPhoto({ userId: ownerId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User deletes DocSpaceAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.deleteMemberPhoto({ userId: adminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User deletes RoomAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.deleteMemberPhoto({ userId: roomAdminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User deletes Guest photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.deleteMemberPhoto({ userId: guestId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("DELETE /people/:userid/photo - Guest cannot delete other users photo", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    await test.step("Guest deletes Owner photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.deleteMemberPhoto({ userId: ownerId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest deletes DocSpaceAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.deleteMemberPhoto({ userId: adminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest deletes RoomAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.deleteMemberPhoto({ userId: roomAdminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest deletes User photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.deleteMemberPhoto({ userId: userId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });
});

test.describe("GET /people/:userid/photo - Permissions", () => {
  test("GET /people/:userid/photo - Room admin cannot get Guest photo", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .photos.getMemberPhoto({ userId: guestId });

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/:userid/photo - User cannot get other users photo", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    await test.step("User cannot get Owner photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.getMemberPhoto({ userId: ownerId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User cannot get DocSpaceAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.getMemberPhoto({ userId: adminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User cannot get RoomAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.getMemberPhoto({ userId: roomAdminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User cannot get Guest photo", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .photos.getMemberPhoto({ userId: guestId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("GET /people/:userid/photo - Guest cannot get other users photo", async ({
    apiSdk,
  }) => {
    const { data: ownerProfile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    await test.step("Guest cannot get Owner photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.getMemberPhoto({ userId: ownerId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest cannot get DocSpaceAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.getMemberPhoto({ userId: adminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest cannot get RoomAdmin photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.getMemberPhoto({ userId: roomAdminId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest cannot get User photo", async () => {
      const { data, status } = await apiSdk
        .forRole("guest")
        .photos.getMemberPhoto({ userId: userId });
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });
});

test.describe("GET /people/:userid/photo - Edge cases", () => {
  test("GET /people/:userid/photo - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .photos.getMemberPhoto({ userId: userId });

    expect(status).toBe(401);
  });

  test("GET /people/:userid/photo - 404 when user not found", async ({
    apiSdk,
  }) => {
    const nonExistentUserId = "00000000-0000-0000-0000-000000000000";

    const { data, status } = await apiSdk
      .forRole("owner")
      .photos.getMemberPhoto({ userId: nonExistentUserId });

    expect(status).toBe(404);
    expect((data as any).error?.message).toContain(
      "The user could not be found",
    );
  });
});

test.describe("DELETE /people/:userid/photo - Edge cases", () => {
  test("DELETE /people/:userid/photo - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .photos.deleteMemberPhoto({ userId: userId });

    expect(status).toBe(401);
  });

  test("DELETE /people/:userid/photo - 404 when user not found", async ({
    apiSdk,
  }) => {
    const nonExistentUserId = "00000000-0000-0000-0000-000000000000";

    const { data, status } = await apiSdk
      .forRole("owner")
      .photos.deleteMemberPhoto({ userId: nonExistentUserId });

    expect(status).toBe(404);
    expect((data as any).error?.message).toContain(
      "The user could not be found",
    );
  });
});

test.describe("POST /people/:userid/photo - Edge cases", () => {
  test("POST /people/:userid/photo - returns error when no file attached", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const { data, status } = await apiSdk.uploadMemberPhoto(
      "owner",
      userId,
      Buffer.alloc(0),
      { skipFile: true },
    );

    expect(status).toBe(200);
    expect(data.response?.success).toBe(false);
    expect(data.response?.message).toBe("The uploaded file could not be found");
  });

  test("POST /people/:userid/photo - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const image = createTestImageBuffer();

    const { status } = await apiSdk.uploadMemberPhoto("owner", userId, image, {
      skipAuth: true,
    });

    expect(status).toBe(401);
  });

  test("POST /people/:userid/photo - 413 when image is too large", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const largeImage = Buffer.alloc(20 * 1024 * 1024, 0);

    const { data, status } = await apiSdk.uploadMemberPhoto(
      "owner",
      userId,
      largeImage,
    );

    expect(status).toBe(200);
    expect(data.response?.success).toBe(false);
    expect(data.response?.message).toBe(
      "The maximum file size is exceeded (5 MB).",
    );
  });

  test("POST /people/:userid/photo - 415 when unsupported file type", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const svgFile = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    );

    const { data, status } = await apiSdk.uploadMemberPhoto(
      "owner",
      userId,
      svgFile,
      { fileName: "avatar.svg", mimeType: "image/svg+xml" },
    );

    expect(status).toBe(200);
    expect(data.response?.success).toBe(false);
  });
});
