import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  ConfirmType,
  EmployeeStatus,
  CheckConfirmRequestDto,
  EmployeeType,
  FileShare,
  LinkType,
  RoomType,
  TfaType,
  ValidationResult,
} from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { enableTfaApp, resetTfaAfterTest } from "@/src/helpers/tfa";
import {
  authState,
  createUser,
  rawLogin,
  rawLogout,
  resolveConfirmLink,
  totpAtOffset,
} from "@/src/helpers/authentication";

const LOGIN_FAILED = "User authentication failed";

test.describe("POST /api/2.0/authentication - permissions", () => {
  test("POST /api/2.0/authentication - Cannot authenticate with wrong password", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = isolatedSdk.forAnonymous();

    const { data, status } = await anonymous.authentication.authenticateMe({
      authRequestDto: {
        userName: user.email,
        password: `${user.password}x`,
      },
    });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    expect(Boolean(data.response?.token)).toBe(false);

    // positive control: the account exists and its real password still works
    const { data: control, status: controlStatus } =
      await anonymous.authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: user.password },
      });
    expect(controlStatus).toBe(200);
    expect(control.response?.token).toBeTruthy();
  });

  test("POST /api/2.0/authentication - Cannot authenticate with non-existent email", async ({
    apiSdk,
  }) => {
    // unique per run: failed attempts are counted per login across portals
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: apiSdk.faker.generateUser().email,
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
    // A dedicated user: failed attempts are counted per login across portals,
    // and the owner's e-mail is shared by every test portal.
    const user = await createUser(apiSdk);

    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code: "123456",
        authWithCodeRequestDto: {
          userName: user.email,
          password: user.password,
          code: "123456",
        },
      });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBeTruthy();
    expect(Boolean(data.response?.token)).toBe(false);
  });

  test("POST /api/2.0/authentication/{code} - 401 when credentials are wrong", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code: "123456",
        authWithCodeRequestDto: {
          userName: apiSdk.faker.generateUser().email,
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

// Failed logins feed a brute-force counter (the account is locked for a while
// after a few of them - see settings/login/login.spec.ts). Every test below
// runs on its own portal and keeps to at most three failed attempts against
// one account, then proves the account is still usable with a positive control.
test.describe("POST /api/2.0/authentication - credential validation", () => {
  test("POST /api/2.0/authentication - Cannot authenticate with wrong letter case in password", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk, "Passw0rdAbc");
    const anonymous = isolatedSdk.forAnonymous();

    const { data, status } = await anonymous.authentication.authenticateMe({
      authRequestDto: { userName: user.email, password: "pASSW0RDaBC" },
    });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe(LOGIN_FAILED);

    const { status: controlStatus } =
      await anonymous.authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: user.password },
      });
    expect(controlStatus).toBe(200);
  });

  test("POST /api/2.0/authentication - Cannot authenticate with empty, missing or null password", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = isolatedSdk.forAnonymous();

    const variants = {
      empty: { userName: user.email, password: "" },
      missing: { userName: user.email },
      null: { userName: user.email, password: null },
    };
    for (const [name, authRequestsDto] of Object.entries(variants)) {
      await test.step(`${name} password is rejected`, async () => {
        const { data, status } = await anonymous.authentication.authenticateMe({
          authRequestDto: authRequestsDto,
        });
        expect(status).toBe(401);
        expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }

    const { status: controlStatus } =
      await anonymous.authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: user.password },
      });
    expect(controlStatus).toBe(200);
  });

  test("POST /api/2.0/authentication - Cannot authenticate with empty, missing or null login", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = isolatedSdk.forAnonymous();

    const variants = {
      empty: { userName: "", password: user.password },
      missing: { password: user.password },
      null: { userName: null, password: user.password },
    };
    for (const [name, authRequestsDto] of Object.entries(variants)) {
      await test.step(`${name} login is rejected`, async () => {
        const { data, status } = await anonymous.authentication.authenticateMe({
          authRequestDto: authRequestsDto,
        });
        expect(status).toBe(401);
        expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }
  });

  test("POST /api/2.0/authentication - Cannot authenticate with whitespace-only credentials or a padded login", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = isolatedSdk.forAnonymous();

    const variants = {
      "whitespace-only login": { userName: "   ", password: user.password },
      "whitespace-only password": { userName: user.email, password: "   " },
      "login padded with spaces": {
        userName: ` ${user.email} `,
        password: user.password,
      },
    };
    for (const [name, authRequestsDto] of Object.entries(variants)) {
      await test.step(`${name} is rejected`, async () => {
        const { data, status } = await anonymous.authentication.authenticateMe({
          authRequestDto: authRequestsDto,
        });
        expect(status).toBe(401);
        expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }

    const { status: controlStatus } =
      await anonymous.authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: user.password },
      });
    expect(controlStatus).toBe(200);
  });

  test("POST /api/2.0/authentication - Malformed, SQL, HTML and control-character logins are rejected without a token", async ({
    isolatedSdk,
  }) => {
    const anonymous = isolatedSdk.forAnonymous();

    const logins = {
      "invalid email format": "not-an-email",
      "SQL-like string": "' OR '1'='1' --",
      "HTML/JavaScript-like string": "<script>alert(1)</script>",
      "control characters": "a\u0000b\u0007@example.com",
    };
    for (const [name, userName] of Object.entries(logins)) {
      await test.step(`${name} is treated as an ordinary unknown login`, async () => {
        const { data, status } = await anonymous.authentication.authenticateMe({
          authRequestDto: { userName, password: "x" },
        });
        expect(status).toBe(401);
        expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }
  });

  test("POST /api/2.0/authentication - Over-long login and password are rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = isolatedSdk.forAnonymous();

    await test.step("5000-character login", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: {
          userName: `${apiSdk.faker.generateString(5000)}@example.com`,
          password: user.password,
        },
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });

    await test.step("10000-character password", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: "p".repeat(10000) },
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });
  });

  test("POST /api/2.0/authentication - Wrong JSON types and malformed JSON are rejected with 400", async ({
    apiSdk,
  }) => {
    await test.step("password sent as a number", async () => {
      const { status, data } = await apiSdk.rawApi(
        null,
        "POST",
        "authentication",
        {
          body: JSON.stringify({ userName: "a@example.com", password: 12345 }),
        },
      );
      expect(status).toBe(400);
      expect(Object.keys(data.response?.errors ?? {})).toContain("$.password");
    });

    await test.step("malformed JSON body", async () => {
      const { status } = await apiSdk.rawApi(null, "POST", "authentication", {
        body: "{not json",
      });
      expect(status).toBe(400);
    });
  });

  test("POST /api/2.0/authentication - Non-matching passwordHash and provider-only requests are rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = isolatedSdk.forAnonymous();

    await test.step("passwordHash that does not match", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: { userName: user.email, passwordHash: "garbage" },
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });

    await test.step("provider without an access token", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: { provider: "google" },
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });
  });

  test("POST /api/2.0/authentication - A failed login does not create a session", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);

    const failed = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: `${user.password}x`,
    });

    expect(failed.status).toBe(401);
    expect(Boolean(failed.token)).toBe(false);
    expect(failed.cookie === "").toBe(true);

    // the context's own cookie jar must still be anonymous
    const { data, status } = await isolatedSdk
      .forAnonymous()
      .authentication.getIsAuthentificated();
    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("POST /api/2.0/authentication - Deactivated user gets 403 and can log in again once reactivated", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const credentials = { userName: user.email, password: user.password };
    const anonymous = isolatedSdk.forAnonymous();

    await test.step("active user logs in", async () => {
      const { status } = await anonymous.authentication.authenticateMe({
        authRequestDto: credentials,
      });
      expect(status).toBe(200);
    });

    await test.step("owner deactivates the user", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .userStatus.updateUserStatus({
          status: EmployeeStatus.Terminated,
          updateMembersRequestDto: { userIds: [user.id] },
        });
      expect(status).toBe(200);
    });

    await test.step("deactivated user is refused with a distinct 403", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: credentials,
      });
      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("User disabled");
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await test.step("owner reactivates the user", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .userStatus.updateUserStatus({
          status: EmployeeStatus.Active,
          updateMembersRequestDto: { userIds: [user.id] },
        });
      expect(status).toBe(200);
    });

    await test.step("reactivated user logs in again", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: credentials,
      });
      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
    });
  });

  test("POST /api/2.0/authentication - Removed user cannot authenticate", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const ownerApi = apiSdk.forRole("owner");

    await test.step("owner deactivates and removes the user", async () => {
      const { status: terminated } = await ownerApi.userStatus.updateUserStatus(
        {
          status: EmployeeStatus.Terminated,
          updateMembersRequestDto: { userIds: [user.id] },
        },
      );
      expect(terminated).toBe(200);
      const { status: removed } = await ownerApi.profiles.removeUsers({
        updateMembersRequestDto: { userIds: [user.id] },
      });
      expect(removed).toBe(200);
    });

    await test.step("login is rejected as for an unknown user", async () => {
      const { data, status } = await isolatedSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: { userName: user.email, password: user.password },
        });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });
  });
});

