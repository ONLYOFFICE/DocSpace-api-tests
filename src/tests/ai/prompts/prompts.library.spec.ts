import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { ownerPrompts } from "@/src/helpers/ai-prompts";

// Reads, listings, partial updates, moves and deletes of the caller's own
// library — the cases prompts.spec.ts does not reach. prompts.spec.ts keeps the
// happy path and the known bugs; this file is the integrity side:
//   * every refused or repeated call is followed by a full library snapshot
//     (`export`, timestamps included), so "refused" also means "untouched"
//   * both listings are documented "newest first" by createdAt. createdAt has a
//     one-second resolution once stored, so the ordering tests wait between
//     creates instead of assuming a tie-break
//   * `move` with `folderId` omitted or null is documented as "to the root"
//
// Left alone on purpose, because the SDK does not say what is right and a test
// would only freeze an accident: `update` with an empty `updates`, names that
// differ only by surrounding whitespace, and `import-bundle` without `options`.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// createdAt is stored in whole seconds, so two creates need more than one second
// between them to be ordered at all.
const NEXT_SECOND = 1100;

test.describe("AI Prompts - get-by-id and get-folder-by-id", () => {
  test("GET /api/2.0/ai/prompts/get-by-id - returns every field, with folderId only for a prompt inside a folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const rootId = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "Root body",
    });
    const insideId = await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Inside body",
      folderId,
    });

    const root = await prompts.getPrompt("owner", rootId);
    expect(root.status).toBe(200);
    expect(root.data).toEqual({
      id: rootId,
      name: "Autotest root",
      text: "Root body",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });

    const inside = await prompts.getPrompt("owner", insideId);
    expect(inside.data).toEqual({
      id: insideId,
      name: "Autotest inside",
      text: "Inside body",
      folderId,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  test("GET /api/2.0/ai/prompts/get-by-id - reflects an update and a move, and does not change anything itself", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest before",
      text: "Before body",
    });

    await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { name: "Autotest after", text: "After body" },
    });
    const updated = await prompts.getPrompt("owner", promptId);
    expect(updated.data?.name).toBe("Autotest after");
    expect(updated.data?.text).toBe("After body");

    await prompts.movePrompt("owner", { id: promptId, folderId });
    expect((await prompts.getPrompt("owner", promptId)).data?.folderId).toBe(
      folderId,
    );

    // Reading is read-only: the same calls repeated leave the library as it was.
    const before = await prompts.snapshot("owner");
    for (let i = 0; i < 3; i++) {
      await prompts.getPrompt("owner", promptId);
      await prompts.getFolder("owner", folderId);
      await prompts.listPrompts("owner", folderId);
      await prompts.listFolders("owner");
      await prompts.exportBundle("owner");
    }
    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("GET /api/2.0/ai/prompts/get-folder-by-id - returns the folder itself, never the prompts inside it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const emptyId = await prompts.createFolderId("owner", "Autotest empty");
    const fullId = await prompts.createFolderId("owner", "Autotest full");
    await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Body",
      folderId: fullId,
    });

    for (const [label, id, name] of [
      ["empty", emptyId, "Autotest empty"],
      ["with a prompt", fullId, "Autotest full"],
    ] as const) {
      const { status, data } = await prompts.getFolder("owner", id);
      expect.soft(status, label).toBe(200);
      expect.soft(data, label).toEqual({
        id,
        name,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      });
    }

    await prompts.renameFolder("owner", {
      id: fullId,
      name: "Autotest renamed",
    });
    expect((await prompts.getFolder("owner", fullId)).data?.name).toBe(
      "Autotest renamed",
    );
  });
});

