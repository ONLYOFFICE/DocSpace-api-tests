import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  appPath,
  listApps,
  pickApps,
  readSettings,
  saveEnabled,
  saveSettings,
  snapshot,
  withAppRestored,
} from "@/src/helpers/apps";

test.describe("PUT /api/2.0/apps/{id}/enabled", () => {
  test("PUT /api/2.0/apps/{id}/enabled - Owner flips enabled and the new state is read back", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const before = await snapshot(owner, id);

      const { data, status } = await owner.apps.setEnabled({
        id,
        setAppEnabledBody: { enabled: !before.enabled },
      });

      expect(status).toBe(200);
      expect(data.response?.id).toBe(id);
      expect(data.response?.enabled).toBe(!before.enabled);
      expect(data.response?.settings ?? null).toEqual(before.settings);
      expect((await snapshot(owner, id)).enabled).toBe(!before.enabled);
      expect((await listApps(owner)).find((a) => a.id === id)?.enabled).toBe(
        !before.enabled,
      );
    });
  });

  test("PUT /api/2.0/apps/{id}/enabled - Enabling and disabling are idempotent", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      for (const enabled of [true, false]) {
        await saveEnabled(owner, id, enabled);
        const first = await snapshot(owner, id);

        const { data, status } = await owner.apps.setEnabled({
          id,
          setAppEnabledBody: { enabled },
        });

        expect(status, `repeat enabled=${enabled}`).toBe(200);
        expect(data.response?.enabled).toBe(enabled);
        expect(await snapshot(owner, id)).toEqual(first);
      }
    });
  });

  test("PUT /api/2.0/apps/{id}/enabled - The last request decides the final state", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      for (const sequence of [
        [true, false, true],
        [false, true, false],
      ]) {
        await test.step(sequence.join(" -> "), async () => {
          for (const enabled of sequence) {
            await saveEnabled(owner, id, enabled);
            expect((await snapshot(owner, id)).enabled).toBe(enabled);
          }
        });
      }
    });
  });

  test("PUT /api/2.0/apps/{id}/enabled - Switching does not touch the settings document", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);
    const doc = { keep: ["me", 1], nested: { ok: true } };

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, doc);

      const off = await saveEnabled(owner, id, false);
      expect(off.data.response?.settings).toEqual(doc);
      expect(await readSettings(owner, id)).toEqual(doc);

      const on = await saveEnabled(owner, id, true);
      expect(on.data.response?.settings).toEqual(doc);
      expect(await readSettings(owner, id)).toEqual(doc);
    });
  });

  test("PUT /api/2.0/apps/{id}/enabled - Switching one application leaves the others and the count alone", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [first, second] = await pickApps(owner, 2);

    await withAppRestored(owner, [first, second], async () => {
      await saveSettings(owner, second, { other: "app" });
      const before = await listApps(owner);

      await saveEnabled(
        owner,
        first,
        !before.find((a) => a.id === first)!.enabled,
      );

      const after = await listApps(owner);
      expect(after.map((a) => a.id)).toEqual(before.map((a) => a.id));
      for (const app of after.filter((a) => a.id !== first)) {
        expect(app, `app ${app.id}`).toEqual(
          before.find((a) => a.id === app.id),
        );
      }
    });
  });

  test("PUT /api/2.0/apps/{id}/enabled - Unknown id returns 404 and creates nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const before = await listApps(owner);

    const { status } = await owner.apps.setEnabled({
      id: "no-such-app",
      setAppEnabledBody: { enabled: false },
    });

    expect(status).toBe(404);
    expect(await listApps(owner)).toEqual(before);
  });

  const BAD_ENABLED: [string, string][] = [
    ["null", '{"enabled":null}'],
    ['the string "true"', '{"enabled":"true"}'],
    ['the string "false"', '{"enabled":"false"}'],
    ["the number 1", '{"enabled":1}'],
    ["the number 0", '{"enabled":0}'],
    ["an array", '{"enabled":[]}'],
    ["an object", '{"enabled":{}}'],
    ["malformed JSON", '{"enabled":tru'],
    ["a JSON null body", "null"],
  ];

  for (const [name, body] of BAD_ENABLED) {
    test(`PUT /api/2.0/apps/{id}/enabled - enabled as ${name} returns 400 and changes nothing`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [id] = await pickApps(owner, 1);

      await withAppRestored(owner, id, async () => {
        await saveSettings(owner, id, { before: "rejected call" });
        const before = await snapshot(owner, id);

        const { status } = await apiSdk.rawApi(
          "owner",
          "PUT",
          `${appPath(id)}/enabled`,
          { body },
        );

        expect(status).toBe(400);
        expect(await snapshot(owner, id)).toEqual(before);
      });
    });
  }

  test("PUT /api/2.0/apps/{id}/enabled - A request without a body is rejected with 415 and changes nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const before = await snapshot(owner, id);

      const { status } = await apiSdk.rawApi(
        "owner",
        "PUT",
        `${appPath(id)}/enabled`,
      );

      expect(status).toBe(415);
      expect(await snapshot(owner, id)).toEqual(before);
    });
  });

  test("BUG 84498: PUT /api/2.0/apps/{id}/enabled - A body without the enabled field is rejected instead of silently disabling the application", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveEnabled(owner, id, true);

      const { status } = await apiSdk.rawApi(
        "owner",
        "PUT",
        `${appPath(id)}/enabled`,
        { body: "{}" },
      );

      // Observed: 200 and enabled becomes false (the missing bool defaults).
      expect((await snapshot(owner, id)).enabled).toBe(true);
      expect(status).toBe(400);
    });
  });
});

