import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiPrompts } from "@/src/helpers/ai-prompts";
import {
  AiAgentChat,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";

// Saved prompts and prompt folders — sections 18.1 and 18.2.
//
//   GET    /ai/prompts/list[?folderId=]
//   GET    /ai/prompts/get-by-id?id=
//   POST   /ai/prompts/create           { name, text, folderId? }
//   PUT    /ai/prompts/update           { id, updates: { name?, text?, folderId? } }
//   DELETE /ai/prompts/delete           bare prompt id
//   GET    /ai/prompts/export
//   POST   /ai/prompts/import-bundle
//   GET    /ai/prompts/list-folders
//   GET    /ai/prompts/get-folder-by-id?id=
//   POST   /ai/prompts/create-folder    bare folder-name string
//   PUT    /ai/prompts/rename-folder    { id, name }
//   DELETE /ai/prompts/delete-folder    bare folder id
//   PUT    /ai/prompts/move             { id, folderId | null }
//
// The store is per user and starts empty. There is no built-in prompt set, no
// built-in folder and no read-only flag anywhere, so 18.1's "built-in prompts are
// read-only" / "a user prompt cannot be forged into a built-in one" and 18.2's
// "the built-in folder cannot be renamed or deleted" have nothing to assert
// against on this build — they are recorded as gaps, not guessed at.
//
// Folders are a single flat level: `create-folder` takes a name and nothing else,
// so there is no parent to point at and 18.2's "cyclic structure with nested
// folders" case cannot exist. And **deleting a folder deletes the prompts inside
// it** — 18.2 lists refuse / cascade / move-out as the three admissible
// contracts; this build cascades, silently.
//
// Error handling is split in a way that trips up a status-only assertion:
//   * a blank/whitespace name (prompt or folder) is HTTP 200
//     `{success:false, error:{...}}`
//   * a blank/whitespace prompt text is a hard HTTP 400
//   * an over-long name is a hard HTTP 400, while a 50 KB text is accepted
//   * a missing id on delete/get-by-id/delete-folder is HTTP 400
//     `{"error":"id required"}`, a malformed one on get-folder-by-id is 400
//   * an unknown-but-well-formed id reads back as HTTP 200 `null`
// and `error.field` is the literal "name" no matter which field was wrong.

test.describe("AI Prompts - lifecycle", () => {
  test("POST /api/2.0/ai/prompts/create - Owner creates a prompt and reads it back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const empty = await prompts.listPrompts("owner");
    expect(empty.status).toBe(200);
    expect(empty.data).toEqual([]);

    const { status, data } = await prompts.createPrompt("owner", {
      name: "Autotest summarize",
      text: "Summarize the document in three bullet points.",
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.prompt?.id).toBeTruthy();
    expect(data?.prompt?.name).toBe("Autotest summarize");
    expect(data?.prompt?.text).toBe(
      "Summarize the document in three bullet points.",
    );
    expect(typeof data?.prompt?.createdAt).toBe("number");
    expect(typeof data?.prompt?.updatedAt).toBe("number");

    const promptId = data!.prompt!.id!;
    const read = await prompts.getPrompt("owner", promptId);
    expect(read.status).toBe(200);
    expect(read.data?.id).toBe(promptId);
    expect(read.data?.name).toBe("Autotest summarize");
    expect(read.data?.text).toBe(
      "Summarize the document in three bullet points.",
    );

    const listed = await prompts.listPrompts("owner");
    expect(listed.data.map((prompt) => prompt.id)).toContain(promptId);
  });

  test("PUT /api/2.0/ai/prompts/update - renaming and re-texting a prompt are independent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest original",
      text: "Original body",
    });

    const renamed = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { name: "Autotest renamed" },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.data?.success).toBe(true);

    // Section 18.1's partial-update requirement: the field that was not sent
    // keeps its value instead of being blanked.
    const afterRename = await prompts.getPrompt("owner", promptId);
    expect(afterRename.data?.name).toBe("Autotest renamed");
    expect(afterRename.data?.text, "the text survived the rename").toBe(
      "Original body",
    );

    const retexted = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { text: "Replaced body" },
    });
    expect(retexted.data?.success).toBe(true);

    const afterRetext = await prompts.getPrompt("owner", promptId);
    expect(afterRetext.data?.text).toBe("Replaced body");
    expect(afterRetext.data?.name, "the name survived the re-text").toBe(
      "Autotest renamed",
    );
  });

  test("DELETE /api/2.0/ai/prompts/delete - deletes a prompt and leaves the others", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const doomed = await prompts.createPromptId("owner", {
      name: "Autotest doomed",
      text: "Body",
    });
    const keeper = await prompts.createPromptId("owner", {
      name: "Autotest keeper",
      text: "Body",
    });

    const { status, data } = await prompts.deletePrompt("owner", doomed);
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect((await prompts.getPrompt("owner", doomed)).data).toBeNull();

    const listed = await prompts.listPrompts("owner");
    expect(listed.data.map((prompt) => prompt.id)).toEqual([keeper]);
  });

  test("DELETE /api/2.0/ai/prompts/delete - a missing id is rejected, a second delete is accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest once",
      text: "Body",
    });

    const missing = await prompts.deletePrompt("owner", "");
    expect(missing.status).toBe(400);
    expect(missing.error).toBe("id required");
    expect(
      (await prompts.getPrompt("owner", promptId)).data?.id,
      "the rejected delete removed nothing",
    ).toBe(promptId);

    expect((await prompts.deletePrompt("owner", promptId)).data?.success).toBe(
      true,
    );

    // Deletion is idempotent rather than 404 on the second call.
    const again = await prompts.deletePrompt("owner", promptId);
    expect(again.status).toBe(200);
    expect(again.data?.success).toBe(true);
  });

  test("GET /api/2.0/ai/prompts/get-by-id - a missing or malformed id is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const empty = await prompts.getPrompt("owner", "");
    expect(empty.status).toBe(400);
    expect(empty.error).toBe("id required");

    // A well-formed but unknown id is 200 null — the same shape as
    // threads/get-by-id and profiles/get-by-id.
    const unknown = await prompts.getPrompt(
      "owner",
      "019fcc1d-2c4d-7557-b8d2-6b4f1be1b212",
    );
    expect(unknown.status).toBe(200);
    expect(unknown.data).toBeNull();
  });
});

