import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import type { ApiSDK } from "@/src/services/api-sdk";

/**
 * External DB sync of a form filling room:
 *   POST /files/rooms/{id}/externaldbsync   startExternalDbSync
 *   GET  /files/rooms/{id}/externaldbsync   getExternalDbSyncStatus
 *
 * Test portals have no external database configured, so only the contract
 * that does not need one is covered here: room-type gate, authorisation,
 * unknown room, "no job yet" answer and "nothing queued" after a refusal.
 * A running / completed / failed job (percentage, forms[], status) cannot be
 * reached without that database and is deliberately not faked here.
 *
 * Established live on a portal without an external DB:
 *   - GET on a form filling room that never had a job: 200, no `response`.
 *   - Any non form filling room: 403 on both calls.
 *   - Unknown room: 404 on both calls. Anonymous: 401 on both calls.
 *   - Only a room manager of the room may call it: owner and RoomManager
 *     get 200 on GET; members with lower access, outsiders and every
 *     User / Guest get 403.
 *   - POST without a configured external DB answers 500 "Bad request."
 *     (BadHttpRequestException) instead of a controlled 4xx.
 */

const nonFormRoomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
] as const;

async function createFormRoom(apiSdk: ApiSDK, title: string) {
  const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.FillingFormsRoom },
  });
  expect(status).toBe(200);
  expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
  return data.response!.id!;
}

async function expectNoJob(apiSdk: ApiSDK, roomId: number) {
  const { data, status } = await apiSdk
    .forRole("owner")
    .rooms.getExternalDbSyncStatus({ id: roomId });
  expect(status).toBe(200);
  expect(data.response).toBeUndefined();
}

test.describe("GET /files/rooms/:id/externaldbsync - status", () => {
  test("Owner gets 200 with an empty body for a form filling room that never ran a sync", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync No Job");

    const { data, status } = await apiSdk
      .forRole("owner")
      .rooms.getExternalDbSyncStatus({ id: roomId });

    expect(status).toBe(200);
    expect(data.response).toBeUndefined();
  });

  test("Repeated GET is a pure read: the answer stays the same and no job appears", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync Repeat GET");
    const ownerApi = apiSdk.forRole("owner");

    for (let i = 0; i < 3; i++) {
      const { data, status } = await ownerApi.rooms.getExternalDbSyncStatus({
        id: roomId,
      });
      expect(status).toBe(200);
      expect(data.response).toBeUndefined();
    }
  });

  for (const { label, roomType } of nonFormRoomTypes) {
    test(`${label} room is refused with 403`, async ({ apiSdk }) => {
      const { data: created } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest DbSync GET ${label}`,
          roomType,
        },
      });
      expect(created.response!.roomType).toBe(roomType);

      const { status } = await apiSdk
        .forRole("owner")
        .rooms.getExternalDbSyncStatus({ id: created.response!.id! });

      expect(status).toBe(403);
    });
  }

  test("Unknown room id returns 404", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rooms.getExternalDbSyncStatus({ id: 999999999 });

    expect(status).toBe(404);
  });

  test("Anonymous request returns 401", async ({ apiSdk }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync GET Anon");

    const { status } = await apiSdk
      .forAnonymous()
      .rooms.getExternalDbSyncStatus({ id: roomId });

    expect(status).toBe(401);
  });
});

test.describe("POST /files/rooms/:id/externaldbsync - start", () => {
  test("BUG 84473: Owner starting a sync with no external database configured returns 500 instead of a controlled 4xx", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 84473: POST /files/rooms/{id}/externaldbsync on a form filling room " +
        "while the portal has no external database throws " +
        'Microsoft.AspNetCore.Http.BadHttpRequestException ("Bad request.") from ' +
        "FileStorageService.StartExternalDbSyncAsync and answers 500. The " +
        "exception type is a client error, the response should be 400.",
    );
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync Start NoDb");

    const { status } = await apiSdk
      .forRole("owner")
      .rooms.startExternalDbSync({ id: roomId });

    expect(status).toBe(400);
  });

  test("A failed start queues nothing: status stays empty and a second start fails the same way", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(
      apiSdk,
      "Autotest DbSync Start Nothing",
    );
    const ownerApi = apiSdk.forRole("owner");

    const first = await ownerApi.rooms.startExternalDbSync({ id: roomId });
    // the call is refused for a missing external DB, not accepted
    expect(first.status).toBeGreaterThanOrEqual(400);
    expect(first.data.response).toBeUndefined();
    await expectNoJob(apiSdk, roomId);

    const second = await ownerApi.rooms.startExternalDbSync({ id: roomId });
    expect(second.status).toBe(first.status);
    await expectNoJob(apiSdk, roomId);
  });

  for (const { label, roomType } of nonFormRoomTypes) {
    test(`${label} room is refused with 403`, async ({ apiSdk }) => {
      const { data: created } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest DbSync Start ${label}`,
          roomType,
        },
      });
      expect(created.response!.roomType).toBe(roomType);

      const { status } = await apiSdk
        .forRole("owner")
        .rooms.startExternalDbSync({ id: created.response!.id! });

      expect(status).toBe(403);
    });
  }

  test("Unknown room id returns 404", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rooms.startExternalDbSync({ id: 999999999 });

    expect(status).toBe(404);
  });

  test("Anonymous request returns 401 and queues nothing", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync Start Anon");

    const { status } = await apiSdk
      .forAnonymous()
      .rooms.startExternalDbSync({ id: roomId });

    expect(status).toBe(401);
    await expectNoJob(apiSdk, roomId);
  });
});

