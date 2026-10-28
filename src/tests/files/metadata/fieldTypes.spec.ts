import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  EntryMetadataDto,
  MetadataFieldType,
  MetadataValueRequest,
} from "@onlyoffice/docspace-api-sdk";
import { createTemplateWithFields } from "@/src/helpers/metadata";
import { getMyDocsFolderId } from "@/src/helpers/files";
import { ApiSDK } from "@/src/services/api-sdk";

/**
 * Boundary matrix of the value of every metadata field type, run against both
 * a file and a folder. Limits come from the documented contract of
 * setFileValues / setFolderValues and from the server's own validation
 * messages:
 *   - string: at most 8000 characters
 *   - number: an integer within +-9007199254740991 (server message)
 *   - date: year 1..9999, a value without an offset is UTC
 *   - single choice: at most one option; multi choice: any number of options
 *   - an empty value (empty string / null / absent / empty list) clears
 *   - a value of the wrong member type is rejected
 * A rejected write must leave the target value and its sibling untouched.
 */

type Kind = "file" | "folder";
type Names = "s" | "n" | "d" | "sc" | "mc";

type Case = {
  label: string;
  /** Builds the request from the template's option IDs. */
  value: (o: Opts) => Omit<MetadataValueRequest, "fieldId">;
  /** 200 with the expected normalised stored value, or 400 (value kept). */
  expect: { status: 200; stored: unknown } | { status: 400 };
};
type Opts = { sc: string[]; mc: string[] };

const instant = (iso: string) => new Date(iso).getTime();

