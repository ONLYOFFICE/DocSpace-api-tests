import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  createKnowledgeFile,
} from "@/src/helpers/ai-vectorization";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";

const ROLES = ["DocSpaceAdmin", "RoomAdmin", "User", "Guest"] as const;

test.describe("Vectorization - startTask permissions", () => {
  test("POST /api/2.0/ai/vectorization/tasks - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // AI is enabled first so the 401 cannot come from a disabled-AI 403 instead.
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const anonApi = apiSdk.forAnonymous();

    // File id 1 need not exist: authentication must be rejected before the
    // endpoint looks the file up.
    const { status } = await anonApi.vectorization.aiVectorizationStartTask({
      requestBody: {
        files: new Set([1]),
      },
    });

    expect(status).toBe(401);
  });

  // The member gets the id of a REAL file the owner created in the agent's
  // Knowledge folder, so a rejection can only be about the caller's rights —
  // passing a folder id here would let the endpoint fail on the input instead.
  for (const role of ROLES) {
    test.fail(
      `BUG 80736: POST /api/2.0/ai/vectorization/tasks - ${role} with Viewer role cannot start vectorization task`,
      async ({ apiSdk, paymentsApi }) => {
        const ownerApi = apiSdk.forRole("owner");

        await enableAiGateway(paymentsApi, ownerApi.payment);

        const { agentId, knowledgeFolderId } =
          await createAgentWithKnowledgeFolder(apiSdk);

        const fileId = await createKnowledgeFile(
          ownerApi,
          knowledgeFolderId,
          `Autotest Vectorization Viewer ${role}.docx`,
        );

        const { data: memberData, userData } = await apiSdk.addMember(
          "owner",
          role,
        );

        await ownerApi.rooms.setRoomSecurity({
          id: agentId,
          roomInvitationRequest: {
            invitations: [
              { id: memberData.response!.id!, access: FileShare.Read },
            ],
            notify: false,
          },
        });

        const memberApi = await apiSdk.authenticateMember(userData, role);

        const { status } =
          await memberApi.vectorization.aiVectorizationStartTask({
            requestBody: {
              files: new Set([fileId]),
            },
          });

        expect(status).toBe(403);
      },
    );
  }

  test("BUG 83255: POST /api/2.0/ai/vectorization/tasks - a Guest who may edit the file still starts a vectorization task", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Distinct from the BUG 80736 pair around it, and it survives their fix. Those
    // two measure a caller with no rights over the file; this Guest holds Content
    // Creator in the room the file lives in, so an access check cannot refuse them.
    // The rule being asked for here is the user type: a Guest has no access to the
    // AI stack — how BUG 83237 was resolved — and vectorization is AI work billed
    // to the portal's wallet.
    //
    // Status-only, unavoidably: `vectorizationStatus` exists only on files in an
    // agent's Knowledge folder (see ai-vectorization.ts) and there is no read route
    // for tasks, so whether the submitted task ran is not observable for a room
    // file. What the premise below does establish is that the 403 a fix produces
    // will not be about the file.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Vectorization Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const fileId = await createKnowledgeFile(
      ownerApi,
      roomId,
      "Autotest Vectorization Guest.docx",
    );

    const { data: guestData, userData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          {
            id: guestData.response!.id!,
            access: FileShare.ContentCreator,
          },
        ],
        notify: false,
      },
    });
    expect(inviteStatus, "the owner invites the Guest as Content Creator").toBe(
      200,
    );

    const guestApi = await apiSdk.authenticateMember(userData, "Guest");

    // The premise: this Guest really does have the file, so the refusal a fix
    // brings can only be about the user type.
    const { status: readStatus } = await guestApi.files.getFileInfo({
      fileId,
    });
    expect(readStatus, "the Guest can read the file they submit").toBe(200);

    const { status } = await guestApi.vectorization.aiVectorizationStartTask({
      requestBody: {
        files: new Set([fileId]),
      },
    });

    test.fail();
    expect(status).toBe(403);
  });

  for (const role of ROLES) {
    test.fail(
      `BUG 80736: POST /api/2.0/ai/vectorization/tasks - ${role} not added to agent cannot start vectorization task`,
      async ({ apiSdk, paymentsApi }) => {
        const ownerApi = apiSdk.forRole("owner");

        await enableAiGateway(paymentsApi, ownerApi.payment);

        const { knowledgeFolderId } =
          await createAgentWithKnowledgeFolder(apiSdk);

        const fileId = await createKnowledgeFile(
          ownerApi,
          knowledgeFolderId,
          `Autotest Vectorization Outsider ${role}.docx`,
        );

        const { api: memberApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          role,
        );

        const { status } =
          await memberApi.vectorization.aiVectorizationStartTask({
            requestBody: {
              files: new Set([fileId]),
            },
          });

        expect(status).toBe(403);
      },
    );
  }
});
// TODO: Expand the list of user role tests in the agent after fixing the bug
