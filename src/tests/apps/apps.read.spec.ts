import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  JSON_VALUES,
  appPath,
  listApps,
  pickApps,
  readSettings,
  saveEnabled,
  saveSettings,
  snapshot,
  withAppRestored,
} from "@/src/helpers/apps";

test.describe("GET /api/2.0/apps", () => {
  test("GET /api/2.0/apps - Owner gets the list of applications", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk.forRole("owner").apps.getAll();

    expect(status).toBe(200);
    const apps = data.response!;
    expect(Array.isArray(apps)).toBe(true);
    expect(data.count).toBe(apps.length);

    const ids = apps.map((app) => app.id);
    for (const app of apps) {
      expect(typeof app.id).toBe("string");
      expect(app.id).not.toBe("");
      expect(typeof app.enabled).toBe("boolean");
    }
    expect(new Set(ids).size, "application ids are unique").toBe(ids.length);
  });

  test("GET /api/2.0/apps - A portal that never saved settings reports none", async ({
    apiSdk,
  }) => {
    const apps = await listApps(apiSdk.forRole("owner"));
    test.skip(apps.length === 0, "no applications on this installation");

    for (const app of apps) {
      expect(app.settings, `settings of ${app.id}`).toBeUndefined();
    }
  });

  test("GET /api/2.0/apps - Repeated calls return the same list and change nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const first = await listApps(owner);

    expect(await listApps(owner)).toEqual(first);
    expect(await listApps(owner)).toEqual(first);
  });

  test("GET /api/2.0/apps - Every listed application matches get and getSettings", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const apps = await listApps(owner);
    test.skip(apps.length === 0, "no applications on this installation");

    for (const app of apps) {
      await test.step(`app ${app.id}`, async () => {
        const { data, status } = await owner.apps.get({ id: app.id! });
        expect(status).toBe(200);
        expect(data.response).toEqual(app);
        expect(await readSettings(owner, app.id!)).toEqual(
          app.settings ?? null,
        );
      });
    }
  });

  test("GET /api/2.0/apps - Unknown query parameters are ignored", async ({
    apiSdk,
  }) => {
    const plain = await apiSdk.rawApi("owner", "GET", "apps");
    const noisy = await apiSdk.rawApi(
      "owner",
      "GET",
      "apps?foo=bar&x[]=1&count=-1&startIndex=%FF",
    );

    expect(plain.status).toBe(200);
    expect(noisy.status).toBe(200);
    expect(noisy.data.response).toEqual(plain.data.response);
  });

  test("GET /api/2.0/apps - A change of enabled and of settings shows up in the next list", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const before = await snapshot(owner, id);
      const countBefore = (await listApps(owner)).length;

      await saveEnabled(owner, id, !before.enabled);
      await saveSettings(owner, id, { marker: "list-check" });

      const apps = await listApps(owner);
      expect(apps.length).toBe(countBefore);
      const app = apps.find((a) => a.id === id)!;
      expect(app.enabled).toBe(!before.enabled);
      expect(app.settings).toEqual({ marker: "list-check" });
    });
  });
});

