import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";

// `POST /api/2.0/ai/messages/{messageId}/export` and
// `POST /api/2.0/ai/chats/{chatId}/messages/export` are both 404 — the
// message-export feature was replaced by `POST /api/2.0/ai/text-to-docx`, which
// takes the text itself instead of a message id:
//
//   { title, content, folderId } -> 202 { success: true }
//
// The old permission suite (member-of-agent / Viewer-role matrices, BUG 80770,
// BUG 80772, BUG 80779) was written against the removed endpoint and no longer
// has anything to assert: the new endpoint takes no message and no agent, so
// agent membership cannot gate it. What it does gate on is the caller being the
// portal Owner, which is covered below.

test.describe("AI Messages - text-to-docx export", () => {
  test("POST /api/2.0/ai/text-to-docx - Owner exports text to My Documents", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const { data, status } = await aiSettings.textToDocx("owner", {
      title: "Exported AI Message",
      content: "The assistant said hello.",
      folderId,
    });

    expect(status).toBe(202);
    expect(data?.success).toBe(true);
  });

  test("POST /api/2.0/ai/text-to-docx - the exported file lands in the target folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;
    const title = `Exported ${apiSdk.faker.generateString(8)}`;

    const { status } = await aiSettings.textToDocx("owner", {
      title,
      content: "The assistant said hello.",
      folderId,
    });
    expect(status).toBe(202);

    // 202: generation is asynchronous, so poll the folder for the new file.
    let titles: string[] = [];
    let found = false;
    for (let attempt = 0; attempt < 20 && !found; attempt++) {
      const { data: folder } = await ownerApi.folders.getFolderByFolderId({
        folderId,
      });
      titles = (folder.response?.files ?? []).map((file) => file.title ?? "");
      found = titles.some((name) => name.startsWith(title));
      if (!found) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    expect(found, `expected a file named "${title}" among ${titles}`).toBe(
      true,
    );
  });
});

test.describe("AI Messages - text-to-docx validation", () => {
  for (const { name, body } of [
    { name: "an empty title", body: { title: "", content: "hello" } },
    { name: "a missing title", body: { content: "hello" } },
    { name: "empty content", body: { title: "T", content: "" } },
    { name: "missing content", body: { title: "T" } },
  ]) {
    test(`POST /api/2.0/ai/text-to-docx - rejects ${name}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      const { data: myFolder } = await ownerApi.folders.getMyFolder({});
      const folderId = myFolder.response!.current!.id!;

      const { status, error } = await aiSettings.textToDocx("owner", {
        ...body,
        folderId,
      });

      expect(error).toBe("title and content are required");
      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/text-to-docx - rejects a missing folderId", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.textToDocx("owner", {
      title: "T",
      content: "hello",
    });

    expect(error).toBe("folderId is required");
    expect(status).toBe(400);
  });

  test("BUG XXXXX: POST /api/2.0/ai/text-to-docx - a non-existent folderId returns 500 instead of 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status } = await aiSettings.textToDocx("owner", {
      title: "T",
      content: "hello",
      folderId: 999999999,
    });

    // An unreachable target folder is a client error, not a server crash.
    test.fail();
    expect(status).toBe(404);
  });
});

test.describe("AI Messages - text-to-docx permissions", () => {
  for (const { type, role } of [
    { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { type: "RoomAdmin", role: "roomAdmin" },
    { type: "User", role: "user" },
    { type: "Guest", role: "guest" },
  ] as Array<{ type: UserType; role: AgentRole }>) {
    test(`POST /api/2.0/ai/text-to-docx - ${role} is forbidden`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      const { data: myFolder } = await ownerApi.folders.getMyFolder({});
      const folderId = myFolder.response!.current!.id!;

      await apiSdk.addAuthenticatedMember("owner", type);

      const { status, error } = await aiSettings.textToDocx(role, {
        title: "Exported AI Message",
        content: "hello",
        folderId,
      });

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });
  }

  test("POST /api/2.0/ai/text-to-docx - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const { status, error } = await aiSettings.textToDocx("anonymous", {
      title: "Exported AI Message",
      content: "hello",
      folderId,
    });

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });
});
