import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  appPath,
  pickApps,
  saveSettings,
  snapshot,
  withAppRestored,
} from "@/src/helpers/apps";

// Reads are open to every authenticated member; writes need the right to edit
// portal settings, which DocSpace admins have and room admins/users/guests lack.
// Every role gets its own test: a second addAuthenticatedMember in one test
// flakes with 401, and a separate portal per role keeps the matrix independent.
const ROLES = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin", canWrite: true },
  { type: "RoomAdmin", role: "roomAdmin", canWrite: false },
  { type: "User", role: "user", canWrite: false },
  { type: "Guest", role: "guest", canWrite: false },
] as const;

test.describe("/api/2.0/apps - permissions by role", () => {
  for (const { type, role, canWrite } of ROLES) {
    test(`/api/2.0/apps - ${type} ${canWrite ? "reads and writes" : "reads but cannot write"}`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [id] = await pickApps(owner, 1);

      await withAppRestored(owner, id, async () => {
        const marker = { savedBy: "owner", role };
        await saveSettings(owner, id, marker);
        const before = await snapshot(owner, id);
        const flipped = !before.enabled;

        await apiSdk.addAuthenticatedMember("owner", type);
        const member = apiSdk.forRole(role);

        await test.step("every authenticated role can read", async () => {
          const list = await member.apps.getAll();
          expect(list.status).toBe(200);
          expect(list.data.response?.find((a) => a.id === id)).toEqual({
            id,
            enabled: before.enabled,
            settings: marker,
          });

          const one = await member.apps.get({ id });
          expect(one.status).toBe(200);
          expect(one.data.response?.id).toBe(id);

          const settings = await member.apps.getSettings({ id });
          expect(settings.status).toBe(200);
          expect(settings.data.response).toEqual(marker);
        });

        await test.step(`setEnabled is ${canWrite ? "allowed" : "denied"}`, async () => {
          const { data, status } = await member.apps.setEnabled({
            id,
            setAppEnabledRequest: { enabled: flipped },
          });

          expect(status).toBe(canWrite ? 200 : 403);
          if (canWrite) {
            expect(data.response?.enabled).toBe(flipped);
          }
          expect((await snapshot(owner, id)).enabled).toBe(
            canWrite ? flipped : before.enabled,
          );
        });

        await test.step(`setSettings is ${canWrite ? "allowed" : "denied"}`, async () => {
          const written = { savedBy: type };
          const { data, status } = await member.apps.setSettings({
            id,
            setAppSettingsRequest: { settings: written },
          });

          expect(status).toBe(canWrite ? 200 : 403);
          if (canWrite) {
            expect(data.response?.settings).toEqual(written);
          }
          expect((await snapshot(owner, id)).settings).toEqual(
            canWrite ? written : marker,
          );
        });

        await test.step(`resetting the settings is ${canWrite ? "allowed" : "denied"}`, async () => {
          const { status } = await member.apps.setSettings({
            id,
            setAppSettingsRequest: { settings: null },
          });

          expect(status).toBe(canWrite ? 200 : 403);
          const settings = (await snapshot(owner, id)).settings;
          if (canWrite) {
            expect(settings).toBeNull();
          } else {
            expect(settings).toEqual(marker);
          }
        });
      });
    });
  }

  test("/api/2.0/apps - Writes are denied to a non-admin for disabled and enabled applications alike", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await apiSdk.addAuthenticatedMember("owner", "User");
      const user = apiSdk.forRole("user");

      for (const enabled of [true, false]) {
        await owner.apps.setEnabled({ id, setAppEnabledRequest: { enabled } });
        const before = await snapshot(owner, id);

        const toggle = await user.apps.setEnabled({
          id,
          setAppEnabledRequest: { enabled: !enabled },
        });
        const save = await user.apps.setSettings({
          id,
          setAppSettingsRequest: { settings: { nope: true } },
        });

        expect(toggle.status, `setEnabled while enabled=${enabled}`).toBe(403);
        expect(save.status, `setSettings while enabled=${enabled}`).toBe(403);
        expect(await snapshot(owner, id)).toEqual(before);
      }
    });
  });

  test("/api/2.0/apps - A denied caller gets 403 before the unknown id is looked up", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");

    const toggle = await user.apps.setEnabled({
      id: "no-such-app",
      setAppEnabledRequest: { enabled: false },
    });
    const save = await user.apps.setSettings({
      id: "no-such-app",
      setAppSettingsRequest: { settings: {} },
    });

    expect(toggle.status).toBe(403);
    expect(save.status).toBe(403);
  });
});

test.describe("/api/2.0/apps - anonymous", () => {
  test("GET /api/2.0/apps - Anonymous request is rejected with 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apps.getAll();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/apps/{id} - Anonymous request is rejected with 401", async ({
    apiSdk,
  }) => {
    const [id] = await pickApps(apiSdk.forRole("owner"), 1);

    const { status } = await apiSdk.forAnonymous().apps.get({ id });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/apps/{id}/settings - Anonymous request is rejected with 401", async ({
    apiSdk,
  }) => {
    const [id] = await pickApps(apiSdk.forRole("owner"), 1);

    const { status } = await apiSdk.forAnonymous().apps.getSettings({ id });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/apps/{id}/enabled - Anonymous request is rejected with 401 and changes nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const before = await snapshot(owner, id);

      const { status } = await apiSdk.forAnonymous().apps.setEnabled({
        id,
        setAppEnabledRequest: { enabled: !before.enabled },
      });

      expect(status).toBe(401);
      expect(await snapshot(owner, id)).toEqual(before);
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Anonymous request is rejected with 401 and changes nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { survives: true });
      const before = await snapshot(owner, id);

      const { status } = await apiSdk.forAnonymous().apps.setSettings({
        id,
        setAppSettingsRequest: { settings: { survives: false } },
      });

      expect(status).toBe(401);
      expect(await snapshot(owner, id)).toEqual(before);
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Anonymous raw request is rejected with 401", async ({
    apiSdk,
  }) => {
    const [id] = await pickApps(apiSdk.forRole("owner"), 1);

    const { status } = await apiSdk.rawApi(
      null,
      "PUT",
      `${appPath(id)}/settings`,
      { body: '{"settings":{"a":1}}' },
    );

    expect(status).toBe(401);
  });
});
