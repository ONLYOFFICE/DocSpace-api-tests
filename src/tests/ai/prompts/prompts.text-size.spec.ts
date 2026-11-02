import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { ownerPrompts } from "@/src/helpers/ai-prompts";

// "Save AI prompt to folder" in the editor's AI Chat is a plain
// POST /api/2.0/ai/prompts/create {name, text, folderId} (DocSpace AI service,
// PromptsApi.aiPromptsCreate). The call is synchronous: the engine stores the row
// and answers with it. No model is called and no operation is queued.
//
// Reported as a possible DoS: a 5000-character prompt text. The contract the
// existing suites pin is that `name` is limited to 255 characters and `text` is
// not (a 50 KB body is stored whole - prompts.spec.ts). These tests pin the
// boundary values around 5000 for `text` only, with exact lengths, in a folder,
// and check that the answer is prompt, intact and leaves the API responsive.
//
// Role matrix, foreign-folder isolation and the blank-text 400 are already
// covered by prompts.permission.spec.ts / prompts.validation.spec.ts and are not
// repeated. Diagnostics run serially and one request at a time - this is a
// single-request check, not a load test.

type Sample = {
  label: string;
  text: string;
};

/** Deterministic text of exactly `codePoints` code points built from `unit`. */
function exactText(unit: string, codePoints: number): string {
  const glyphs = Array.from(unit);
  let out = "";
  for (let i = 0; i < codePoints; i++) {
    out += glyphs[i % glyphs.length];
  }
  return out;
}

/** The three different "lengths" a Unicode string has. */
function measure(text: string) {
  return {
    utf16: text.length,
    codePoints: Array.from(text).length,
    utf8Bytes: Buffer.byteLength(text, "utf8"),
  };
}

const ASCII = "abcdefghijklmnopqrstuvwxyz0123456789";
const CYRILLIC = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжз";
const EMOJI = "😀🚀👨‍👩‍👧🇷🇺✨";
const JSON_SPECIAL = `"\\/\b\f\t{}[]:,'<>&\u0000`;

const SIZES = [1, 4999, 5000, 5001, 10000] as const;

const FOLDER_NAME = "Autotest size folder";