test.describe("AI Prompts - list and list-folders", () => {
  test("GET /api/2.0/ai/prompts/list - lists the root newest first, without duplicates, and an empty folderId means the root", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const first = await prompts.createPromptId("owner", {
      name: "Autotest first",
      text: "Body",
    });
    await sleep(NEXT_SECOND);
    const second = await prompts.createPromptId("owner", {
      name: "Autotest second",
      text: "Body",
    });
    await sleep(NEXT_SECOND);
    const third = await prompts.createPromptId("owner", {
      name: "Autotest third",
      text: "Body",
    });
    await prompts.createPromptId("owner", {
      name: "Autotest in folder",
      text: "Body",
      folderId,
    });

    const root = await prompts.listPrompts("owner");
    expect(root.status).toBe(200);
    expect(
      root.data.map((prompt) => prompt.id),
      "newest first, and the foldered prompt is not in the root",
    ).toEqual([third, second, first]);

    const empty = await prompts.listPrompts("owner", "");
    expect(
      empty.data.map((prompt) => prompt.id),
      "an empty folderId lists the root, not the whole library",
    ).toEqual([third, second, first]);
  });

  test("GET /api/2.0/ai/prompts/list - folders do not mix, and an empty folder lists nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderA = await prompts.createFolderId("owner", "Autotest A");
    const folderB = await prompts.createFolderId("owner", "Autotest B");
    const emptyFolder = await prompts.createFolderId("owner", "Autotest empty");
    const rootId = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "Body",
    });
    const inA = await prompts.createPromptId("owner", {
      name: "Autotest in A",
      text: "Body",
      folderId: folderA,
    });
    const inB1 = await prompts.createPromptId("owner", {
      name: "Autotest in B one",
      text: "Body",
      folderId: folderB,
    });
    await sleep(NEXT_SECOND);
    const inB2 = await prompts.createPromptId("owner", {
      name: "Autotest in B two",
      text: "Body",
      folderId: folderB,
    });

    const ids = async (folderId?: string) =>
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id);

    expect(await ids(folderA), "folder A").toEqual([inA]);
    expect(await ids(folderB), "folder B, newest first").toEqual([inB2, inB1]);
    expect(await ids(), "the root").toEqual([rootId]);
    expect(
      await ids(emptyFolder),
      "an empty folder — the other listings above show the call is not just returning nothing",
    ).toEqual([]);
  });

  test("GET /api/2.0/ai/prompts/list - an update, a move and a delete show up in the listings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const edited = await prompts.createPromptId("owner", {
      name: "Autotest edited",
      text: "Old body",
    });
    const moved = await prompts.createPromptId("owner", {
      name: "Autotest moved",
      text: "Body",
    });
    const deleted = await prompts.createPromptId("owner", {
      name: "Autotest deleted",
      text: "Body",
    });

    await prompts.updatePrompt("owner", {
      id: edited,
      updates: { name: "Autotest edited twice", text: "New body" },
    });
    await prompts.movePrompt("owner", { id: moved, folderId });
    await prompts.deletePrompt("owner", deleted);

    const root = (await prompts.listPrompts("owner")).data;
    expect(root.map((prompt) => prompt.id)).toEqual([edited]);
    expect(root[0]?.name).toBe("Autotest edited twice");
    expect(root[0]?.text).toBe("New body");
    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
    ).toEqual([moved]);
  });

  test("GET /api/2.0/ai/prompts/list-folders - lists every folder, empty ones too, newest first, and follows rename and delete", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const first = await prompts.createFolderId("owner", "Autotest first");
    await sleep(NEXT_SECOND);
    const second = await prompts.createFolderId("owner", "Autotest second");
    await sleep(NEXT_SECOND);
    const third = await prompts.createFolderId("owner", "Autotest third");
    await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Body",
      folderId: second,
    });

    const listed = await prompts.listFolders("owner");
    expect(listed.status).toBe(200);
    expect(
      listed.data.map((folder) => folder.id),
      "all three, the empty ones included, newest first",
    ).toEqual([third, second, first]);
    for (const folder of listed.data) {
      expect
        .soft(Object.keys(folder).sort(), folder.name)
        .toEqual(["createdAt", "id", "name", "updatedAt"]);
    }

    await prompts.renameFolder("owner", {
      id: second,
      name: "Autotest renamed",
    });
    await prompts.deleteFolder("owner", first);

    const after = await prompts.listFolders("owner");
    expect(after.data.map((folder) => [folder.id, folder.name])).toEqual([
      [third, "Autotest third"],
      [second, "Autotest renamed"],
    ]);
  });
});