test.describe("AI Prompts - content validation", () => {
  test("POST /api/2.0/ai/prompts/create - a blank name is refused as a validation error", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    for (const name of ["", "   ", "\t\n"]) {
      const { status, data } = await prompts.createPrompt("owner", {
        name,
        text: "Body",
      });
      expect(status, `name ${JSON.stringify(name)}`).toBe(200);
      expect(data?.success).toBe(false);
      expect(data?.error?.message).toBe("Name is required");
    }

    // Nothing was stored under any of those names.
    expect((await prompts.listPrompts("owner")).data).toEqual([]);
  });

  test("POST /api/2.0/ai/prompts/create - a blank text is rejected with 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    for (const text of ["", "   "]) {
      const { status } = await prompts.createPrompt("owner", {
        name: `Autotest blank ${JSON.stringify(text)}`,
        text,
      });
      expect(status, `text ${JSON.stringify(text)}`).toBe(400);
    }

    expect((await prompts.listPrompts("owner")).data).toEqual([]);
  });

  test("POST /api/2.0/ai/prompts/create - a duplicate name in the same folder is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const first = await prompts.createPromptId("owner", {
      name: "Autotest duplicate",
      text: "First body",
    });

    const { status, data } = await prompts.createPrompt("owner", {
      name: "Autotest duplicate",
      text: "Second body",
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(
      "Prompt name already exists in this folder",
    );

    // The original is untouched and no second record appeared.
    const listed = await prompts.listPrompts("owner");
    expect(listed.data.map((prompt) => prompt.id)).toEqual([first]);
    expect(listed.data[0]?.text).toBe("First body");
  });

  test("POST /api/2.0/ai/prompts/create - duplicate text under a different name is allowed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const first = await prompts.createPromptId("owner", {
      name: "Autotest one",
      text: "Identical body",
    });
    const second = await prompts.createPromptId("owner", {
      name: "Autotest two",
      text: "Identical body",
    });

    expect(second).not.toBe(first);
    const listed = await prompts.listPrompts("owner");
    expect(listed.data.map((prompt) => prompt.id).sort()).toEqual(
      [first, second].sort(),
    );
  });

  test("POST /api/2.0/ai/prompts/create - unicode, emoji and markdown survive the round trip", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const name = "Autotest translate 🎉";
    const text = [
      "# Heading",
      "",
      "Translate **this** text into French:",
      "",
      "```js",
      "const a = 1 < 2 && 3 > 2;",
      "```",
      "",
      '| column | "value" |',
    ].join("\n");

    const promptId = await prompts.createPromptId("owner", { name, text });

    const read = await prompts.getPrompt("owner", promptId);
    expect(read.status).toBe(200);
    expect(read.data?.name).toBe(name);
    expect(read.data?.text, "markdown and unicode are stored verbatim").toBe(
      text,
    );
  });

  test("POST /api/2.0/ai/prompts/create - the name is length-limited and the text is not", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const longName = await prompts.createPrompt("owner", {
      name: "N".repeat(5000),
      text: "Body",
    });
    expect(longName.status).toBe(400);
    expect(
      (await prompts.listPrompts("owner")).data,
      "the rejected name stored nothing",
    ).toEqual([]);

    // A 50 KB body is accepted whole — the two fields have different limits, so a
    // client cannot assume one check covers both.
    const text = "Y".repeat(50000);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest long text",
      text,
    });

    const read = await prompts.getPrompt("owner", promptId);
    expect(read.status).toBe(200);
    expect(read.data?.text?.length, "the stored body length").toBe(50000);
    expect(read.data?.text).toBe(text);
  });

  test("POST /api/2.0/ai/prompts/create - a prompt in a non-existent folder is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    for (const folderId of [
      "019fcc1d-2ccd-7274-974a-cc335f583f58",
      "not-a-guid",
    ]) {
      const { status, data } = await prompts.createPrompt("owner", {
        name: `Autotest folder ${folderId}`,
        text: "Body",
        folderId,
      });
      expect(status, `folderId ${folderId}`).toBe(200);
      expect(data?.success).toBe(false);
      expect(data?.error?.message).toBe(`Folder not found: ${folderId}`);
    }

    expect((await prompts.listPrompts("owner")).data).toEqual([]);
  });

  test("PUT /api/2.0/ai/prompts/update - an unknown prompt id is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const unknown = "019fcc1d-2c4d-7557-b8d2-6b4f1be1b212";

    const { status, data } = await prompts.updatePrompt("owner", {
      id: unknown,
      updates: { name: "Autotest renamed" },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(`Prompt not found: ${unknown}`);
  });
});

