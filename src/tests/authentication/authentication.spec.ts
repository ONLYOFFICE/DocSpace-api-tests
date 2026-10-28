import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import config from "@/config";
import { generateTOTPAtCounter } from "@/src/utils/totp";
import {
  ConfirmType,
  EmployeeType,
  FileShare,
  LinkType,
  RoomType,
  TfaType,
  ValidationResult,
} from "@onlyoffice/docspace-api-sdk";
import { rememberOwnerTfaSecret, resetTfaAfterTest } from "@/src/helpers/tfa";
import {
  authState,
  createUser,
  expectNewLogoutEvent,
  getSelfRaw,
  rawLogin,
  rawLogout,
  resolveConfirmLink,
  snapshotLogoutEvents,
  totpAtOffset,
} from "@/src/helpers/authentication";

test.describe("GET /api/2.0/authentication", () => {
  test("GET /api/2.0/authentication - Owner is authenticated", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .authentication.getIsAuthentificated();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("GET");
  });

  test("GET /api/2.0/authentication - DocSpaceAdmin is authenticated", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .authentication.getIsAuthentificated();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("GET");
  });

  test("GET /api/2.0/authentication - RoomAdmin is authenticated", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .authentication.getIsAuthentificated();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("GET");
  });

  test("GET /api/2.0/authentication - User is authenticated", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .authentication.getIsAuthentificated();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("GET");
  });

  test("GET /api/2.0/authentication - Guest is authenticated", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .authentication.getIsAuthentificated();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("GET");
  });
});

test.describe("POST /api/2.0/authentication", () => {
  test("POST /api/2.0/authentication - Owner authenticates", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
    expect(data.response?.expires).toBeTruthy();
    expect(data.response?.sms).toBe(false);
    expect(data.response?.tfa).toBe(false);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("POST");
  });

  test("POST /api/2.0/authentication - DocSpaceAdmin authenticates", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: userData.email,
          password: userData.password,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
    expect(data.response?.expires).toBeTruthy();
    expect(data.response?.sms).toBe(false);
    expect(data.response?.tfa).toBe(false);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("POST");
  });

  test("POST /api/2.0/authentication - RoomAdmin authenticates", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: userData.email,
          password: userData.password,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
    expect(data.response?.expires).toBeTruthy();
    expect(data.response?.sms).toBe(false);
    expect(data.response?.tfa).toBe(false);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("POST");
  });

  test("POST /api/2.0/authentication - User authenticates", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "User");

    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: userData.email,
          password: userData.password,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
    expect(data.response?.expires).toBeTruthy();
    expect(data.response?.sms).toBe(false);
    expect(data.response?.tfa).toBe(false);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("POST");
  });

  test("POST /api/2.0/authentication - Guest authenticates", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: userData.email,
          password: userData.password,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
    expect(data.response?.expires).toBeTruthy();
    expect(data.response?.sms).toBe(false);
    expect(data.response?.tfa).toBe(false);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("POST");
  });

  test("POST /api/2.0/authentication - Owner re-authenticates and gets new token", async ({
    apiSdk,
  }) => {
    const { data: first } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
        },
      });

    const firstToken = first.response?.token;

    const { data: second, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
        },
      });

    expect(status).toBe(200);
    expect(second.response?.token).toBeTruthy();
    expect(second.response?.token).not.toBe(firstToken);
  });
});

