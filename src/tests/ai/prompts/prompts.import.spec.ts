import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  AiPrompts,
  libraryShape,
  ownerPrompts,
} from "@/src/helpers/ai-prompts";

// export / import-bundle integrity. prompts.spec.ts pins the happy paths, the
// replace/merge difference and the collision report of BUG 83130; this file is
// about what happens to the library the import is applied to.
//
// What the SDK promises for `import-bundle` (the contract the tests below hold it
// to): "Either every entry persisted with counts, or no entries persisted plus a
// per-entry error report", "a corrupt bundle is rejected whole rather than
// applied halfway", and `replace` "deletes the current prompts and folders
// before writing".
//
// Measured 2026-10-08, against that promise:
//   * soft refusals (unsupported version, a prompt pointing at a folder the
//     bundle does not have, a name collision on merge) are atomic in both modes —
//     tested here as plain passing tests
//   * a bundle the validator refuses with a hard 400 is **not**: in `replace` the
//     library is deleted first and then the bundle fails, leaving it empty (or
//     holding only the entries before the bad one); in `merge` the entries before
//     the bad one are kept — BUG XXXXX tests
//   * a bundle with the wrong shape (no `folders`, no bundle at all) is a 500 —
//     BUG XXXXX tests
//   * two prompts of one name in a `replace` bundle, and two folders of one name
//     in any bundle, are written as duplicates although create / rename / merge
//     refuse exactly that — BUG XXXXX tests
//
// Not pinned, because the SDK does not say: what an import without `options`
// does (it behaves as `replace` today), and what an unknown `mode` does (it
// behaves as `merge`). Both are raised in the report instead.

type Bundle = {
  version?: number;
  folders?: unknown;
  prompts?: unknown;
};

const bundleOf = (
  folders: Array<Record<string, unknown>>,
  prompts: Array<Record<string, unknown>>,
): Bundle => ({ version: 1, folders, prompts });

/** Two folders (one empty), one prompt inside the first and one at the root. */
async function seedLibrary(prompts: AiPrompts) {
  const folderId = await prompts.createFolderId("owner", "Autotest S");
  const emptyFolderId = await prompts.createFolderId("owner", "Autotest empty");
  await prompts.createPromptId("owner", {
    name: "Autotest SP",
    text: "in S\nsecond line — 界 🚀",
    folderId,
  });
  await prompts.createPromptId("owner", {
    name: "Autotest SR",
    text: "root",
  });
  return { folderId, emptyFolderId };
}

async function clearLibrary(prompts: AiPrompts) {
  for (const folder of (await prompts.listFolders("owner")).data) {
    await prompts.deleteFolder("owner", folder.id);
  }
  for (const prompt of (await prompts.listPrompts("owner")).data) {
    await prompts.deletePrompt("owner", prompt.id);
  }
}

test.describe("AI Prompts - export/import round trip", () => {
  test("GET export, POST import-bundle mode replace - an exported library comes back whole after the library was changed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const { folderId } = await seedLibrary(prompts);
    const original = await prompts.snapshot("owner");
    const exported = await prompts.exportBundle("owner");

    // Change everything the export holds.
    await prompts.renameFolder("owner", {
      id: folderId,
      name: "Autotest moved",
    });
    await prompts.createPromptId("owner", {
      name: "Autotest stray",
      text: "added afterwards",
    });
    await prompts.deletePrompt("owner", original.prompts[0].id);

    const { status, data } = await prompts.importBundle("owner", {
      bundle: exported.data,
      options: { mode: "replace" },
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.imported).toEqual({
      folders: original.folders.length,
      prompts: original.prompts.length,
    });

    const restored = await prompts.snapshot("owner");
    expect(
      libraryShape(restored),
      "names, texts and which folder holds what",
    ).toEqual(libraryShape(original));
  });

  test("GET export, POST import-bundle mode merge - an exported library is restored into an emptied one, empty folders included", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const original = await prompts.snapshot("owner");
    const exported = await prompts.exportBundle("owner");

    await clearLibrary(prompts);
    expect(
      await prompts.snapshot("owner"),
      "the library really was emptied first",
    ).toEqual({ folders: [], prompts: [] });

    const { data } = await prompts.importBundle("owner", {
      bundle: exported.data,
      options: { mode: "merge" },
    });
    expect(data?.success).toBe(true);
    expect(data?.imported).toEqual({
      folders: original.folders.length,
      prompts: original.prompts.length,
    });

    const restored = await prompts.snapshot("owner");
    expect(libraryShape(restored)).toEqual(libraryShape(original));
    expect(
      restored.folders.map((folder) => folder.name),
      "the empty folder came back",
    ).toContain("Autotest empty");
  });

  test("POST import-bundle mode merge - a library's own export merged into itself is refused whole and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const before = await prompts.snapshot("owner");
    const exported = await prompts.exportBundle("owner");

    const { status, data } = await prompts.importBundle("owner", {
      bundle: exported.data,
      options: { mode: "merge" },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(
      data?.errors?.map((error) => error.ref).sort(),
      "one error per colliding prompt",
    ).toEqual(["Autotest SP", "Autotest SR"]);
    expect(data?.imported).toBeUndefined();
    expect(await prompts.snapshot("owner")).toEqual(before);
  });
});

