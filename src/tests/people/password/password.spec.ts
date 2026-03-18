import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import config from "@/config";

test.describe("POST /people/password - Send password reminder", () => {
  test("POST /people/password - Owner reminds himself of the password.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = config.DOCSPACE_OWNER_EMAIL;
    const { data, status } = await ownerApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - DocSpace admin reminds himself of the password.", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const email = memberData.response!.email!;

    const { data, status } = await adminApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - Room admin reminds himself of the password.", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const email = memberData.response!.email!;

    const { data, status } = await roomAdminApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - User reminds himself of the password.", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const email = memberData.response!.email!;

    const { data, status } = await userApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - Guest reminds himself of the password.", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const email = memberData.response!.email!;

    const { data, status } = await guestApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - DocSpace admin reminds the room admin of the password.", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const email = roomAdminData.response!.email!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data, status } = await adminApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - DocSpace admin reminds the user of the password.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const email = userData.response!.email!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data, status } = await adminApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - DocSpace admin reminds the guest of the password.", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const email = guestData.response!.email!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data, status } = await adminApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `The password change instruction has been sent to ${email} email address.`,
    );
  });

  test("POST /people/password - Reminds himself of the password in the login page.", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const email = config.DOCSPACE_OWNER_EMAIL;
    const { data, status } = await anonApi.password.sendUserPassword({
      emailMemberRequestDto: { email },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      `If a user with the ${email} email exists, the password change instruction has been sent to this email address.`,
    );
  });
});

/* TODO: - Need email integration to this methods to be able to test them properly
PUT /people/{userid}/password
*/