// These tests switch TFA App on for the whole portal and the owner's token dies
// with it. The owner's TFA secret is remembered as soon as the first login step
// returns it - before the code that links it is submitted - and afterEach uses
// it (or links an unlinked owner) to get a token back and switch TFA off, so a
// failure at any point still leaves a portal that can be cleaned up.
test.describe("POST /api/2.0/authentication/{code}", () => {
  test.afterEach(async ({ apiSdk }) => {
    await resetTfaAfterTest(apiSdk);
  });

  test("POST /api/2.0/authentication/{code} - Owner authenticates with TOTP", async ({
    apiSdk,
  }) => {
    let tfaKeyFromAuth: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
      rememberOwnerTfaSecret(apiSdk, tfaKeyFromAuth);
    });

    await test.step("Authenticate with TOTP code — expect token", async () => {
      const code = generateTOTPAtCounter(
        tfaKeyFromAuth,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();

      apiSdk.tokenStore.setToken("owner", data.response!.token!);
    });

    await test.step("Disable TFA to restore portal for cleanup", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.None },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/authentication/{code} - Owner re-authenticates with TOTP and gets new token", async ({
    apiSdk,
  }) => {
    let tfaKeyFromAuth: string;
    let firstToken: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
      rememberOwnerTfaSecret(apiSdk, tfaKeyFromAuth);
    });

    await test.step("First TOTP authentication — get token", async () => {
      const T = Math.floor(Date.now() / 1000 / 30);
      const code = generateTOTPAtCounter(tfaKeyFromAuth, T);

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code,
          },
        });

      expect(status).toBe(200);
      firstToken = data.response!.token as string;
    });

    await test.step("Second TOTP authentication — expect new token", async () => {
      const T = Math.floor(Date.now() / 1000 / 30);
      const code = generateTOTPAtCounter(tfaKeyFromAuth, T + 1);

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
      expect(data.response?.token).not.toBe(firstToken);

      apiSdk.tokenStore.setToken("owner", data.response!.token!);
    });

    await test.step("Disable TFA to restore portal for cleanup", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.None },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/authentication/{code} - DocSpaceAdmin authenticates with TOTP", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    let tfaKeyFromAuth: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: userData.email,
            password: userData.password,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
    });

    await test.step("Authenticate with TOTP code — expect token", async () => {
      const code = generateTOTPAtCounter(
        tfaKeyFromAuth,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: userData.email,
            password: userData.password,
            code,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
    });

    await test.step("Disable TFA to restore portal for cleanup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      rememberOwnerTfaSecret(apiSdk, ownerTfaKey);
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.None },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/authentication/{code} - RoomAdmin authenticates with TOTP", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "RoomAdmin");
    let tfaKeyFromAuth: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: userData.email,
            password: userData.password,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
    });

    await test.step("Authenticate with TOTP code — expect token", async () => {
      const code = generateTOTPAtCounter(
        tfaKeyFromAuth,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: userData.email,
            password: userData.password,
            code,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
    });

    await test.step("Disable TFA to restore portal for cleanup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      rememberOwnerTfaSecret(apiSdk, ownerTfaKey);
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.None },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/authentication/{code} - User authenticates with TOTP", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "User");
    let tfaKeyFromAuth: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: userData.email,
            password: userData.password,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
    });

    await test.step("Authenticate with TOTP code — expect token", async () => {
      const code = generateTOTPAtCounter(
        tfaKeyFromAuth,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: userData.email,
            password: userData.password,
            code,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
    });

    await test.step("Disable TFA to restore portal for cleanup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      rememberOwnerTfaSecret(apiSdk, ownerTfaKey);
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.None },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/authentication/{code} - Guest authenticates with TOTP", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addMember("owner", "Guest");
    let tfaKeyFromAuth: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: userData.email,
            password: userData.password,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
    });

    await test.step("Authenticate with TOTP code — expect token", async () => {
      const code = generateTOTPAtCounter(
        tfaKeyFromAuth,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: {
            userName: userData.email,
            password: userData.password,
            code,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
    });

    await test.step("Disable TFA to restore portal for cleanup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      rememberOwnerTfaSecret(apiSdk, ownerTfaKey);
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestDto: { type: TfaType.None },
        });

      expect(status).toBe(200);
    });
  });
});

