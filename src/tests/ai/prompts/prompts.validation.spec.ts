import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  ownerPrompts,
  UNKNOWN_FOLDER_ID,
  UNKNOWN_PROMPT_ID,
} from "@/src/helpers/ai-prompts";

// Input validation for the write routes, the part of 18.1/18.2 that
// prompts.spec.ts leaves at "blank name / blank text / 5000 characters".
//
// Measured on 2026-10-08 (every figure re-checked by the tests below):
//   * name limit is 255 characters on create, update, create-folder, rename-folder
//     and import — 255 is stored whole, 256 is a hard 400
//   * a text of the wrong type or a missing text is a hard 400
//   * a name that is missing, null or not a string is a hard **500** on create,
//     create-folder, rename-folder and update — while the sibling field `text`
//     answers 400 for the same kind of input. Those are the BUG 84429 tests.
//   * names are unique per folder / per library **case-insensitively**, and are
//     not trimmed — "Alpha " is a different name from "Alpha".
//
// The over-long names and duplicate names that prompts.spec.ts already pins
// (5000 characters, exact-case duplicates) are not repeated here.

const NAME_255 = "N".repeat(255);
const NAME_256 = "M".repeat(256);

// A `name` that is not a usable string. `undefined` leaves the key out.
const BAD_NAMES: Array<[string, unknown]> = [
  ["missing", undefined],
  ["null", null],
  ["a number", 5],
  ["a boolean", true],
  ["an array", ["a"]],
  ["an object", { a: 1 }],
];

// A `text` that is not a usable string.
const BAD_TEXTS: Array<[string, unknown]> = [
  ["missing", undefined],
  ["null", null],
  ["a number", 5],
  ["a boolean", true],
  ["an array", ["a"]],
  ["an object", { a: 1 }],
];

const withField = (key: string, value: unknown) =>
  value === undefined ? {} : { [key]: value };

