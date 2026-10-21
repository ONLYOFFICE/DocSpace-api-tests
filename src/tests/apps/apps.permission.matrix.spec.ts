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

// Complements apps.permission.spec.ts: the owner itself, the disabled-state
// matrix, and the order in which permission is checked against 404 and 400.
// One role per test, each on its own portal: a second addAuthenticatedMember in
// one test flakes with 401.
const WRITERS = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin", canWrite: true },
  { type: "RoomAdmin", role: "roomAdmin", canWrite: false },
  { type: "User", role: "user", canWrite: false },
  { type: "Guest", role: "guest", canWrite: false },
] as const;

const DENIED = WRITERS.filter((r) => !r.canWrite);

test.describe("/api/2.0/apps - Owner permissions", () => {
  test("/api/2.0/apps - Owner reads and writes through all five methods", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [id] = await pickApps(owner, 1);

    await withAppRestored(owner, id, async () => {
      const before = await snapshot(owner, id);
      const doc = { writtenBy: "owner", list: [1, 2] };

      await test.step("getAll", async () => {
        const { data, status } = await owner.apps.getAll();
        expect(status).toBe(200);
        expect(data.response?.find((a) => a.id === id)?.enabled).toBe(
          before.enabled,
        );
      });

      await test.step("get", async () => {
        const { data, status } = await owner.apps.get({ id });
        expect(status).toBe(200);
        expect(data.response?.id).toBe(id);
      });

      await test.step("getSettings", async () => {
        const { status } = await owner.apps.getSettings({ id });
        expect(status).toBe(200);
        expect(await readSettings(owner, id)).toEqual(before.settings);
      });

      await test.step("setEnabled changes the stored state", async () => {
        const { data, status } = await owner.apps.setEnabled({
          id,
          setAppEnabledBody: { enabled: !before.enabled },
        });
        expect(status).toBe(200);
        expect(data.response?.enabled).toBe(!before.enabled);
        expect((await snapshot(owner, id)).enabled).toBe(!before.enabled);
      });

      await test.step("setSettings changes the stored document", async () => {
        const { data, status } = await owner.apps.setSettings({
          id,
          setAppSettingsBody: { settings: doc },
        });
        expect(status).toBe(200);
        expect(data.response?.settings).toEqual(doc);
        expect(await readSettings(owner, id)).toEqual(doc);
        expect((await listApps(owner)).find((a) => a.id === id)).toEqual({
          id,
          enabled: !before.enabled,
          settings: doc,
        });
      });
    });
  });
});

test.describe("/api/2.0/apps - permissions while the application is disabled", () => {
  for (const { type, role, canWrite } of WRITERS) {
    test(`/api/2.0/apps - ${type} ${canWrite ? "reads and writes" : "reads but cannot write"} a disabled application`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [id] = await pickApps(owner, 1);

      await withAppRestored(owner, id, async () => {
        const marker = { disabledMarker: role };
        await saveSettings(owner, id, marker);
        await saveEnabled(owner, id, false);

        await apiSdk.addAuthenticatedMember("owner", type);
        const member = apiSdk.forRole(role);

        await test.step("reads still return the disabled state and settings", async () => {
          const list = await member.apps.getAll();
          expect(list.status).toBe(200);
          expect(list.data.response?.find((a) => a.id === id)).toEqual({
            id,
            enabled: false,
            settings: marker,
          });

          const one = await member.apps.get({ id });
          expect(one.status).toBe(200);
          expect(one.data.response).toEqual({
            id,
            enabled: false,
            settings: marker,
          });

          const settings = await member.apps.getSettings({ id });
          expect(settings.status).toBe(200);
          expect(settings.data.response).toEqual(marker);
        });

        await test.step(`setSettings is ${canWrite ? "allowed" : "denied"}`, async () => {
          const written = { disabledMarker: "rewritten", by: type };
          const { status } = await member.apps.setSettings({
            id,
            setAppSettingsBody: { settings: written },
          });

          expect(status).toBe(canWrite ? 200 : 403);
          const after = await snapshot(owner, id);
          expect(after.settings).toEqual(canWrite ? written : marker);
          expect(after.enabled).toBe(false);
        });

        await test.step(`setEnabled is ${canWrite ? "allowed" : "denied"}`, async () => {
          const { status } = await member.apps.setEnabled({
            id,
            setAppEnabledBody: { enabled: true },
          });

          expect(status).toBe(canWrite ? 200 : 403);
          expect((await snapshot(owner, id)).enabled).toBe(canWrite);
        });
      });
    });
  }
});