test.describe("/files/rooms/:id/externaldbsync - access control", () => {
  // Only a room manager of the room may use the endpoint. The invitations
  // are asserted so that a 403 below cannot come from a failed invite.
  async function inviteAndConfirm(
    apiSdk: ApiSDK,
    roomId: number,
    userId: string,
    access: FileShare,
  ) {
    const { status } = await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access }],
        notify: false,
      },
    });
    expect(status).toBe(200);

    const { data } = await apiSdk
      .forRole("owner")
      .rooms.getRoomSecurityInfo({ id: roomId });
    const member = data.response!.find((s) => s.sharedToUser?.id === userId);
    expect(member?.access).toBe(access);
  }

  for (const userType of ["RoomAdmin", "User", "Guest"] as const) {
    test(`${userType} outside the room gets 403 on both calls and nothing is queued`, async ({
      apiSdk,
    }) => {
      const roomId = await createFormRoom(
        apiSdk,
        `Autotest DbSync ${userType}`,
      );
      const { api } = await apiSdk.addAuthenticatedMember("owner", userType);

      const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
      const start = await api.rooms.startExternalDbSync({ id: roomId });

      await expectNoJob(apiSdk, roomId);
      expect(get.status).toBe(403);
      expect(start.status).toBe(403);
    });
  }

  // Editing is not a valid level for a form filling room, so only the level
  // the room accepts is used (Viewer is rejected too).
  const lowerAccesses = [
    { label: "FormFiller", access: FileShare.FillForms },
  ] as const;

  for (const userType of ["User", "Guest"] as const) {
    for (const { label, access } of lowerAccesses) {
      test(`${userType} invited as ${label} gets 403 on both calls`, async ({
        apiSdk,
      }) => {
        const roomId = await createFormRoom(
          apiSdk,
          `Autotest DbSync ${userType} ${label}`,
        );
        const { api, data } = await apiSdk.addAuthenticatedMember(
          "owner",
          userType,
        );
        await inviteAndConfirm(apiSdk, roomId, data.response!.id!, access);

        const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
        const start = await api.rooms.startExternalDbSync({ id: roomId });

        await expectNoJob(apiSdk, roomId);
        expect(get.status).toBe(403);
        expect(start.status).toBe(403);
      });
    }
  }

  for (const { label, access } of lowerAccesses) {
    test(`RoomAdmin invited as ${label} gets 403 on both calls`, async ({
      apiSdk,
    }) => {
      const roomId = await createFormRoom(
        apiSdk,
        `Autotest DbSync RoomAdmin ${label}`,
      );
      const { api, data } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );
      await inviteAndConfirm(apiSdk, roomId, data.response!.id!, access);

      const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
      const start = await api.rooms.startExternalDbSync({ id: roomId });

      await expectNoJob(apiSdk, roomId);
      expect(get.status).toBe(403);
      expect(start.status).toBe(403);
    });
  }

  test("RoomAdmin invited as RoomManager passes the permission gate", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(
      apiSdk,
      "Autotest DbSync RoomAdmin Manager",
    );
    const { api, data } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    await inviteAndConfirm(
      apiSdk,
      roomId,
      data.response!.id!,
      FileShare.RoomManager,
    );

    const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
    expect(get.status).toBe(200);
    expect(get.data.response).toBeUndefined();

    // Not asserting the refusal status here (that is the 500 bug above): the
    // point is that the request got past authorisation and queued nothing.
    const start = await api.rooms.startExternalDbSync({ id: roomId });
    expect(start.status).not.toBe(403);
    expect(start.status).not.toBe(401);
    await expectNoJob(apiSdk, roomId);
  });

  // The endpoint is manager-only, including for a portal administrator: a
  // DocSpaceAdmin outside the room is refused like any other outsider, and one
  // invited as RoomManager passes the gate.
  test("DocSpaceAdmin outside the room gets 403 on both calls and nothing is queued", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync DSAdmin Out");
    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
    const start = await api.rooms.startExternalDbSync({ id: roomId });

    await expectNoJob(apiSdk, roomId);
    expect(get.status).toBe(403);
    expect(start.status).toBe(403);
  });

  test("DocSpaceAdmin invited as FormFiller gets 403 on both calls", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync DSAdmin FF");
    const { api, data } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    await inviteAndConfirm(
      apiSdk,
      roomId,
      data.response!.id!,
      FileShare.FillForms,
    );

    const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
    const start = await api.rooms.startExternalDbSync({ id: roomId });

    await expectNoJob(apiSdk, roomId);
    expect(get.status).toBe(403);
    expect(start.status).toBe(403);
  });

  test("DocSpaceAdmin invited as RoomManager passes the permission gate", async ({
    apiSdk,
  }) => {
    const roomId = await createFormRoom(apiSdk, "Autotest DbSync DSAdmin Mgr");
    const { api, data } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    await inviteAndConfirm(
      apiSdk,
      roomId,
      data.response!.id!,
      FileShare.RoomManager,
    );

    const get = await api.rooms.getExternalDbSyncStatus({ id: roomId });
    expect(get.status).toBe(200);
    expect(get.data.response).toBeUndefined();

    // Refusal status is the 500 bug above; here only that authorisation passed.
    const start = await api.rooms.startExternalDbSync({ id: roomId });
    expect(start.status).not.toBe(403);
    expect(start.status).not.toBe(401);
    await expectNoJob(apiSdk, roomId);
  });
});