// getIsAuthentificated never answers 401: credentials it cannot accept are
// reported in the body as response=false with status 200.
test.describe("GET /api/2.0/authentication - invalid credentials", () => {
  test("GET /api/2.0/authentication - Invalid tokens and cookies are reported as false with status 200", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });
    expect(session.status).toBe(200);
    const token = session.token!;

    await test.step("positive control: the real token is authenticated", async () => {
      const state = await authState(isolatedSdk, { bearer: token });
      expect(state).toEqual({ status: 200, authenticated: true });
    });

    const invalid: Array<[string, Parameters<typeof authState>[1]]> = [
      ["arbitrary Bearer token", { bearer: "garbage" }],
      ["empty Bearer token", { authorization: "Bearer " }],
      ["Bearer scheme without a token", { authorization: "Bearer" }],
      [
        "well-formed Basic credentials for an unknown user",
        {
          authorization: `Basic ${Buffer.from("nobody:wrong-password").toString("base64")}`,
        },
      ],
      [
        "tampered token",
        {
          bearer: `${token.slice(0, -3)}${token.endsWith("abc") ? "xyz" : "abc"}`,
        },
      ],
      ["invalid auth cookie", { cookie: "asc_auth_key=garbage" }],
    ];
    for (const [name, credentials] of invalid) {
      await test.step(`${name} is not authenticated`, async () => {
        const state = await authState(isolatedSdk, credentials);
        expect(state).toEqual({ status: 200, authenticated: false });
      });
    }
  });

  test("BUG 84500: GET /api/2.0/authentication - A malformed Basic Authorization header is not an internal error", async ({
    isolatedSdk,
  }) => {
    test.fail(
      true,
      "BUG 84500: GET /authentication with 'Authorization: Basic <value>' where the value is not " +
        "valid base64 (or decodes to something without a ':') answers 500 - BasicAuthHandler throws " +
        "an unhandled FormatException / 'Unable to get password' and returns the stack trace. Every " +
        "other invalid credential on this endpoint is reported as response=false with 200, so that " +
        "is the expected result here. Remove test.fail once it is fixed.",
    );

    const state = await authState(isolatedSdk, {
      authorization: "Basic !!!not-base64",
    });

    expect(state).toEqual({ status: 200, authenticated: false });
  });

  test("GET /api/2.0/authentication - A session token stops being authenticated once the user is deactivated or removed", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const ownerApi = apiSdk.forRole("owner");
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });
    const token = session.token!;

    await test.step("token is authenticated before", async () => {
      const state = await authState(isolatedSdk, { bearer: token });
      expect(state.authenticated).toBe(true);
    });

    await test.step("deactivated user's token is no longer authenticated", async () => {
      const { status } = await ownerApi.userStatus.updateUserStatus({
        status: EmployeeStatus.Terminated,
        updateMembersRequestDto: { userIds: [user.id] },
      });
      expect(status).toBe(200);
      const state = await authState(isolatedSdk, { bearer: token });
      expect(state).toEqual({ status: 200, authenticated: false });
    });

    await test.step("removed user's token stays unauthenticated", async () => {
      const { status } = await ownerApi.profiles.removeUsers({
        updateMembersRequestDto: { userIds: [user.id] },
      });
      expect(status).toBe(200);
      const state = await authState(isolatedSdk, { bearer: token });
      expect(state).toEqual({ status: 200, authenticated: false });
    });
  });

  test("GET /api/2.0/authentication - An auth cookie takes precedence over the Bearer token", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });

    await test.step("valid cookie and valid Bearer token", async () => {
      const state = await authState(isolatedSdk, {
        cookie: session.cookie,
        bearer: session.token,
      });
      expect(state.authenticated).toBe(true);
    });

    await test.step("valid Bearer token with an invalid cookie is not authenticated", async () => {
      const state = await authState(isolatedSdk, {
        cookie: "asc_auth_key=garbage",
        bearer: session.token,
      });
      expect(state.authenticated).toBe(false);
    });

    await test.step("invalid Bearer token with a valid cookie is authenticated", async () => {
      const state = await authState(isolatedSdk, {
        cookie: session.cookie,
        bearer: "garbage",
      });
      expect(state.authenticated).toBe(true);
    });
  });
});

