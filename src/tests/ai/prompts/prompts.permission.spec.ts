import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiPrompts,
  libraryShape,
  ownerPrompts,
} from "@/src/helpers/ai-prompts";
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

// ---------------------------------------------------------------------------
// Isolation, second half: folders, the library-wide routes, and proof that a
// refused call leaves the owner's data exactly as it was. Every "unchanged"
// below is a full `export` snapshot with timestamps, not a spot check of one
// field, and the owner's snapshot is taken before the second user exists (the
// shared context's cookie would otherwise answer as the wrong person).

type SoftAnswer = {
  data?: { success?: boolean; error?: { message?: string } };
};

test.describe("AI Prompts - cross-user isolation (folders and library-wide routes)", () => {
  test("POST create, PUT move, update - a prompt cannot be put into, or pulled out of, another user's folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const ownerFolder = await prompts.createFolderId("owner", "Autotest owner");
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
      folderId: ownerFolder,
    });
    const ownerBefore = await prompts.snapshot("owner");

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");
    await prompts.createFolderId("user", "Autotest member");
    const memberPrompt = await prompts.createPromptId("user", {
      name: "Autotest member prompt",
      text: "Member body",
    });
    const memberBefore = await prompts.snapshot("user");

    const noFolder = `Folder not found: ${ownerFolder}`;
    const noPrompt = `Prompt not found: ${ownerPrompt}`;
    const refusals: Array<[string, () => Promise<SoftAnswer>, string]> = [
      [
        "create a prompt in the owner's folder",
        () =>
          prompts.createPrompt("user", {
            name: "Autotest planted",
            text: "x",
            folderId: ownerFolder,
          }),
        noFolder,
      ],
      [
        "move the member's own prompt into the owner's folder",
        () =>
          prompts.movePrompt("user", {
            id: memberPrompt,
            folderId: ownerFolder,
          }),
        noFolder,
      ],
      [
        "update{folderId} of the member's prompt to the owner's folder",
        () =>
          prompts.updatePrompt("user", {
            id: memberPrompt,
            updates: { folderId: ownerFolder },
          }),
        noFolder,
      ],
      [
        "update{name, folderId} of the member's prompt to the owner's folder",
        () =>
          prompts.updatePrompt("user", {
            id: memberPrompt,
            updates: { name: "Autotest renamed", folderId: ownerFolder },
          }),
        noFolder,
      ],
      [
        "move the owner's prompt out to the member's root",
        () => prompts.movePrompt("user", { id: ownerPrompt, folderId: null }),
        noPrompt,
      ],
      [
        "update{folderId: null} of the owner's prompt",
        () =>
          prompts.updatePrompt("user", {
            id: ownerPrompt,
            updates: { folderId: null },
          }),
        noPrompt,
      ],
    ];

    for (const [label, call, message] of refusals) {
      const { data } = await call();
      expect.soft(data?.success, label).toBe(false);
      expect.soft(data?.error?.message, label).toBe(message);
    }

    // Reads aimed at the owner's folder find nothing — the folder is not
    // "empty", it is not there as far as this user can tell.
    expect((await prompts.getFolder("user", ownerFolder)).data).toBeNull();
    expect((await prompts.listPrompts("user", ownerFolder)).data).toEqual([]);

    expect(
      await prompts.snapshot("user"),
      "the member's own library is untouched",
    ).toEqual(memberBefore);
    await apiSdk.authenticateOwner();
    expect(
      await prompts.snapshot("owner"),
      "so is the owner's, with the prompt still inside its folder",
    ).toEqual(ownerBefore);
    expect(
      (await prompts.listPrompts("owner", ownerFolder)).data.map((p) => p.id),
      "positive control: the folder the member could not see is really there",
    ).toEqual([ownerPrompt]);
  });

  test("POST create, create-folder, GET export - two users may use the same names, and each export holds only its own library", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const ownerSecret = `OWNER-${apiSdk.faker.generateString(8)}`;
    const ownerFolder = await prompts.createFolderId(
      "owner",
      "Autotest shared",
    );
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest shared",
      text: ownerSecret,
      folderId: ownerFolder,
    });
    const ownerBefore = await prompts.snapshot("owner");

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");
    const memberSecret = `MEMBER-${apiSdk.faker.generateString(8)}`;

    // Same folder name and same prompt name: no conflict across users.
    const memberFolder = await prompts.createFolderId(
      "user",
      "Autotest shared",
    );
    const memberPrompt = await prompts.createPromptId("user", {
      name: "Autotest shared",
      text: memberSecret,
      folderId: memberFolder,
    });
    expect(memberFolder).not.toBe(ownerFolder);
    expect(memberPrompt).not.toBe(ownerPrompt);

    const memberExport = await prompts.exportBundle("user");
    expect(memberExport.data?.prompts?.map((p) => p.id)).toEqual([
      memberPrompt,
    ]);
    expect(memberExport.data?.folders?.map((f) => f.id)).toEqual([
      memberFolder,
    ]);
    expect(JSON.stringify(memberExport.data)).not.toContain(ownerSecret);

    await apiSdk.authenticateOwner();
    const ownerExport = await prompts.exportBundle("owner");
    expect(ownerExport.data?.prompts?.map((p) => p.id)).toEqual([ownerPrompt]);
    expect(JSON.stringify(ownerExport.data)).not.toContain(memberSecret);
    expect(
      await prompts.snapshot("owner"),
      "the member's writes did not touch the owner's library",
    ).toEqual(ownerBefore);
  });

  test("POST import-bundle, DELETE delete-folder - a member's replace-import and deletes change only the member's library, and bundle ids cannot name the owner's rows", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const ownerFolder = await prompts.createFolderId("owner", "Autotest owner");
    const ownerPrompt = await prompts.createPromptId("owner", {
      name: "Autotest owner prompt",
      text: "Owner body",
      folderId: ownerFolder,
    });
    await prompts.createPromptId("owner", {
      name: "Autotest owner root",
      text: "Owner root body",
    });
    const ownerBefore = await prompts.snapshot("owner");

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await prompts.expectActingAs("user", memberData.response!.id!, "User");
    const memberOldFolder = await prompts.createFolderId(
      "user",
      "Autotest old",
    );
    await prompts.createPromptId("user", {
      name: "Autotest old prompt",
      text: "Old",
      folderId: memberOldFolder,
    });

    // The bundle reuses the owner's own ids. They are ignored: the member's
    // rows get fresh ids and the owner's rows are not written through them.
    const { status, data } = await prompts.importBundle("user", {
      bundle: {
        version: 1,
        folders: [{ id: ownerFolder, name: "Autotest imported" }],
        prompts: [
          {
            id: ownerPrompt,
            name: "Autotest imported prompt",
            text: "Imported body",
            folderId: ownerFolder,
          },
        ],
      },
      options: { mode: "replace" },
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.imported).toEqual({ folders: 1, prompts: 1 });

    const memberAfter = await prompts.snapshot("user");
    expect(libraryShape(memberAfter)).toEqual({
      folders: ["Autotest imported"],
      prompts: ["Autotest imported/Autotest imported prompt: Imported body"],
    });
    expect(
      memberAfter.folders.map((folder) => folder.id),
      "the member's new folder id is not the owner's",
    ).not.toContain(ownerFolder);
    expect(
      memberAfter.prompts.map((prompt) => prompt.id),
      "the member's new prompt id is not the owner's",
    ).not.toContain(ownerPrompt);

    // And the member's own cleanup stays inside their library too.
    const newFolder = memberAfter.folders[0].id!;
    expect((await prompts.deleteFolder("user", newFolder)).data?.success).toBe(
      true,
    );
    expect((await prompts.deleteFolder("user", ownerFolder)).status).toBe(404);

    await apiSdk.authenticateOwner();
    expect(
      await prompts.snapshot("owner"),
      "the owner's library is byte-identical after all of it",
    ).toEqual(ownerBefore);
  });
});

