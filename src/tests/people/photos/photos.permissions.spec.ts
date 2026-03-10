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
      const { data } = await apiSdk.uploadMemberPhoto("owner", adminId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Owner uploads avatar to RoomAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "owner",
        roomAdminId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Owner uploads avatar to User", async () => {
      const { data } = await apiSdk.uploadMemberPhoto("owner", userId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Owner uploads avatar to Guest", async () => {
      const { data } = await apiSdk.uploadMemberPhoto("owner", guestId, image);
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
      const { data } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        ownerId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("DocSpace admin uploads avatar to RoomAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        roomAdminId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("DocSpace admin uploads avatar to User", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        userId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("DocSpace admin uploads avatar to Guest", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "docSpaceAdmin",
        guestId,
        image,
      );
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
      const { data } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        ownerId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Room admin uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        adminId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Room admin uploads avatar to User", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        userId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Room admin uploads avatar to Guest", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "roomAdmin",
        guestId,
        image,
      );
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
      const { data } = await apiSdk.uploadMemberPhoto("user", ownerId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("User uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto("user", adminId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("User uploads avatar to RoomAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "user",
        roomAdminId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("User uploads avatar to Guest", async () => {
      const { data } = await apiSdk.uploadMemberPhoto("user", guestId, image);
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
      const { data } = await apiSdk.uploadMemberPhoto("guest", ownerId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Guest uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto("guest", adminId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Guest uploads avatar to RoomAdmin", async () => {
      const { data } = await apiSdk.uploadMemberPhoto(
        "guest",
        roomAdminId,
        image,
      );
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });

    await test.step("Guest uploads avatar to User", async () => {
      const { data } = await apiSdk.uploadMemberPhoto("guest", userId, image);
      expect(data.statusCode).toBe(200);
      expect(data.response?.success).toBe(false);
      expect(data.response?.message).toBe("Security error.");
    });
  });

  test("POST /people/:userid/photo - 400 when no file attached", async ({
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

    expect(status).toBe(400);
    expect(data.error?.message).toContain("Value cannot be null.");
  });

  test("POST /people/:userid/photo - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { data: profile } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const image = createTestImageBuffer();

    const { status } = await apiSdk.uploadMemberPhoto(
      "owner",
      userId,
      image,
      { skipAuth: true },
    );

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
    expect(data.response?.message).toBe("The maximum file size is exceeded (5 MB).");
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