test.describe("AI Prompts - stored injection payloads", () => {
  test("POST /api/2.0/ai/prompts/create - HTML and script payloads are stored verbatim", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const name = "<img src=x onerror=alert(1)>";
    const text = "<script>alert(document.cookie)</script>";

    const promptId = await prompts.createPromptId("owner", { name, text });
    const read = await prompts.getPrompt("owner", promptId);

    // The storage layer keeps the bytes as sent, which is the correct behaviour
    // for a prompt body — the response is JSON and has no HTML parsing context,
    // so escaping here would corrupt legitimate prompts. What this test pins is
    // that nothing is silently rewritten; whether the client escapes it on render
    // is a UI concern.
    expect(read.status).toBe(200);
    expect(read.data?.name).toBe(name);
    expect(read.data?.text).toBe(text);

    // And it is still the same payload after a round trip through export.
    const exported = await prompts.exportBundle("owner");
    expect(exported.status).toBe(200);
    const inBundle = exported.data?.prompts?.find(
      (prompt) => prompt.id === promptId,
    );
    expect(inBundle?.name).toBe(name);
    expect(inBundle?.text).toBe(text);
  });
});

test.describe("AI Prompts - export and import", () => {
  test("GET /api/2.0/ai/prompts/export - exports the caller's prompts and folders", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const emptyBundle = await prompts.exportBundle("owner");
    expect(emptyBundle.status).toBe(200);
    expect(emptyBundle.data?.version).toBe(1);
    expect(emptyBundle.data?.prompts).toEqual([]);
    expect(emptyBundle.data?.folders).toEqual([]);

    const folderId = await prompts.createFolderId("owner", "Autotest folder");
    const rootPrompt = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "Root body",
    });
    const foldered = await prompts.createPromptId("owner", {
      name: "Autotest foldered",
      text: "Foldered body",
      folderId,
    });

    const { status, data } = await prompts.exportBundle("owner");
    expect(status).toBe(200);
    expect(data?.version).toBe(1);
    expect(data?.folders?.map((folder) => folder.id)).toEqual([folderId]);
    expect(data?.prompts?.map((prompt) => prompt.id).sort()).toEqual(
      [rootPrompt, foldered].sort(),
    );

    // The bundle keeps the folder binding, which is what makes it re-importable.
    const exportedFoldered = data?.prompts?.find(
      (prompt) => prompt.id === foldered,
    );
    expect(exportedFoldered?.folderId).toBe(folderId);
  });

  test("POST /api/2.0/ai/prompts/import-bundle - imports prompts and reports the counts", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const { status, data } = await prompts.importBundle("owner", {
      bundle: {
        version: 1,
        folders: [],
        prompts: [
          { id: "ignored-1", name: "Autotest imported one", text: "Body one" },
          { id: "ignored-2", name: "Autotest imported two", text: "Body two" },
        ],
      },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.imported?.prompts).toBe(2);
    expect(data?.imported?.folders).toBe(0);

    const listed = await prompts.listPrompts("owner");
    expect(listed.data.map((prompt) => prompt.name).sort()).toEqual([
      "Autotest imported one",
      "Autotest imported two",
    ]);

    // The ids in the bundle are not honoured — the portal issues its own, so an
    // import cannot be used to plant a chosen prompt id.
    for (const prompt of listed.data) {
      expect(prompt.id).not.toBe("ignored-1");
      expect(prompt.id).not.toBe("ignored-2");
    }
  });

  test("GET /api/2.0/ai/prompts/export, POST import-bundle - a bundle round-trips", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest bundle");
    await prompts.createPromptId("owner", {
      name: "Autotest bundled",
      text: "Bundled body",
      folderId,
    });

    const exported = await prompts.exportBundle("owner");
    expect(exported.status).toBe(200);

    // Re-importing the caller's own bundle must not fail on the names that are
    // already there; whatever the merge rule is, the call has to be answered.
    const reimported = await prompts.importBundle("owner", {
      bundle: exported.data as Record<string, unknown>,
    });
    expect(reimported.status).toBe(200);
    expect(typeof reimported.data?.success).toBe("boolean");
  });

  // `options.mode` is the only knob the import takes, and it decides whether the
  // library is added to or wiped — the difference between a merge and data loss.
  test("POST /api/2.0/ai/prompts/import-bundle - mode merge keeps what is already there", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const existingFolder = await prompts.createFolderId(
      "owner",
      "Autotest existing folder",
    );
    const existing = await prompts.createPromptId("owner", {
      name: "Autotest existing",
      text: "Existing body",
      folderId: existingFolder,
    });

    const { status, data } = await prompts.importBundle("owner", {
      bundle: {
        version: 1,
        folders: [{ id: "ignored-folder", name: "Autotest imported folder" }],
        prompts: [
          {
            id: "ignored-prompt",
            name: "Autotest imported",
            text: "Imported body",
            folderId: "ignored-folder",
          },
        ],
      },
      options: { mode: "merge" },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.imported?.prompts).toBe(1);
    expect(data?.imported?.folders).toBe(1);

    // Both libraries are there afterwards, and the imported prompt landed inside
    // the imported folder rather than in the root — the bundle's own folder ids
    // are re-issued, so the binding has to be remapped, not dropped.
    const folders = await prompts.listFolders("owner");
    expect(folders.data.map((folder) => folder.name).sort()).toEqual([
      "Autotest existing folder",
      "Autotest imported folder",
    ]);
    expect(
      (await prompts.listPrompts("owner", existingFolder)).data.map(
        (p) => p.id,
      ),
      "the prompt that was already there",
    ).toEqual([existing]);

    const importedFolder = folders.data.find(
      (folder) => folder.name === "Autotest imported folder",
    );
    const inside = await prompts.listPrompts("owner", importedFolder!.id!);
    expect(inside.data.map((prompt) => prompt.name)).toEqual([
      "Autotest imported",
    ]);
    expect(inside.data[0]?.text).toBe("Imported body");
  });

  test("POST /api/2.0/ai/prompts/import-bundle - mode replace drops the existing library", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const doomedFolder = await prompts.createFolderId(
      "owner",
      "Autotest doomed folder",
    );
    const doomed = await prompts.createPromptId("owner", {
      name: "Autotest doomed",
      text: "Doomed body",
      folderId: doomedFolder,
    });

    const { status, data } = await prompts.importBundle("owner", {
      bundle: {
        version: 1,
        folders: [],
        prompts: [
          { id: "ignored", name: "Autotest replacement", text: "New body" },
        ],
      },
      options: { mode: "replace" },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.imported?.prompts).toBe(1);

    // Replace means replace: the previous prompt and its folder are gone, and the
    // library is exactly the bundle. This is destructive by design, which is why
    // it is pinned rather than left to a client's assumption.
    expect((await prompts.getPrompt("owner", doomed)).data).toBeNull();
    expect((await prompts.getFolder("owner", doomedFolder)).data).toBeNull();
    expect((await prompts.listFolders("owner")).data).toEqual([]);
    expect(
      (await prompts.listPrompts("owner")).data.map((prompt) => prompt.name),
    ).toEqual(["Autotest replacement"]);
  });

  test("BUG XXXXX: POST /api/2.0/ai/prompts/import-bundle - a bundle entry that collides with an existing name overwrites it silently", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const existing = await prompts.createPromptId("owner", {
      name: "Autotest collision",
      text: "Existing body",
    });

    const { status, data } = await prompts.importBundle("owner", {
      bundle: {
        version: 1,
        folders: [],
        prompts: [
          { id: "ignored-1", name: "Autotest collision", text: "Bundle body" },
          { id: "ignored-2", name: "Autotest fresh", text: "Fresh body" },
        ],
      },
      options: { mode: "merge" },
    });
    expect(status).toBe(200);

    // Control: `create` still refuses a duplicate name, so the library really has
    // a uniqueness rule for the import to report against — the silence below is
    // the import's own, not the absence of any rule to break.
    const duplicate = await prompts.createPrompt("owner", {
      name: "Autotest collision",
      text: "Another body",
    });
    expect(
      duplicate.data?.success,
      "create refuses the duplicate name the import accepted",
    ).toBe(false);

    test.fail();
    // What happens instead: `200 {success:true, imported:{prompts:2}}`, and the
    // existing prompt is overwritten in place — same id, `text` replaced by the
    // bundle's, `createdAt` restamped. There is no `errors` entry and nothing
    // else in the response a client could use to warn that a saved prompt was
    // destroyed. AiImportResult documents the opposite: all-or-nothing, with the
    // offending entry named in `errors`.
    const listed = await prompts.listPrompts("owner");
    expect(
      listed.data.find((prompt) => prompt.id === existing)?.text,
      "the existing prompt was not overwritten",
    ).toBe("Existing body");

    expect(data?.success).toBe(false);
    expect(data?.errors?.length).toBe(1);
    expect(data?.errors?.[0]?.kind).toBe("prompt");
    expect(data?.errors?.[0]?.ref).toContain("Autotest collision");

    // Nothing was written — not the colliding entry, and not the clean one that
    // shared the bundle with it.
    expect(listed.data.map((prompt) => prompt.id)).toEqual([existing]);
  });
});