test.describe("AI Prompts - the rest of the surface for each member role", () => {
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`PUT update, rename-folder, DELETE delete-folder, GET get-folder-by-id, list-folders, POST import-bundle - ${label} manages their own library`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      await prompts.createPromptId("owner", {
        name: "Autotest owner prompt",
        text: "Owner body",
      });
      const ownerBefore = await prompts.snapshot("owner");

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await prompts.expectActingAs(role, memberData.response!.id!, label);

      const folderId = await prompts.createFolderId(role, `Autotest ${label}`);
      const promptId = await prompts.createPromptId(role, {
        name: `Autotest ${label}`,
        text: "Body",
        folderId,
      });

      const updated = await prompts.updatePrompt(role, {
        id: promptId,
        updates: { text: "Edited body" },
      });
      expect(updated.status).toBe(200);
      expect(updated.data?.success).toBe(true);
      expect((await prompts.getPrompt(role, promptId)).data?.text).toBe(
        "Edited body",
      );

      const renamed = await prompts.renameFolder(role, {
        id: folderId,
        name: `Autotest ${label} renamed`,
      });
      expect(renamed.status).toBe(200);
      expect(renamed.data?.success).toBe(true);
      expect((await prompts.getFolder(role, folderId)).data?.name).toBe(
        `Autotest ${label} renamed`,
      );
      expect(
        (await prompts.listFolders(role)).data.map((folder) => folder.id),
      ).toEqual([folderId]);

      const imported = await prompts.importBundle(role, {
        bundle: {
          version: 1,
          folders: [],
          prompts: [{ id: "x", name: `Autotest ${label} imported`, text: "t" }],
        },
        options: { mode: "merge" },
      });
      expect(imported.status).toBe(200);
      expect(imported.data?.success).toBe(true);
      expect(imported.data?.imported).toEqual({ folders: 0, prompts: 1 });

      const removed = await prompts.deleteFolder(role, folderId);
      expect(removed.status).toBe(200);
      expect(removed.data?.success).toBe(true);
      expect(
        (await prompts.getPrompt(role, promptId)).data,
        "the prompt went with its folder",
      ).toBeNull();
      expect(
        (await prompts.listPrompts(role)).data.map((prompt) => prompt.name),
      ).toEqual([`Autotest ${label} imported`]);

      await apiSdk.authenticateOwner();
      expect(
        await prompts.snapshot("owner"),
        "none of it reached the owner's library",
      ).toEqual(ownerBefore);
    });
  }
});

