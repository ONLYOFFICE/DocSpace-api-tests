import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  assertRestoreRequestCannotQueue,
  startRestoreThatCannotQueue,
} from "@/src/helpers/backup";

// These tests need no portal and send nothing: they check the guard that keeps
// every restore request of the suite from reaching the restore queue (see
// assertRestoreRequestCannotQueue), and that nothing goes around it.

const GUID = "11111111-2222-3333-4444-555555555555";

const refused: { name: string; dto: unknown }[] = [
  {
    name: "an all-zero GUID",
    dto: { backupId: "0".repeat(8) + "-0000-0000-0000-" + "0".repeat(12) },
  },
  { name: "a GUID", dto: { backupId: GUID } },
  { name: "an upper-case GUID", dto: { backupId: GUID.toUpperCase() } },
  { name: "a GUID without hyphens", dto: { backupId: GUID.replace(/-/g, "") } },
  { name: "a GUID in braces", dto: { backupId: `{${GUID}}` } },
  { name: "a GUID in parentheses", dto: { backupId: `(${GUID})` } },
  {
    name: "a GUID in the hexadecimal form",
    dto: {
      backupId:
        "{0x11111111,0x2222,0x3333,{0x44,0x44,0x55,0x55,0x55,0x55,0x55,0x55}}",
    },
  },
  { name: "a GUID with spaces around it", dto: { backupId: `  ${GUID}  ` } },
  {
    name: "32 hexadecimal letters",
    dto: { backupId: "abcdefabcdefabcdefabcdefabcdefab" },
  },
  {
    name: "a GUID in another field",
    dto: { backupId: "not-a-guid", storageType: GUID },
  },
  {
    name: "a GUID in a storageParams value",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "folderId", value: GUID }],
    },
  },
  { name: "a numeric string backupId", dto: { backupId: "123" } },
  { name: "a backupId that looks like a path", dto: { backupId: "a/b" } },
  { name: "a backupId with a dot", dto: { backupId: "a.b" } },
  {
    name: "a backupId that is too long to rule out a GUID",
    dto: { backupId: "a".repeat(21) },
  },
  { name: "a non-empty object backupId", dto: { backupId: { a: 1 } } },
  { name: "a non-empty array backupId", dto: { backupId: ["a"] } },
  {
    name: "a filePath storage parameter",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "filePath", value: "x" }],
    },
  },
  {
    name: "a FILEPATH storage parameter",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "FILEPATH", value: "x" }],
    },
  },
  {
    name: "a file_path storage parameter",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "file_path", value: "x" }],
    },
  },
  {
    name: "a path in a value",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "folderId", value: "/tmp/path" }],
    },
  },
  {
    name: "a storage parameter key other than folderId",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "module", value: "s3" }],
    },
  },
  {
    name: "a storageParams item with an unexpected field",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "folderId", extra: 1 }],
    },
  },
  {
    name: "a storageParams item that is a string",
    dto: { backupId: "not-a-guid", storageParams: ["x"] },
  },
  {
    name: "non-empty storageParams as an object",
    dto: { backupId: "not-a-guid", storageParams: { folderId: "1" } },
  },
  {
    name: "a top-level filePath",
    dto: { backupId: "not-a-guid", filePath: "x" },
  },
  {
    name: "a field outside the DTO",
    dto: { backupId: "not-a-guid", serverBaseUri: "https://x" },
  },
  { name: "dump true", dto: { backupId: "not-a-guid", dump: true } },
  {
    name: "dump as the string true",
    dto: { backupId: "not-a-guid", dump: "true" },
  },
  { name: "dump as the string 1", dto: { backupId: "not-a-guid", dump: "1" } },
  {
    name: "dump as a non-zero number",
    dto: { backupId: "not-a-guid", dump: 1 },
  },
  { name: "a body that is an array", dto: [] },
  { name: "a body that is a string", dto: "x" },
];