test.describe("AI Prompt folders - lifecycle", () => {
  test("POST /api/2.0/ai/prompts/create-folder - Owner creates a folder and reads it back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const empty = await prompts.listFolders("owner");
    expect(empty.status).toBe(200);
    expect(empty.data).toEqual([]);

    const { status, data } = await prompts.createFolder(
      "owner",
      "Autotest folder",
    );
    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.folder?.id).toBeTruthy();
    expect(data?.folder?.name).toBe("Autotest folder");

    const folderId = data!.folder!.id!;
    const read = await prompts.getFolder("owner", folderId);
    expect(read.status).toBe(200);
    expect(read.data?.id).toBe(folderId);
    expect(read.data?.name).toBe("Autotest folder");

    const listed = await prompts.listFolders("owner");
    expect(listed.data.map((folder) => folder.id)).toEqual([folderId]);
  });

  test("POST /api/2.0/ai/prompts/create-folder - the name binds both as a bare string and as an object field", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const bare = await prompts.createFolder("owner", "Autotest bare");
    expect(bare.data?.folder?.name).toBe("Autotest bare");

    const wrapped = await prompts.createFolder("owner", {
      name: "Autotest wrapped",
    });
    expect(wrapped.status).toBe(200);
    expect(wrapped.data?.success).toBe(true);
    expect(wrapped.data?.folder?.name).toBe("Autotest wrapped");

    const listed = await prompts.listFolders("owner");
    expect(listed.data.map((folder) => folder.name).sort()).toEqual([
      "Autotest bare",
      "Autotest wrapped",
    ]);
  });

  test("PUT /api/2.0/ai/prompts/rename-folder - renames a folder without touching its prompts", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest before");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Body",
      folderId,
    });

    const { status, data } = await prompts.renameFolder("owner", {
      id: folderId,
      name: "Autotest after",
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.folder?.name).toBe("Autotest after");

    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(
      "Autotest after",
    );

    const inside = await prompts.listPrompts("owner", folderId);
    expect(inside.data.map((prompt) => prompt.id)).toEqual([promptId]);
    expect(inside.data[0]?.name).toBe("Autotest inside");
  });

  test("DELETE /api/2.0/ai/prompts/delete-folder - deletes an empty folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const doomed = await prompts.createFolderId("owner", "Autotest doomed");
    const keeper = await prompts.createFolderId("owner", "Autotest keeper");

    const { status, data } = await prompts.deleteFolder("owner", doomed);
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect((await prompts.getFolder("owner", doomed)).data).toBeNull();
    const listed = await prompts.listFolders("owner");
    expect(listed.data.map((folder) => folder.id)).toEqual([keeper]);
  });

  test("DELETE /api/2.0/ai/prompts/delete-folder - deleting a folder deletes the prompts inside it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest cascade");
    const inside = await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Body",
      folderId,
    });
    const outside = await prompts.createPromptId("owner", {
      name: "Autotest outside",
      text: "Body",
    });

    const { status, data } = await prompts.deleteFolder("owner", folderId);
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    // Cascade, with no warning in the response: the prompt is gone, not moved to
    // the root. A client that treats the folder as a label loses user data here.
    expect(
      (await prompts.getPrompt("owner", inside)).data,
      "the prompt inside the folder",
    ).toBeNull();
    expect(
      (await prompts.getPrompt("owner", outside)).data?.id,
      "a prompt outside the folder",
    ).toBe(outside);

    const root = await prompts.listPrompts("owner");
    expect(root.data.map((prompt) => prompt.id)).toEqual([outside]);
  });

  test("DELETE /api/2.0/ai/prompts/delete-folder - a missing id is rejected, a second delete is accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest once");

    const missing = await prompts.deleteFolder("owner", "");
    expect(missing.status).toBe(400);
    expect(missing.error).toBe("id required");
    expect(
      (await prompts.getFolder("owner", folderId)).data?.id,
      "the rejected delete removed nothing",
    ).toBe(folderId);

    expect((await prompts.deleteFolder("owner", folderId)).data?.success).toBe(
      true,
    );

    const again = await prompts.deleteFolder("owner", folderId);
    expect(again.status).toBe(200);
    expect(again.data?.success).toBe(true);
  });
});