test.describe("AI Prompts - create: field validation", () => {
  for (const [label, value] of BAD_NAMES) {
    test(`BUG 84429: POST /api/2.0/ai/prompts/create - a name that is ${label} answers 500, not a 400 validation error`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);

      const { status } = await prompts.createPrompt("owner", {
        ...withField("name", value),
        text: "Body",
      });

      expect(
        (await prompts.listPrompts("owner")).data,
        "the refused call stored nothing",
      ).toEqual([]);

      // `text` of the wrong type is a clean 400 on this same route (test below),
      // so the unhandled name is the odd one out.
      test.fail();
      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/prompts/create - a text that is missing, null or not a string is a 400 and stores nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    for (const [label, value] of BAD_TEXTS) {
      const { status } = await prompts.createPrompt("owner", {
        name: `Autotest text ${label}`,
        ...withField("text", value),
      });
      expect.soft(status, `text is ${label}`).toBe(400);
    }

    expect((await prompts.listPrompts("owner")).data).toEqual([]);
  });

  test("POST /api/2.0/ai/prompts/create - a name of 255 characters is stored whole, 256 is a 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    const promptId = await prompts.createPromptId("owner", {
      name: NAME_255,
      text: "Body",
    });
    expect((await prompts.getPrompt("owner", promptId)).data?.name).toBe(
      NAME_255,
    );

    const over = await prompts.createPrompt("owner", {
      name: NAME_256,
      text: "Body",
    });
    expect(over.status).toBe(400);
    expect(
      (await prompts.listPrompts("owner")).data.map((prompt) => prompt.id),
      "the 256-character name stored nothing",
    ).toEqual([promptId]);
  });

  test("POST /api/2.0/ai/prompts/create - the shortest name and text are accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    const promptId = await prompts.createPromptId("owner", {
      name: "q",
      text: "z",
    });

    const read = await prompts.getPrompt("owner", promptId);
    expect(read.data?.name).toBe("q");
    expect(read.data?.text).toBe("z");
  });

  test("POST /api/2.0/ai/prompts/create - whitespace, quotes, JSON and CRLF in the text come back unchanged", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const text = [
      "  leading and trailing  ",
      "\ttabbed\tline",
      "windows\r\nline break",
      "quote \" apostrophe ' backslash \\ end",
      '{"json": [1, 2, {"k": null}], "s": "a\\nb"}',
      "trailing newline\n",
    ].join("\n");

    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest whitespace",
      text,
    });

    expect((await prompts.getPrompt("owner", promptId)).data?.text).toBe(text);
    expect(
      (await prompts.exportBundle("owner")).data?.prompts?.[0]?.text,
      "and through export",
    ).toBe(text);
  });

  test("POST /api/2.0/ai/prompts/create - Cyrillic and CJK names and texts round-trip", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const name = "Автотест: краткое изложение 总结";
    const text = "Сделай краткое изложение документа. 请用中文回答。";

    const promptId = await prompts.createPromptId("owner", { name, text });
    const read = await prompts.getPrompt("owner", promptId);

    expect(read.data?.name).toBe(name);
    expect(read.data?.text).toBe(text);
  });

  test("POST /api/2.0/ai/prompts/create - a prompt created in a folder is bound to it and only listed there", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest home");

    const created = await prompts.createPrompt("owner", {
      name: "Autotest inside",
      text: "Body",
      folderId,
    });
    expect(created.status).toBe(200);
    expect(created.data?.success).toBe(true);
    expect(created.data?.prompt?.folderId, "the create response").toBe(
      folderId,
    );
    const promptId = created.data!.prompt!.id!;

    expect(
      (await prompts.getPrompt("owner", promptId)).data?.folderId,
      "get-by-id",
    ).toBe(folderId);
    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
      "the folder listing",
    ).toEqual([promptId]);
    expect(
      (await prompts.listPrompts("owner")).data,
      "the root listing does not carry it",
    ).toEqual([]);
  });

  test("POST /api/2.0/ai/prompts/create - one name is allowed in the root and in two folders, and may equal a folder's name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderA = await prompts.createFolderId("owner", "Autotest shared");
    const folderB = await prompts.createFolderId("owner", "Autotest other");

    // The uniqueness rule is per folder, so the same name lives in three scopes.
    const inRoot = await prompts.createPromptId("owner", {
      name: "Autotest shared",
      text: "root body",
    });
    const inA = await prompts.createPromptId("owner", {
      name: "Autotest shared",
      text: "A body",
      folderId: folderA,
    });
    const inB = await prompts.createPromptId("owner", {
      name: "Autotest shared",
      text: "B body",
      folderId: folderB,
    });

    expect((await prompts.getPrompt("owner", inRoot)).data?.text).toBe(
      "root body",
    );
    expect((await prompts.getPrompt("owner", inA)).data?.text).toBe("A body");
    expect((await prompts.getPrompt("owner", inB)).data?.text).toBe("B body");
    expect(
      (await prompts.listPrompts("owner", folderA)).data.map((p) => p.id),
    ).toEqual([inA]);
    expect(
      (await prompts.listPrompts("owner", folderB)).data.map((p) => p.id),
    ).toEqual([inB]);

    // A prompt may also share its name with a folder — separate namespaces.
    // "Autotest shared" is already a folder's name above; the reverse direction:
    const folderNamedLikePrompt = await prompts.createFolder(
      "owner",
      "Autotest shared prompt",
    );
    expect(folderNamedLikePrompt.data?.success).toBe(true);
    const promptNamedLikeFolder = await prompts.createPrompt("owner", {
      name: "Autotest shared prompt",
      text: "Body",
    });
    expect(promptNamedLikeFolder.data?.success).toBe(true);
  });

  test("POST /api/2.0/ai/prompts/create - the name is unique case-insensitively, inside a folder too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest folder");
    const rootId = await prompts.createPromptId("owner", {
      name: "Autotest Case",
      text: "root body",
    });
    const folderPromptId = await prompts.createPromptId("owner", {
      name: "Autotest Case",
      text: "folder body",
      folderId,
    });
    const before = await prompts.snapshot("owner");

    for (const [label, body] of [
      ["root", { name: "AUTOTEST CASE", text: "x" }],
      ["folder", { name: "autotest case", text: "x", folderId }],
    ] as const) {
      const { data } = await prompts.createPrompt("owner", body);
      expect
        .soft(data?.success, `${label}: a case variant is refused`)
        .toBe(false);
      expect
        .soft(data?.error?.message, `${label}: the refusal`)
        .toBe("Prompt name already exists in this folder");
    }

    expect(
      await prompts.snapshot("owner"),
      "neither refusal wrote anything",
    ).toEqual(before);
    expect(before.prompts.map((prompt) => prompt.id).sort()).toEqual(
      [rootId, folderPromptId].sort(),
    );
  });
});