test.describe("POST /api/2.0/authentication/logout", () => {
  test("POST /api/2.0/authentication/logout - Owner logs out", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").authentication.logout();

    expect(status).toBe(200);
  });

  test("POST /api/2.0/authentication/logout - DocSpaceAdmin logs out", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .authentication.logout();

    expect(status).toBe(200);
  });

  test("POST /api/2.0/authentication/logout - RoomAdmin logs out", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .authentication.logout();

    expect(status).toBe(200);
  });

  test("POST /api/2.0/authentication/logout - User logs out", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk.forRole("user").authentication.logout();

    expect(status).toBe(200);
  });

  test("POST /api/2.0/authentication/logout - Guest logs out", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk.forRole("guest").authentication.logout();

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/authentication - session and credentials", () => {
  test("POST /api/2.0/authentication - The issued token works on a protected endpoint", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);

    const { data, status } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: user.password },
      });

    expect(status).toBe(200);
    expect(data.response?.sms).toBe(false);
    expect(data.response?.tfa).toBe(false);
    expect(data.response?.tfaKey).toBeFalsy();
    expect(data.response?.confirmUrl).toBeFalsy();
    expect(new Date(data.response!.expires!).getTime()).not.toBeNaN();

    // the token alone (no cookie) is enough to read the caller's own profile
    const self = await getSelfRaw(isolatedSdk, {
      bearer: data.response!.token!,
    });
    expect(self.status).toBe(200);
    expect(self.email).toBe(user.email);
  });

  test("POST /api/2.0/authentication - session=true issues a session token, session=false and the default expire in a year", async ({
    isolatedSdk,
  }) => {
    const anonymous = isolatedSdk.forAnonymous();
    const credentials = {
      userName: config.DOCSPACE_OWNER_EMAIL,
      password: config.DOCSPACE_OWNER_PASSWORD,
    };
    const dayMs = 24 * 60 * 60 * 1000;

    await test.step("session=true has no expiry date", async () => {
      const { data, status } = await anonymous.authentication.authenticateMe({
        authRequestDto: { ...credentials, session: true },
      });
      expect(status).toBe(200);
      expect(data.response?.token).toBeTruthy();
      expect(data.response?.expires).toBe("0001-01-01T00:00:00");
    });

    for (const [name, extra] of Object.entries({
      "session=false": { session: false },
      "session omitted": {},
    })) {
      await test.step(`${name} expires in about a year`, async () => {
        const { data, status } = await anonymous.authentication.authenticateMe({
          authRequestDto: { ...credentials, ...extra },
        });
        expect(status).toBe(200);
        const expiresInDays =
          (new Date(data.response!.expires!).getTime() - Date.now()) / dayMs;
        expect(expiresInDays).toBeGreaterThan(360);
        expect(expiresInDays).toBeLessThan(370);
      });
    }
  });

  test("POST /api/2.0/authentication - Login is case-insensitive for the email", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);

    const { data, status } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: {
          userName: user.email.toUpperCase(),
          password: user.password,
        },
      });

    expect(status).toBe(200);
    const self = await getSelfRaw(isolatedSdk, {
      bearer: data.response!.token!,
    });
    expect(self.email).toBe(user.email);
  });

  test("POST /api/2.0/authentication - A password with special characters works", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk, "Aa1!@#$%^&*()_+-=[]{};:,.<>?");

    const { data, status } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestDto: { userName: user.email, password: user.password },
      });

    expect(status).toBe(200);
    expect(data.response?.token).toBeTruthy();
  });
});

test.describe("GET /api/2.0/authentication - cookie session", () => {
  test("GET /api/2.0/authentication - A cookie session is authenticated without a Bearer token", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });
    expect(session.status).toBe(200);
    expect(session.cookie).toMatch(/^asc_auth_key=.+/);

    const state = await authState(isolatedSdk, { cookie: session.cookie });
    expect(state).toEqual({ status: 200, authenticated: true });

    const self = await getSelfRaw(isolatedSdk, { cookie: session.cookie });
    expect(self.status).toBe(200);
    expect(self.email).toBe(user.email);
  });
});

