import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiPrompts } from "@/src/helpers/ai-prompts";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";

// Saved prompts are a per-user store, so the matrix is short: every member owns
// their own library, a Guest has none, and an anonymous caller gets 401.
//
// The interesting part is the isolation half of section 18.1 and the IDOR entries
// of section 22: a prompt id belonging to someone else must not be readable,
// editable or deletable. Two of those three hold; `delete` reports success on a
// prompt it did not touch, which is the bug at the bottom of the file.

const MEMBER_ROLES: Array<{ label: string; type: UserType; role: AgentRole }> =
  [
    { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
  ];

test.describe("AI Prompts - anonymous access", () => {
  test("GET|POST|PUT|DELETE /api/2.0/ai/prompts/* - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
    });
    const folderId = await prompts.createFolderId("owner", "Autotest folder");

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["list", prompts.listPrompts("anonymous")],
      ["get-by-id", prompts.getPrompt("anonymous", promptId)],
      [
        "create",
        prompts.createPrompt("anonymous", { name: "Autotest", text: "Body" }),
      ],
      [
        "update",
        prompts.updatePrompt("anonymous", {
          id: promptId,
          updates: { name: "Autotest hijacked" },
        }),
      ],
      ["move", prompts.movePrompt("anonymous", { id: promptId, folderId })],
      ["delete", prompts.deletePrompt("anonymous", promptId)],
      ["list-folders", prompts.listFolders("anonymous")],
      ["get-folder-by-id", prompts.getFolder("anonymous", folderId)],
      ["create-folder", prompts.createFolder("anonymous", "Autotest")],
      [
        "rename-folder",
        prompts.renameFolder("anonymous", { id: folderId, name: "Autotest" }),
      ],
      ["delete-folder", prompts.deleteFolder("anonymous", folderId)],
      ["export", prompts.exportBundle("anonymous")],
      [
        "import-bundle",
        prompts.importBundle("anonymous", {
          bundle: { version: 1, folders: [], prompts: [] },
        }),
      ],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} as anonymous`).toBe(401);
    }

    // None of the refused writes reached the owner's library.
    await apiSdk.authenticateOwner();
    const read = await prompts.getPrompt("owner", promptId);
    expect(read.data?.name).toBe("Autotest owner prompt");
    expect((await prompts.getFolder("owner", folderId)).data?.id).toBe(
      folderId,
    );
  });
});

test.describe("AI Prompts - role access", () => {
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`GET|POST /api/2.0/ai/prompts/* - ${label} has their own prompt library`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await prompts.expectActingAs(role, memberData.response!.id!, label);

      const listed = await prompts.listPrompts(role);
      expect(listed.status).toBe(200);
      expect(listed.data).toEqual([]);

      const created = await prompts.createPrompt(role, {
        name: `Autotest ${label}`,
        text: "Body",
      });
      expect(created.status).toBe(200);
      expect(created.data?.success).toBe(true);
      const promptId = created.data!.prompt!.id!;

      expect((await prompts.getPrompt(role, promptId)).data?.id).toBe(promptId);

      const folder = await prompts.createFolder(role, `Autotest ${label}`);
      expect(folder.data?.success).toBe(true);

      const moved = await prompts.movePrompt(role, {
        id: promptId,
        folderId: folder.data!.folder!.id!,
      });
      expect(moved.data?.success).toBe(true);

      const exported = await prompts.exportBundle(role);
      expect(exported.status).toBe(200);
      expect(exported.data?.prompts?.map((prompt) => prompt.id)).toEqual([
        promptId,
      ]);

      expect((await prompts.deletePrompt(role, promptId)).data?.success).toBe(
        true,
      );
    });
  }

  test("GET|POST|PUT|DELETE /api/2.0/ai/prompts/* - a Guest has no prompt library", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    // The owner's ids, created before the Guest exists so the shared context's
    // cookie cannot send the Guest's calls as the owner. They give the id-taking
    // routes something real to aim at — a 403 on a made-up id would not
    // distinguish "Guests are refused" from "that id does not exist".
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
    });
    const folderId = await prompts.createFolderId("owner", "Autotest folder");

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await prompts.expectActingAs("guest", guestData.response!.id!, "Guest");

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["list", prompts.listPrompts("guest")],
      ["get-by-id", prompts.getPrompt("guest", promptId)],
      ["create", prompts.createPrompt("guest", { name: "A", text: "Body" })],
      [
        "update",
        prompts.updatePrompt("guest", {
          id: promptId,
          updates: { name: "Autotest hijacked" },
        }),
      ],
      ["move", prompts.movePrompt("guest", { id: promptId, folderId })],
      ["delete", prompts.deletePrompt("guest", promptId)],
      ["list-folders", prompts.listFolders("guest")],
      ["get-folder-by-id", prompts.getFolder("guest", folderId)],
      ["create-folder", prompts.createFolder("guest", "Autotest")],
      [
        "rename-folder",
        prompts.renameFolder("guest", { id: folderId, name: "Autotest guest" }),
      ],
      ["delete-folder", prompts.deleteFolder("guest", folderId)],
      ["export", prompts.exportBundle("guest")],
      [
        "import-bundle",
        prompts.importBundle("guest", {
          bundle: { version: 1, folders: [], prompts: [] },
        }),
      ],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} as Guest`).toBe(403);
    }

    // None of the refused writes reached the owner's library.
    await apiSdk.authenticateOwner();
    const read = await prompts.getPrompt("owner", promptId);
    expect(read.data?.name).toBe("Autotest owner prompt");
    expect(read.data?.folderId).toBeUndefined();
    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(
      "Autotest folder",
    );
  });
});

test.describe("AI Prompts - cross-user isolation", () => {
  test("GET /api/2.0/ai/prompts/list, get-by-id - another user's prompts are invisible", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const secret = `OWNER-SECRET-${apiSdk.faker.generateString(8)}`;

    // All of the owner's setup runs before the member exists, so the shared
    // context's session cookie cannot silently send the member's reads as the
    // owner and turn a leak into self-access.
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: secret,
    });
    const ownerFolder = await prompts.createFolderId("owner", "Autotest owner");

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");

    const listed = await prompts.listPrompts("user");
    expect(listed.status).toBe(200);
    expect(listed.data, "the member's own library is empty").toEqual([]);

    const folders = await prompts.listFolders("user");
    expect(folders.data).toEqual([]);

    // A direct read by id — the IDOR case of section 22.
    const direct = await prompts.getPrompt("user", ownerPrompt);
    expect(direct.status).toBe(200);
    expect(direct.data, "the owner's prompt read by id").toBeNull();

    const directFolder = await prompts.getFolder("user", ownerFolder);
    expect(directFolder.data, "the owner's folder read by id").toBeNull();

    const exported = await prompts.exportBundle("user");
    expect(exported.status).toBe(200);
    expect(exported.data?.prompts).toEqual([]);
    expect(
      JSON.stringify(exported.data),
      "the export must not carry the owner's text",
    ).not.toContain(secret);
  });

  test("PUT /api/2.0/ai/prompts/update, move - another user's prompt cannot be edited", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");

    const memberFolder = await prompts.createFolderId(
      "user",
      "Autotest member",
    );

    const hijack = await prompts.updatePrompt("user", {
      id: ownerPrompt,
      updates: { name: "Autotest hijacked", text: "Hijacked body" },
    });
    expect(hijack.status).toBe(200);
    expect(hijack.data?.success).toBe(false);
    expect(hijack.data?.error?.message).toBe(
      `Prompt not found: ${ownerPrompt}`,
    );

    // Nor can it be dragged into the member's own folder.
    const steal = await prompts.movePrompt("user", {
      id: ownerPrompt,
      folderId: memberFolder,
    });
    expect(steal.data?.success).toBe(false);
    expect((await prompts.listPrompts("user", memberFolder)).data).toEqual([]);

    await apiSdk.authenticateOwner();
    const read = await prompts.getPrompt("owner", ownerPrompt);
    expect(read.data?.name, "the owner's prompt is unchanged").toBe(
      "Autotest owner prompt",
    );
    expect(read.data?.text).toBe("Owner body");
    expect(read.data?.folderId).toBeUndefined();
  });

  test("BUG 82809: DELETE /api/2.0/ai/prompts/delete - deleting another user's prompt reports success", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");

    const { status, data } = await prompts.deletePrompt("user", ownerPrompt);
    expect(status).toBe(200);
    expect(data?.success, "the call reports the delete succeeded").toBe(true);

    // The data is safe — the store is scoped, so nothing was actually removed.
    // The defect is the answer: a caller cannot tell "deleted" from "not yours",
    // and the neighbouring update/move on the same id do report "not found".
    await apiSdk.authenticateOwner();
    const survived = await prompts.getPrompt("owner", ownerPrompt);
    expect(survived.data?.id, "the owner's prompt survives").toBe(ownerPrompt);

    test.fail();
    expect(
      data?.success,
      "deleting a prompt the caller does not own must not report success",
    ).toBe(false);
  });

  test("PUT /api/2.0/ai/prompts/rename-folder - another user's folder cannot be renamed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const ownerFolder = await prompts.createFolderId("owner", "Autotest owner");

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");

    const { status, data } = await prompts.renameFolder("user", {
      id: ownerFolder,
      name: "Autotest hijacked",
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(`Folder not found: ${ownerFolder}`);

    await apiSdk.authenticateOwner();
    expect(
      (await prompts.getFolder("owner", ownerFolder)).data?.name,
      "the owner's folder keeps its name",
    ).toBe("Autotest owner");
  });

  test("BUG 83138 FIXED: DELETE /api/2.0/ai/prompts/delete-folder - deleting another user's folder is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    // delete-folder is the one write with a blast radius: it cascade-deletes the
    // prompts inside. So the folder gets a prompt, and the prompt is what the
    // assertions read — a folder that survived while its contents were wiped
    // would otherwise look like a pass.
    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const ownerFolder = await prompts.createFolderId("owner", "Autotest owner");
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Owner body",
      folderId: ownerFolder,
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");

    // Used to answer 200 `{success:true}` while deleting nothing, so a caller
    // could not tell "deleted" from "not yours". Now matches rename-folder one
    // test up: the same id, for the same caller, is "Folder not found".
    const { status, error } = await prompts.deleteFolder("user", ownerFolder);
    expect(status, "deleting a folder the caller does not own").toBe(404);
    expect(error).toContain("Folder not found");

    // Untouched either way.
    await apiSdk.authenticateOwner();
    expect(
      (await prompts.getFolder("owner", ownerFolder)).data?.id,
      "the owner's folder survives",
    ).toBe(ownerFolder);
    expect(
      (await prompts.getPrompt("owner", ownerPrompt)).data?.id,
      "and so does the prompt inside it",
    ).toBe(ownerPrompt);
  });
});

test.describe("AI Prompts - AI Disabled", () => {
  test("GET|POST|PUT|DELETE /api/2.0/ai/prompts/* - the whole surface returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
    });
    const folderId = await prompts.createFolderId("owner", "Autotest folder");

    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["list", prompts.listPrompts("owner")],
      ["get-by-id", prompts.getPrompt("owner", promptId)],
      [
        "create",
        prompts.createPrompt("owner", { name: "Autotest", text: "B" }),
      ],
      [
        "update",
        prompts.updatePrompt("owner", {
          id: promptId,
          updates: { name: "Autotest off" },
        }),
      ],
      ["move", prompts.movePrompt("owner", { id: promptId, folderId })],
      ["delete", prompts.deletePrompt("owner", promptId)],
      ["list-folders", prompts.listFolders("owner")],
      ["get-folder-by-id", prompts.getFolder("owner", folderId)],
      ["create-folder", prompts.createFolder("owner", "Autotest off")],
      [
        "rename-folder",
        prompts.renameFolder("owner", { id: folderId, name: "Autotest off" }),
      ],
      ["delete-folder", prompts.deleteFolder("owner", folderId)],
      ["export", prompts.exportBundle("owner")],
      [
        "import-bundle",
        prompts.importBundle("owner", {
          bundle: { version: 1, folders: [], prompts: [] },
        }),
      ],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} with AI access disabled`).toBe(403);
    }

    // Switching AI back on shows the refused writes changed nothing.
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);

    const read = await prompts.getPrompt("owner", promptId);
    expect(read.data?.name).toBe("Autotest owner prompt");
    expect(read.data?.folderId).toBeUndefined();
    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(
      "Autotest folder",
    );
    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      promptId,
    ]);
  });
});