test.describe("PUT /api/2.0/apps/{id}/settings", () => {
  test("PUT /api/2.0/apps/{id}/settings - Response carries the stored document and every reader agrees", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const doc = { a: 1, list: [{ x: 1 }] };

      const { data, status } = await owner.apps.setSettings({
        id,
        setAppSettingsBody: { settings: doc },
      });

      expect(status).toBe(200);
      expect(data.response?.id).toBe(id);
      expect(data.response?.settings).toEqual(doc);
      expect(await readSettings(owner, id)).toEqual(doc);
      expect((await snapshot(owner, id)).settings).toEqual(doc);
      expect(
        (await listApps(owner)).find((a) => a.id === id)?.settings,
      ).toEqual(doc);
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Saving the same document twice is idempotent", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const doc = { same: "document" };
      await saveSettings(owner, id, doc);
      const first = await snapshot(owner, id);

      const { data, status } = await owner.apps.setSettings({
        id,
        setAppSettingsBody: { settings: doc },
      });

      expect(status).toBe(200);
      expect(data.response?.settings).toEqual(doc);
      expect(await snapshot(owner, id)).toEqual(first);
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Saving settings does not change enabled", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      for (const enabled of [true, false]) {
        await saveEnabled(owner, id, enabled);

        const { data } = await owner.apps.setSettings({
          id,
          setAppSettingsBody: { settings: { enabledWas: enabled } },
        });

        expect(data.response?.enabled).toBe(enabled);
        expect((await snapshot(owner, id)).enabled).toBe(enabled);
      }
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Settings saved while disabled apply after enabling", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveEnabled(owner, id, false);
      await saveSettings(owner, id, { saved: "while disabled" });

      await saveEnabled(owner, id, true);

      expect(await readSettings(owner, id)).toEqual({
        saved: "while disabled",
      });
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Saving one application's settings leaves another's alone", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [first, second] = await pickApps(owner, 2);

    await withAppRestored(owner, [first, second], async () => {
      await saveSettings(owner, second, { owner: "second" });
      const secondBefore = await snapshot(owner, second);

      await saveSettings(owner, first, { owner: "first" });

      expect(await snapshot(owner, second)).toEqual(secondBefore);
      expect(await readSettings(owner, first)).toEqual({ owner: "first" });
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - A deeply nested document is stored whole", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);
    let deep: unknown = { leaf: "bottom" };
    for (let level = 0; level < 20; level++) {
      deep = { level, child: deep };
    }

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, deep);

      expect(await readSettings(owner, id)).toEqual(deep);
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - The document is replaced, never merged", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await test.step("{a,b} then {a} drops b", async () => {
        await saveSettings(owner, id, { a: 1, b: 2 });
        await saveSettings(owner, id, { a: 3 });
        expect(await readSettings(owner, id)).toEqual({ a: 3 });
      });

      await test.step("a nested object is replaced by another shape", async () => {
        await saveSettings(owner, id, { a: 1, b: 2, nested: { x: 1, y: 2 } });
        await saveSettings(owner, id, { nested: { z: 9 } });
        expect(await readSettings(owner, id)).toEqual({ nested: { z: 9 } });
      });

      await test.step("an object becomes an array and back", async () => {
        await saveSettings(owner, id, { a: 1 });
        await saveSettings(owner, id, [1, 2, 3]);
        expect(await readSettings(owner, id)).toEqual([1, 2, 3]);
        await saveSettings(owner, id, { b: 2 });
        expect(await readSettings(owner, id)).toEqual({ b: 2 });
      });

      await test.step("a non-empty document becomes {}", async () => {
        await saveSettings(owner, id, { a: 1 });
        await saveSettings(owner, id, {});
        expect(await readSettings(owner, id)).toEqual({});
      });
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - settings: null drops the document and is repeatable", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { to: "drop" });
      const enabled = (await snapshot(owner, id)).enabled;

      for (const attempt of [1, 2]) {
        const { data, status } = await owner.apps.setSettings({
          id,
          setAppSettingsBody: { settings: null },
        });

        expect(status, `reset #${attempt}`).toBe(200);
        expect(data.response?.id).toBe(id);
        expect(data.response?.settings).toBeUndefined();
        expect(await readSettings(owner, id)).toBeNull();
        expect((await owner.apps.getSettings({ id })).data.count).toBe(0);
        const snap = await snapshot(owner, id);
        expect(snap.settings).toBeNull();
        expect(snap.enabled).toBe(enabled);
        expect(
          (await listApps(owner)).find((a) => a.id === id)?.settings,
        ).toBeUndefined();
      }

      await saveSettings(owner, id, { after: "reset" });
      expect(await readSettings(owner, id)).toEqual({ after: "reset" });
    });
  });

  test("PUT /api/2.0/apps/{id}/settings - Unknown id returns 404 and creates nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const before = await listApps(owner);

    const { status } = await owner.apps.setSettings({
      id: "no-such-app",
      setAppSettingsBody: { settings: { a: 1 } },
    });

    expect(status).toBe(404);
    expect(await listApps(owner)).toEqual(before);
  });

  // These bodies are not valid for the endpoint at all, so the call has to fail
  // and the previously saved document has to survive it untouched. Raw HTTP is
  // used because the typed client can only ever send well-formed JSON objects.
  const BAD_BODIES: [string, string][] = [
    ["truncated JSON", '{"settings":{"a":'],
    ["an unclosed brace", '{"settings":{"a":1}'],
    ["a trailing comma", '{"settings":{"a":1,}}'],
    ["an unquoted key", '{settings:{"a":1}}'],
    ["a bare number", "5"],
    ["a bare string", '"text"'],
    ["a root array", "[1,2]"],
    ["a JSON null", "null"],
    ["an empty string body", ""],
  ];

  for (const [name, body] of BAD_BODIES) {
    test(`PUT /api/2.0/apps/{id}/settings - ${name} returns 400 and the saved document survives`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [id] = await pickApps(owner, 1);

      await withAppRestored(owner, id, async () => {
        const doc = { survives: true, list: [1, 2] };
        await saveSettings(owner, id, doc);
        const before = await snapshot(owner, id);

        const { status } = await apiSdk.rawApi(
          "owner",
          "PUT",
          `${appPath(id)}/settings`,
          { body },
        );

        expect(status).toBe(400);
        expect(await readSettings(owner, id)).toEqual(doc);
        expect(await snapshot(owner, id)).toEqual(before);
      });
    });
  }

  test("PUT /api/2.0/apps/{id}/settings - A request without a body is rejected with 415 and the document survives", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      await saveSettings(owner, id, { survives: true });

      const { status } = await apiSdk.rawApi(
        "owner",
        "PUT",
        `${appPath(id)}/settings`,
      );

      expect(status).toBe(415);
      expect(await readSettings(owner, id)).toEqual({ survives: true });
    });
  });

  // The request model has a single optional `settings` member, and an absent
  // member means "no document", exactly like an explicit null.
  for (const [name, body] of [
    ["an empty object", "{}"],
    ["an object without the settings member", '{"survives":false}'],
  ] as const) {
    test(`PUT /api/2.0/apps/{id}/settings - ${name} resets the document like settings: null`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [id] = await pickApps(owner, 1);

      await withAppRestored(owner, id, async () => {
        await saveSettings(owner, id, { survives: true });
        const enabled = (await snapshot(owner, id)).enabled;

        const { data, status } = await apiSdk.rawApi(
          "owner",
          "PUT",
          `${appPath(id)}/settings`,
          { body },
        );

        expect(status).toBe(200);
        expect(data.response?.id).toBe(id);
        expect(data.response?.settings).toBeUndefined();
        expect(await readSettings(owner, id)).toBeNull();
        expect((await snapshot(owner, id)).enabled).toBe(enabled);
      });
    });
  }
});
