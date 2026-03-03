// Tests that check user access rights.

import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import config from "@/config";

test.describe("POST /people/password - access control", () => {
  // 80157 - FIX
  test("POST /people/password - DocSpace administrator reminds the owner of the password.", async ({
    apiSdk,
  }) => {
    const ownerEmail = config.DOCSPACE_OWNER_EMAIL;
    const { api: adminApi } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data } = await adminApi.password.sendUserPassword({ email: ownerEmail });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - Room admin reminds the owner of the password.", async ({
    apiSdk,
  }) => {
    const ownerEmail = config.DOCSPACE_OWNER_EMAIL;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data } = await roomAdminApi.password.sendUserPassword({ email: ownerEmail });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - User reminds the owner of the password.", async ({
    apiSdk,
  }) => {
    const ownerEmail = config.DOCSPACE_OWNER_EMAIL;
    const { api: userApi } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data } = await userApi.password.sendUserPassword({ email: ownerEmail });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - Guest reminds the owner of the password.", async ({
    apiSdk,
  }) => {
    const ownerEmail = config.DOCSPACE_OWNER_EMAIL;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data } = await guestApi.password.sendUserPassword({ email: ownerEmail });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  // 80157 - FIX
  test("POST /people/password - DocSpace admin reminds the docspace admin of the password.", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const email = docSpaceAdminData.response!.email!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data } = await adminApi.password.sendUserPassword({ email });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - Room admin reminds the room admin of the password.", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const email = roomAdminData.response!.email!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data } = await roomAdminApi.password.sendUserPassword({ email });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - User reminds the user of the password.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const email = userData.response!.email!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember("owner", "User");
    const { data } = await userApi.password.sendUserPassword({ email });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - Guest reminds the guest of the password.", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const email = guestData.response!.email!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember("owner", "Guest");
    const { data } = await guestApi.password.sendUserPassword({ email });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - Room admin reminds the user of the password.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const email = userData.response!.email!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data } = await roomAdminApi.password.sendUserPassword({ email });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /people/password - Room admin reminds the guest of the password.", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const email = guestData.response!.email!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data } = await roomAdminApi.password.sendUserPassword({ email });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
