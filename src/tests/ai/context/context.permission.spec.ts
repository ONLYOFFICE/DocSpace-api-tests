import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  expectActingAs,
  knowledgeRoomIds,
  knowledgeRooms,
  roomTitle,
} from "@/src/helpers/ai-context";
import { createRoomOfType } from "@/src/helpers/rooms";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import type { ApiSDK } from "@/src/services/api-sdk";

// Who sees which KnowledgeRoom in GET /ai/context/get-knowledge-folders, and
// that get-context-folders hands nothing of the owner's to anyone.
//
// Every member call is pinned with `expectActingAs`: the shared request context's
// session cookie beats the bearer token, so without it a "member reads" call may
// really be the owner reading and an absence check would prove nothing. Owner
// setup and the owner-side positive control come first, then the member is
// authenticated, as the shared context requires.

const MEMBERS = [
  {
    label: "DocSpace Admin",
    type: "DocSpaceAdmin",
    role: "docSpaceAdmin",
    seesWithoutInvite: true,
  },
  {
    label: "Room Admin",
    type: "RoomAdmin",
    role: "roomAdmin",
    seesWithoutInvite: false,
  },
  { label: "User", type: "User", role: "user", seesWithoutInvite: false },
  { label: "Guest", type: "Guest", role: "guest", seesWithoutInvite: false },
] as const;

async function ownerSetup(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof enableAiGateway>[0],
) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);
  return ownerApi;
}

/** Owner invites a member and insists the invite took: no premise, no verdict. */
async function invite(apiSdk: ApiSDK, roomId: number, userId: string) {
  const { status } = await apiSdk.forRole("owner").rooms.setRoomSecurity({
    id: roomId,
    roomInvitationRequest: {
      invitations: [{ id: userId, access: FileShare.Read }],
      notify: false,
    },
  });
  expect(status, "the owner invites the member to the KnowledgeRoom").toBe(200);
}

async function expectOwnerSees(
  ownerApi: ReturnType<ApiSDK["forRole"]>,
  roomId: number,
) {
  const { status, data } =
    await ownerApi.aiContext.aiContextGetKnowledgeFolders();
  expect(status, "GET get-knowledge-folders as owner").toBe(200);
  expect(knowledgeRoomIds(data), "owner sees the KnowledgeRoom").toContain(
    String(roomId),
  );
}

test.describe("GET /ai/context/get-knowledge-folders - authentication", () => {
  test("GET /ai/context/get-knowledge-folders - anonymous is refused with 401", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await ownerSetup(apiSdk, paymentsApi);
    const id = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    await expectOwnerSees(ownerApi, id);

    const { status, data } = await apiSdk
      .forAnonymous()
      .aiContext.aiContextGetKnowledgeFolders();

    expect(status).toBe(401);
    expect(
      JSON.stringify(data),
      "the refusal carries no room data",
    ).not.toContain(String(id));
  });

  test("GET /ai/context/get-context-folders - anonymous is refused with 401", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await ownerSetup(apiSdk, paymentsApi);
    expect((await ownerApi.aiContext.aiContextGetContextFolders()).status).toBe(
      200,
    );

    const { status } = await apiSdk
      .forAnonymous()
      .aiContext.aiContextGetContextFolders();

    expect(status).toBe(401);
  });
});

