import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { createTestImage } from "@/src/utils/test-image";

test.describe("POST /people/:userid/photo - Permissions", () => {
  test("POST /people/:userid/photo - Owner cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const visitorId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await test.step("Owner uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await ownerApi.photos.uploadMemberPhoto(adminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Owner uploads avatar to RoomAdmin", async () => {
      const { data } = await ownerApi.photos.uploadMemberPhoto(roomAdminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Owner uploads avatar to User", async () => {
      const { data } = await ownerApi.photos.uploadMemberPhoto(visitorId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Owner uploads avatar to Guest", async () => {
      const { data } = await ownerApi.photos.uploadMemberPhoto(guestId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });

  test("POST /people/:userid/photo - DocSpace admin cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: ownerProfile } = await apiSdk.forRole("owner").profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await test.step("DocSpace admin uploads avatar to Owner", async () => {
      const { data } = await adminApi.photos.uploadMemberPhoto(ownerId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("DocSpace admin uploads avatar to RoomAdmin", async () => {
      const { data } = await adminApi.photos.uploadMemberPhoto(roomAdminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("DocSpace admin uploads avatar to User", async () => {
      const { data } = await adminApi.photos.uploadMemberPhoto(userId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("DocSpace admin uploads avatar to Guest", async () => {
      const { data } = await adminApi.photos.uploadMemberPhoto(guestId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });

  test("POST /people/:userid/photo - Room admin cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: ownerProfile } = await apiSdk.forRole("owner").profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await test.step("Room admin uploads avatar to Owner", async () => {
      const { data } = await roomAdminApi.photos.uploadMemberPhoto(ownerId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Room admin uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await roomAdminApi.photos.uploadMemberPhoto(adminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Room admin uploads avatar to User", async () => {
      const { data } = await roomAdminApi.photos.uploadMemberPhoto(userId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Room admin uploads avatar to Guest", async () => {
      const { data } = await roomAdminApi.photos.uploadMemberPhoto(guestId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });

  test("POST /people/:userid/photo - User cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: ownerProfile } = await apiSdk.forRole("owner").profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await test.step("User uploads avatar to Owner", async () => {
      const { data } = await userApi.photos.uploadMemberPhoto(ownerId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("User uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await userApi.photos.uploadMemberPhoto(adminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("User uploads avatar to RoomAdmin", async () => {
      const { data } = await userApi.photos.uploadMemberPhoto(roomAdminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("User uploads avatar to Guest", async () => {
      const { data } = await userApi.photos.uploadMemberPhoto(guestId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });

  test("POST /people/:userid/photo - Guest cannot upload avatar to other users", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data: ownerProfile } = await apiSdk.forRole("owner").profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: adminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await test.step("Guest uploads avatar to Owner", async () => {
      const { data } = await guestApi.photos.uploadMemberPhoto(ownerId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Guest uploads avatar to DocSpaceAdmin", async () => {
      const { data } = await guestApi.photos.uploadMemberPhoto(adminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Guest uploads avatar to RoomAdmin", async () => {
      const { data } = await guestApi.photos.uploadMemberPhoto(roomAdminId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    await test.step("Guest uploads avatar to User", async () => {
      const { data } = await guestApi.photos.uploadMemberPhoto(userId, [
        createTestImage() as any,
      ]);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
});