test.describe("GET /api/2.0/apps/{id}", () => {
  test("GET /api/2.0/apps/{id} - Owner gets an application by id", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);
    const listed = (await listApps(owner)).find((app) => app.id === id);

    const { data, status } = await owner.apps.get({ id });

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.id).toBe(id);
    expect(typeof data.response?.enabled).toBe("boolean");
    expect(data.response).toEqual(listed);
  });

  test("GET /api/2.0/apps/{id} - Reading does not change enabled or settings", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { keep: "me" });
      const before = await snapshot(owner, id);

      await owner.apps.get({ id });
      await owner.apps.get({ id });
      await owner.apps.getSettings({ id });
      await owner.apps.getAll();

      expect(await snapshot(owner, id)).toEqual(before);
    });
  });

  test("GET /api/2.0/apps/{id} - Returns the enabled and the disabled application", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveEnabled(owner, id, true);
      expect((await owner.apps.get({ id })).data.response?.enabled).toBe(true);

      await saveEnabled(owner, id, false);
      expect((await owner.apps.get({ id })).data.response?.enabled).toBe(false);
    });
  });

  test("GET /api/2.0/apps/{id} - Returns the saved settings document", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { theme: "dark", limits: [1, 2] });

      const { data, status } = await owner.apps.get({ id });

      expect(status).toBe(200);
      expect(data.response?.settings).toEqual({
        theme: "dark",
        limits: [1, 2],
      });
    });
  });

  test("GET /api/2.0/apps/{id} - Unknown id returns 404", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apps.get({ id: "no-such-app" });

    expect(status).toBe(404);
    expect((data as any)?.error?.message).toContain("no-such-app");
  });

  // Every one of these is addressed as a literal application key, so none may
  // resolve to a real application or fail with a server error.
  const BAD_IDS: [string, string][] = [
    ["whitespace", "   "],
    ["Unicode", "приложение-😀"],
    ["special characters", "a<b>&c'd\"e"],
    ["encoded slash", "a/b"],
    ["path traversal", "../settings"],
    ["very long", "x".repeat(2000)],
  ];

  for (const [name, badId] of BAD_IDS) {
    test(`GET /api/2.0/apps/{id} - ${name} id returns 404`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.rawApi("owner", "GET", appPath(badId));

      expect(status).toBe(404);
    });
  }

  test("GET /api/2.0/apps/{id} - Id is case-sensitive", async ({ apiSdk }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);
    test.skip(
      id === id.toUpperCase(),
      "id has no lower-case letters to change",
    );

    const { status } = await owner.apps.get({ id: id.toUpperCase() });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/apps/{id} - Empty id is routed to the list, not to an application", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data, status } = await owner.apps.get({ id: "" });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toEqual(await listApps(owner));
  });
});

test.describe("GET /api/2.0/apps/{id}/settings", () => {
  test("GET /api/2.0/apps/{id}/settings - Never-saved settings come back empty", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    const { data, status } = await owner.apps.getSettings({ id });

    expect(status).toBe(200);
    expect(data.response).toBeUndefined();
    expect(data.count).toBe(0);
  });

  test("GET /api/2.0/apps/{id}/settings - Owner reads back every kind of JSON value unchanged", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      for (const [name, value] of JSON_VALUES) {
        await test.step(name, async () => {
          const put = await saveSettings(owner, id, value);
          expect(put.data.response?.id).toBe(id);
          expect(put.data.response?.settings).toEqual(value);

          expect(await readSettings(owner, id)).toEqual(value);
          // a repeated read is identical
          expect(await readSettings(owner, id)).toEqual(value);
          expect((await snapshot(owner, id)).settings).toEqual(value);
        });
      }
    });
  });

  test("GET /api/2.0/apps/{id}/settings - Falsy documents are kept, not treated as empty", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      for (const falsy of [0, false, "", [], {}]) {
        await saveSettings(owner, id, falsy);

        const { data, status } = await owner.apps.getSettings({ id });

        expect(status).toBe(200);
        expect(data.response, JSON.stringify(falsy)).toEqual(falsy);
        expect(data.count).toBe(1);
      }
    });
  });

  test("GET /api/2.0/apps/{id}/settings - Settings are readable while the application is disabled", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { still: "readable" });
      await saveEnabled(owner, id, false);

      const { data, status } = await owner.apps.getSettings({ id });

      expect(status).toBe(200);
      expect(data.response).toEqual({ still: "readable" });
      expect((await snapshot(owner, id)).enabled).toBe(false);
    });
  });

  test("GET /api/2.0/apps/{id}/settings - Unknown id returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .apps.getSettings({ id: "no-such-app" });

    expect(status).toBe(404);
  });

  for (const [name, badId] of [
    ["whitespace", "   "],
    ["Unicode", "приложение-😀"],
    ["special characters", "a<b>&c'd\"e"],
  ]) {
    test(`GET /api/2.0/apps/{id}/settings - ${name} id returns 404`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.rawApi(
        "owner",
        "GET",
        `${appPath(badId)}/settings`,
      );

      expect(status).toBe(404);
    });
  }
});