test.describe("GET /ai/context/get-knowledge-folders - members", () => {
  for (const { label, type, role, seesWithoutInvite } of MEMBERS) {
    test(`GET /ai/context/get-knowledge-folders - ${label} invited to a KnowledgeRoom sees it`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = await ownerSetup(apiSdk, paymentsApi);
      const title = roomTitle(apiSdk);
      const id = await createRoomOfType(
        apiSdk,
        "owner",
        title,
        RoomType.KnowledgeRoom,
      );
      const { data: member, userData } = await apiSdk.addMember("owner", type);
      await invite(apiSdk, id, member.response!.id!);
      await expectOwnerSees(ownerApi, id);

      await apiSdk.authenticateMember(userData, type);
      await expectActingAs(apiSdk, role, member.response!.id!, label);
      const { status, data } = await apiSdk
        .forRole(role)
        .aiContext.aiContextGetKnowledgeFolders();

      expect(status).toBe(200);
      expect(knowledgeRoomIds(data)).toEqual([String(id)]);
      expect(knowledgeRooms(data)[0].name).toBe(title);
    });

    test(`GET /ai/context/get-knowledge-folders - ${label} not invited ${seesWithoutInvite ? "still sees" : "does not see"} the KnowledgeRoom`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = await ownerSetup(apiSdk, paymentsApi);
      const id = await createRoomOfType(
        apiSdk,
        "owner",
        roomTitle(apiSdk),
        RoomType.KnowledgeRoom,
      );
      const { data: member, userData } = await apiSdk.addMember("owner", type);
      await expectOwnerSees(ownerApi, id);

      await apiSdk.authenticateMember(userData, type);
      await expectActingAs(apiSdk, role, member.response!.id!, label);
      const { status, data } = await apiSdk
        .forRole(role)
        .aiContext.aiContextGetKnowledgeFolders();

      expect(status).toBe(200);
      expect(knowledgeRoomIds(data)).toEqual(
        seesWithoutInvite ? [String(id)] : [],
      );
    });
  }

  test("GET /ai/context/get-knowledge-folders - a member loses the room when the access is revoked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await ownerSetup(apiSdk, paymentsApi);
    const id = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const { data: member, userData } = await apiSdk.addMember("owner", "User");
    const userId = member.response!.id!;
    await invite(apiSdk, id, userId);

    await apiSdk.authenticateMember(userData, "User");
    await expectActingAs(apiSdk, "user", userId);
    const before = await apiSdk
      .forRole("user")
      .aiContext.aiContextGetKnowledgeFolders();
    expect(before.status).toBe(200);
    expect(knowledgeRoomIds(before.data), "the invited user sees it").toEqual([
      String(id),
    ]);

    await apiSdk.authenticateOwner();
    const { status } = await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.None }],
        notify: false,
      },
    });
    expect(status, "the owner revokes the access").toBe(200);
    await expectOwnerSees(ownerApi, id);

    await apiSdk.authenticateMember(userData, "User");
    await expectActingAs(apiSdk, "user", userId);
    await expect
      .poll(
        async () =>
          knowledgeRoomIds(
            (
              await apiSdk
                .forRole("user")
                .aiContext.aiContextGetKnowledgeFolders()
            ).data,
          ),
        { timeout: 30_000 },
      )
      .toEqual([]);
  });

  test("GET /ai/context/get-knowledge-folders - two users each see only the KnowledgeRoom they were invited to", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await ownerSetup(apiSdk, paymentsApi);
    const roomA = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk, "A"),
      RoomType.KnowledgeRoom,
    );
    const roomB = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk, "B"),
      RoomType.KnowledgeRoom,
    );
    const { data: memberA, userData: userA } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const { data: memberB, userData: userB } = await apiSdk.addMember(
      "owner",
      "User",
    );
    await invite(apiSdk, roomA, memberA.response!.id!);
    await invite(apiSdk, roomB, memberB.response!.id!);
    expect(
      [
        ...knowledgeRoomIds(
          (await ownerApi.aiContext.aiContextGetKnowledgeFolders()).data,
        ),
      ].sort(),
      "the owner sees both rooms",
    ).toEqual([String(roomA), String(roomB)].sort());

    // Both are Users, so they share the "user" credential slot: one after the
    // other, each pinned before it is read.
    await apiSdk.authenticateMember(userA, "User");
    await expectActingAs(apiSdk, "user", memberA.response!.id!, "user A");
    const seenByA = await apiSdk
      .forRole("user")
      .aiContext.aiContextGetKnowledgeFolders();

    await apiSdk.authenticateMember(userB, "User");
    await expectActingAs(apiSdk, "user", memberB.response!.id!, "user B");
    const seenByB = await apiSdk
      .forRole("user")
      .aiContext.aiContextGetKnowledgeFolders();

    expect(seenByA.status).toBe(200);
    expect(seenByB.status).toBe(200);
    expect(knowledgeRoomIds(seenByA.data)).toEqual([String(roomA)]);
    expect(knowledgeRoomIds(seenByB.data)).toEqual([String(roomB)]);
  });
});

test.describe("GET /ai/context/get-context-folders - members", () => {
  for (const { label, type, role } of MEMBERS) {
    test(`GET /ai/context/get-context-folders - ${label} gets a JSON array without the owner's rooms`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await ownerSetup(apiSdk, paymentsApi);
      const title = roomTitle(apiSdk);
      const id = await createRoomOfType(
        apiSdk,
        "owner",
        title,
        RoomType.KnowledgeRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        title + " custom",
        RoomType.CustomRoom,
      );
      const { data: member, userData } = await apiSdk.addMember("owner", type);
      await invite(apiSdk, id, member.response!.id!);

      await apiSdk.authenticateMember(userData, type);
      await expectActingAs(apiSdk, role, member.response!.id!, label);
      const { status, data } = await apiSdk
        .forRole(role)
        .aiContext.aiContextGetContextFolders();

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(
        JSON.stringify(data),
        "no room of the owner in a context list",
      ).not.toContain(title);
    });
  }
});