test.describe("AI Prompts - import merge keeps what is there", () => {
  test("POST import-bundle mode merge - existing prompts and folders are byte-identical afterwards, and the counts match what was added", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const before = await prompts.snapshot("owner");

    const { status, data } = await prompts.importBundle("owner", {
      bundle: bundleOf(
        [{ id: "f1", name: "Autotest imported folder" }],
        [
          { id: "p1", name: "Autotest imported root", text: "root body" },
          {
            id: "p2",
            name: "Autotest imported inside",
            text: "inside body",
            folderId: "f1",
          },
        ],
      ),
      options: { mode: "merge" },
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect(data?.imported).toEqual({ folders: 1, prompts: 2 });

    const after = await prompts.snapshot("owner");
    expect(after.folders).toHaveLength(before.folders.length + 1);
    expect(after.prompts).toHaveLength(before.prompts.length + 2);
    for (const folder of before.folders) {
      expect
        .soft(
          after.folders.find((candidate) => candidate.id === folder.id),
          `folder ${folder.name}`,
        )
        .toEqual(folder);
    }
    for (const prompt of before.prompts) {
      expect
        .soft(
          after.prompts.find((candidate) => candidate.id === prompt.id),
          `prompt ${prompt.name}`,
        )
        .toEqual(prompt);
    }
  });

  test("POST import-bundle mode merge - a bundle prompt may reuse a name that lives in another folder, and a 255-character name imports whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const longName = "L".repeat(255);

    const { data } = await prompts.importBundle("owner", {
      bundle: bundleOf(
        [{ id: "f1", name: "Autotest other folder" }],
        [
          // "Autotest SP" exists in folder S, not in this one.
          {
            id: "p1",
            name: "Autotest SP",
            text: "other body",
            folderId: "f1",
          },
          { id: "p2", name: longName, text: "long" },
        ],
      ),
      options: { mode: "merge" },
    });
    expect(data?.success).toBe(true);

    const after = await prompts.snapshot("owner");
    expect(
      after.prompts.filter((prompt) => prompt.name === "Autotest SP"),
      "the same name now lives in two folders",
    ).toHaveLength(2);
    expect(after.prompts.some((prompt) => prompt.name === longName)).toBe(true);
  });

  test("POST import-bundle mode merge - a bundle folder named like an existing one (any case) does not create a second folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const { folderId } = await seedLibrary(prompts);
    const before = await prompts.snapshot("owner");

    await prompts.importBundle("owner", {
      bundle: bundleOf([{ id: "f1", name: "AUTOTEST S" }], []),
      options: { mode: "merge" },
    });

    const after = await prompts.snapshot("owner");
    expect(
      after.folders.map((folder) => folder.name).sort(),
      "still one folder per name",
    ).toEqual(before.folders.map((folder) => folder.name).sort());
    expect(
      after.folders.find((folder) => folder.id === folderId)?.name,
      "the existing folder keeps its own spelling",
    ).toBe("Autotest S");
  });
});