const CASES: Record<Names, Case[]> = {
  s: [
    {
      label: "1 character",
      value: () => ({ stringValue: "a" }),
      expect: { status: 200, stored: "a" },
    },
    {
      label: "8000 characters (limit)",
      value: () => ({ stringValue: "a".repeat(8000) }),
      expect: { status: 200, stored: "a".repeat(8000) },
    },
    {
      label: "8001 characters (just over)",
      value: () => ({ stringValue: "a".repeat(8001) }),
      expect: { status: 400 },
    },
    {
      label: "empty string clears",
      value: () => ({ stringValue: "" }),
      expect: { status: 200, stored: null },
    },
    {
      label: "null clears",
      value: () => ({ stringValue: null }),
      expect: { status: 200, stored: null },
    },
    {
      label: "absent member clears",
      value: () => ({}),
      expect: { status: 200, stored: null },
    },
    {
      label: "whitespace-only is stored as is",
      value: () => ({ stringValue: "   " }),
      expect: { status: 200, stored: "   " },
    },
    {
      label: "Cyrillic and BMP symbols",
      value: () => ({ stringValue: "Привет ™ ✓ é" }),
      expect: { status: 200, stored: "Привет ™ ✓ é" },
    },
    {
      label: "number member on a string field",
      value: () => ({ numberValue: 5 }),
      expect: { status: 400 },
    },
    {
      label: "option member on a string field",
      value: (o) => ({ optionIds: [o.sc[0]] }),
      expect: { status: 400 },
    },
  ],
  n: [
    {
      label: "zero",
      value: () => ({ numberValue: 0 }),
      expect: { status: 200, stored: 0 },
    },
    {
      label: "negative",
      value: () => ({ numberValue: -7 }),
      expect: { status: 200, stored: -7 },
    },
    {
      label: "maximum 9007199254740991",
      value: () => ({ numberValue: 9007199254740991 }),
      expect: { status: 200, stored: 9007199254740991 },
    },
    {
      label: "minimum -9007199254740991",
      value: () => ({ numberValue: -9007199254740991 }),
      expect: { status: 200, stored: -9007199254740991 },
    },
    {
      label: "maximum + 1",
      value: () => ({ numberValue: 9007199254740992 }),
      expect: { status: 400 },
    },
    {
      label: "minimum - 1",
      value: () => ({ numberValue: -9007199254740992 }),
      expect: { status: 400 },
    },
    {
      label: "far beyond the range (1e30)",
      value: () => ({ numberValue: 1e30 }),
      expect: { status: 400 },
    },
    {
      label: "null clears",
      value: () => ({ numberValue: null }),
      expect: { status: 200, stored: null },
    },
    {
      label: "absent member clears",
      value: () => ({}),
      expect: { status: 200, stored: null },
    },
    {
      label: "string member on a number field",
      value: () => ({ stringValue: "x" }),
      expect: { status: 400 },
    },
    {
      label: "option member on a number field",
      value: (o) => ({ optionIds: [o.sc[0]] }),
      expect: { status: 400 },
    },
  ],
  d: [
    {
      label: "earliest 0001-01-01T00:00:00Z",
      value: () => ({ dateValue: "0001-01-01T00:00:00Z" }),
      expect: { status: 200, stored: instant("0001-01-01T00:00:00Z") },
    },
    {
      label: "latest 9999-12-31T23:59:59Z",
      value: () => ({ dateValue: "9999-12-31T23:59:59Z" }),
      expect: { status: 200, stored: instant("9999-12-31T23:59:59Z") },
    },
    {
      label: "year 0000 (just before the range)",
      value: () => ({ dateValue: "0000-01-01" }),
      expect: { status: 400 },
    },
    {
      label: "year 10000 (just after the range)",
      value: () => ({ dateValue: "10000-01-01" }),
      expect: { status: 400 },
    },
    {
      label: "month 13",
      value: () => ({ dateValue: "2026-13-01" }),
      expect: { status: 400 },
    },
    {
      label: "not a date",
      value: () => ({ dateValue: "not a date" }),
      expect: { status: 400 },
    },
    {
      label: "date only",
      value: () => ({ dateValue: "2026-03-04" }),
      expect: { status: 200, stored: instant("2026-03-04T00:00:00Z") },
    },
    {
      label: "no offset is read as UTC",
      value: () => ({ dateValue: "2026-03-04T05:06:07" }),
      expect: { status: 200, stored: instant("2026-03-04T05:06:07Z") },
    },
    {
      label: "offset +03:00 is converted to the same instant",
      value: () => ({ dateValue: "2026-03-04T05:06:07+03:00" }),
      expect: { status: 200, stored: instant("2026-03-04T02:06:07Z") },
    },
    {
      label: "Unix epoch",
      value: () => ({ dateValue: "1970-01-01T00:00:00Z" }),
      expect: { status: 200, stored: 0 },
    },
    {
      label: "null clears",
      value: () => ({ dateValue: null }),
      expect: { status: 200, stored: null },
    },
    {
      label: "absent member clears",
      value: () => ({}),
      expect: { status: 200, stored: null },
    },
    {
      label: "string member on a date field",
      value: () => ({ stringValue: "2026-03-04" }),
      expect: { status: 400 },
    },
    {
      label: "number member on a date field",
      value: () => ({ numberValue: 5 }),
      expect: { status: 400 },
    },
  ],
  sc: [
    {
      label: "the other option replaces the stored one",
      value: (o) => ({ optionIds: [o.sc[1]] }),
      expect: { status: 200, stored: "sc:1" },
    },
    {
      label: "empty list clears",
      value: () => ({ optionIds: [] }),
      expect: { status: 200, stored: null },
    },
    {
      label: "null clears",
      value: () => ({ optionIds: null }),
      expect: { status: 200, stored: null },
    },
    {
      label: "absent member clears",
      value: () => ({}),
      expect: { status: 200, stored: null },
    },
    {
      label: "two options on a single choice",
      value: (o) => ({ optionIds: [o.sc[0], o.sc[1]] }),
      expect: { status: 400 },
    },
    {
      label: "malformed option ID",
      value: () => ({ optionIds: ["bogus"] }),
      expect: { status: 400 },
    },
    {
      label: "option of a multi choice field",
      value: (o) => ({ optionIds: [o.mc[0]] }),
      expect: { status: 400 },
    },
    {
      label: "string member on a choice field",
      value: () => ({ stringValue: "x" }),
      expect: { status: 400 },
    },
  ],
  mc: [
    {
      label: "all options",
      value: (o) => ({ optionIds: [...o.mc] }),
      expect: { status: 200, stored: "mc:0,1,2" },
    },
    {
      label: "a single option",
      value: (o) => ({ optionIds: [o.mc[2]] }),
      expect: { status: 200, stored: "mc:2" },
    },
    {
      label: "empty list clears",
      value: () => ({ optionIds: [] }),
      expect: { status: 200, stored: null },
    },
    {
      label: "null clears",
      value: () => ({ optionIds: null }),
      expect: { status: 200, stored: null },
    },
    {
      label: "absent member clears",
      value: () => ({}),
      expect: { status: 200, stored: null },
    },
    {
      label: "option of another field",
      value: (o) => ({ optionIds: [o.sc[0]] }),
      expect: { status: 400 },
    },
    {
      label: "malformed option ID",
      value: () => ({ optionIds: ["bogus"] }),
      expect: { status: 400 },
    },
    {
      label: "string member on a choice field",
      value: () => ({ stringValue: "x" }),
      expect: { status: 400 },
    },
  ],
};

