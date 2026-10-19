import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  createKnowledgeFile,
} from "@/src/helpers/ai-vectorization";
import { inviteToAgent } from "@/src/helpers/ai-agent-chat";
import { FileShare } from "@onlyoffice/docspace-api-sdk";

// POST /ai/vectorization/tasks — authorization across TWO agents. The existing
// permission spec covers a caller with the wrong role in the file's own agent
// (Viewer) and a caller who is not in it at all. This is the case in between,
// and the one BUG 80736 is really about: a caller who IS a manager somewhere
// else, naming a file by its id.
//
// Measured 2026-10-09: a RoomAdmin who is a RoomManager of agent A and has no
// access of any kind to agent B starts a task for B's file and gets 200 — alone
// and in a list next to A's own file. Whether B's file then gets (re)indexed
// cannot be seen from outside, but the answer is a green light for a file the
// caller cannot open, on nothing but its id. The expectation is the one the
// existing BUG 80736 tests state: a refusal, 403.
//
// The mixed list is expected to be refused as a whole, not accepted in part. A
// partial acceptance would be unobservable (there is no task to read), and the
// route already treats a list as one unit — one id that does not exist refuses
// the lot with a 404 (vectorization.validation.spec.ts).

test.describe("Vectorization - startTask across agents", () => {
  test("BUG 80736: POST /api/2.0/ai/vectorization/tasks - a manager of one agent cannot start a task for a file of an agent they have no access to", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const own = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest Vectorization Agent A",
    );
    const foreign = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest Vectorization Agent B",
    );
    const ownFile = await createKnowledgeFile(
      ownerApi,
      own.knowledgeFolderId,
      "Autotest Own Agent File.docx",
    );
    const foreignFile = await createKnowledgeFile(
      ownerApi,
      foreign.knowledgeFolderId,
      "Autotest Foreign Agent File.docx",
    );

    const { data: member, userData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    await inviteToAgent(
      ownerApi.rooms,
      own.agentId,
      member.response!.id!,
      FileShare.RoomManager,
    );
    const memberApi = await apiSdk.authenticateMember(userData, "RoomAdmin");

    // The control, and the premise of the whole test: the same caller IS allowed
    // on the file of the agent they manage, and cannot open the other one.
    const control = await memberApi.vectorization.aiVectorizationStartTask({
      aiVectorizationStartTaskRequest: { files: [ownFile] },
    });
    expect(control.status, "a manager starts a task in their own agent").toBe(
      200,
    );
    const { status: openStatus } = await memberApi.files.getFileInfo({
      fileId: foreignFile,
    });
    expect(openStatus, "the caller cannot even read the foreign file").toBe(
      403,
    );

    const alone = await memberApi.vectorization.aiVectorizationStartTask({
      aiVectorizationStartTaskRequest: { files: [foreignFile] },
    });

    test.fail();
    expect(
      alone.status,
      "a file of an agent the caller has no access to must be refused",
    ).toBe(403);
  });

  test("BUG 80736: POST /api/2.0/ai/vectorization/tasks - a list that mixes a file the caller manages with one they cannot open is refused as a whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const own = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest Vectorization Agent A",
    );
    const foreign = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest Vectorization Agent B",
    );
    const ownFile = await createKnowledgeFile(
      ownerApi,
      own.knowledgeFolderId,
      "Autotest Own Agent File.docx",
    );
    const foreignFile = await createKnowledgeFile(
      ownerApi,
      foreign.knowledgeFolderId,
      "Autotest Foreign Agent File.docx",
    );

    const { data: member, userData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    await inviteToAgent(
      ownerApi.rooms,
      own.agentId,
      member.response!.id!,
      FileShare.RoomManager,
    );
    const memberApi = await apiSdk.authenticateMember(userData, "RoomAdmin");

    expect(
      (
        await memberApi.vectorization.aiVectorizationStartTask({
          aiVectorizationStartTaskRequest: { files: [ownFile] },
        })
      ).status,
      "the control: the file the caller manages is accepted on its own",
    ).toBe(200);

    // Both orders: a check that only looks at the first id would pass one of them.
    const results = [];
    for (const files of [
      [ownFile, foreignFile],
      [foreignFile, ownFile],
    ]) {
      const { status } = await memberApi.vectorization.aiVectorizationStartTask(
        {
          aiVectorizationStartTaskRequest: { files },
        },
      );
      results.push(status);
    }

    test.fail();
    expect(
      results,
      "a list holding a file the caller cannot open must be refused, in either order",
    ).toEqual([403, 403]);
  });
});