test.describe("AI Prompt folders - validation", () => {
  test("POST /api/2.0/ai/prompts/create-folder - a blank name is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    for (const name of ["", "   "]) {
      const { status, data } = await prompts.createFolder("owner", name);
      expect(status, `name ${JSON.stringify(name)}`).toBe(200);
      expect(data?.success).toBe(false);
      expect(data?.error?.message).toBe("Name is required");
    }

    expect((await prompts.listFolders("owner")).data).toEqual([]);
  });

  test("POST /api/2.0/ai/prompts/create-folder - a duplicate folder name is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest dup");

    const { status, data } = await prompts.createFolder(
      "owner",
      "Autotest dup",
    );
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Folder name already exists");

    expect((await prompts.listFolders("owner")).data.map((f) => f.id)).toEqual([
      folderId,
    ]);
  });

  test("POST /api/2.0/ai/prompts/create-folder - an over-long name is rejected with 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const { status } = await prompts.createFolder("owner", "N".repeat(5000));
    expect(status).toBe(400);

    expect((await prompts.listFolders("owner")).data).toEqual([]);
  });

  test("POST /api/2.0/ai/prompts/create-folder - unicode and emoji names round-trip", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const name = "Autotest prompts 📁";

    const folderId = await prompts.createFolderId("owner", name);
    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(name);
  });

  test("GET /api/2.0/ai/prompts/get-folder-by-id - a malformed or unknown id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    expect((await prompts.getFolder("owner", "not-a-guid")).status).toBe(400);
    expect((await prompts.getFolder("owner", "")).status).toBe(400);

    const unknown = await prompts.getFolder(
      "owner",
      "019fcc1d-2ccd-7274-974a-cc335f583f58",
    );
    expect(unknown.status).toBe(200);
    expect(unknown.data).toBeNull();
  });

  // rename-folder is a separate handler from create-folder, and renaming is one
  // of the four gestures section 18.2 names, so its validation is pinned in its
  // own right rather than assumed to match create's.
  test("PUT /api/2.0/ai/prompts/rename-folder - a blank name is refused and the folder keeps its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest keeper");

    for (const name of ["", "   ", "\t\n"]) {
      const { status, data } = await prompts.renameFolder("owner", {
        id: folderId,
        name,
      });
      expect(status, `name ${JSON.stringify(name)}`).toBe(200);
      expect(data?.success).toBe(false);
      expect(data?.error?.message).toBe("Name is required");
    }

    // The refusal left the folder alone — a blank rename must not wipe the name.
    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(
      "Autotest keeper",
    );
    expect(
      (await prompts.listFolders("owner")).data.map((folder) => folder.name),
    ).toEqual(["Autotest keeper"]);
  });

  test("PUT /api/2.0/ai/prompts/rename-folder - renaming onto an existing folder's name is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const first = await prompts.createFolderId("owner", "Autotest first");
    const second = await prompts.createFolderId("owner", "Autotest second");

    const { status, data } = await prompts.renameFolder("owner", {
      id: second,
      name: "Autotest first",
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Folder name already exists");

    // Neither folder moved: create refuses the duplicate, so rename must too, or
    // the tree ends up with two identical labels the user cannot tell apart.
    expect((await prompts.getFolder("owner", second)).data?.name).toBe(
      "Autotest second",
    );
    expect((await prompts.getFolder("owner", first)).data?.name).toBe(
      "Autotest first",
    );
  });

  test("BUG XXXXX: PUT /api/2.0/ai/prompts/rename-folder - an over-long name is truncated instead of rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest short");

    // Control: the same over-long name is a hard 400 on `create-folder`. The
    // limit exists and is enforced on the way in, so what follows is the rename
    // route disagreeing with create about the same field.
    const created = await prompts.createFolder("owner", "C".repeat(5000));
    expect(
      created.status,
      "create-folder rejects the name rename-folder accepts",
    ).toBe(400);

    const { status } = await prompts.renameFolder("owner", {
      id: folderId,
      name: "N".repeat(5000),
    });

    test.fail();
    // What happens instead: `200 {success:true}` and the name is silently cut to
    // 255 characters — 256, 257, 1000, 1024 and 1025 all behave the same way, so
    // there is no length at which the route reports anything. The folder is left
    // carrying a name the caller never asked for.
    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(
      "Autotest short",
    );
    expect(status).toBe(400);
  });

  test("PUT /api/2.0/ai/prompts/rename-folder - an unknown folder id is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const unknown = "019fcc1d-2ccd-7274-974a-cc335f583f58";

    const { status, data } = await prompts.renameFolder("owner", {
      id: unknown,
      name: "Autotest renamed",
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(`Folder not found: ${unknown}`);
  });
});