// The cookie session and the Bearer token issued by one login are the same
// session: logging out with the cookie ends both. Logging out with only the
// Bearer token, on the other hand, does not end anything - the project's
// working assumption is that logout does not revoke a Bearer token, and that
// is what these tests record.
test.describe("POST /api/2.0/authentication/logout - sessions", () => {
  test("POST /api/2.0/authentication/logout - Logout with the session cookie ends the cookie session", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });
    const eventsBefore = await snapshotLogoutEvents(apiSdk, user.id);

    await test.step("the cookie session is authenticated before logout", async () => {
      const state = await authState(isolatedSdk, { cookie: session.cookie });
      expect(state.authenticated).toBe(true);
    });

    await test.step("logout answers 200 and clears the auth cookie", async () => {
      const { status, body, setCookie } = await rawLogout(isolatedSdk, {
        cookie: session.cookie,
      });
      expect(status).toBe(200);
      expect(body.statusCode).toBe(200);
      expect(body.count).toBe(0);
      expect(body.links?.[0].action).toBe("POST");
      const cleared = setCookie.filter((c) => c.startsWith("asc_auth_key=;"));
      expect(cleared.length).toBeGreaterThan(0);
    });

    await test.step("the old cookie is no longer authenticated", async () => {
      const state = await authState(isolatedSdk, { cookie: session.cookie });
      expect(state).toEqual({ status: 200, authenticated: false });
    });

    await test.step("the cookie jar of the client is anonymous again", async () => {
      const { data } = await isolatedSdk
        .forAnonymous()
        .authentication.getIsAuthentificated();
      expect(data.response).toBe(false);
    });

    await test.step("the logout is recorded in the login history", async () => {
      await expectNewLogoutEvent(apiSdk, user.id, eventsBefore);
    });
  });

  test("POST /api/2.0/authentication/logout - Logout with the session cookie also invalidates that session's Bearer token", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });

    const before = await authState(isolatedSdk, { bearer: session.token });
    expect(before.authenticated).toBe(true);

    const { status } = await rawLogout(isolatedSdk, { cookie: session.cookie });
    expect(status).toBe(200);

    const after = await authState(isolatedSdk, { bearer: session.token });
    expect(after).toEqual({ status: 200, authenticated: false });
    const self = await getSelfRaw(isolatedSdk, { bearer: session.token });
    expect(self.status).toBe(401);
  });

  test("POST /api/2.0/authentication/logout - Logout with only a Bearer token does not end the session", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const session = await rawLogin(isolatedSdk, {
      userName: user.email,
      password: user.password,
    });
    const eventsBefore = await snapshotLogoutEvents(apiSdk, user.id);

    const { status, setCookie } = await rawLogout(isolatedSdk, {
      bearer: session.token,
    });

    expect(status).toBe(200);
    expect(setCookie).toHaveLength(0);

    await test.step("the Bearer token is still authenticated", async () => {
      const state = await authState(isolatedSdk, { bearer: session.token });
      expect(state).toEqual({ status: 200, authenticated: true });
    });

    await test.step("the cookie of the same login is still authenticated", async () => {
      const state = await authState(isolatedSdk, { cookie: session.cookie });
      expect(state).toEqual({ status: 200, authenticated: true });
    });

    await test.step("the call is still recorded as a logout", async () => {
      await expectNewLogoutEvent(apiSdk, user.id, eventsBefore);
    });
  });

  test("POST /api/2.0/authentication/logout - Logging out one session leaves another session of the same user active", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const credentials = { userName: user.email, password: user.password };
    const first = await rawLogin(isolatedSdk, credentials);
    const second = await rawLogin(isolatedSdk, credentials);
    expect(first.token).not.toBe(second.token);
    expect(first.cookie).not.toBe(second.cookie);

    const { status } = await rawLogout(isolatedSdk, { cookie: first.cookie });
    expect(status).toBe(200);

    await test.step("the first session is over, cookie and token", async () => {
      expect(await authState(isolatedSdk, { cookie: first.cookie })).toEqual({
        status: 200,
        authenticated: false,
      });
      expect(await authState(isolatedSdk, { bearer: first.token })).toEqual({
        status: 200,
        authenticated: false,
      });
    });

    await test.step("the second session is untouched, cookie and token", async () => {
      expect(await authState(isolatedSdk, { cookie: second.cookie })).toEqual({
        status: 200,
        authenticated: true,
      });
      expect(await authState(isolatedSdk, { bearer: second.token })).toEqual({
        status: 200,
        authenticated: true,
      });
    });
  });

  test("POST /api/2.0/authentication/logout - Logout is repeatable and the user can log in again afterwards", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const user = await createUser(apiSdk);
    const credentials = { userName: user.email, password: user.password };
    const session = await rawLogin(isolatedSdk, credentials);

    for (const attempt of ["first", "second"]) {
      await test.step(`${attempt} logout with the same cookie answers 200`, async () => {
        const { status, body } = await rawLogout(isolatedSdk, {
          cookie: session.cookie,
        });
        expect(status).toBe(200);
        expect(body.statusCode).toBe(200);
      });
    }

    await test.step("a new login after logout gives a new working session", async () => {
      const next = await rawLogin(isolatedSdk, credentials);
      expect(next.status).toBe(200);
      expect(next.token).not.toBe(session.token);
      const state = await authState(isolatedSdk, { cookie: next.cookie });
      expect(state.authenticated).toBe(true);
    });
  });
});