test.describe("AI Prompts - create: text size boundaries", () => {
  test.describe.configure({ mode: "serial" });

  for (const size of SIZES) {
    test(`POST /api/2.0/ai/prompts/create - a ${size}-character ASCII text is stored whole in a folder`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      const folderId = await prompts.createFolderId("owner", FOLDER_NAME);
      const text = exactText(ASCII, size);
      expect(text.length, "the generator is exact").toBe(size);

      const name = `Autotest ${size}`;
      const created = await prompts.createPrompt("owner", {
        name,
        text,
        folderId,
      });

      expect(created.status).toBe(200);
      expect(created.data?.success).toBe(true);
      const promptId = created.data?.prompt?.id;
      expect(promptId).toBeDefined();

      const read = await prompts.getPrompt("owner", promptId!);
      expect(read.status).toBe(200);
      expect(read.data?.text?.length, "not truncated").toBe(size);
      expect(read.data?.text, "byte-for-byte").toBe(text);
      expect(read.data?.name).toBe(name);
      expect(read.data?.folderId).toBe(folderId);
    });
  }

  test("POST /api/2.0/ai/prompts/create - an empty text is a 400 and stores nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", FOLDER_NAME);

    const { status } = await prompts.createPrompt("owner", {
      name: "Autotest empty",
      text: "",
      folderId,
    });

    expect(
      (await prompts.listPrompts("owner", folderId)).data,
      "the refused call stored nothing",
    ).toEqual([]);
    expect(status).toBe(400);
  });

  const SAMPLES: Sample[] = [
    { label: "ASCII", text: exactText(ASCII, 5000) },
    { label: "Cyrillic", text: exactText(CYRILLIC, 5000) },
    { label: "one repeated character", text: "x".repeat(5000) },
    {
      label: "newlines (LF and CRLF)",
      text: exactText("line one\nline two\r\n\n", 5000),
    },
    { label: "JSON special characters", text: exactText(JSON_SPECIAL, 5000) },
    // 5000 UTF-16 units but 2500 code points - the "5000" of the report depends
    // on which length is meant.
    { label: "emoji, 5000 UTF-16 units", text: exactText("😀", 2500) },
    // 5000 code points = 10000 UTF-16 units = 20000 UTF-8 bytes for plain emoji.
    { label: "emoji, 5000 code points", text: exactText(EMOJI, 5000) },
  ];

  for (const sample of SAMPLES) {
    test(`POST /api/2.0/ai/prompts/create - 5000 characters of ${sample.label} survive create, get and export`, async ({
      apiSdk,
      paymentsApi,
    }, testInfo) => {
      const prompts = await ownerPrompts(apiSdk, paymentsApi);
      const folderId = await prompts.createFolderId("owner", FOLDER_NAME);
      testInfo.annotations.push({
        type: "text-measure",
        description: JSON.stringify(measure(sample.text)),
      });

      const promptId = await prompts.createPromptId("owner", {
        name: `Autotest ${sample.label}`,
        text: sample.text,
        folderId,
      });

      const read = await prompts.getPrompt("owner", promptId);
      expect(read.data?.text, "get-by-id returns the exact text").toBe(
        sample.text,
      );

      const inFolder = await prompts.listPrompts("owner", folderId);
      expect(
        inFolder.data.find((prompt) => prompt.id === promptId)?.text,
        "list returns the exact text",
      ).toBe(sample.text);

      const exported = await prompts.exportBundle("owner");
      expect(
        exported.data?.prompts?.find((prompt) => prompt.id === promptId)?.text,
        "export returns the exact text",
      ).toBe(sample.text);
    });
  }

  test("POST /api/2.0/ai/prompts/create - one save leaves exactly one prompt, in the chosen folder, with the chosen name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", FOLDER_NAME);
    const text = exactText(ASCII, 5000);

    const promptId = await prompts.createPromptId("owner", {
      name: "Autotest single",
      text,
      folderId,
    });

    const inFolder = await prompts.listPrompts("owner", folderId);
    expect(inFolder.data.map((prompt) => prompt.id)).toEqual([promptId]);
    expect(
      (await prompts.listPrompts("owner")).data,
      "nothing leaked to the root",
    ).toEqual([]);
    expect((await prompts.listFolders("owner")).data).toHaveLength(1);

    const first = (await prompts.getPrompt("owner", promptId)).data;
    const second = (await prompts.getPrompt("owner", promptId)).data;
    expect(second, "a repeated read changes nothing").toEqual(first);
  });

  test("POST /api/2.0/ai/prompts/create - a 5000-character save answers promptly, and the API stays responsive afterwards", async ({
    apiSdk,
    paymentsApi,
  }, testInfo) => {
    const prompts = await ownerPrompts(apiSdk, paymentsApi);
    const folderId = await prompts.createFolderId("owner", FOLDER_NAME);

    const timings: Record<string, number> = {};
    for (const size of [1, 5000, 10000]) {
      const started = Date.now();
      const { status, data } = await prompts.createPrompt("owner", {
        name: `Autotest timing ${size}`,
        text: exactText(ASCII, size),
        folderId,
      });
      timings[String(size)] = Date.now() - started;

      expect(status, `size ${size}`).toBe(200);
      expect(data?.success, `size ${size}`).toBe(true);
    }
    testInfo.annotations.push({
      type: "create-ms",
      description: JSON.stringify(timings),
    });

    // Absolute bound, not a ratio: a one-off timing ratio is noise on a shared
    // portal. A multi-second answer for 10 KB would still be a finding.
    expect(timings["5000"], "5000 characters, ms").toBeLessThan(5_000);
    expect(timings["10000"], "10000 characters, ms").toBeLessThan(5_000);

    // Related APIs still answer after the large writes.
    expect((await prompts.listPrompts("owner", folderId)).status).toBe(200);
    expect((await prompts.listFolders("owner")).status).toBe(200);
    expect((await prompts.exportBundle("owner")).status).toBe(200);
    const { status: operationsStatus, data: operations } = await apiSdk
      .forRole("owner")
      .operations.getOperationStatuses();
    expect(operationsStatus).toBe(200);
    expect(
      (operations.response ?? []).filter((op) => !op.finished),
      "the save queued no background operation",
    ).toEqual([]);
  });
});