test.describe("AI Prompt folders - moving prompts", () => {
  test("PUT /api/2.0/ai/prompts/move - moves a prompt into a folder and back to the root", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest target");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest movable",
      text: "Body",
    });

    // Starts at the root: listed without a folderId, absent from the folder.
    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      promptId,
    ]);
    expect((await prompts.listPrompts("owner", folderId)).data).toEqual([]);

    const moved = await prompts.movePrompt("owner", { id: promptId, folderId });
    expect(moved.status).toBe(200);
    expect(moved.data?.success).toBe(true);
    expect(moved.data?.prompt?.folderId).toBe(folderId);

    // The root listing is scoped, not cumulative — a moved prompt leaves it.
    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
    ).toEqual([promptId]);
    expect(
      (await prompts.listPrompts("owner")).data,
      "the root no longer lists it",
    ).toEqual([]);

    const back = await prompts.movePrompt("owner", {
      id: promptId,
      folderId: null,
    });
    expect(back.status).toBe(200);
    expect(back.data?.success).toBe(true);

    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      promptId,
    ]);
    expect((await prompts.listPrompts("owner", folderId)).data).toEqual([]);
  });

  test("PUT /api/2.0/ai/prompts/move - moving between two folders leaves the source empty", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const source = await prompts.createFolderId("owner", "Autotest source");
    const target = await prompts.createFolderId("owner", "Autotest target");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest movable",
      text: "Body",
      folderId: source,
    });

    const moved = await prompts.movePrompt("owner", {
      id: promptId,
      folderId: target,
    });
    expect(moved.data?.success).toBe(true);

    expect(
      (await prompts.listPrompts("owner", target)).data.map((p) => p.id),
    ).toEqual([promptId]);
    expect((await prompts.listPrompts("owner", source)).data).toEqual([]);
  });

  test("PUT /api/2.0/ai/prompts/move - moving to a non-existent folder is refused and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest movable",
      text: "Body",
      folderId,
    });
    const unknown = "019fcc1d-2ccd-7274-974a-cc335f583f58";

    const { status, data } = await prompts.movePrompt("owner", {
      id: promptId,
      folderId: unknown,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(`Folder not found: ${unknown}`);

    // The prompt did not fall out of its folder on the way.
    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
    ).toEqual([promptId]);
  });

  test("PUT /api/2.0/ai/prompts/move - an unknown prompt id is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest target");
    const unknown = "019fcc1d-2c4d-7557-b8d2-6b4f1be1b212";

    const { status, data } = await prompts.movePrompt("owner", {
      id: unknown,
      folderId,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(`Prompt not found: ${unknown}`);
  });

  test("PUT /api/2.0/ai/prompts/update - folderId can also be changed through update", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest target");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest movable",
      text: "Body",
    });

    const { status, data } = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { folderId },
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
    ).toEqual([promptId]);
  });

  // The duplicate-name rule is scoped to a folder, so two prompts may legally
  // share a name while they sit in different folders. Moving one onto the other
  // is the moment the rule has to be re-checked — on both routes that move a
  // prompt, `move` and `update{folderId}`.
  test("BUG XXXXX: PUT /api/2.0/ai/prompts/move - moving onto a name already taken in the target folder is not refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const target = await prompts.createFolderId("owner", "Autotest target");

    // Same name in two scopes, which create allows: the rule is per folder.
    const inFolder = await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "Folder body",
      folderId: target,
    });
    const inRoot = await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "Root body",
    });

    const { status, data } = await prompts.movePrompt("owner", {
      id: inRoot,
      folderId: target,
    });
    expect(status).toBe(200);

    // Control: `create` refuses that very name inside the target folder, so the
    // per-folder uniqueness rule is live on this build — `move` simply does not
    // consult it.
    const duplicate = await prompts.createPrompt("owner", {
      name: "Autotest clash",
      text: "Third body",
      folderId: target,
    });
    expect(
      duplicate.data?.error?.message,
      "create refuses the duplicate the move was allowed to create",
    ).toBe("Prompt name already exists in this folder");

    test.fail();
    // What happens instead: `200 {success:true}` and the move goes through, so
    // the folder ends up holding two prompts with the same name and the root is
    // left empty. The rule is enforced on `create` and on `update{name}` — only
    // the routes that change a prompt's folder skip it.
    const listed = await prompts.listPrompts("owner", target);
    expect(listed.data.map((prompt) => prompt.id)).toEqual([inFolder]);
    expect(listed.data[0]?.text).toBe("Folder body");
    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      inRoot,
    ]);

    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(
      "Prompt name already exists in this folder",
    );
  });

  test("BUG XXXXX: PUT /api/2.0/ai/prompts/update - moving onto a taken name through update is not refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const target = await prompts.createFolderId("owner", "Autotest target");
    await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "Folder body",
      folderId: target,
    });
    const inRoot = await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "Root body",
    });

    const { status, data } = await prompts.updatePrompt("owner", {
      id: inRoot,
      updates: { folderId: target },
    });
    expect(status).toBe(200);

    // Control, as on `move` one test up: the rule is live, this route ignores it.
    const duplicate = await prompts.createPrompt("owner", {
      name: "Autotest clash",
      text: "Third body",
      folderId: target,
    });
    expect(
      duplicate.data?.error?.message,
      "create refuses the duplicate the update was allowed to create",
    ).toBe("Prompt name already exists in this folder");

    test.fail();
    // Same defect reached through `update{folderId}` rather than `move`: 200
    // {success:true}, and the target folder ends up with two prompts named
    // "Autotest clash". Both routes need the check, so both are pinned.
    expect(
      (await prompts.listPrompts("owner", target)).data,
      "the target folder still holds one prompt",
    ).toHaveLength(1);
    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      inRoot,
    ]);

    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(
      "Prompt name already exists in this folder",
    );
  });

  test("PUT /api/2.0/ai/prompts/update - renaming a prompt onto a sibling's name is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const folderId = await prompts.createFolderId("owner", "Autotest folder");
    await prompts.createPromptId("owner", {
      name: "Autotest taken",
      text: "First body",
      folderId,
    });
    const second = await prompts.createPromptId("owner", {
      name: "Autotest free",
      text: "Second body",
      folderId,
    });

    const { status, data } = await prompts.updatePrompt("owner", {
      id: second,
      updates: { name: "Autotest taken" },
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(
      "Prompt name already exists in this folder",
    );

    expect(
      (await prompts.getPrompt("owner", second)).data?.name,
      "the refused rename left the name alone",
    ).toBe("Autotest free");
  });

  test("GET /api/2.0/ai/prompts/list - an unknown folderId lists nothing, a malformed one is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    // A root prompt as the positive control: an empty answer below then means
    // "that folder has nothing", not "the listing is broken for everything".
    const rootPrompt = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "Root body",
    });

    const unknown = await prompts.listPrompts(
      "owner",
      "019fcc1d-2ccd-7274-974a-cc335f583f58",
    );
    expect(unknown.status).toBe(200);
    expect(unknown.data, "an unknown folder lists nothing").toEqual([]);

    // A folderId that is not a GUID at all is a different case, and the route
    // treats it as one: it never reaches the store, so instead of the empty
    // listing an unknown-but-well-formed id gets, the request is refused. Worth
    // pinning precisely because the two look alike from the client's side.
    const malformed = await prompts.listPrompts("owner", "not-a-guid");
    expect(malformed.status).toBe(400);

    // Neither call leaked the root listing into a folder-scoped one.
    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      rootPrompt,
    ]);
  });
});