test.describe("POST /api/2.0/authentication/logout - invalid credentials", () => {
  test("POST /api/2.0/authentication/logout - Logout with an invalid Bearer token still succeeds", async ({
    isolatedSdk,
  }) => {
    const { status, body } = await rawLogout(isolatedSdk, {
      bearer: "garbage",
    });

    expect(status).toBe(200);
    expect(body.statusCode).toBe(200);
    expect(body.count).toBe(0);
    expect(body.links?.[0].action).toBe("POST");
  });
});

// A confirmation link's key is validated against the link's creator (`uiD`)
// and, for invitations, the employee type. Anything that does not match is not
// an HTTP error: it comes back as 200 with result=Invalid. The only way to get
// a real key without an email is to follow the short invitation link.
test.describe("POST /api/2.0/authentication/confirm - invalid confirmations", () => {
  async function invitationKey(apiSdk: ApiSDK) {
    const { data, status } = await apiSdk
      .forRole("owner")
      .users.getInvitationLink({ employeeType: EmployeeType.User });
    expect(status).toBe(200);
    const confirm = await resolveConfirmLink(apiSdk, data.response as string);
    expect(confirm.key).toBeTruthy();
    expect(confirm.uid).toBeTruthy();
    return confirm;
  }

  test("POST /api/2.0/authentication/confirm - Keys that do not match the invitation are Invalid", async ({
    apiSdk,
  }) => {
    const { key, uid } = await invitationKey(apiSdk);
    const anonymous = apiSdk.forAnonymous();

    await test.step("positive control: the real key is Ok", async () => {
      const { data, status } = await anonymous.authentication.checkConfirm({
        checkConfirmRequestDto: {
          key,
          uiD: uid,
          emplType: EmployeeType.User,
          type: ConfirmType.LinkInvite,
        },
      });
      expect(status).toBe(200);
      expect(data.response?.result).toBe(ValidationResult.Ok);
    });

    const invalid: Record<string, CheckConfirmRequestDto> = {
      "tampered key": {
        key: `${key.slice(0, -2)}XX`,
        uiD: uid,
        emplType: EmployeeType.User,
        type: ConfirmType.LinkInvite,
      },
      "arbitrary key": {
        key: "garbage",
        uiD: uid,
        emplType: EmployeeType.User,
        type: ConfirmType.LinkInvite,
      },
      "empty key": {
        key: "",
        uiD: uid,
        emplType: EmployeeType.User,
        type: ConfirmType.LinkInvite,
      },
      "key without the creator id": {
        key,
        emplType: EmployeeType.User,
        type: ConfirmType.LinkInvite,
      },
      "key for a different employee type": {
        key,
        uiD: uid,
        emplType: EmployeeType.RoomAdmin,
        type: ConfirmType.LinkInvite,
      },
      "key with a different confirmation type": {
        key,
        uiD: uid,
        emplType: EmployeeType.User,
        type: ConfirmType.PasswordChange,
      },
      "key presented as a personal email invitation": {
        key,
        uiD: uid,
        emplType: EmployeeType.User,
        email: "someone@example.com",
        type: ConfirmType.EmpInvite,
      },
    };
    for (const [name, emailValidationKeyModel] of Object.entries(invalid)) {
      await test.step(`${name} is Invalid`, async () => {
        const { data, status } = await anonymous.authentication.checkConfirm({
          checkConfirmRequestDto: emailValidationKeyModel,
        });
        expect(status).toBe(200);
        expect(data.response?.result).toBe(ValidationResult.Invalid);
        expect(data.response?.roomId).toBeUndefined();
        expect(data.response?.title).toBeUndefined();
      });
    }
  });

  test("POST /api/2.0/authentication/confirm - A room invitation key without the creator id does not disclose the room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(12),
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: link, status } = await ownerApi.rooms.setRoomLink({
      id: room.response!.id!,
      roomLinkRequest: {
        linkType: LinkType.Invitation,
        access: FileShare.Read,
        internal: false,
      },
    });
    expect(status).toBe(200);
    const { key, uid } = await resolveConfirmLink(
      apiSdk,
      link.response!.sharedTo!.shareLink!,
    );
    const anonymous = apiSdk.forAnonymous();

    await test.step("positive control: with the creator id the room is disclosed", async () => {
      const { data } = await anonymous.authentication.checkConfirm({
        checkConfirmRequestDto: {
          key,
          uiD: uid,
          type: ConfirmType.LinkInvite,
        },
      });
      expect(data.response?.result).toBe(ValidationResult.Ok);
      expect(data.response?.title).toBe(room.response!.title);
    });

    await test.step("without the creator id the key is Invalid and no room data leaks", async () => {
      const { data, status: checkStatus } =
        await anonymous.authentication.checkConfirm({
          checkConfirmRequestDto: { key, type: ConfirmType.LinkInvite },
        });
      expect(checkStatus).toBe(200);
      expect(data.response?.result).toBe(ValidationResult.Invalid);
      expect(data.response?.roomId).toBeUndefined();
      expect(data.response?.title).toBeUndefined();
    });
  });

  test("POST /api/2.0/authentication/confirm - Empty body and empty object are rejected with 400", async ({
    apiSdk,
  }) => {
    const anonymous = apiSdk.forAnonymous();

    await test.step("no body", async () => {
      const { data, status } = await anonymous.authentication.checkConfirm();
      expect(status).toBe(400);
      expect((data as any)?.error?.message).toBeTruthy();
    });

    await test.step("empty object", async () => {
      const { data, status } = await anonymous.authentication.checkConfirm({
        checkConfirmRequestDto: {},
      });
      expect(status).toBe(400);
      expect((data as any)?.error?.message).toBeTruthy();
    });
  });

  test("POST /api/2.0/authentication/confirm - Unknown confirmation type is rejected with a validation error", async ({
    apiSdk,
  }) => {
    const { status, data } = await apiSdk.rawApi(
      null,
      "POST",
      "authentication/confirm",
      { body: JSON.stringify({ key: "garbage", type: "Bogus" }) },
    );

    expect(status).toBe(400);
    expect(Object.keys(data.response?.errors ?? {})).toContain("$.type");
  });

  test("BUG 84502: POST /api/2.0/authentication/confirm - EmpInvite without an employee type does not surface an internal exception", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 84502: POST /authentication/confirm with type=EmpInvite and no emplType answers 403 " +
        "with the raw .NET message 'Nullable object must have a value.'. Cause: " +
        "EmailValidationKeyModelHelper.ValidateAsync does `(int)emplType` on a nullable with no " +
        "null check (the LinkInvite branch uses `emplType ?? default`). The correct status is " +
        "not specified anywhere, so the test only asserts what is clearly wrong: an unhandled " +
        "exception message in the body and a 403 for a request that is merely incomplete. " +
        "Remove test.fail once it is fixed.",
    );

    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.checkConfirm({
        checkConfirmRequestDto: {
          key: "garbage",
          email: "someone@example.com",
          type: ConfirmType.EmpInvite,
        },
      });

    expect((data as any)?.error?.message ?? "").not.toContain(
      "Nullable object must have a value",
    );
    expect(status).not.toBe(403);
  });
});

