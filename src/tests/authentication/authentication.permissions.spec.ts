import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import config from "@/config";

test.describe("POST /api/2.0/authentication - permissions", () => {
  test("POST /api/2.0/authentication - Cannot authenticate with wrong password", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestsDto: {
          userName: "wrong@email.com",
          password: "wrongpassword",
        },
      });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe("User authentication failed");
  });

  test("POST /api/2.0/authentication - Cannot authenticate with non-existent email", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestsDto: {
          userName: "nonexistent@example.com",
          password: "somepassword123",
        },
      });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe("User authentication failed");
  });

  test("POST /api/2.0/authentication - Cannot authenticate without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe();

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe("User authentication failed");
  });
});

test.describe("POST /api/2.0/authentication/{code} - permissions", () => {
  test("POST /api/2.0/authentication/{code} - 401 when TFA is not enabled", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code: "123456",
        authWithCodeRequestsDto: {
          userName: config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
          code: "123456",
        },
      });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBeTruthy();
  });

  test("POST /api/2.0/authentication/{code} - 401 when credentials are wrong", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code: "123456",
        authWithCodeRequestsDto: {
          userName: "wrong@email.com",
          password: "wrongpassword",
          code: "123456",
        },
      });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe("User authentication failed");
  });

  test("POST /api/2.0/authentication/{code} - 401 when body is empty", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code: "123456",
      });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe("User authentication failed");
  });
});

test.describe("POST /api/2.0/authentication/logout - permissions", () => {
  test("POST /api/2.0/authentication/logout - Anonymous can logout", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().authentication.logout();

    expect(status).toBe(200);
  });
});

// POST /api/2.0/authentication/confirm (checkConfirm) cannot be tested:
// a valid confirmation key is generated server-side and delivered only via email.
// Without email access in the test environment there is no way to obtain a real key.

// POST /api/2.0/authentication/setphone (saveMobilePhone) cannot be tested:
// the flow requires a real phone number and access to SMS to verify it.

// POST /api/2.0/authentication/sendsms (sendSmsCode) cannot be tested:
// the flow requires a real phone number and access to SMS to receive the code.

test.describe("GET /api/2.0/authentication - permissions", () => {
  test("GET /api/2.0/authentication - Anonymous is not authenticated", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.getIsAuthentificated();

    expect(status).toBe(200);
    expect(data.response).toBe(false);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("GET");
  });
});