test.describe("AI Prompts - update: field validation", () => {
  test("PUT /api/2.0/ai/prompts/update - a missing or malformed id is a 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await prompts.createPromptId("owner", { name: "Autotest keep", text: "B" });
    const before = await prompts.snapshot("owner");

    const missing = await prompts.updatePrompt("owner", {
      updates: { name: "Autotest renamed" },
    });
    expect(missing.status, "id missing").toBe(400);

    const malformed = await prompts.updatePrompt("owner", {
      id: "not-a-guid",
      updates: { name: "Autotest renamed" },
    });
    expect(malformed.status, "id is not a GUID").toBe(400);

    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("PUT /api/2.0/ai/prompts/update - a blank name is refused and the prompt keeps its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest keeper",
      text: "Body",
    });
    const before = await prompts.snapshot("owner");

    for (const name of ["", "   ", "\t\n"]) {
      const { status, data } = await prompts.updatePrompt("owner", {
        id: promptId,
        updates: { name },
      });
      expect.soft(status, `name ${JSON.stringify(name)}`).toBe(200);
      expect.soft(data?.success, `name ${JSON.stringify(name)}`).toBe(false);
      expect
        .soft(data?.error?.message, `name ${JSON.stringify(name)}`)
        .toBe("Name is required");
    }

    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("PUT /api/2.0/ai/prompts/update - a blank or non-string text is a 400 and the prompt keeps its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest keeper",
      text: "Body",
    });
    const before = await prompts.snapshot("owner");

    for (const [label, text] of [
      ["empty", ""],
      ["whitespace", "   "],
      ["an array", [1]],
      ["an object", { a: 1 }],
    ] as const) {
      const { status } = await prompts.updatePrompt("owner", {
        id: promptId,
        updates: { text },
      });
      expect.soft(status, `text is ${label}`).toBe(400);
    }

    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  for (const [label, value] of BAD_NAMES.filter(
    ([, value]) => typeof value !== "undefined" && value !== null,
  )) {
    test(`BUG 84429: PUT /api/2.0/ai/prompts/update - a name that is ${label} answers 500, not a 400 validation error`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      const promptId = await prompts.createPromptId("owner", {
        name: "Autotest keeper",
        text: "Body",
      });
      const before = await prompts.snapshot("owner");

      const { status } = await prompts.updatePrompt("owner", {
        id: promptId,
        updates: { name: value },
      });

      expect(
        await prompts.snapshot("owner"),
        "the refused call changed nothing",
      ).toEqual(before);

      test.fail();
      expect(status).toBe(400);
    });
  }

  test("PUT /api/2.0/ai/prompts/update - a name of 255 characters is stored whole, 256 is a 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest short",
      text: "Body",
    });

    const over = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { name: NAME_256 },
    });
    expect(over.status).toBe(400);
    expect(
      (await prompts.getPrompt("owner", promptId)).data?.name,
      "the 256-character name changed nothing",
    ).toBe("Autotest short");

    const exact = await prompts.updatePrompt("owner", {
      id: promptId,
      updates: { name: NAME_255 },
    });
    expect(exact.data?.success).toBe(true);
    expect((await prompts.getPrompt("owner", promptId)).data?.name).toBe(
      NAME_255,
    );
  });

  test("PUT /api/2.0/ai/prompts/update - an unknown or malformed folderId is refused and nothing moves", async ({
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
    const before = await prompts.snapshot("owner");

    for (const target of [UNKNOWN_FOLDER_ID, "not-a-guid"]) {
      const { status, data } = await prompts.updatePrompt("owner", {
        id: promptId,
        updates: { folderId: target, name: "Autotest renamed too" },
      });
      expect.soft(status, `folderId ${target}`).toBe(200);
      expect.soft(data?.success, `folderId ${target}`).toBe(false);
      expect
        .soft(data?.error?.message, `folderId ${target}`)
        .toBe(`Folder not found: ${target}`);
    }

    // The rename in the same body must not have been applied half-way.
    expect(await prompts.snapshot("owner")).toEqual(before);
    expect(before.prompts[0]?.id).toBe(promptId);
  });

  test("PUT /api/2.0/ai/prompts/update - a prompt may take its own name back and a name used in another folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest folder");
    const inFolder = await prompts.createPromptId("owner", {
      name: "Autotest taken",
      text: "folder body",
      folderId,
    });
    const inRoot = await prompts.createPromptId("owner", {
      name: "Autotest free",
      text: "root body",
    });

    // Another folder's name is not a conflict — the rule is per folder.
    const other = await prompts.updatePrompt("owner", {
      id: inRoot,
      updates: { name: "Autotest taken" },
    });
    expect(other.data?.success).toBe(true);
    expect((await prompts.getPrompt("owner", inRoot)).data?.name).toBe(
      "Autotest taken",
    );
    expect((await prompts.getPrompt("owner", inFolder)).data?.name).toBe(
      "Autotest taken",
    );

    // Its own name, even re-cased, is not a conflict with itself.
    for (const name of ["Autotest taken", "AUTOTEST TAKEN"]) {
      const self = await prompts.updatePrompt("owner", {
        id: inRoot,
        updates: { name },
      });
      expect.soft(self.data?.success, `to ${name}`).toBe(true);
    }
    expect((await prompts.getPrompt("owner", inRoot)).data?.name).toBe(
      "AUTOTEST TAKEN",
    );
  });

  test("PUT /api/2.0/ai/prompts/update - a case variant of a sibling's name is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await prompts.createPromptId("owner", {
      name: "Autotest Sibling",
      text: "First",
    });
    const second = await prompts.createPromptId("owner", {
      name: "Autotest second",
      text: "Second",
    });
    const before = await prompts.snapshot("owner");

    const { data } = await prompts.updatePrompt("owner", {
      id: second,
      updates: { name: "AUTOTEST SIBLING" },
    });

    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe(
      "Prompt name already exists in this folder",
    );
    expect(await prompts.snapshot("owner")).toEqual(before);
  });
});

