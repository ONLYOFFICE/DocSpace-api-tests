import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";
import config from "@/config";

test.describe("API email methods", () => {
  test("POST /people/email - Owner sent himself instructions on how to change his email address", async ({
    apiSdk,
    api,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );

    await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: config.DOCSPACE_OWNER_EMAIL,
      },
    });
    await api.auth.authenticateOwner();
  });

  test("POST /people/email - Owner sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - Owner sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: roomAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - Owner sent user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - DocSpace admin sent instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - DocSpace admin sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: roomAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - DocSpace admin sent User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - Room admin sent instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: roomAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - User sent instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await userApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });

  test("POST /people/email - Guest sent instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = userData.response!.id!;

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(
      "The email change instructions have been successfully sent",
    );
  });
});

/* TODO: - Need email integration to this methods to be able to test them properly
PUT /people/{userid}/email
*/
