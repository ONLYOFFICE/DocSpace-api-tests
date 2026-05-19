import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import config from "@/config";
import { generateTOTPAtCounter } from "@/src/utils/totp";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";

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
        authRequestsDto: {
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
        authRequestsDto: {
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
        authRequestsDto: {
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
        authRequestsDto: {
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
        authRequestsDto: {
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
        authRequestsDto: {
          userName: config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
        },
      });

    const firstToken = first.response?.token;

    const { data: second, status } = await apiSdk
      .forAnonymous()
      .authentication.authenticateMe({
        authRequestsDto: {
          userName: config.DOCSPACE_OWNER_EMAIL,
          password: config.DOCSPACE_OWNER_PASSWORD,
        },
      });

    expect(status).toBe(200);
    expect(second.response?.token).toBeTruthy();
    expect(second.response?.token).not.toBe(firstToken);
  });
});

test.describe("POST /api/2.0/authentication/{code}", () => {
  test("POST /api/2.0/authentication/{code} - Owner authenticates with TOTP", async ({
    apiSdk,
  }) => {
    let tfaKeyFromAuth: string;

    await test.step("Enable TFA App on portal", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: { type: TfaRequestsDtoType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
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
          authWithCodeRequestsDto: {
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
          tfaRequestsDto: { type: TfaRequestsDtoType.None },
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
          tfaRequestsDto: { type: TfaRequestsDtoType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });

      tfaKeyFromAuth = data.response!.tfaKey as string;
    });

    await test.step("First TOTP authentication — get token", async () => {
      const T = Math.floor(Date.now() / 1000 / 30);
      const code = generateTOTPAtCounter(tfaKeyFromAuth, T);

      const { data, status } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code,
          authWithCodeRequestsDto: {
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
          authWithCodeRequestsDto: {
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
          tfaRequestsDto: { type: TfaRequestsDtoType.None },
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
          tfaRequestsDto: { type: TfaRequestsDtoType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestsDto: {
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
          authWithCodeRequestsDto: {
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
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: { type: TfaRequestsDtoType.None },
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
          tfaRequestsDto: { type: TfaRequestsDtoType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestsDto: {
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
          authWithCodeRequestsDto: {
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
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: { type: TfaRequestsDtoType.None },
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
          tfaRequestsDto: { type: TfaRequestsDtoType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestsDto: {
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
          authWithCodeRequestsDto: {
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
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: { type: TfaRequestsDtoType.None },
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
          tfaRequestsDto: { type: TfaRequestsDtoType.App },
        });

      expect(status).toBe(200);
    });

    await test.step("Authenticate — get tfaKey for TOTP setup", async () => {
      const { data } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMe({
          authRequestsDto: {
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
          authWithCodeRequestsDto: {
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
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
          },
        });
      const ownerTfaKey = data.response!.tfaKey as string;
      const ownerCode = generateTOTPAtCounter(
        ownerTfaKey,
        Math.floor(Date.now() / 1000 / 30),
      );

      const { data: tokenData } = await apiSdk
        .forAnonymous()
        .authentication.authenticateMeFromBodyWithCode({
          code: ownerCode,
          authWithCodeRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            code: ownerCode,
          },
        });
      apiSdk.tokenStore.setToken("owner", tokenData.response!.token!);

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: { type: TfaRequestsDtoType.None },
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
