import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /people/theme - Get portal theme", () => {
  test("GET /people/theme - Owner gets portal theme", async ({ apiSdk }) => {
    const { data } = await apiSdk.forRole("owner").theme.getPortalTheme();

    expect(data.statusCode).toBe(200);
    expect(data.response?.theme).toBe("System");
  });

  test("GET /people/theme - DocSpace admin gets portal theme", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data } = await apiSdk
      .forRole("docSpaceAdmin")
      .theme.getPortalTheme();

    expect(data.statusCode).toBe(200);
    expect(data.response?.theme).toBe("System");
  });

  test("GET /people/theme - Room admin gets portal theme", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data } = await apiSdk.forRole("roomAdmin").theme.getPortalTheme();

    expect(data.statusCode).toBe(200);
    expect(data.response?.theme).toBe("System");
  });

  test("GET /people/theme - User gets portal theme", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data } = await apiSdk.forRole("user").theme.getPortalTheme();

    expect(data.statusCode).toBe(200);
    expect(data.response?.theme).toBe("System");
  });

  test("GET /people/theme - Guest gets portal theme", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data } = await apiSdk.forRole("guest").theme.getPortalTheme();

    expect(data.statusCode).toBe(200);
    expect(data.response?.theme).toBe("System");
  });
});

test.describe("PUT /people/theme - Change portal theme", () => {
  test("PUT /people/theme - Owner changes theme Base -> Dark -> System", async ({
    apiSdk,
  }) => {
    await test.step("Owner changes theme to Base", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .theme.changePortalTheme({ theme: "Base" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Base");
    });

    await test.step("Owner changes theme to Dark", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .theme.changePortalTheme({ theme: "Dark" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Dark");
    });

    await test.step("Owner changes theme to System", async () => {
      const { data } = await apiSdk
        .forRole("owner")
        .theme.changePortalTheme({ theme: "System" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("System");
    });
  });

  test("PUT /people/theme - DocSpace admin changes theme Base -> Dark -> System", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await test.step("DocSpace admin changes theme to Base", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .theme.changePortalTheme({ theme: "Base" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Base");
    });

    await test.step("DocSpace admin changes theme to Dark", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .theme.changePortalTheme({ theme: "Dark" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Dark");
    });

    await test.step("DocSpace admin changes theme to System", async () => {
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .theme.changePortalTheme({ theme: "System" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("System");
    });
  });

  test("PUT /people/theme - Room admin changes theme Base -> Dark -> System", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    await test.step("Room admin changes theme to Base", async () => {
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .theme.changePortalTheme({ theme: "Base" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Base");
    });

    await test.step("Room admin changes theme to Dark", async () => {
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .theme.changePortalTheme({ theme: "Dark" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Dark");
    });

    await test.step("Room admin changes theme to System", async () => {
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .theme.changePortalTheme({ theme: "System" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("System");
    });
  });

  test("PUT /people/theme - User changes theme Base -> Dark -> System", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    await test.step("User changes theme to Base", async () => {
      const { data } = await apiSdk
        .forRole("user")
        .theme.changePortalTheme({ theme: "Base" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Base");
    });

    await test.step("User changes theme to Dark", async () => {
      const { data } = await apiSdk
        .forRole("user")
        .theme.changePortalTheme({ theme: "Dark" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Dark");
    });

    await test.step("User changes theme to System", async () => {
      const { data } = await apiSdk
        .forRole("user")
        .theme.changePortalTheme({ theme: "System" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("System");
    });
  });

  test("PUT /people/theme - Guest changes theme Base -> Dark -> System", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    await test.step("Guest changes theme to Base", async () => {
      const { data } = await apiSdk
        .forRole("guest")
        .theme.changePortalTheme({ theme: "Base" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Base");
    });

    await test.step("Guest changes theme to Dark", async () => {
      const { data } = await apiSdk
        .forRole("guest")
        .theme.changePortalTheme({ theme: "Dark" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("Dark");
    });

    await test.step("Guest changes theme to System", async () => {
      const { data } = await apiSdk
        .forRole("guest")
        .theme.changePortalTheme({ theme: "System" });

      expect(data.statusCode).toBe(200);
      expect(data.response?.theme).toBe("System");
    });
  });
});
