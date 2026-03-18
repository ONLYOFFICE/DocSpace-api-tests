import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { createTestImageBuffer } from "@/src/utils/test-image";

test.fail(
  "BUG 80569 POST /people/:userid/photo - Owner uploads avatar via SDK photos.uploadMemberPhoto",
  async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profile } = await ownerApi.profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const imageBuffer = createTestImageBuffer();
    const file = new File([new Uint8Array(imageBuffer)], "avatar.png", {
      type: "image/png",
    });

    const { data, status } = await ownerApi.photos.uploadMemberPhoto({
      userid: userId,
      formCollection: [file] as any,
    });

    expect(status).toBe(200);
    expect(data.response?.success).toBe(true);
  },
);

test.describe("POST /people/:userid/photo - Upload member photo", () => {
  test("POST /people/:userid/photo - Owner uploads own avatar", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profile } = await ownerApi.profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const { data } = await apiSdk.uploadMemberPhoto(
      "owner",
      userId,
      createTestImageBuffer(),
    );

    expect(data.statusCode).toBe(200);
    expect(data.response.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - DocSpace admin uploads own avatar", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk.uploadMemberPhoto(
      "docSpaceAdmin",
      userId,
      createTestImageBuffer(),
    );

    expect(data.statusCode).toBe(200);
    expect(data.response.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - Room admin uploads own avatar", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk.uploadMemberPhoto(
      "roomAdmin",
      userId,
      createTestImageBuffer(),
    );

    expect(data.statusCode).toBe(200);
    expect(data.response.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - User uploads own avatar", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk.uploadMemberPhoto(
      "user",
      userId,
      createTestImageBuffer(),
    );

    expect(data.statusCode).toBe(200);
    expect(data.response.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - Guest uploads own avatar", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk.uploadMemberPhoto(
      "guest",
      userId,
      createTestImageBuffer(),
    );

    expect(data.statusCode).toBe(200);
    expect(data.response.success).toBe(true);
    expect(data.count).toBe(1);
  });
});

test.describe("DELETE /people/:userid/photo - Delete member photo", () => {
  test("DELETE /people/:userid/photo - Owner deletes own photo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profile } = await ownerApi.profiles.getSelfProfile();
    const userId = profile.response!.id!;

    await apiSdk.uploadMemberPhoto("owner", userId, createTestImageBuffer());

    const { data } = await ownerApi.photos.deleteMemberPhoto({
      userid: userId,
    });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("DELETE /people/:userid/photo - DocSpace admin deletes own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const userId = memberData.response!.id!;

    await apiSdk.uploadMemberPhoto(
      "docSpaceAdmin",
      userId,
      createTestImageBuffer(),
    );

    const { data } = await apiSdk
      .forRole("docSpaceAdmin")
      .photos.deleteMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("DELETE /people/:userid/photo - Room admin deletes own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const userId = memberData.response!.id!;

    await apiSdk.uploadMemberPhoto(
      "roomAdmin",
      userId,
      createTestImageBuffer(),
    );

    const { data } = await apiSdk
      .forRole("roomAdmin")
      .photos.deleteMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("DELETE /people/:userid/photo - User deletes own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = memberData.response!.id!;

    await apiSdk.uploadMemberPhoto("user", userId, createTestImageBuffer());

    const { data } = await apiSdk
      .forRole("user")
      .photos.deleteMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("DELETE /people/:userid/photo - Guest deletes own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const userId = memberData.response!.id!;

    await apiSdk.uploadMemberPhoto("guest", userId, createTestImageBuffer());

    const { data } = await apiSdk
      .forRole("guest")
      .photos.deleteMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });
});

test.describe("GET /people/:userid/photo - Get member photo", () => {
  test("GET /people/:userid/photo - Owner gets own photo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profile } = await ownerApi.profiles.getSelfProfile();
    const userId = profile.response!.id!;

    const { data } = await ownerApi.photos.getMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("GET /people/:userid/photo - DocSpace admin gets own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk
      .forRole("docSpaceAdmin")
      .photos.getMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("GET /people/:userid/photo - Room admin gets own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk
      .forRole("roomAdmin")
      .photos.getMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("GET /people/:userid/photo - User gets own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk
      .forRole("user")
      .photos.getMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });

  test("GET /people/:userid/photo - Guest gets own photo", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const userId = memberData.response!.id!;

    const { data } = await apiSdk
      .forRole("guest")
      .photos.getMemberPhoto({ userid: userId });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });
});

test.describe("GET /people/:userid/photo - Get other users photo", () => {
  test("GET /people/:userid/photo - Owner gets all users photo", async ({
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

    await test.step("Owner gets DocSpaceAdmin photo", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .photos.getMemberPhoto({ userid: adminId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Owner gets RoomAdmin photo", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .photos.getMemberPhoto({ userid: roomAdminId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Owner gets User photo", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .photos.getMemberPhoto({ userid: userId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Owner gets Guest photo", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .photos.getMemberPhoto({ userid: guestId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });
  });

  test("GET /people/:userid/photo - DocSpace admin gets all users photo", async ({
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

    await test.step("DocSpace admin gets Owner photo", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.getMemberPhoto({ userid: ownerId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("DocSpace admin gets RoomAdmin photo", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.getMemberPhoto({ userid: roomAdminId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("DocSpace admin gets User photo", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.getMemberPhoto({ userid: userId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("DocSpace admin gets Guest photo", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .photos.getMemberPhoto({ userid: guestId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });
  });

  test("GET /people/:userid/photo - Room admin gets users photo", async ({
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

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    await test.step("Room admin gets Owner photo", async () => {
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .photos.getMemberPhoto({ userid: ownerId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Room admin gets DocSpaceAdmin photo", async () => {
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .photos.getMemberPhoto({ userid: adminId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Room admin gets User photo", async () => {
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .photos.getMemberPhoto({ userid: userId });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
    });
  });
});

// SDK methods updateMemberPhoto (PUT /people/{userid}/photo) and
// createMemberPhotoThumbnails (POST /people/{userid}/photo/thumbnails)
// are available in the SDK but not used in the UI — only upload and delete are used.
