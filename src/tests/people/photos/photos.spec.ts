import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { createTestImageBuffer } from "@/src/utils/test-image";

// Bug: SDK PhotosApi.uploadMemberPhoto has wrong type for formCollection parameter.
test("POST /people/:userid/photo - Owner uploads avatar via SDK photos.uploadMemberPhoto", async ({
  apiSdk,
}) => {
  test.skip(
    true,
    "Bug: SDK PhotosApi.uploadMemberPhoto type is Array<KeyValuePairStringStringValues> instead of File/Blob — server returns 400",
  );

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
});

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