// The two ends of the composer, which no other block touches. `create` has no
// "from message" route — the client reads the message text and posts it as
// `text` — so what these pin is the round trip: a real message becomes a prompt
// unchanged, and a saved prompt goes back out as a message the model answers.
// Both need real inference, hence the gateway and the agent.

const SHORT_ANSWERS =
  "You are a test assistant. Answer with one short sentence.";

/** An agent and a thread of the owner's own, with the profile behind both. */
async function threadForPrompts(aiChat: AiAgentChat, threadTitle: string) {
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "Autotest Prompt Agent",
    profileId,
  });
  const threadId = await aiChat.createThreadId("owner", {
    title: threadTitle,
    profileId,
    agentId,
  });

  return { profileId, agentId, threadId };
}

// A message a user would plausibly want to keep: multi-line, markdown, and
// outside ASCII. Every construct carries a word of its own so a prompt that
// kept the text but lost the formatting is still caught.
const MESSAGE_TO_SAVE = [
  "# BRIEFHEAD",
  "",
  "Rewrite the text below as **BOLDWORD** bullet points:",
  "",
  "- LISTONE",
  "- 第二项",
  "",
  "```js",
  "const answer = 42;",
  "```",
  "",
  "café naïve, größer, 🚀",
].join("\n");

test.describe("AI Prompts - composer round trip", () => {
  test("GET /api/2.0/ai/threads/read-messages, POST /api/2.0/ai/prompts/create - a prompt made from a message keeps it verbatim", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await threadForPrompts(
      aiChat,
      "Autotest prompt source thread",
    );

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: MESSAGE_TO_SAVE,
      instructions: SHORT_ANSWERS,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    // The text the composer would save comes off the stored message, not off
    // the constant above — a store that mangled the message would otherwise be
    // invisible here and the round trip would be measured against nothing.
    const userMessages = AiAgentChat.userMessages(messages);
    expect(userMessages).toHaveLength(1);
    const messageText = AiAgentChat.messageText(userMessages[0]);
    expect(messageText, "the message survived the send verbatim").toBe(
      MESSAGE_TO_SAVE,
    );

    const created = await prompts.createPrompt("owner", {
      name: "Autotest from my message",
      text: messageText,
    });
    expect(created.status).toBe(200);
    expect(created.data?.success).toBe(true);
    const promptId = created.data!.prompt!.id!;

    const read = await prompts.getPrompt("owner", promptId);
    expect(read.status).toBe(200);
    expect(read.data?.text, "the saved prompt is the message, unchanged").toBe(
      MESSAGE_TO_SAVE,
    );
    // Spelt out separately: `toBe` on the whole blob says "different" without
    // saying what a truncating or newline-normalising store dropped.
    expect(read.data?.text?.split("\n")).toHaveLength(
      MESSAGE_TO_SAVE.split("\n").length,
    );
    for (const marker of ["BRIEFHEAD", "**BOLDWORD**", "第二项", "🚀"]) {
      expect(read.data?.text).toContain(marker);
    }

    // And it is in the library the composer lists, not just readable by id.
    const listed = await prompts.listPrompts("owner");
    expect(listed.data.map((prompt) => prompt.id)).toContain(promptId);

    // The other half of the same gesture: keeping the model's answer. Same
    // route, but the text is one the test did not author.
    const replyText = AiAgentChat.messageText(
      AiAgentChat.assistantMessages(messages)[0],
    );
    const fromReply = await prompts.createPrompt("owner", {
      name: "Autotest from the reply",
      text: replyText,
    });
    expect(fromReply.status).toBe(200);
    expect(fromReply.data?.success).toBe(true);
    expect(
      (await prompts.getPrompt("owner", fromReply.data!.prompt!.id!)).data
        ?.text,
    ).toBe(replyText);
  });

  test("GET /api/2.0/ai/prompts/get-by-id, POST /api/2.0/ai/ai/send-with-stream - a saved prompt is sent from the composer and answered", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    const promptText = "Reply with exactly the word PROMPTPLUTO.";
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest composer preset",
      text: promptText,
    });

    // What the composer inserts is what `get-by-id` hands back, so the message
    // is built from the response rather than from `promptText`.
    const stored = await prompts.getPrompt("owner", promptId);
    expect(stored.status).toBe(200);
    expect(stored.data?.text).toBe(promptText);

    const { profileId, agentId, threadId } = await threadForPrompts(
      aiChat,
      "Autotest preset thread",
    );

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: stored.data!.text!,
      instructions: SHORT_ANSWERS,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    // The prompt arrived as the user's message, and the model acted on it —
    // a healthy reply on its own would pass even if the text had been dropped.
    expect(AiAgentChat.messageText(AiAgentChat.userMessages(messages)[0])).toBe(
      promptText,
    );
    expect(
      AiAgentChat.messageText(AiAgentChat.assistantMessages(messages)[0]),
    ).toMatch(/\bPROMPTPLUTO\b/);

    // Using a preset does not consume it — it is still in the library.
    expect(
      (await prompts.listPrompts("owner")).data.map((prompt) => prompt.id),
    ).toContain(promptId);
  });
});