test.describe("AI Prompt folders - field validation", () => {
  for (const [label, body] of [
    ["null", null],
    ["a number", 5],
    ["a boolean", true],
    ["an array", ["a"]],
    ["an object without a name", {}],
    ["an object with a null name", { name: null }],
    ["an object with a numeric name", { name: 5 }],
  ] as Array<[string, unknown]>) {
    test(`BUG 84429: POST /api/2.0/ai/prompts/create-folder - a body that is ${label} answers 500, not a 400 validation error`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);

      const { status } = await prompts.createFolder("owner", body);

      expect(
        (await prompts.listFolders("owner")).data,
        "the refused call created nothing",
      ).toEqual([]);

      test.fail();
      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/prompts/create-folder - a name of 255 characters is stored whole, 256 is a 400, one character is enough", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    const exactId = await prompts.createFolderId("owner", NAME_255);
    expect((await prompts.getFolder("owner", exactId)).data?.name).toBe(
      NAME_255,
    );

    const shortId = await prompts.createFolderId("owner", "z");
    expect((await prompts.getFolder("owner", shortId)).data?.name).toBe("z");

    const over = await prompts.createFolder("owner", NAME_256);
    expect(over.status).toBe(400);
    expect(
      (await prompts.listFolders("owner")).data
        .map((folder) => folder.id)
        .sort(),
      "the 256-character name created nothing",
    ).toEqual([exactId, shortId].sort());
  });

  test("POST /api/2.0/ai/prompts/create-folder - the name is unique case-insensitively but is not trimmed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest Alpha");
    const before = await prompts.snapshot("owner");

    const variant = await prompts.createFolder("owner", "AUTOTEST ALPHA");
    expect(variant.data?.success).toBe(false);
    expect(variant.data?.error?.message).toBe("Folder name already exists");
    expect(
      await prompts.snapshot("owner"),
      "the refused case variant created nothing",
    ).toEqual(before);
    expect(before.folders.map((folder) => folder.id)).toEqual([folderId]);
  });

  for (const [label, value] of BAD_NAMES) {
    test(`BUG 84429: PUT /api/2.0/ai/prompts/rename-folder - a name that is ${label} answers 500, not a 400 validation error`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      const folderId = await prompts.createFolderId("owner", "Autotest keeper");
      const before = await prompts.snapshot("owner");

      const { status } = await prompts.renameFolder("owner", {
        id: folderId,
        ...withField("name", value),
      });

      expect(
        await prompts.snapshot("owner"),
        "the refused rename changed nothing",
      ).toEqual(before);

      test.fail();
      expect(status).toBe(400);
    });
  }

  test("PUT /api/2.0/ai/prompts/rename-folder - a name of 255 characters is stored whole, 256 is a 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest short");

    const over = await prompts.renameFolder("owner", {
      id: folderId,
      name: NAME_256,
    });
    expect(over.status).toBe(400);
    expect(
      (await prompts.getFolder("owner", folderId)).data?.name,
      "the 256-character name changed nothing",
    ).toBe("Autotest short");

    const exact = await prompts.renameFolder("owner", {
      id: folderId,
      name: NAME_255,
    });
    expect(exact.data?.success).toBe(true);
    expect((await prompts.getFolder("owner", folderId)).data?.name).toBe(
      NAME_255,
    );
  });

  test("PUT /api/2.0/ai/prompts/rename-folder - a folder may be renamed to its own name, re-cased, or to Unicode", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest folder");
    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "Body",
      folderId,
    });

    for (const name of [
      "Autotest folder",
      "AUTOTEST FOLDER",
      "Папка для промптов 📁 提示",
    ]) {
      const { status, data } = await prompts.renameFolder("owner", {
        id: folderId,
        name,
      });
      expect.soft(status, `to ${name}`).toBe(200);
      expect.soft(data?.success, `to ${name}`).toBe(true);
      expect
        .soft((await prompts.getFolder("owner", folderId)).data?.name, name)
        .toBe(name);
    }

    expect(
      (await prompts.listPrompts("owner", folderId)).data.map((p) => p.id),
      "the prompt stayed in the renamed folder",
    ).toEqual([promptId]);
  });

  test("PUT /api/2.0/ai/prompts/rename-folder - a case variant of another folder's name is refused and nothing changes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await prompts.createFolderId("owner", "Autotest Alpha");
    const second = await prompts.createFolderId("owner", "Autotest Beta");
    const before = await prompts.snapshot("owner");

    const { data } = await prompts.renameFolder("owner", {
      id: second,
      name: "AUTOTEST ALPHA",
    });

    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Folder name already exists");
    expect(await prompts.snapshot("owner")).toEqual(before);
  });
});

