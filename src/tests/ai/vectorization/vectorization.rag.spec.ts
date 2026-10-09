import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  waitForVectorization,
} from "@/src/helpers/ai-vectorization";
import {
  AiAgentChat,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";
import { uploadFileViaSession } from "@/src/helpers/upload-file";
import { ApiSDK } from "@/src/services/api-sdk";
import { VectorizationStatus } from "@onlyoffice/docspace-api-sdk";

// What indexing is FOR: a file in an agent's Knowledge folder is found by the
// agent's `knowledge_search` tool. `vectorizationStatus` says a file was indexed;
// only a question the model can answer from nothing but that file says the index
// can be used — and that it is the right agent's index.
//
// The tests spend real model tokens (a chat round each), so there are two, and
// each asks one question per agent. The answer is a made-up codename the model
// cannot have in its weights, so a reply carrying it can only have come from the
// file.
//
// Not covered here, and why:
//   * re-indexing after a file's content changes: Knowledge indexes a file when
//     it ARRIVES, and the route takes no content — there is no stable way to
//     change what a stored file says and then tell a stale index from a fresh
//     one without a second model round per attempt;
//   * "changing the embedding provider does not re-index" — the provider is the
//     gateway's and there is no setting to change on a test portal;
//   * indexing billed on arrival: already pinned in ai/billing/billing.spec.ts
//     (the `Vectorization` operation of the add-on's meter).

const KNOWLEDGE_SEARCH = /knowledge_search/;

function secretMemo(apiSdk: ApiSDK) {
  const project = `ZB${apiSdk.faker.generateString(6).toUpperCase()}`;
  const codename = `QUILL${apiSdk.faker.generateString(8).toUpperCase()}`;
  return {
    project,
    codename,
    text: [
      `Internal memo about project ${project}.`,
      `The secret launch codename of project ${project} is ${codename}.`,
      "Do not share the codename outside the project team.",
    ].join("\n"),
    question: (agent: string) =>
      `Search your knowledge base (${agent}) and tell me: what is the secret launch codename of project ${project}? Answer with the codename only if you found it, otherwise say you did not find it.`,
  };
}

async function ask(
  aiChat: AiAgentChat,
  profileId: string,
  agentId: number,
  title: string,
  message: string,
) {
  const threadId = await aiChat.createThreadId("owner", {
    title,
    profileId,
    agentId,
  });
  const sent = await aiChat.sendMessage("owner", {
    threadId,
    agentId,
    profileId,
    message,
    timeoutMs: 240000,
  });
  expect(sent.status).toBe(200);
  expect(sent.streamError).toBeUndefined();

  const messages = await aiChat.waitForAssistantReply("owner", threadId);
  expectHealthyAssistantReply(messages);
  const reply = AiAgentChat.assistantMessages(messages).at(-1)!;
  return {
    text: AiAgentChat.messageText(reply),
    tools: AiAgentChat.toolCalls(reply).map((part) => part.toolName ?? ""),
  };
}

test.describe("Vectorization - the index is used by the agent that owns it", () => {
  test("POST /api/2.0/ai/vectorization/tasks - a submitted file is found by its agent's knowledge_search and not by another agent's", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const withFile = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest RAG Agent With File",
    );
    const withoutFile = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest RAG Agent Without File",
    );

    const memo = secretMemo(apiSdk);
    const upload = await uploadFileViaSession(
      apiSdk,
      "owner",
      withFile.knowledgeFolderId,
      Buffer.from(memo.text, "utf-8"),
      "autotest-memo.txt",
      "text/plain",
    );
    const fileId = (upload.data as { response?: { id?: number } }).response?.id;
    expect(upload.status, "uploading the memo").toBe(201);
    expect(fileId, "the memo was stored").toBeTruthy();

    // Explicitly submit it as well. The file is indexed on arrival anyway, so
    // this does not prove the call did it — it proves the call is harmless on an
    // indexed file and that the end state below is the submitted file's.
    const { status } = await ownerApi.vectorization.aiVectorizationStartTask({
      aiVectorizationStartTaskRequest: { files: [fileId!] },
    });
    expect(status).toBe(200);
    expect(await waitForVectorization(ownerApi, fileId!)).toBe(
      VectorizationStatus.Completed,
    );

    // The positive control comes first and is the thing that gives the absence
    // below its meaning: with the file, the agent finds the codename.
    const found = await ask(
      aiChat,
      profileId,
      withFile.agentId,
      "RAG with the file",
      memo.question("with the file"),
    );
    expect(
      found.tools.filter((name) => KNOWLEDGE_SEARCH.test(name)),
      `the agent searched its knowledge; tools were ${JSON.stringify(found.tools)}`,
    ).not.toHaveLength(0);
    expect(found.text, "the codename came out of the indexed file").toContain(
      memo.codename,
    );

    // The same question to an agent whose Knowledge folder is empty: the file
    // belongs to the other agent's index, so nothing here may produce the
    // codename — the model has no other way to know it.
    const missed = await ask(
      aiChat,
      profileId,
      withoutFile.agentId,
      "RAG without the file",
      memo.question("without the file"),
    );
    expect(
      missed.text,
      "the other agent's index must not leak into this one",
    ).not.toContain(memo.codename);
  });

  test("POST /api/2.0/ai/threads/create - a user with no access to the agent cannot reach its indexed content", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const agent = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest RAG Private Agent",
    );
    const memo = secretMemo(apiSdk);
    const upload = await uploadFileViaSession(
      apiSdk,
      "owner",
      agent.knowledgeFolderId,
      Buffer.from(memo.text, "utf-8"),
      "autotest-private-memo.txt",
      "text/plain",
    );
    const fileId = (upload.data as { response?: { id?: number } }).response?.id;
    expect(fileId, "the memo was stored").toBeTruthy();
    expect(await waitForVectorization(ownerApi, fileId!)).toBe(
      VectorizationStatus.Completed,
    );

    // The control: the owner CAN open a thread in the agent, so the 403 below is
    // about the caller and not about the agent.
    const own = await aiChat.createThread("owner", {
      title: "Owner thread",
      profileId,
      agentId: agent.agentId,
    });
    expect(own.status, "the owner opens a thread in the agent").toBe(200);

    const { data, userData } = await apiSdk.addMember("owner", "User");
    expect(data.response?.id).toBeTruthy();
    await apiSdk.authenticateMember(userData, "User");

    const refused = await aiChat.createThread("user", {
      title: "Stranger thread",
      profileId,
      agentId: agent.agentId,
    });
    expect(
      refused.status,
      "a user who is not in the agent cannot open a thread in it",
    ).toBe(403);
  });
});