// The other half of the requirement — what an EMPTY chat shows: ready-made
// suggestion chips, and a read-only folder of built-in prompts. Neither has an
// API surface on this build, so both are `test.fixme` placeholders: they cost
// nothing to run and they keep the gap visible in the report instead of buried
// in a comment at the top of the file.
//
//   * No built-in set and no read-only flag exists in the contract. `AiPrompt`
//     and `AiPromptFolder` carry id / name / text / folderId and the two
//     timestamps and nothing else — no `isSystem`, no `readOnly`, no `source` —
//     `list` and `list-folders` start empty on a fresh portal (pinned by the
//     lifecycle tests above), and the SDK exposes exactly the 13 routes listed at
//     the top of this file, none of which serves a system library.
//   * Nothing serves the chips either: no prompts route, no field on
//     `/ai/config` (AiAiSettingsDto is vectorizationEnabled /
//     vectorizationNeedReset / aiReady / embeddingModel / systemAiEnabled /
//     recommendedModelForForms), and `/ai/preferences/*` is deep-mode only.
//
// So each is either a client-side constant — a UI concern, out of reach from the
// API — or not implemented on the backend. That question belongs to development;
// until it is answered there is nothing here to assert against.

test.describe("AI Prompts - empty chat: built-ins and suggestions", () => {
  test.fixme("GET /api/2.0/ai/prompts/list-folders - the built-in prompt folder is read-only", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);

    // What this will assert once built-ins exist: the folder is present on a
    // fresh portal, it is flagged read-only, rename-folder and delete-folder
    // are refused on it, the prompts inside it refuse update / delete / move,
    // and a user's own prompt cannot be flipped into a built-in one through
    // create or update. Today `list-folders` is empty and no field carries the
    // flag, so there is no id to point any of that at.
    const folders = await prompts.listFolders("owner");
    expect(folders.status).toBe(200);
    expect(
      folders.data,
      "a fresh portal serves the built-in prompt folder",
    ).not.toEqual([]);
  });

  test.fixme("the empty-chat suggestion chips are served by an API", async () => {
    // Nothing to call: no route, no config field. Once development says where
    // the chips come from, this becomes the test for it — the list is served,
    // it is non-empty, each chip carries the text that goes into the composer,
    // and the AI-off / Guest behaviour matches the rest of the prompts family.
    // If the answer is "hard-coded in the client", this placeholder goes away
    // and the coverage moves to the UI suite.
  });
});