const FIELD_TYPE: Record<Names, MetadataFieldType> = {
  s: MetadataFieldType.String,
  n: MetadataFieldType.Number,
  d: MetadataFieldType.Date,
  sc: MetadataFieldType.SingleChoice,
  mc: MetadataFieldType.MultiChoice,
};

const TYPE_LABEL: Record<Names, string> = {
  s: "String",
  n: "Number",
  d: "Date",
  sc: "SingleChoice",
  mc: "MultiChoice",
};

async function arrange(apiSdk: ApiSDK, kind: Kind) {
  const api = apiSdk.forRole("owner");
  const parent = await getMyDocsFolderId(api);
  let entryId: number;
  if (kind === "file") {
    const { data, status } = await api.files.createFile({
      folderId: parent,
      createFileRequest: {
        title: `Autotest types ${apiSdk.faker.generateString(6)}.docx`,
      },
    });
    expect(status).toBe(200);
    entryId = data.response!.id!;
  } else {
    const { data, status } = await api.folders.createFolder({
      folderId: parent,
      createFolderRequest: {
        title: `Autotest types ${apiSdk.faker.generateString(6)}`,
      },
    });
    expect(status).toBe(200);
    entryId = data.response!.id!;
  }

  const tpl = await createTemplateWithFields(api, apiSdk, [
    { name: "s", type: FIELD_TYPE.s },
    { name: "n", type: FIELD_TYPE.n },
    { name: "d", type: FIELD_TYPE.d },
    {
      name: "sc",
      type: FIELD_TYPE.sc,
      options: [{ value: "one" }, { value: "two" }],
    },
    {
      name: "mc",
      type: FIELD_TYPE.mc,
      options: [{ value: "a" }, { value: "b" }, { value: "c" }],
    },
    { name: "sibling", type: MetadataFieldType.String },
  ]);
  const byName = Object.fromEntries(
    tpl.template.fields!.map((f) => [f.name!, f]),
  );
  const optionIds = (n: "sc" | "mc") => byName[n].options!.map((o) => o.id!);

  const assign = {
    templateIds: [tpl.id],
  };
  const assigned =
    kind === "file"
      ? await api.metadata.assignFileTemplates({
          fileId: entryId,
          assignMetadataTemplates: assign,
        })
      : await api.metadata.assignFolderTemplates({
          folderId: entryId,
          assignMetadataTemplates: assign,
        });
  expect(assigned.status).toBe(200);

  const set = (values: MetadataValueRequest[]) =>
    kind === "file"
      ? api.metadata.setFileValues({
          fileId: entryId,
          setMetadataValues: { values },
        })
      : api.metadata.setFolderValues({
          folderId: entryId,
          setMetadataValues: { values },
        });

  const get = async (): Promise<EntryMetadataDto> => {
    const { data, status } =
      kind === "file"
        ? await api.metadata.getFileMetadata({ fileId: entryId })
        : await api.metadata.getFolderMetadata({ folderId: entryId });
    expect(status).toBe(200);
    return data.response!;
  };

  const opts = { sc: optionIds("sc"), mc: optionIds("mc") };

  /** Normalised stored value of a field, null when the entry holds none. */
  const stored = async (name: Names | "sibling"): Promise<unknown> => {
    const meta = await get();
    const f = meta
      .templates!.find((t) => t.id === tpl.id)!
      .fields!.find((x) => x.id === byName[name].id)!;
    const v = f.value;
    if (!v) return null;
    switch (name) {
      case "s":
      case "sibling":
        return v.stringValue || null;
      case "n":
        return v.numberValue ?? null;
      case "d":
        return v.dateValue
          ? new Date(v.dateValue as unknown as string).getTime()
          : null;
      case "sc":
      case "mc": {
        const ids = v.optionIds ?? [];
        if (ids.length === 0) return null;
        return `${name}:${ids
          .map((id) => opts[name].indexOf(id))
          .sort()
          .join(",")}`;
      }
    }
  };

  const seeds: Record<Names, MetadataValueRequest> = {
    s: { fieldId: byName.s.id!, stringValue: "seed" },
    n: { fieldId: byName.n.id!, numberValue: 1 },
    d: { fieldId: byName.d.id!, dateValue: "2020-01-01T00:00:00Z" },
    sc: { fieldId: byName.sc.id!, optionIds: [opts.sc[0]] },
    mc: { fieldId: byName.mc.id!, optionIds: [opts.mc[0]] },
  };
  const seededValue: Record<Names, unknown> = {
    s: "seed",
    n: 1,
    d: instant("2020-01-01T00:00:00Z"),
    sc: "sc:0",
    mc: "mc:0",
  };

  return { byName, opts, set, stored, seeds, seededValue };
}