test.describe("AI Prompts - import is refused whole (soft refusals)", () => {
  const SOFT_REFUSALS: Array<[string, Bundle, string]> = [
    [
      "a bundle version of 0",
      { version: 0, folders: [], prompts: [] },
      "Unsupported bundle version",
    ],
    [
      "a bundle version of 2",
      { version: 2, folders: [], prompts: [] },
      "Unsupported bundle version",
    ],
    [
      "no bundle version",
      { folders: [], prompts: [] },
      "Unsupported bundle version",
    ],
    [
      "a prompt in a folder the bundle does not have, next to a clean prompt",
      bundleOf(
        [],
        [
          { id: "ok", name: "Autotest clean", text: "t" },
          {
            id: "orphan",
            name: "Autotest orphan",
            text: "t",
            folderId: "nope",
          },
        ],
      ),
      "references missing folder",
    ],
  ];

  for (const mode of ["merge", "replace"] as const) {
    test(`POST /api/2.0/ai/prompts/import-bundle - mode ${mode}: an unsupported version or a dangling folder reference is reported and nothing is written${mode === "replace" ? " or deleted" : ""}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      await seedLibrary(prompts);
      const before = await prompts.snapshot("owner");

      for (const [label, bundle, message] of SOFT_REFUSALS) {
        const { status, data } = await prompts.importBundle("owner", {
          bundle,
          options: { mode },
        });
        expect.soft(status, label).toBe(200);
        expect.soft(data?.success, label).toBe(false);
        expect.soft(data?.imported, label).toBeUndefined();
        expect
          .soft(data?.errors?.[0]?.error?.message, label)
          .toContain(message);
        expect
          .soft(await prompts.snapshot("owner"), `${label}: the library`)
          .toEqual(before);
      }
    });
  }

  test("POST /api/2.0/ai/prompts/import-bundle - mode merge: two prompts of one name in the bundle are refused whole, the clean one with them", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const before = await prompts.snapshot("owner");

    const { status, data } = await prompts.importBundle("owner", {
      bundle: bundleOf(
        [],
        [
          { id: "a", name: "Autotest clean", text: "t" },
          { id: "b", name: "Autotest twin", text: "first" },
          { id: "c", name: "Autotest twin", text: "second" },
        ],
      ),
      options: { mode: "merge" },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.errors?.[0]?.error?.message).toBe(
      "Prompt name already exists in this folder",
    );
    expect(await prompts.snapshot("owner")).toEqual(before);
  });
});

test.describe("AI Prompts - import validation (hard 400)", () => {
  const BAD_ENTRIES: Array<[string, Bundle]> = [
    ["a prompt without a text", bundleOf([], [{ id: "a", name: "n" }])],
    [
      "a prompt with a blank name",
      bundleOf([], [{ id: "a", name: "", text: "t" }]),
    ],
    [
      "a prompt with a blank text",
      bundleOf([], [{ id: "a", name: "n", text: "" }]),
    ],
    [
      "a prompt name of 256 characters",
      bundleOf([], [{ id: "a", name: "N".repeat(256), text: "t" }]),
    ],
    ["a folder with a blank name", bundleOf([{ id: "a", name: "" }], [])],
    [
      "a folder name of 256 characters",
      bundleOf([{ id: "a", name: "N".repeat(256) }], []),
    ],
  ];

  test("POST /api/2.0/ai/prompts/import-bundle - mode merge: a bundle with a single invalid entry is a 400 and writes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const before = await prompts.snapshot("owner");

    for (const [label, bundle] of BAD_ENTRIES) {
      const { status } = await prompts.importBundle("owner", {
        bundle,
        options: { mode: "merge" },
      });
      expect.soft(status, label).toBe(400);
      expect
        .soft(await prompts.snapshot("owner"), `${label}: the library`)
        .toEqual(before);
    }
  });

  const MIXED: Bundle = bundleOf(
    [],
    [
      { id: "ok", name: "Autotest valid first", text: "t" },
      { id: "bad", name: "Autotest invalid second", text: "" },
    ],
  );

  test("BUG 84421: POST /api/2.0/ai/prompts/import-bundle - mode merge: an invalid entry after a valid one is a 400 but the valid one stays written", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await seedLibrary(prompts);
    const before = await prompts.snapshot("owner");

    const { status, data } = await prompts.importBundle("owner", {
      bundle: MIXED,
      options: { mode: "merge" },
    });
    expect(status, "the bundle is refused").toBe(400);
    expect(data?.success).not.toBe(true);

    // "a corrupt bundle is rejected whole rather than applied halfway".
    test.fail();
    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  const REPLACE_REFUSALS: Array<[string, Bundle]> = [
    ["a blank prompt name", bundleOf([], [{ id: "a", name: "", text: "t" }])],
    ["a blank prompt text", bundleOf([], [{ id: "a", name: "n", text: "" }])],
    ["a valid entry followed by an invalid one", MIXED],
  ];

  for (const [label, bundle] of REPLACE_REFUSALS) {
    test(`BUG 84422: POST /api/2.0/ai/prompts/import-bundle - mode replace: ${label} is a 400 but the existing library has already been deleted`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      await seedLibrary(prompts);
      const before = await prompts.snapshot("owner");
      expect(
        before.prompts.length,
        "there is something to lose",
      ).toBeGreaterThan(0);

      const { status, data } = await prompts.importBundle("owner", {
        bundle,
        options: { mode: "replace" },
      });
      expect(status, "the bundle is refused").toBe(400);
      expect(data?.success).not.toBe(true);

      // `replace` is documented as destructive, but a refused bundle must not
      // have destroyed anything.
      test.fail();
      expect(await prompts.snapshot("owner")).toEqual(before);
    });
  }

  const MALFORMED: Array<[string, Record<string, unknown>]> = [
    ["a prompt that is a string", { bundle: bundleOf([], ["x" as never]) }],
    ["a folder that is a number", { bundle: bundleOf([5 as never], []) }],
    [
      "a prompt without a name",
      { bundle: bundleOf([], [{ id: "a", text: "t" }]) },
    ],
    ["no bundle at all", {}],
    ["a null bundle", { bundle: null }],
    ["a bundle without folders", { bundle: { version: 1, prompts: [] } }],
    ["a bundle without prompts", { bundle: { version: 1, folders: [] } }],
    [
      "a bundle whose folders is a string",
      { bundle: { version: 1, folders: "x", prompts: [] } },
    ],
    [
      "a bundle whose prompts is an object",
      { bundle: { version: 1, folders: [], prompts: {} } },
    ],
  ];

  for (const [label, body] of MALFORMED) {
    test(`BUG 84423: POST /api/2.0/ai/prompts/import-bundle - ${label} answers 500, not a 400 validation error`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      await seedLibrary(prompts);
      const before = await prompts.snapshot("owner");

      const { status } = await prompts.importBundle("owner", {
        ...body,
        options: { mode: "merge" },
      });

      expect(await prompts.snapshot("owner"), "nothing was written").toEqual(
        before,
      );

      test.fail();
      expect(status).toBe(400);
    });
  }
});

test.describe("AI Prompts - import must not bypass the name rules", () => {
  test("BUG 84424: POST /api/2.0/ai/prompts/import-bundle - mode replace: two prompts of one name in the bundle are written as duplicates", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    // The same bundle in `merge` is refused ("Prompt name already exists in this
    // folder"), and so is a second `create` of that name.
    await prompts.importBundle("owner", {
      bundle: bundleOf(
        [],
        [
          { id: "a", name: "Autotest twin", text: "first" },
          { id: "b", name: "Autotest twin", text: "second" },
        ],
      ),
      options: { mode: "replace" },
    });

    const names = (await prompts.snapshot("owner")).prompts.map((prompt) =>
      String(prompt.name).toLowerCase(),
    );
    test.fail();
    expect(new Set(names).size, "prompt names in the library").toBe(
      names.length,
    );
  });

  test("BUG 84425: POST /api/2.0/ai/prompts/import-bundle - mode merge: two folders of one name in the bundle are written as duplicates", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    // create-folder and rename-folder refuse a second folder of an existing name.
    await prompts.importBundle("owner", {
      bundle: bundleOf(
        [
          { id: "a", name: "Autotest twin" },
          { id: "b", name: "Autotest twin" },
        ],
        [],
      ),
      options: { mode: "merge" },
    });

    const names = (await prompts.snapshot("owner")).folders.map((folder) =>
      String(folder.name).toLowerCase(),
    );
    test.fail();
    expect(new Set(names).size, "folder names in the library").toBe(
      names.length,
    );
  });
});
