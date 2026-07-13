import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/settings/owner - access control", () => {
  test("POST /api/2.0/settings/owner - Anonymous cannot send owner change instructions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .owner.sendOwnerChangeInstructions({
        ownerIdSettingsRequestDto: { ownerId: "some-id" },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/owner - RoomAdmin cannot send owner change instructions", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const newOwnerId = memberData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .owner.sendOwnerChangeInstructions({
        ownerIdSettingsRequestDto: { ownerId: newOwnerId },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/owner - User cannot send owner change instructions", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const newOwnerId = memberData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .owner.sendOwnerChangeInstructions({
        ownerIdSettingsRequestDto: { ownerId: newOwnerId },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/owner - Guest cannot send owner change instructions", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const newOwnerId = memberData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .owner.sendOwnerChangeInstructions({
        ownerIdSettingsRequestDto: { ownerId: newOwnerId },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/owner - access control", () => {
  // updatePortalOwner requires a confirmation token from email — positive case not automatable.
  // DocSpaceAdmin likely has access (same as POST), but cannot be verified without mail server.

  test("PUT /api/2.0/settings/owner - Anonymous cannot update portal owner", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().owner.updatePortalOwner({
      ownerIdSettingsRequestDto: { ownerId: "some-id" },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/owner - RoomAdmin cannot update portal owner", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .owner.updatePortalOwner({
        ownerIdSettingsRequestDto: { ownerId: "some-id" },
      });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/settings/owner - User cannot update portal owner", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk.forRole("user").owner.updatePortalOwner({
      ownerIdSettingsRequestDto: { ownerId: "some-id" },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/settings/owner - Guest cannot update portal owner", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk.forRole("guest").owner.updatePortalOwner({
      ownerIdSettingsRequestDto: { ownerId: "some-id" },
    });

    expect(status).toBe(403);
  });
});