test.describe("AI Prompts - export", () => {
  test("GET /api/2.0/ai/prompts/export - carries every prompt and folder exactly as the other routes read them", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const emptyFolder = await prompts.createFolderId("owner", "Autotest empty");
    const fullFolder = await prompts.createFolderId(
      "owner",
      "Autotest 📁 full",
    );
    const rootId = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "# Root\n\n- one\n- two",
    });
    const insideId = await prompts.createPromptId("owner", {
      name: "Autotest 提示",
      text: 'Строка с "кавычками" и \\ слешем\n{"k": [1, 2]}',
      folderId: fullFolder,
    });

    const exported = await prompts.exportBundle("owner");
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toContain("application/json");
    expect(exported.data?.version).toBe(1);

    expect(exported.data?.folders?.map((folder) => folder.id).sort()).toEqual(
      [emptyFolder, fullFolder].sort(),
    );
    expect(
      exported.data?.folders?.find((folder) => folder.id === emptyFolder),
      "an empty folder is exported too",
    ).toBeDefined();

    for (const id of [rootId, insideId]) {
      const exportedPrompt = exported.data?.prompts?.find((p) => p.id === id);
      const read = await prompts.getPrompt("owner", id);
      expect
        .soft(exportedPrompt, `prompt ${read.data?.name} against get-by-id`)
        .toEqual(read.data);
    }
    for (const folder of exported.data?.folders ?? []) {
      expect
        .soft(folder, `folder ${folder.name} against get-folder-by-id`)
        .toEqual((await prompts.getFolder("owner", folder.id!)).data);
    }
  });

  test("GET /api/2.0/ai/prompts/export - a library of only empty folders, and one of only root prompts", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest empty");

    const onlyFolders = await prompts.exportBundle("owner");
    expect(onlyFolders.data?.folders?.map((folder) => folder.id)).toEqual([
      folderId,
    ]);
    expect(onlyFolders.data?.prompts).toEqual([]);

    await prompts.deleteFolder("owner", folderId);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "Body",
    });

    const onlyPrompts = await prompts.exportBundle("owner");
    expect(onlyPrompts.data?.folders).toEqual([]);
    expect(onlyPrompts.data?.prompts?.map((prompt) => prompt.id)).toEqual([
      promptId,
    ]);
    expect(onlyPrompts.data?.prompts?.[0]?.folderId).toBeUndefined();
  });

  test("GET /api/2.0/ai/prompts/export - leaves out deleted prompts and deleted folders with their prompts, and repeats unchanged", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const keptFolder = await prompts.createFolderId("owner", "Autotest kept");
    const doomedFolder = await prompts.createFolderId(
      "owner",
      "Autotest doomed",
    );
    const keptRoot = await prompts.createPromptId("owner", {
      name: "Autotest kept root",
      text: "Body",
    });
    const keptInside = await prompts.createPromptId("owner", {
      name: "Autotest kept inside",
      text: "Body",
      folderId: keptFolder,
    });
    const deletedRoot = await prompts.createPromptId("owner", {
      name: "Autotest deleted root",
      text: "Body",
    });
    await prompts.createPromptId("owner", {
      name: "Autotest doomed inside",
      text: "Body",
      folderId: doomedFolder,
    });

    await prompts.deletePrompt("owner", deletedRoot);
    await prompts.deleteFolder("owner", doomedFolder);

    const exported = await prompts.snapshot("owner");
    expect(exported.folders.map((folder) => folder.id)).toEqual([keptFolder]);
    expect(exported.prompts.map((prompt) => prompt.id).sort()).toEqual(
      [keptRoot, keptInside].sort(),
    );
    expect(
      exported.prompts.every(
        (prompt) => prompt.folderId === null || prompt.folderId === keptFolder,
      ),
      "no prompt points at the deleted folder",
    ).toBe(true);

    expect(
      await prompts.snapshot("owner"),
      "a second export is identical",
    ).toEqual(exported);
  });
});

