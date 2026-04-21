import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("Portal Guests — Sharing Link", () => {
  test("GET /api/2.0/people/guests/{userid}/share - Owner gets sharing link for a guest", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .portalGuests.getGuestSharingLink({ userid: guestId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(() => new URL(data.response!)).not.toThrow();
    expect(new URL(data.response!).pathname).toMatch(/^\/s\//);
  });

  test("GET /api/2.0/people/guests/{userid}/share - Owner gets sharing link for a guest created by DocSpace admin", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data: guestData } = await apiSdk.addMember(
      "docSpaceAdmin",
      "Guest",
    );
    const guestId = guestData.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .portalGuests.getGuestSharingLink({ userid: guestId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(() => new URL(data.response!)).not.toThrow();
    expect(new URL(data.response!).pathname).toMatch(/^\/s\//);
  });

  test("GET /api/2.0/people/guests/{userid}/share - DocSpace admin gets sharing link for a guest created by Owner", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data, status } = await adminApi.portalGuests.getGuestSharingLink({
      userid: guestId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(() => new URL(data.response!)).not.toThrow();
    expect(new URL(data.response!).pathname).toMatch(/^\/s\//);
  });

  test("GET /api/2.0/people/guests/{userid}/share - DocSpace admin gets sharing link for their own guest", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: guestData } = await apiSdk.addMember(
      "docSpaceAdmin",
      "Guest",
    );
    const guestId = guestData.response!.id!;

    const { data, status } = await adminApi.portalGuests.getGuestSharingLink({
      userid: guestId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(() => new URL(data.response!)).not.toThrow();
    expect(new URL(data.response!).pathname).toMatch(/^\/s\//);
  });

  test("GET /api/2.0/people/guests/{userid}/share - Room admin gets sharing link for their own guest", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: guestData } = await apiSdk.addMember("roomAdmin", "Guest");
    const guestId = guestData.response!.id!;

    const { data, status } =
      await roomAdminApi.portalGuests.getGuestSharingLink({
        userid: guestId,
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(() => new URL(data.response!)).not.toThrow();
    expect(new URL(data.response!).pathname).toMatch(/^\/s\//);
  });
});
