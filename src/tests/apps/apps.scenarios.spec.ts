import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  listApps,
  pickApps,
  readSettings,
  saveEnabled,
  saveSettings,
  snapshot,
  withAppRestored,
} from "@/src/helpers/apps";

test.describe("/api/2.0/apps - scenarios", () => {
  test("/api/2.0/apps - Application lifecycle: settings, disable, enable, restore", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);
    const doc = { lifecycle: true, steps: [1, 2, 3] };

    await withAppRestored(owner, id, async () => {
      const original = await snapshot(owner, id);

      await test.step("save a new document", async () => {
        await saveSettings(owner, id, doc);
        expect(await readSettings(owner, id)).toEqual(doc);
      });

      await test.step("disable: flag flips, document stays", async () => {
        await saveEnabled(owner, id, false);
        const state = await snapshot(owner, id);
        expect(state.enabled).toBe(false);
        expect(state.settings).toEqual(doc);
      });

      await test.step("enable: flag flips back, document stays", async () => {
        await saveEnabled(owner, id, true);
        const state = await snapshot(owner, id);
        expect(state.enabled).toBe(true);
        expect(state.settings).toEqual(doc);
      });

      await test.step("restore the original state and confirm it", async () => {
        await saveEnabled(owner, id, original.enabled);
        await saveSettings(owner, id, original.settings);
        expect(await snapshot(owner, id)).toEqual(original);
      });
    });
  });

  test("/api/2.0/apps - Replace then reset: the document never accumulates", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { a: 1, b: 2, nested: { x: 1 } });
      expect(await readSettings(owner, id)).toEqual({
        a: 1,
        b: 2,
        nested: { x: 1 },
      });

      await saveSettings(owner, id, { a: 3 });
      const replaced = await readSettings(owner, id);
      expect(replaced).toEqual({ a: 3 });
      expect(replaced).not.toHaveProperty("b");
      expect(replaced).not.toHaveProperty("nested");
      expect((await snapshot(owner, id)).settings).toEqual({ a: 3 });
      expect(
        (await listApps(owner)).find((a) => a.id === id)?.settings,
      ).toEqual({ a: 3 });

      await saveSettings(owner, id, null);
      await saveSettings(owner, id, null);
      expect(await readSettings(owner, id)).toBeNull();

      await saveSettings(owner, id, { fresh: 1 });
      expect(await readSettings(owner, id)).toEqual({ fresh: 1 });
    });
  });

  test("/api/2.0/apps - An unknown application is rejected everywhere and never appears", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const before = await listApps(owner);
    const id = `missing-${Date.now()}`;
    expect(before.map((a) => a.id)).not.toContain(id);

    const results = {
      get: (await owner.apps.get({ id })).status,
      getSettings: (await owner.apps.getSettings({ id })).status,
      setEnabled: (
        await owner.apps.setEnabled({
          id,
          setAppEnabledBody: { enabled: true },
        })
      ).status,
      setSettings: (
        await owner.apps.setSettings({
          id,
          setAppSettingsBody: { settings: { a: 1 } },
        })
      ).status,
    };

    expect(results).toEqual({
      get: 404,
      getSettings: 404,
      setEnabled: 404,
      setSettings: 404,
    });
    expect(await listApps(owner)).toEqual(before);
    expect((await owner.apps.get({ id })).status).toBe(404);
  });

  test("/api/2.0/apps - Two applications are independent in both enabled and settings", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [first, second] = await pickApps(owner, 2);

    await withAppRestored(owner, [first, second], async () => {
      await saveSettings(owner, second, { mine: "second" });
      const secondBefore = await snapshot(owner, second);

      await saveSettings(owner, first, { mine: "first" });
      expect(await snapshot(owner, second)).toEqual(secondBefore);

      await saveEnabled(owner, first, !(await snapshot(owner, first)).enabled);
      expect(await snapshot(owner, second)).toEqual(secondBefore);
    });
  });

  test("/api/2.0/apps - get, getSettings and getAll stay consistent after every change", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    const expectConsistent = async (label: string) => {
      const fromGet = (await owner.apps.get({ id })).data.response;
      const fromList = (await listApps(owner)).find((a) => a.id === id);
      const fromSettings = await readSettings(owner, id);

      expect(fromList, `${label}: get vs getAll`).toEqual(fromGet);
      expect(fromSettings, `${label}: getSettings vs get`).toEqual(
        fromGet?.settings ?? null,
      );
    };

    await withAppRestored(owner, id, async () => {
      await expectConsistent("initial");

      await saveEnabled(owner, id, !(await snapshot(owner, id)).enabled);
      await expectConsistent("after setEnabled");

      await saveSettings(owner, id, { consistent: [1, 2] });
      await expectConsistent("after setSettings");

      await saveSettings(owner, id, null);
      await expectConsistent("after reset");
    });
  });

  test("/api/2.0/apps - A fresh owner session sees the stored state", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveEnabled(owner, id, false);
      await saveSettings(owner, id, { persisted: true });

      // forRole builds a brand new client (and axios instance) each call
      const state = await snapshot(apiSdk.forRole("owner"), id);

      expect(state.enabled).toBe(false);
      expect(state.settings).toEqual({ persisted: true });
    });
  });

  test("/api/2.0/apps - Every module is reachable and can be switched and configured", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const apps = await listApps(owner);
    test.skip(apps.length === 0, "no applications on this installation");
    const ids = apps.map((app) => app.id!);

    // The module set and its defaults come from the installation config, so
    // they are reported rather than asserted.
    test.info().annotations.push({
      type: "modules",
      description: apps
        .map((app) => `${app.id}=${app.enabled ? "on" : "off"}`)
        .join(", "),
    });

    await withAppRestored(owner, ids, async () => {
      for (const app of apps) {
        const id = app.id!;
        const enabled = app.enabled!;
        await test.step(`module ${id}`, async () => {
          const { data, status } = await owner.apps.get({ id });
          expect(status).toBe(200);
          expect(data.response?.id).toBe(id);
          expect(data.response?.enabled).toBe(enabled);

          const marker = { probe: id };
          await saveSettings(owner, id, marker);
          expect(await readSettings(owner, id)).toEqual(marker);

          await saveEnabled(owner, id, !enabled);
          expect((await snapshot(owner, id)).enabled).toBe(!enabled);
          await saveEnabled(owner, id, enabled);
          expect(await snapshot(owner, id)).toEqual({
            id,
            enabled,
            settings: marker,
          });
        });
      }
    });
  });

  // The dynamic tests above take whatever the installation reports, so a module
  // dropped from the config would silently shrink their coverage. On a stand
  // where the module set is known, APPS_REQUIRED_MODULES pins it.
  test("/api/2.0/apps - The installation exposes every required module", async ({
    apiSdk,
  }) => {
    const required = (process.env.APPS_REQUIRED_MODULES ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    test.skip(
      required.length === 0,
      "APPS_REQUIRED_MODULES is not set for this installation",
    );

    const ids = (await listApps(apiSdk.forRole("owner"))).map((a) => a.id);

    const missing = required.filter((id) => !ids.includes(id));
    expect(missing, `modules missing from GET /api/2.0/apps`).toEqual([]);
    for (const id of required) {
      const { data, status } = await apiSdk.forRole("owner").apps.get({ id });
      expect(status, id).toBe(200);
      expect(data.response?.id).toBe(id);
    }
  });
});