// The invitation link is the one confirmation link whose key can be obtained
// without an email: the short link (/s/<id>) redirects to the confirm page,
// and the key, the link creator's id (uiD) and the employee type are in that
// URL. A key is Ok only together with the creator's id and the right type.
test.describe("POST /api/2.0/authentication/confirm", () => {
  test("POST /api/2.0/authentication/confirm - A user invitation key is Ok for an anonymous visitor and UserExisted for a signed-in member", async ({
    apiSdk,
  }) => {
    const { data: link, status } = await apiSdk
      .forRole("owner")
      .users.getInvitationLink({ employeeType: EmployeeType.User });
    expect(status).toBe(200);
    const { key, uid, type } = await resolveConfirmLink(
      apiSdk,
      link.response as string,
    );
    expect(type).toBe(ConfirmType.LinkInvite);
    const emailValidationKeyModel = {
      key,
      uiD: uid,
      emplType: EmployeeType.User,
      type: ConfirmType.LinkInvite,
    };

    await test.step("an anonymous visitor gets Ok", async () => {
      const { data, status: checkStatus } = await apiSdk
        .forAnonymous()
        .authentication.checkConfirm({
          checkConfirmRequestDto: emailValidationKeyModel,
        });
      expect(checkStatus).toBe(200);
      expect(data.response?.result).toBe(ValidationResult.Ok);
      expect(data.response?.isAgent).toBe(false);
      expect(data.response?.roomId).toBeUndefined();
      expect(data.response?.title).toBeUndefined();
      expect(data.count).toBe(1);
      expect(data.links?.[0].action).toBe("POST");
    });

    await test.step("a signed-in member of the portal gets UserExisted", async () => {
      const { data, status: checkStatus } = await apiSdk
        .forRole("owner")
        .authentication.checkConfirm({
          checkConfirmRequestDto: emailValidationKeyModel,
        });
      expect(checkStatus).toBe(200);
      expect(data.response?.result).toBe(ValidationResult.UserExisted);
    });
  });

  test("POST /api/2.0/authentication/confirm - A room admin invitation link with a use limit is Ok", async ({
    apiSdk,
  }) => {
    const { data: created, status } = await apiSdk
      .forRole("owner")
      .users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
          maxUseCount: 5,
        },
      });
    expect(status).toBe(200);
    expect(created.response?.maxUseCount).toBe(5);
    const { key, uid } = await resolveConfirmLink(
      apiSdk,
      created.response!.url!,
    );

    const { data } = await apiSdk.forAnonymous().authentication.checkConfirm({
      checkConfirmRequestDto: {
        key,
        uiD: uid,
        emplType: EmployeeType.RoomAdmin,
        type: ConfirmType.LinkInvite,
      },
    });

    expect(data.response?.result).toBe(ValidationResult.Ok);
  });

  test("POST /api/2.0/authentication/confirm - A room invitation key is Ok and names the room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const title = apiSdk.faker.generateString(12);
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
    });
    const roomId = room.response!.id!;
    const { data: link, status } = await ownerApi.rooms.setRoomLink({
      id: roomId,
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

    const { data, status: checkStatus } = await apiSdk
      .forAnonymous()
      .authentication.checkConfirm({
        checkConfirmRequestDto: {
          key,
          uiD: uid,
          type: ConfirmType.LinkInvite,
        },
      });

    expect(checkStatus).toBe(200);
    expect(data.response?.result).toBe(ValidationResult.Ok);
    expect(data.response?.roomId).toBe(String(roomId));
    expect(data.response?.title).toBe(title);
  });

  test("POST /api/2.0/authentication/confirm - Checking a key is repeatable and does not consume the invitation", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
        maxUseCount: 1,
      },
    });
    const linkId = created.response!.id!;
    const { key, uid } = await resolveConfirmLink(
      apiSdk,
      created.response!.url!,
    );
    const anonymous = apiSdk.forAnonymous();

    for (const attempt of ["first", "second", "third"]) {
      await test.step(`${attempt} check is Ok`, async () => {
        const { data } = await anonymous.authentication.checkConfirm({
          checkConfirmRequestDto: {
            key,
            uiD: uid,
            emplType: EmployeeType.RoomAdmin,
            type: ConfirmType.LinkInvite,
          },
        });
        expect(data.response?.result).toBe(ValidationResult.Ok);
      });
    }

    await test.step("the invitation link was not used up by the checks", async () => {
      const { data } = await ownerApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.RoomAdmin,
      });
      expect(data.response?.id).toBe(linkId);
      expect(data.response?.currentUseCount).toBe(0);
    });
  });

  test("POST /api/2.0/authentication/confirm - A key stops being valid once its invitation link is deleted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: { employeeType: EmployeeType.RoomAdmin },
    });
    const { key, uid } = await resolveConfirmLink(
      apiSdk,
      created.response!.url!,
    );
    const emailValidationKeyModel = {
      key,
      uiD: uid,
      emplType: EmployeeType.RoomAdmin,
      type: ConfirmType.LinkInvite,
    };
    const anonymous = apiSdk.forAnonymous();

    await test.step("the key is Ok before deletion", async () => {
      const { data } = await anonymous.authentication.checkConfirm({
        checkConfirmRequestDto: emailValidationKeyModel,
      });
      expect(data.response?.result).toBe(ValidationResult.Ok);
    });

    await test.step("owner deletes the invitation link", async () => {
      const { status } = await ownerApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: { id: created.response!.id! },
      });
      expect(status).toBe(200);
    });

    await test.step("the same key is Invalid after deletion", async () => {
      const { data, status } = await anonymous.authentication.checkConfirm({
        checkConfirmRequestDto: emailValidationKeyModel,
      });
      expect(status).toBe(200);
      expect(data.response?.result).toBe(ValidationResult.Invalid);
    });
  });
});