test.describe("AI Prompts - update, move and delete keep the rest intact", () => {
  test("PUT /api/2.0/ai/prompts/update - a partial update touches only what was sent, and a repeat changes nothing more", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest original",
      text: "Original body",
      folderId,
    });
    const bystander = await prompts.createPromptId("owner", {
      name: "Autotest bystander",
      text: "Bystander body",
    });
    const original = (await prompts.getPrompt("owner", promptId)).data!;
    const bystanderBefore = (await prompts.getPrompt("owner", bystander)).data;
    await sleep(NEXT_SECOND);

    const both = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { name: "Autotest both", text: "Both body" },
    });
    expect(both.data?.success).toBe(true);

    const read = (await prompts.getPrompt("owner", promptId)).data!;
    expect(read.id, "the id survives").toBe(promptId);
    expect(read.name).toBe("Autotest both");
    expect(read.text).toBe("Both body");
    expect(read.folderId, "the folder was not in `updates`").toBe(folderId);
    expect(read.createdAt, "createdAt is not rewritten").toBe(
      original.createdAt,
    );
    expect(read.updatedAt, "updatedAt moves forward").toBeGreaterThan(
      original.updatedAt!,
    );

    const again = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { name: "Autotest both", text: "Both body" },
    });
    expect(again.data?.success, "the same values again").toBe(true);
    const afterAgain = (await prompts.getPrompt("owner", promptId)).data!;
    expect(afterAgain.name).toBe("Autotest both");
    expect(afterAgain.text).toBe("Both body");
    expect(afterAgain.folderId).toBe(folderId);

    expect(
      (await prompts.getPrompt("owner", bystander)).data,
      "another prompt is untouched",
    ).toEqual(bystanderBefore);
  });

  test("PUT /api/2.0/ai/prompts/update - an empty updates object or a null one changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest keeper",
      text: "Body",
      folderId,
    });
    const before = (await prompts.getPrompt("owner", promptId)).data;

    // Whether an empty `updates` is an accepted no-op or a refusal is not stated
    // by the SDK, so the status is not asserted — only that it cannot edit.
    await prompts.updatePrompt("owner", { id: promptId, updates: {} });
    await prompts.updatePrompt("owner", { id: promptId, updates: null });
    await prompts.updatePrompt("owner", { id: promptId });

    const after = (await prompts.getPrompt("owner", promptId)).data;
    expect(after?.name).toBe(before?.name);
    expect(after?.text).toBe(before?.text);
    expect(after?.folderId).toBe(before?.folderId);
    expect(after?.createdAt).toBe(before?.createdAt);
  });

  test("PUT /api/2.0/ai/prompts/update - a long Unicode text is stored whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest long",
      text: "short",
    });
    const text = "Тест 界 🚀 ".repeat(5000);

    const { data } = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { text },
    });
    expect(data?.success).toBe(true);

    expect((await prompts.getPrompt("owner", promptId)).data?.text).toBe(text);
    expect(
      (await prompts.exportBundle("owner")).data?.prompts?.[0]?.text,
      "and through export",
    ).toBe(text);
  });

  test("PUT /api/2.0/ai/prompts/update - folderId moves the prompt without touching its name or text, and null returns it to the root", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderA = await prompts.createFolderId("owner", "Autotest A");
    const folderB = await prompts.createFolderId("owner", "Autotest B");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest traveller",
      text: "Traveller body",
      folderId: folderA,
    });

    for (const [label, folderId] of [
      ["to folder B", folderB],
      ["to the root", null],
      ["to folder A", folderA],
    ] as const) {
      const { data } = await prompts.updatePrompt("owner", {
        id: promptId,
        updates: { folderId },
      });
      expect.soft(data?.success, label).toBe(true);
      const read = (await prompts.getPrompt("owner", promptId)).data;
      expect.soft(read?.folderId ?? null, label).toBe(folderId);
      expect.soft(read?.name, label).toBe("Autotest traveller");
      expect.soft(read?.text, label).toBe("Traveller body");
    }
  });

  test("PUT /api/2.0/ai/prompts/move - keeps the id, name, text and createdAt, and omitting folderId means the root", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest traveller",
      text: "Traveller body",
    });
    const original = (await prompts.getPrompt("owner", promptId)).data!;

    const into = await prompts.movePrompt("owner", { id: promptId, folderId });
    expect(into.data?.success).toBe(true);
    const inside = (await prompts.getPrompt("owner", promptId)).data!;
    expect(inside.folderId).toBe(folderId);
    expect(inside.id).toBe(original.id);
    expect(inside.name).toBe(original.name);
    expect(inside.text).toBe(original.text);
    expect(inside.createdAt).toBe(original.createdAt);

    // The SDK: "to the root when `folderId` is omitted or null".
    const omitted = await prompts.movePrompt("owner", { id: promptId });
    expect(omitted.data?.success).toBe(true);
    expect((await prompts.getPrompt("owner", promptId)).data?.folderId).toBe(
      undefined,
    );
    expect(
      (await prompts.listPrompts("owner", folderId)).data,
      "the folder is empty again",
    ).toEqual([]);

    // Root to root is a no-op that is still answered with success.
    const rootToRoot = await prompts.movePrompt("owner", {
      id: promptId,
      folderId: null,
    });
    expect(rootToRoot.data?.success).toBe(true);
    expect(
      (await prompts.listPrompts("owner")).data.map((prompt) => prompt.id),
    ).toEqual([promptId]);
  });

  test("PUT /api/2.0/ai/prompts/move - moving a prompt into the folder it is already in succeeds and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest settled",
      text: "Body",
      folderId,
    });
    const before = (await prompts.getPrompt("owner", promptId)).data;

    for (const attempt of ["first", "repeat"]) {
      const { status, data } = await prompts.movePrompt("owner", {
        id: promptId,
        folderId,
      });
      expect.soft(status, attempt).toBe(200);
      expect
        .soft(data?.success, `${attempt}: it is not a conflict with itself`)
        .toBe(true);
    }

    const after = (await prompts.getPrompt("owner", promptId)).data;
    expect(after?.folderId).toBe(folderId);
    expect(after?.name).toBe(before?.name);
    expect(after?.text).toBe(before?.text);
    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
    ).toEqual([promptId]);
  });

  test("DELETE /api/2.0/ai/prompts/delete - removes a prompt from its folder only, and the folder and its other prompts stay", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");
    const doomed = await prompts.createPromptId("owner", {
      name: "Autotest doomed",
      text: "Body",
      folderId,
    });
    const sibling = await prompts.createPromptId("owner", {
      name: "Autotest sibling",
      text: "Body",
      folderId,
    });
    const root = await prompts.createPromptId("owner", {
      name: "Autotest root",
      text: "Body",
    });

    const { status, data } = await prompts.deletePrompt("owner", doomed);
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect((await prompts.getPrompt("owner", doomed)).data).toBeNull();
    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
    ).toEqual([sibling]);
    expect((await prompts.getFolder("owner", folderId)).data?.id).toBe(
      folderId,
    );
    expect((await prompts.listPrompts("owner")).data.map((p) => p.id)).toEqual([
      root,
    ]);
    expect(
      (await prompts.snapshot("owner")).prompts
        .map((prompt) => prompt.id)
        .sort(),
      "export agrees",
    ).toEqual([sibling, root].sort());

    // Deleting the last prompt of a folder does not delete the folder.
    await prompts.deletePrompt("owner", sibling);
    expect((await prompts.listPrompts("owner", folderId)).data).toEqual([]);
    expect((await prompts.getFolder("owner", folderId)).data?.id).toBe(
      folderId,
    );

    // And the repeat touches nothing else.
    const before = await prompts.snapshot("owner");
    expect((await prompts.deletePrompt("owner", doomed)).data?.success).toBe(
      true,
    );
    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("DELETE /api/2.0/ai/prompts/delete-folder - deleting a folder with several prompts removes all of them everywhere and spares the other folders", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const doomedFolder = await prompts.createFolderId(
      "owner",
      "Autotest doomed",
    );
    const keptFolder = await prompts.createFolderId("owner", "Autotest kept");
    const doomed: string[] = [];
    for (const name of ["one", "two", "three"]) {
      doomed.push(
        await prompts.createPromptId("owner", {
          name: `Autotest doomed ${name}`,
          text: "Body",
          folderId: doomedFolder,
        }),
      );
    }
    const kept = await prompts.createPromptId("owner", {
      name: "Autotest doomed one",
      text: "Same name, other folder",
      folderId: keptFolder,
    });
    const root = await prompts.createPromptId("owner", {
      name: "Autotest doomed one",
      text: "Same name, root",
    });

    const { status, data } = await prompts.deleteFolder("owner", doomedFolder);
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    for (const id of doomed) {
      expect
        .soft((await prompts.getPrompt("owner", id)).data, `prompt ${id}`)
        .toBeNull();
    }
    expect((await prompts.getFolder("owner", doomedFolder)).data).toBeNull();
    expect(
      (await prompts.listPrompts("owner")).data.map((prompt) => prompt.id),
      "none of them was moved to the root",
    ).toEqual([root]);

    const left = await prompts.snapshot("owner");
    expect(left.folders.map((folder) => folder.id)).toEqual([keptFolder]);
    expect(left.prompts.map((prompt) => prompt.id).sort()).toEqual(
      [kept, root].sort(),
    );
  });
});