const allowed: { name: string; dto: unknown }[] = [
  { name: "no body", dto: undefined },
  { name: "a null body", dto: null },
  { name: "an empty body", dto: {} },
  { name: "a backupId that is not a GUID", dto: { backupId: "not-a-guid" } },
  { name: "an empty backupId", dto: { backupId: "" } },
  { name: "a null backupId", dto: { backupId: null } },
  { name: "a numeric backupId", dto: { backupId: 123 } },
  { name: "a boolean backupId", dto: { backupId: true } },
  { name: "an empty object backupId", dto: { backupId: {} } },
  { name: "an empty array backupId", dto: { backupId: [] } },
  {
    name: "a storageType of any kind",
    dto: { backupId: "not-a-guid", storageType: 99 },
  },
  {
    name: "a string storageType",
    dto: { backupId: "not-a-guid", storageType: "abc" },
  },
  {
    name: "a notify of the wrong type",
    dto: { backupId: "not-a-guid", notify: "x" },
  },
  { name: "dump false", dto: { backupId: "not-a-guid", dump: false } },
  {
    name: "dump as a string that is not true",
    dto: { backupId: "not-a-guid", dump: "x" },
  },
  {
    name: "empty storageParams",
    dto: { backupId: "not-a-guid", storageParams: [] },
  },
  {
    name: "null storageParams",
    dto: { backupId: "not-a-guid", storageParams: null },
  },
  {
    name: "empty object storageParams",
    dto: { backupId: "not-a-guid", storageParams: {} },
  },
  {
    name: "string storageParams",
    dto: { backupId: "not-a-guid", storageParams: "x" },
  },
  {
    name: "a folderId storage parameter",
    dto: {
      backupId: "not-a-guid",
      storageParams: [{ key: "folderId", value: "1" }],
    },
  },
  {
    name: "a null storageParams item",
    dto: { backupId: "not-a-guid", storageParams: [null] },
  },
  {
    name: "a storageParams item without a key",
    dto: { backupId: "not-a-guid", storageParams: [{ value: "x" }] },
  },
];

test.describe("Backup restore guard - startRestoreThatCannotQueue", () => {
  for (const { name, dto } of refused) {
    test(`Refuses ${name}`, () => {
      expect(() => assertRestoreRequestCannotQueue(dto)).toThrow(/Refusing/);
    });
  }

  for (const { name, dto } of allowed) {
    test(`Lets through ${name}`, () => {
      expect(() => assertRestoreRequestCannotQueue(dto)).not.toThrow();
    });
  }

  test("A refused body is never passed to the SDK, an allowed one is passed once", async () => {
    const sent: unknown[] = [];
    const fakeApi = {
      startBackupRestore: async (request: unknown) => {
        sent.push(request);
        return {};
      },
    } as never;

    for (const { dto } of refused) {
      await expect(startRestoreThatCannotQueue(fakeApi, dto)).rejects.toThrow(
        /Refusing/,
      );
    }
    expect(sent).toEqual([]);

    await startRestoreThatCannotQueue(fakeApi, { backupId: "not-a-guid" });
    expect(sent).toHaveLength(1);
  });
});

test.describe("Backup restore guard - nothing goes around it", () => {
  const root = path.resolve(__dirname, "..", "..");
  const helper = path.join(root, "helpers", "backup.ts");
  const self = path.resolve(__filename);

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(ts|js|mjs)$/.test(entry.name) ? [full] : [];
    });
  }

  // Blanks out comments, keeping the line numbers, so that a comment that names
  // the endpoint is not taken for a call.
  function withoutComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  function codeLines(file: string) {
    return withoutComments(fs.readFileSync(file, "utf-8"))
      .split("\n")
      .map((line, index) => ({ line, at: `${file}:${index + 1}` }));
  }

  // Built from parts so that this file does not match its own search.
  const sdkCall = new RegExp(["start", "BackupRestore"].join(""));
  const rawCall = new RegExp(["start", "restore"].join(""), "i");

  test("startBackupRestore is called only by the guard helper", () => {
    const offenders = sourceFiles(root)
      .filter((file) => file !== helper && file !== self)
      .flatMap((file) =>
        codeLines(file)
          .filter(({ line }) => sdkCall.test(line))
          .map(({ at }) => at),
      );

    expect(offenders).toEqual([]);
  });

  test("The restore endpoint is not reached by a raw HTTP request", () => {
    const offenders = sourceFiles(root)
      .filter((file) => file !== self)
      .flatMap((file) =>
        codeLines(file)
          .filter(
            ({ line }) =>
              rawCall.test(line) &&
              /(\.post\(|fetch\(|\.request\(|\.fetch\()/.test(line),
          )
          .map(({ at }) => at),
      );

    expect(offenders).toEqual([]);
  });

  test("The guard helper makes exactly one SDK call, after the check", () => {
    const source = fs.readFileSync(helper, "utf-8");
    const calls = source.match(/\.startBackupRestore\(/g) ?? [];
    expect(calls).toHaveLength(1);

    const check = source.indexOf("assertRestoreRequestCannotQueue(dto);");
    const call = source.indexOf(".startBackupRestore(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(call);
  });
});