for (const kind of ["file", "folder"] as const) {
  for (const name of Object.keys(CASES) as Names[]) {
    test(`PUT /files/metadata/${kind}/:id/values - ${TYPE_LABEL[name]} field boundaries on a ${kind}`, async ({
      apiSdk,
    }) => {
      const a = await arrange(apiSdk, kind);

      // The sibling holds a value that no write to the target may disturb
      expect(
        (
          await a.set([
            { fieldId: a.byName.sibling.id!, stringValue: "sibling" },
          ])
        ).status,
      ).toBe(200);

      for (const c of CASES[name]) {
        await test.step(c.label, async () => {
          // Arrange: the target holds a known value, the update replaces it
          expect((await a.set([a.seeds[name]])).status).toBe(200);
          expect(await a.stored(name)).toEqual(a.seededValue[name]);

          const { status } = await a.set([
            { fieldId: a.byName[name].id!, ...c.value(a.opts) },
          ]);
          expect(status, c.label).toBe(c.expect.status);

          if (c.expect.status === 200) {
            expect(await a.stored(name), c.label).toEqual(c.expect.stored);
          } else {
            expect(await a.stored(name), `${c.label}: value kept`).toEqual(
              a.seededValue[name],
            );
          }
          expect(await a.stored("sibling"), `${c.label}: sibling`).toBe(
            "sibling",
          );
        });
      }
    });
  }

  test(`PUT /files/metadata/${kind}/:id/values - A batch with one invalid value writes none of them`, async ({
    apiSdk,
  }) => {
    const a = await arrange(apiSdk, kind);
    await a.set([a.seeds.s, a.seeds.n]);

    const { status } = await a.set([
      { fieldId: a.byName.s.id!, stringValue: "changed" },
      { fieldId: a.byName.n.id!, numberValue: 9007199254740992 },
    ]);
    expect(status).toBe(400);

    expect(await a.stored("s")).toBe("seed");
    expect(await a.stored("n")).toBe(1);
  });

  test(`PUT /files/metadata/${kind}/:id/values - A fractional number is either stored exactly or rejected, never rounded`, async ({
    apiSdk,
  }) => {
    // The Int64 binding of numberValue is undocumented for fractions: the
    // contract-neutral invariant is that the stored value is never altered.
    const a = await arrange(apiSdk, kind);
    await a.set([a.seeds.n]);

    const { status } = await a.set([
      { fieldId: a.byName.n.id!, numberValue: 42.5 },
    ]);
    test.info().annotations.push({
      type: "diagnostic",
      description: `numberValue 42.5 on a ${kind} answered ${status}`,
    });

    const after = await a.stored("n");
    if (status === 200) {
      expect(after).toBe(42.5);
    } else {
      expect(status).toBe(400);
      expect(after).toBe(1);
    }
  });
}