// SMS two-factor authentication cannot be switched on for the test portals:
// updateTfaSettings(Sms) is refused. Without it neither a phone number nor an
// SMS code can be exercised end to end, so the cases below cover everything
// that is reachable without an SMS provider.
test.describe("SMS two-factor authentication on the test stand", () => {
  test("PUT /settings/tfaapp - SMS two-factor authentication cannot be enabled (premise of the SMS tests)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestDto: { type: TfaType.Sms },
      });

    // If this starts returning 200, SMS flows became testable: add the
    // saveMobilePhone / sendSmsCode happy-path and validation tests.
    expect(status).toBe(405);
    expect((data as any)?.error?.message).toBe(
      "SMS settings are not available",
    );
  });
});

test.describe("POST /api/2.0/authentication/setphone - permissions", () => {
  test("POST /api/2.0/authentication/setphone - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .authentication.saveMobilePhone({
        mobileRequestDto: { mobilePhone: "+14155550123" },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/authentication/setphone - Authenticated owner gets 403 and the phone is not saved", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: before } = await ownerApi.profiles.getSelfProfile();

    const variants = {
      "valid number": { mobilePhone: "+14155550123" },
      "empty number": { mobilePhone: "" },
      "number with letters": { mobilePhone: "abc" },
    };
    for (const [name, mobileRequestsDto] of Object.entries(variants)) {
      await test.step(`${name} is refused before it is looked at`, async () => {
        const { status } = await ownerApi.authentication.saveMobilePhone({
          mobileRequestDto: mobileRequestsDto,
        });
        expect(status).toBe(403);
      });
    }

    await test.step("the phone number of the account is unchanged", async () => {
      const { data: after } = await ownerApi.profiles.getSelfProfile();
      expect(after.response?.mobilePhone).toBe(before.response?.mobilePhone);
    });
  });
});