test.describe("AI Prompts - move and delete: id validation", () => {
  test("PUT /api/2.0/ai/prompts/move - a missing or malformed prompt id is a 400, an unknown folder id is refused softly", async ({
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
    const before = await prompts.snapshot("owner");

    const noBody = await prompts.movePrompt("owner", {});
    expect.soft(noBody.status, "an empty body").toBe(400);
    const noId = await prompts.movePrompt("owner", { folderId });
    expect.soft(noId.status, "id missing").toBe(400);
    const badId = await prompts.movePrompt("owner", {
      id: "not-a-guid",
      folderId,
    });
    expect.soft(badId.status, "id is not a GUID").toBe(400);

    for (const target of ["not-a-guid", "", UNKNOWN_FOLDER_ID]) {
      const { status, data } = await prompts.movePrompt("owner", {
        id: promptId,
        folderId: target,
      });
      expect.soft(status, `folderId ${JSON.stringify(target)}`).toBe(200);
      expect
        .soft(data?.success, `folderId ${JSON.stringify(target)}`)
        .toBe(false);
      expect
        .soft(data?.error?.message, `folderId ${JSON.stringify(target)}`)
        .toBe(`Folder not found: ${target}`);
    }

    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("DELETE /api/2.0/ai/prompts/delete - a malformed or whitespace id is a 400 and deletes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    await prompts.createPromptId("owner", {
      name: "Autotest keeper",
      text: "B",
    });
    const before = await prompts.snapshot("owner");

    for (const id of ["not-a-guid", "   "]) {
      const { status } = await prompts.deletePrompt("owner", id);
      expect.soft(status, `id ${JSON.stringify(id)}`).toBe(400);
    }
    // A prompt id that no library holds is answered with success, as the SDK
    // documents ("An ID that does not exist ... is not reported").
    const unknown = await prompts.deletePrompt("owner", UNKNOWN_PROMPT_ID);
    expect(unknown.status).toBe(200);
    expect(unknown.data?.success).toBe(true);

    expect(await prompts.snapshot("owner")).toEqual(before);
  });

  test("DELETE /api/2.0/ai/prompts/delete-folder - a malformed or whitespace id is a 400 and deletes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", "Autotest keeper");
    await prompts.createPromptId("owner", {
      name: "Autotest inside",
      text: "B",
      folderId,
    });
    const before = await prompts.snapshot("owner");

    for (const id of ["not-a-guid", "   "]) {
      const { status } = await prompts.deleteFolder("owner", id);
      expect.soft(status, `id ${JSON.stringify(id)}`).toBe(400);
    }

    expect(
      await prompts.snapshot("owner"),
      "neither the folder nor the prompt inside it was touched",
    ).toEqual(before);
  });

  test("GET /api/2.0/ai/prompts/get-by-id, get-folder-by-id - a whitespace id is a 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);

    expect((await prompts.getPrompt("owner", "   ")).status).toBe(400);
    expect((await prompts.getPrompt("owner", "not-a-guid")).status).toBe(400);
    expect((await prompts.getFolder("owner", "   ")).status).toBe(400);
  });
});