// TFA App is a portal-wide setting: enabling it invalidates the owner's token.
// Every test hands the owner a working token as soon as a good code is
// accepted, and afterEach falls back to the helper that disables TFA again so
// the portal can be cleaned up.
test.describe("POST /api/2.0/authentication - TFA App login flow", () => {
  const credentials = {
    userName: config.DOCSPACE_OWNER_EMAIL,
    password: config.DOCSPACE_OWNER_PASSWORD,
  };

  test.afterEach(async ({ apiSdk }) => {
    await resetTfaAfterTest(apiSdk);
  });

  test("POST /api/2.0/authentication - With TFA App enabled the first step returns the TFA key, not a token", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ownerToken = apiSdk.tokenStore.getToken("owner");

    await test.step("enable TFA App", async () => {
      const { status } = await ownerApi.tfaSettings.updateTfaSettings({
        tfaRequestDto: { type: TfaType.App },
      });
      expect(status).toBe(200);
    });

    await test.step("the owner's previous token no longer authenticates", async () => {
      const state = await authState(isolatedSdk, { bearer: ownerToken });
      expect(state).toEqual({ status: 200, authenticated: false });
    });

    const { data, status } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMe({ authRequestDto: credentials });
    if (data.response?.tfaKey) {
      rememberOwnerTfaSecret(apiSdk, data.response.tfaKey);
    }

    await test.step("the password step answers 200 with the TFA hand-off and no token", async () => {
      expect(status).toBe(200);
      expect(data.response?.tfa).toBe(true);
      expect(data.response?.sms).toBe(false);
      expect(Boolean(data.response?.token)).toBe(false);
      expect(data.response?.tfaKey).toBeTruthy();
      expect(data.response?.confirmUrl).toContain("/confirm/TfaActivation");
    });

    await test.step("the TFA key and a TOTP code complete the login", async () => {
      const code = totpAtOffset(data.response!.tfaKey!);
      const { data: done, status: doneStatus } = await isolatedSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestDto: { ...credentials, code },
        });
      // hand the owner the token before asserting anything: once the code is
      // accepted TFA is linked, and without this token the portal cannot be
      // cleaned up if an assertion below fails
      if (done.response?.token) {
        apiSdk.tokenStore.setToken("owner", done.response.token);
      }
      expect(doneStatus).toBe(200);
      expect(done.response?.token).toBeTruthy();
    });

    await test.step("the TFA token is a working session for the owner", async () => {
      const self = await getSelfRaw(isolatedSdk, {
        bearer: apiSdk.tokenStore.getToken("owner"),
      });
      expect(self.status).toBe(200);
      expect(self.email).toBe(credentials.userName);
    });
  });

  test("POST /api/2.0/authentication/{code} - A code from the previous 30-second step is accepted", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestDto: { type: TfaType.App },
      });
    expect(status, "setup: enable TFA App").toBe(200);
    const { data: first } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMe({ authRequestDto: credentials });
    const secret = first.response!.tfaKey!;
    rememberOwnerTfaSecret(apiSdk, secret);

    const code = totpAtOffset(secret, -1);
    const { data, status: codeStatus } = await isolatedSdk
      .forAnonymous()
      .authentication.authenticateMeFromBodyWithCode({
        code,
        authWithCodeRequestDto: { ...credentials, code },
      });

    if (data.response?.token) {
      apiSdk.tokenStore.setToken("owner", data.response.token);
    }
    expect(codeStatus).toBe(200);
    expect(data.response?.token).toBeTruthy();
  });
});