test.describe("POST /api/2.0/authentication/sendsms - invalid credentials", () => {
  test("POST /api/2.0/authentication/sendsms - Wrong password and unknown user get 401", async ({
    apiSdk,
  }) => {
    const user = await createUser(apiSdk);
    const anonymous = apiSdk.forAnonymous();

    await test.step("wrong password of an existing account", async () => {
      const { data, status } = await anonymous.authentication.sendSmsCode({
        authRequestDto: {
          userName: user.email,
          password: `${user.password}x`,
        },
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });

    await test.step("unknown user", async () => {
      const { data, status } = await anonymous.authentication.sendSmsCode({
        authRequestDto: {
          userName: apiSdk.faker.generateUser().email,
          password: "somepassword123",
        },
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });
  });

  test("POST /api/2.0/authentication/sendsms - Empty credentials and empty body get 401", async ({
    apiSdk,
  }) => {
    const anonymous = apiSdk.forAnonymous();

    await test.step("empty credentials object", async () => {
      const { data, status } = await anonymous.authentication.sendSmsCode({
        authRequestDto: {},
      });
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });

    await test.step("no body", async () => {
      const { data, status } = await anonymous.authentication.sendSmsCode();
      expect(status).toBe(401);
      expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    });
  });

  test("BUG 84503: POST /api/2.0/authentication/sendsms - Valid credentials while SMS is not enabled is not an internal error", async ({
    apiSdk,
  }) => {
    const user = await createUser(apiSdk);
    test.fail(
      true,
      "BUG 84503: POST /authentication/sendsms with valid credentials on a portal where SMS 2FA " +
        "is not enabled answers 500. SmsManager.PutAuthCodeAsync deliberately throws " +
        "MethodAccessException when SMS settings are not available / TFA is not enabled for the " +
        "user, and nothing maps it to a client response. The same condition is reported cleanly " +
        "by PUT /settings/tfaapp (405 'SMS settings are not available'), but the exact status " +
        "for sendsms is not specified, so the test only asserts it is not a 500. Remove " +
        "test.fail once it is fixed.",
    );

    const { status } = await apiSdk.forAnonymous().authentication.sendSmsCode({
      authRequestDto: {
        userName: user.email,
        password: user.password,
      },
    });

    expect(status).not.toBe(500);
  });
});

// TFA App is a portal-wide setting: enabling it invalidates the owner's token,
// and the portal can only be cleaned up once TFA is off again - afterEach runs
// the helper that links TFA for the owner and disables it.
//
// Wrong codes are always sent for a freshly created user, never for the owner:
// the owner's e-mail is the same on every test portal and every test logs in
// with it during setup, so failed attempts on it could lock the whole suite
// out. At most three wrong codes are sent per user, then a good code proves
// the account is not locked.
test.describe("POST /api/2.0/authentication/{code} - invalid codes", () => {
  test.afterEach(async ({ apiSdk }) => {
    await resetTfaAfterTest(apiSdk);
  });

  type Account = { userName: string; password: string };

  async function newAccount(apiSdk: ApiSDK): Promise<Account> {
    const user = await createUser(apiSdk);
    return { userName: user.email, password: user.password };
  }

  /** First login step with TFA App on: returns the account's TFA secret. */
  async function firstStepSecret(isolatedSdk: ApiSDK, account: Account) {
    const { data, status } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMe({ authRequestDto: account });
    expect(status).toBe(200);
    expect(data.response?.tfa).toBe(true);
    expect(Boolean(data.response?.token)).toBe(false);
    expect(data.response?.tfaKey).toBeTruthy();
    return data.response!.tfaKey!;
  }

  /** Creates a user, enables TFA App and returns the user's TFA secret. */
  async function startTfa(apiSdk: ApiSDK, isolatedSdk: ApiSDK) {
    const account = await newAccount(apiSdk);
    await enableTfaApp(apiSdk, "owner");
    const secret = await firstStepSecret(isolatedSdk, account);
    return { account, secret };
  }

  function submitCode(
    isolatedSdk: ApiSDK,
    code: string,
    body: { userName: string; password: string; code?: string | null },
  ) {
    return isolatedSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code,
        authWithCodeRequestDto: body,
      });
  }

  /** A good code must still work, and its token must be a working session. */
  async function expectGoodCodeStillWorks(
    isolatedSdk: ApiSDK,
    account: Account,
    secret: string,
  ) {
    const code = totpAtOffset(secret);
    const { data, status } = await submitCode(isolatedSdk, code, {
      userName: account.userName,
      password: account.password,
      code,
    });
    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
    const state = await authState(isolatedSdk, {
      bearer: data.response!.token!,
    });
    expect(state.authenticated).toBe(true);
  }

  test("POST /api/2.0/authentication/{code} - A wrong code is rejected without a token", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);

    const { data, status } = await submitCode(isolatedSdk, "000000", {
      ...account,
      code: "000000",
    });

    expect(status).toBe(401);
    expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
    expect(Boolean(data.response?.token)).toBe(false);

    await expectGoodCodeStillWorks(isolatedSdk, account, secret);
  });

  test("POST /api/2.0/authentication/{code} - Codes of the wrong length are rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);

    for (const [name, code] of Object.entries({
      "5 digits": "12345",
      "7 digits": "1234567",
    })) {
      await test.step(`${name} is rejected`, async () => {
        const { data, status } = await submitCode(isolatedSdk, code, {
          ...account,
          code,
        });
        expect(status).toBe(401);
        expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }

    await expectGoodCodeStillWorks(isolatedSdk, account, secret);
  });

  test("POST /api/2.0/authentication/{code} - Codes with letters, spaces or special characters are rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);

    for (const [name, code] of Object.entries({
      letters: "abcdef",
      "a space inside": "12 345",
      "special characters": "!@#$%^",
    })) {
      await test.step(`code with ${name} is rejected`, async () => {
        const { data, status } = await submitCode(isolatedSdk, code, {
          ...account,
          code,
        });
        expect(status).toBe(401);
        expect((data as any)?.error?.message).toBe(LOGIN_FAILED);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }

    await expectGoodCodeStillWorks(isolatedSdk, account, secret);
  });

  test("POST /api/2.0/authentication/{code} - An empty or missing code in the body is rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);
    const goodCode = totpAtOffset(secret);

    await test.step("empty code in the body", async () => {
      const { data, status } = await submitCode(isolatedSdk, goodCode, {
        ...account,
        code: "",
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await test.step("no code in the body", async () => {
      const { data, status } = await submitCode(isolatedSdk, goodCode, {
        userName: account.userName,
        password: account.password,
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await expectGoodCodeStillWorks(isolatedSdk, account, secret);
  });

  test("POST /api/2.0/authentication/{code} - A correct code does not help with wrong credentials", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);
    const code = totpAtOffset(secret);

    await test.step("wrong password", async () => {
      const { data, status } = await submitCode(isolatedSdk, code, {
        userName: account.userName,
        password: `${account.password}x`,
        code,
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await test.step("wrong login", async () => {
      const { data, status } = await submitCode(isolatedSdk, code, {
        userName: apiSdk.faker.generateUser().email,
        password: account.password,
        code,
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await expectGoodCodeStillWorks(isolatedSdk, account, secret);
  });

  test("POST /api/2.0/authentication/{code} - A code generated for another user is rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const firstAccount = await newAccount(apiSdk);
    const secondAccount = await newAccount(apiSdk);
    await enableTfaApp(apiSdk, "owner");
    const firstSecret = await firstStepSecret(isolatedSdk, firstAccount);
    const secondSecret = await firstStepSecret(isolatedSdk, secondAccount);
    expect(
      firstSecret === secondSecret,
      "every user gets their own TFA secret",
    ).toBe(false);

    await test.step("the first user's code does not log the second user in", async () => {
      const code = totpAtOffset(firstSecret);
      const { data, status } = await submitCode(isolatedSdk, code, {
        ...secondAccount,
        code,
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await test.step("the second user's code does not log the first user in", async () => {
      const code = totpAtOffset(secondSecret);
      const { data, status } = await submitCode(isolatedSdk, code, {
        ...firstAccount,
        code,
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await expectGoodCodeStillWorks(isolatedSdk, firstAccount, firstSecret);
    await expectGoodCodeStillWorks(isolatedSdk, secondAccount, secondSecret);
  });

  test("POST /api/2.0/authentication/{code} - Codes from long before or long after now are rejected", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);

    // 12 steps = 6 minutes. The server tolerates clock drift of several
    // steps; the exact tolerance is not documented, so only a code that is
    // clearly out of range is asserted here.
    for (const offset of [-12, 12]) {
      await test.step(`code ${offset} steps away from now is rejected`, async () => {
        const code = totpAtOffset(secret, offset);
        const { data, status } = await submitCode(isolatedSdk, code, {
          ...account,
          code,
        });
        expect(status).toBe(401);
        expect(Boolean(data.response?.token)).toBe(false);
      });
    }

    await expectGoodCodeStillWorks(isolatedSdk, account, secret);
  });

  test("POST /api/2.0/authentication/{code} - The code in the body is the one that is checked, the path value is not bound", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    // Documented: the SDK says to send the same value in the path and in the
    // body "which is the one the handler reads", and the server's route
    // placeholder is unbound. A wrong path value therefore changes nothing
    // while a wrong body value fails.
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);
    const goodCode = totpAtOffset(secret);

    await test.step("a good path code with a wrong body code is rejected", async () => {
      const { data, status } = await submitCode(isolatedSdk, goodCode, {
        ...account,
        code: "000000",
      });
      expect(status).toBe(401);
      expect(Boolean(data.response?.token)).toBe(false);
    });

    await test.step("a wrong path code with a good body code logs in", async () => {
      const { data, status } = await submitCode(isolatedSdk, "000000", {
        ...account,
        code: goodCode,
      });
      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
    });
  });

  test("POST /api/2.0/authentication/{code} - A code that was already used cannot be used again", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    test.fail(
      true,
      "BUG XXXXX: POST /authentication/{code} accepts the same TOTP code any number of times " +
        "(a second login with an already-consumed code returns 200 and a fresh token). RFC 6238 " +
        "section 5.2 requires a verifier to reject a second attempt with an OTP it has already " +
        "accepted. Remove test.fail once replays are rejected.",
    );
    const { account, secret } = await startTfa(apiSdk, isolatedSdk);
    const code = totpAtOffset(secret);
    const body = { ...account, code };

    const { status: firstStatus } = await submitCode(isolatedSdk, code, body);
    expect(firstStatus).toBe(200);

    const { data: replay, status: replayStatus } = await submitCode(
      isolatedSdk,
      code,
      body,
    );

    expect(Boolean(replay.response?.token)).toBe(false);
    expect(replayStatus).toBe(401);
  });
});