test.describe("AI Prompts - name conflicts keep the library whole", () => {
  test("PUT /api/2.0/ai/prompts/move, update, POST create, create-folder, rename-folder - every refused name conflict leaves the whole library untouched, and a rename lets the move through", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderA = await prompts.createFolderId("owner", "Autotest A");
    const folderB = await prompts.createFolderId("owner", "Autotest B");
    await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "A body",
      folderId: folderA,
    });
    const inB = await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "B body",
      folderId: folderB,
    });
    const inRoot = await prompts.createPromptId("owner", {
      name: "Autotest clash",
      text: "Root body",
    });
    const before = await prompts.snapshot("owner");
    expect(before.prompts, "three prompts share one name legally").toHaveLength(
      3,
    );

    type Answer = {
      data?: { success?: boolean; error?: { message?: string } };
    };
    const refusals: Array<[string, () => Promise<Answer>, string]> = [
      [
        "create in A",
        () =>
          prompts.createPrompt("owner", {
            name: "Autotest clash",
            text: "x",
            folderId: folderA,
          }),
        "Prompt name already exists in this folder",
      ],
      [
        "create in the root",
        () =>
          prompts.createPrompt("owner", { name: "Autotest clash", text: "x" }),
        "Prompt name already exists in this folder",
      ],
      [
        "move the root prompt into A",
        () => prompts.movePrompt("owner", { id: inRoot, folderId: folderA }),
        "Prompt name already exists in this folder",
      ],
      [
        "update{folderId} of the B prompt to A",
        () =>
          prompts.updatePrompt("owner", {
            id: inB,
            updates: { folderId: folderA },
          }),
        "Prompt name already exists in this folder",
      ],
      [
        "update{name, folderId} of the B prompt to A",
        () =>
          prompts.updatePrompt("owner", {
            id: inB,
            updates: { name: "Autotest clash", folderId: folderA },
          }),
        "Prompt name already exists in this folder",
      ],
      [
        "create-folder with an existing name",
        () => prompts.createFolder("owner", "Autotest A"),
        "Folder name already exists",
      ],
      [
        "rename-folder B onto A",
        () =>
          prompts.renameFolder("owner", { id: folderB, name: "Autotest A" }),
        "Folder name already exists",
      ],
    ];

    for (const [label, call, message] of refusals) {
      // One at a time: a refusal that wrongly succeeded would otherwise change
      // the state the next call is judged against.
      const { data } = await call();
      expect.soft(data?.success, label).toBe(false);
      expect.soft(data?.error?.message, label).toBe(message);
    }

    expect(
      await prompts.snapshot("owner"),
      "no refused call changed a row, a folder or a timestamp",
    ).toEqual(before);

    // The scenario's second half: a rename removes the conflict, and the very
    // same move now goes through.
    const rename = await prompts.updatePrompt("owner", {
      id: inRoot,
      updates: { name: "Autotest clash renamed" },
    });
    expect(rename.data?.success).toBe(true);
    const retry = await prompts.movePrompt("owner", {
      id: inRoot,
      folderId: folderA,
    });
    expect(retry.data?.success).toBe(true);
    expect(
      (await prompts.listPrompts("owner", folderA)).data
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Autotest clash", "Autotest clash renamed"]);
    expect((await prompts.listPrompts("owner")).data).toEqual([]);
  });
});
