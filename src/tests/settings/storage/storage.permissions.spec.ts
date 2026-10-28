import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/storage/s3 - access control", () => {
  test("User (non-admin) can read the Amazon S3 regions", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.storage.getAmazonS3Regions();
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the Amazon S3 regions", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().storage.getAmazonS3Regions();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/storage/backup - access control", () => {
  test("DocSpaceAdmin can read the backup storages", async ({ apiSdk }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.storage.getAllBackupStorages();
    expect(status).toBe(200);
  });

  test("User (non-admin) cannot read the backup storages", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.storage.getAllBackupStorages();
    expect(status).toBe(403);
  });

  test("Anonymous cannot read the backup storages", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .storage.getAllBackupStorages();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/storage/progress - access control", () => {
  test("User (non-admin) cannot read the storage migration progress", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.storage.getStorageProgress();
    expect(status).toBe(403);
  });

  test("Anonymous cannot read the storage migration progress", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().storage.getStorageProgress();
    expect(status).toBe(401);
  });
});

test.describe("SaaS-gated storage endpoints - Anonymous access control", () => {
  // Every one of these is refused with 403 even for Owner on this SaaS
  // portal (storage.spec.ts), so the only thing left to confirm per-role is
  // that an unauthenticated caller is rejected earlier, with 401, before
  // that gate is ever reached - checked together since it's the same claim
  // repeated across every one of these methods.
  test("Anonymous gets 401, not 403, on every SaaS-gated storage endpoint", async ({
    apiSdk,
  }) => {
    const anon = apiSdk.forAnonymous();

    const getAllStorages = await anon.storage.getAllStorages();
    expect(getAllStorages.status).toBe(401);

    const getAllCdnStorages = await anon.storage.getAllCdnStorages();
    expect(getAllCdnStorages.status).toBe(401);

    const resetCdnToDefault = await anon.storage.resetCdnToDefault();
    expect(resetCdnToDefault.status).toBe(401);

    const resetStorageToDefault = await anon.storage.resetStorageToDefault();
    expect(resetStorageToDefault.status).toBe(401);

    const updateCdnStorage = await anon.storage.updateCdnStorage({
      storageRequestDto: { module: "s3", props: [] },
    });
    expect(updateCdnStorage.status).toBe(401);

    const updateStorage = await anon.storage.updateStorage({
      storageRequestDto: { module: "s3", props: [] },
    });
    expect(updateStorage.status).toBe(401);
  });
});
