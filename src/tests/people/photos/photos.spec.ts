import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { createTestImage } from "@/src/utils/test-image";

test.describe("POST /people/:userid/photo - Upload member photo", () => {
  test.only("POST /people/:userid/photo - Owner uploads own avatar", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profile } = await ownerApi.profiles.getSelfProfile();
    console.log(profile);
    const userId = profile.response!.id!;

    const { data } = await ownerApi.photos.uploadMemberPhoto(userId, [
      createTestImage() as any,
    ]);

    expect(data.statusCode).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - DocSpace admin uploads own avatar", async ({
    apiSdk,
  }) => {
    const { api: adminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    const { data } = await adminApi.photos.uploadMemberPhoto(userId, [
      createTestImage() as any,
    ]);

    expect(data.statusCode).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - Room admin uploads own avatar", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;

    const { data } = await roomAdminApi.photos.uploadMemberPhoto(userId, [
      createTestImage() as any,
    ]);

    expect(data.statusCode).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - User uploads own avatar", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    const { data } = await userApi.photos.uploadMemberPhoto(userId, [
      createTestImage() as any,
    ]);

    expect(data.statusCode).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.count).toBe(1);
  });

  test("POST /people/:userid/photo - Guest uploads own avatar", async ({
    apiSdk,
  }) => {
    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = memberData.response!.id!;

    const { data } = await guestApi.photos.uploadMemberPhoto(userId, [
      createTestImage() as any,
    ]);

    expect(data.statusCode).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.count).toBe(1);
  });
});
