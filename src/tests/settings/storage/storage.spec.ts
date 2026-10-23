import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Portal/CDN/backup storage settings. Confirmed live: every method that can
// actually switch or reconfigure where the portal's data or static content
// lives (getAllStorages, getAllCdnStorages, resetCdnToDefault,
// resetStorageToDefault, updateCdnStorage, updateStorage) requires "a server
// installation with unrestricted access space" - the same SaaS-refusal gate
// already seen on RebrandingApi's company/additional save/delete calls - and
// is refused with 403 here regardless of role, Owner included.
//
// Three methods are NOT behind that gate and work normally on this SaaS
// portal:
// - getAmazonS3Regions: static, build-compiled reference data, no
//   portal-settings permission needed at all;
// - getAllBackupStorages: backup IS available on this portal even though
//   it's SaaS, so this lists the real backup-capable providers;
// - getStorageProgress: answers -1 ("migration not offered on this
//   installation") rather than erroring, even though no migration has ever
//   been started here.

test.describe("GET /api/2.0/settings/storage/s3 - Get the Amazon S3 regions", () => {
  test("Owner gets the compiled-in list of AWS regions", async ({ apiSdk }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .storage.getAmazonS3Regions();

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0]).toEqual(
      expect.objectContaining({
        systemName: expect.any(String),
        displayName: expect.any(String),
      }),
    );
  });
});

test.describe("GET /api/2.0/settings/storage/backup - Get the backup storages", () => {
  test("Owner gets the backup-capable storage providers", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .storage.getAllBackupStorages();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0]).toEqual(
      expect.objectContaining({ id: expect.any(String) }),
    );
  });

  test("dump=true reads the server-wide schedule instead, same list shape", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .storage.getAllBackupStorages({ dump: true });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("GET /api/2.0/settings/storage/progress - Get the storage migration progress", () => {
  test("Owner gets -1 when storage migration isn't offered on this installation", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .storage.getStorageProgress();

    expect(status).toBe(200);
    expect(data.response).toBe(-1);
  });
});

test.describe("GET /api/2.0/settings/storage - Get the portal storages", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").storage.getAllStorages();
    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/storage/cdn - Get the CDN storages", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .storage.getAllCdnStorages();
    expect(status).toBe(403);
  });
});

test.describe("DELETE /api/2.0/settings/storage/cdn - Reset the CDN storage settings", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .storage.resetCdnToDefault();
    expect(status).toBe(403);
  });
});

test.describe("DELETE /api/2.0/settings/storage - Reset the storage settings", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .storage.resetStorageToDefault();
    expect(status).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/storage/cdn - Update the CDN storage", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").storage.updateCdnStorage({
      storageRequestsDto: {
        module: "s3",
        props: [{ key: "acesskey", value: "x" }],
      },
    });
    expect(status).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/storage - Switch the portal storage", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").storage.updateStorage({
      storageRequestsDto: {
        module: "s3",
        props: [{ key: "acesskey", value: "x" }],
      },
    });
    expect(status).toBe(403);
  });
});