// Observed order of checks for a write: media type (415) -> body binding (400)
// -> permission (403) -> id lookup (404). A caller without the right to write is
// refused before the id is looked up, so nothing reveals whether an application
// exists. A body that cannot even be bound to the request model is rejected by
// the framework first, with the same 400 for every caller, so that reply says
// nothing about the application either. A body that binds but is semantically
// empty ({} or a valid value) reaches the permission check and gets 403.
// Bodies the framework cannot bind.
const BAD_BODIES: {
  name: string;
  path: "enabled" | "settings";
  body: string;
}[] = [
  { name: "enabled as a string", path: "enabled", body: '{"enabled":"true"}' },
  { name: "enabled with no value", path: "enabled", body: "{}" },
  {
    name: "enabled as malformed JSON",
    path: "enabled",
    body: '{"enabled":tru',
  },
  {
    name: "settings as truncated JSON",
    path: "settings",
    body: '{"settings":{"a":',
  },
  { name: "settings as a bare number", path: "settings", body: "5" },
];

// Bodies that bind to the request models but would be wrong or destructive if
// accepted: they must hit the permission check, not be applied.
// `enabled` with no value used to bind as `false` and reach the permission
// check; BUG 84498 made it a validation error, so it sits with the other
// unbindable bodies now (measured 2026-10-21).
const BINDABLE_BODIES: typeof BAD_BODIES = [
  { name: "settings with no wrapper", path: "settings", body: '{"a":5}' },
  { name: "settings: null", path: "settings", body: '{"settings":null}' },
];

test.describe("/api/2.0/apps - permission is checked before the id, after body binding", () => {
  for (const { type, role } of DENIED) {
    test(`/api/2.0/apps - ${type} gets 403 for an unknown id, and 400 only for bodies that cannot be bound`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [id] = await pickApps(owner, 1);

      await withAppRestored(owner, id, async () => {
        const marker = { survives: role };
        await saveSettings(owner, id, marker);
        const before = await snapshot(owner, id);

        await test.step("premise: the owner gets 404 and 400 for the same requests", async () => {
          const missing = await apiSdk.rawApi(
            "owner",
            "PUT",
            `${appPath("no-such-app")}/enabled`,
            { body: '{"enabled":false}' },
          );
          expect(missing.status).toBe(404);

          for (const { name, path, body } of BAD_BODIES) {
            const { status } = await apiSdk.rawApi(
              "owner",
              "PUT",
              `${appPath(id)}/${path}`,
              { body },
            );
            expect(status, `owner: ${name}`).toBe(400);
          }
          expect(await snapshot(owner, id)).toEqual(before);
        });

        await apiSdk.addAuthenticatedMember("owner", type);
        const member = apiSdk.forRole(role);

        // The User case is already covered with the SDK client in
        // apps.permission.spec.ts, so it is only repeated for the other roles.
        if (role !== "user") {
          await test.step("an unknown id is 403, never 404", async () => {
            const toggle = await member.apps.setEnabled({
              id: "no-such-app",
              setAppEnabledBody: { enabled: false },
            });
            const save = await member.apps.setSettings({
              id: "no-such-app",
              setAppSettingsBody: { settings: {} },
            });

            expect(toggle.status).toBe(403);
            expect(save.status).toBe(403);
          });
        }

        await test.step("the refusal does not reveal whether the application exists", async () => {
          const real = await member.apps.setEnabled({
            id,
            setAppEnabledBody: { enabled: !before.enabled },
          });
          const unknown = await member.apps.setEnabled({
            id: "no-such-app",
            setAppEnabledBody: { enabled: !before.enabled },
          });

          expect(real.status).toBe(403);
          expect(unknown.status).toBe(403);
          expect((unknown.data as any)?.error?.message).toBe(
            (real.data as any)?.error?.message,
          );
        });

        for (const { name, path, body } of BAD_BODIES) {
          await test.step(`${name} is rejected as 400 by body binding, as for the owner`, async () => {
            const { status } = await apiSdk.rawApi(
              role,
              "PUT",
              `${appPath(id)}/${path}`,
              { body },
            );

            expect(status).toBe(400);
          });
        }

        for (const { name, path, body } of BINDABLE_BODIES) {
          await test.step(`${name} reaches the permission check and is 403`, async () => {
            const { status } = await apiSdk.rawApi(
              role,
              "PUT",
              `${appPath(id)}/${path}`,
              { body },
            );

            expect(status).toBe(403);
          });
        }

        expect(await snapshot(owner, id)).toEqual(before);
      });
    });
  }
});
