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

    const { data, status } = await ownerApi.photos.uploadMemberPhoto(userId, [
      file,
    ] as any);

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

    const { data } = await ownerApi.photos.deleteMemberPhoto(userId);

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
      .photos.deleteMemberPhoto(userId);

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
      .photos.deleteMemberPhoto(userId);

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
      .photos.deleteMemberPhoto(userId);

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
      .photos.deleteMemberPhoto(userId);

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

    const { data } = await ownerApi.photos.getMemberPhoto(userId);

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
      .photos.getMemberPhoto(userId);

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
      .photos.getMemberPhoto(userId);

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

    const { data } = await apiSdk.forRole("user").photos.getMemberPhoto(userId);

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
      .photos.getMemberPhoto(userId);

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
  });
});

// SDK methods updateMemberPhoto (PUT /people/{userid}/photo) and
// createMemberPhotoThumbnails (POST /people/{userid}/photo/thumbnails)
// are available in the SDK but not used in the UI — only upload and delete are used.
