import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiPrompts } from "@/src/helpers/ai-prompts";

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

  test("POST /api/2.0/ai/prompts/create - cyrillic, emoji and markdown survive the round trip", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const name = "Автотест перевод 🎉";
    const text = [
      "# Заголовок",
      "",
      "Переведи **этот** текст на английский:",
      "",
      "```js",
      "const a = 1 < 2 && 3 > 2;",
      "```",
      "",
      '| колонка | "значение" |',
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

  test("POST /api/2.0/ai/prompts/create-folder - cyrillic and emoji names round-trip", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const prompts = new AiPrompts(apiSdk.request, apiSdk.tokenStore);
    const name = "Мои промпты 📁";

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
});
