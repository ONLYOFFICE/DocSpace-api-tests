import { expect, test } from "@playwright/test";
import type { AppDto } from "@onlyoffice/docspace-api-sdk";
import type { AppsApi } from "@onlyoffice/docspace-api-sdk/dist/api/apps/apps-api";

// Anything that exposes an `apps` client: forRole(...), forAnonymous().
export type AppsClient = { apps: AppsApi };

// An "empty" settings document is reported by omitting the `response` field
// entirely, so `null` here means "no document saved" and is distinct from `{}`,
// `0`, `false` and `""`, which are all stored and returned as they are.
export type AppState = { id: string; enabled: boolean; settings: unknown };

export async function listApps(api: AppsClient): Promise<AppDto[]> {
  const { data, status } = await api.apps.getAll();
  expect(status, "getAll apps").toBe(200);
  return data.response ?? [];
}

// The installation decides which applications exist, so nothing here assumes a
// concrete id: the tests take whatever getAll reports and skip when there are
// not enough applications.
export async function pickApps(
  api: AppsClient,
  count: number,
): Promise<string[]> {
  const ids = (await listApps(api)).map((app) => app.id!);
  test.skip(
    ids.length < count,
    `the installation exposes ${ids.length} app(s), the test needs ${count}`,
  );
  return ids.slice(0, count);
}

export async function readSettings(
  api: AppsClient,
  id: string,
): Promise<unknown> {
  const { data, status } = await api.apps.getSettings({ id });
  expect(status, `getSettings ${id}`).toBe(200);
  return data.response ?? null;
}

export async function snapshot(api: AppsClient, id: string): Promise<AppState> {
  const { data, status } = await api.apps.get({ id });
  expect(status, `get app ${id}`).toBe(200);
  return {
    id,
    enabled: data.response!.enabled!,
    settings: data.response!.settings ?? null,
  };
}

export async function saveSettings(
  api: AppsClient,
  id: string,
  settings: unknown,
) {
  const result = await api.apps.setSettings({
    id,
    setAppSettingsRequest: { settings },
  });
  expect(result.status, `setSettings ${id} (setup)`).toBe(200);
  return result;
}

export async function saveEnabled(
  api: AppsClient,
  id: string,
  enabled: boolean,
) {
  const result = await api.apps.setEnabled({
    id,
    setAppEnabledRequest: { enabled },
  });
  expect(result.status, `setEnabled ${id} (setup)`).toBe(200);
  return result;
}

async function restoreApp(api: AppsClient, state: AppState) {
  await api.apps.setEnabled({
    id: state.id,
    setAppEnabledRequest: { enabled: state.enabled },
  });
  await api.apps.setSettings({
    id: state.id,
    setAppSettingsRequest: { settings: state.settings },
  });
  const after = await snapshot(api, state.id);
  if (JSON.stringify(after) !== JSON.stringify(state)) {
    throw new Error(
      `expected ${JSON.stringify(state)}, found ${JSON.stringify(after)}`,
    );
  }
}

// Runs a mutating body and puts the application back exactly as it was found,
// even when an assertion inside it fails. A restore problem never replaces the
// original failure: it is attached to the test as an annotation instead.
export async function withAppRestored<T>(
  api: AppsClient,
  ids: string | string[],
  body: () => Promise<T>,
): Promise<T> {
  const list = Array.isArray(ids) ? ids : [ids];
  const before = await Promise.all(list.map((id) => snapshot(api, id)));
  try {
    return await body();
  } finally {
    for (const state of before) {
      await restoreApp(api, state).catch((error) => {
        test.info().annotations.push({
          type: "restore-failed",
          description: `app "${state.id}": ${error}`,
        });
      });
    }
  }
}

export const appPath = (id: string) => `apps/${encodeURIComponent(id)}`;

// Every value goes through PUT /settings and back through GET /settings, so the
// matrix covers both methods. `null` is not here: it resets the document and is
// covered by its own tests.
export const JSON_VALUES: [string, unknown][] = [
  ["simple object", { a: 1 }],
  ["object with several fields", { a: 1, b: "two", c: true, d: [1, 2] }],
  ["nested object", { a: { b: { c: { d: "deep" } } } }],
  ["array", [1, "two", false]],
  ["array of objects", [{ id: 1 }, { id: 2, tags: ["x"] }]],
  ["nested arrays", [[1, [2, [3]]], []]],
  ["string", "plain string"],
  ["number", 42],
  ["negative number", -7],
  ["fractional number", 3.14159],
  ["true", true],
  ["false", false],
  ["zero", 0],
  ["empty string", ""],
  ["empty array", []],
  ["empty object", {}],
  ["Unicode", { ru: "Привет, мир", zh: "你好", emoji: "😀🚀", rtl: "مرحبا" }],
  [
    "special characters",
    {
      html: "<script>alert(1)</script>",
      quotes: `"double" 'single' \\ back\\slash`,
      control: "line1\nline2\ttab",
      sql: "' OR 1=1 --",
    },
  ],
  ["keys with spaces and symbols", { "a key": 1, "k/e\\y": 2, "<>": 3, "": 4 }],
  ["nested null", { a: null, list: [null, 1], o: { n: null } }],
];
