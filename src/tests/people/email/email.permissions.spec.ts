// Tests that check user access rights for EmailApi.

import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";

test.describe("API email tests for access rights", () => {
  test("POST /people/email - Sent instructions on changing an email address to a non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const userId = faker.string.uuid();
    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      "The user could not be found",
    ); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Sent instructions on how to change your email address with an incorrect email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const incorrectEmail = apiSdk.faker.generateString(20);

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: incorrectEmail,
      },
    });
    expect((data as any).response.status).toBe(400);
    expect((data as any).response.title).toContain(
      "One or more validation errors occurred.",
    );
    expect(
      ((data as any).response.errors as Record<string, string[]>).Email[0],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The Email field is not a valid e-mail address.",
    );
  });

  test("POST /people/email - DocSpace admin sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - DocSpace admin sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: roomAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: roomAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: roomAdminId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent another User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent Guest instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "Guest");
    const userId = userData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: userId,
        email: faker.internet.email(),
      },
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Sent instructions on how to change email address without authorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { status } = await anonApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: ownerId,
        email: faker.internet.email(),
      },
    });
    expect(status).toBe(401);
  });

  test("POST /people/email - Sending instructions on how to change a very long email address.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const veryLongEmail = apiSdk.faker.generateEmailWithLength(260);

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      updateMemberRequestDto: {
        userId: docSpaceAdminId,
        email: veryLongEmail,
      },
    });
    expect((data as any).response.status).toBe(400);
    expect((data as any).response.title).toContain(
      "One or more validation errors occurred.",
    );
    expect(
      ((data as any).response.errors as Record<string, string[]>).Email[0],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field Email must be a string with a maximum length of 255.",
    );
  });
});