// A caller who is refused must also leave the library alone. The calls are the
// writes with the widest reach: create, rename, move, both deletes and — the
// dangerous one — a replace-import, which would empty the library if it got
// through. The statuses are the ones the tests above already pin for each state;
// what is new is the byte-for-byte comparison afterwards.

type RefusedCall = [string, () => Promise<{ status: number }>];

function writesAimedAt(
  prompts: AiPrompts,
  role: AgentRole,
  ids: { promptId: string; folderId: string },
): RefusedCall[] {
  return [
    [
      "create",
      () => prompts.createPrompt(role, { name: "Autotest planted", text: "x" }),
    ],
    [
      "create in the folder",
      () =>
        prompts.createPrompt(role, {
          name: "Autotest planted",
          text: "x",
          folderId: ids.folderId,
        }),
    ],
    ["create-folder", () => prompts.createFolder(role, "Autotest planted")],
    [
      "update",
      () =>
        prompts.updatePrompt(role, {
          id: ids.promptId,
          updates: { name: "Autotest hijacked", text: "Hijacked" },
        }),
    ],
    [
      "move to the root",
      () => prompts.movePrompt(role, { id: ids.promptId, folderId: null }),
    ],
    [
      "rename-folder",
      () =>
        prompts.renameFolder(role, {
          id: ids.folderId,
          name: "Autotest hijacked",
        }),
    ],
    ["delete", () => prompts.deletePrompt(role, ids.promptId)],
    ["delete-folder", () => prompts.deleteFolder(role, ids.folderId)],
    [
      "import-bundle merge",
      () =>
        prompts.importBundle(role, {
          bundle: {
            version: 1,
            folders: [{ id: "f", name: "Autotest planted" }],
            prompts: [{ id: "p", name: "Autotest planted", text: "x" }],
          },
          options: { mode: "merge" },
        }),
    ],
    [
      "import-bundle replace",
      () =>
        prompts.importBundle(role, {
          bundle: {
            version: 1,
            folders: [],
            prompts: [{ id: "p", name: "Autotest planted", text: "x" }],
          },
          options: { mode: "replace" },
        }),
    ],
  ];
}

async function seedForRefusals(prompts: AiPrompts) {
  const folderId = await prompts.createFolderId("owner", "Autotest owner");
  const promptId = await prompts.createPromptId("owner", {
    name: "Autotest owner prompt",
    text: "Owner body",
    folderId,
  });
  await prompts.createPromptId("owner", {
    name: "Autotest owner root",
    text: "Owner root body",
  });
  return { folderId, promptId };
}

test.describe("AI Prompts - refused callers leave the library byte-identical", () => {
  test("GET|POST|PUT|DELETE /api/2.0/ai/prompts/* - Anonymous: every write, replace-import included, is 401 and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const ids = await seedForRefusals(prompts);
    const before = await prompts.snapshot("owner");
    expect(
      before.prompts,
      "something a replace-import could wipe",
    ).toHaveLength(2);

    for (const [label, call] of writesAimedAt(prompts, "anonymous", ids)) {
      expect.soft((await call()).status, label).toBe(401);
    }

    await apiSdk.authenticateOwner();
    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("GET|POST|PUT|DELETE /api/2.0/ai/prompts/* - Guest: every write, replace-import included, is 403 and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const ids = await seedForRefusals(prompts);
    const before = await prompts.snapshot("owner");

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await prompts.expectActingAs("guest", guestData.response!.id!, "Guest");

    for (const [label, call] of writesAimedAt(prompts, "guest", ids)) {
      expect.soft((await call()).status, label).toBe(403);
    }

    await apiSdk.authenticateOwner();
    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("GET|POST|PUT|DELETE /api/2.0/ai/prompts/* - AI disabled: every write, replace-import included, is 403 and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const ids = await seedForRefusals(prompts);
    const before = await prompts.snapshot("owner");

    const off = await setPortalAiAccess(apiSdk.forRole("owner"), false);
    expect(off.enabled).toBe(false);

    for (const [label, call] of writesAimedAt(prompts, "owner", ids)) {
      expect.soft((await call()).status, label).toBe(403);
    }

    const on = await setPortalAiAccess(apiSdk.forRole("owner"), true);
    expect(on.enabled).toBe(true);
    expect(await prompts.snapshot("owner")).toEqual(before);
  });
});
