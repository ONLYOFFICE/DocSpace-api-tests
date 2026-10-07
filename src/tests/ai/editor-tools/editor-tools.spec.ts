import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  AiEditorTools,
  EditorTool,
  generatedFile,
  isReadOnly,
  readToolResult,
  sampleArguments,
  wrongTypeValue,
} from "@/src/helpers/ai-editor-tools";
import { listFolderFiles } from "@/src/helpers/text-to-docx";
import { ApiSDK } from "@/src/services/api-sdk";

// `GET /api/2.0/ai/editor-tools/list` and `POST /api/2.0/ai/editor-tools/call`.
//
// What the pair really is (measured 2026-10-07, see the probe notes in memory):
// not a "hand the editor a command" endpoint but a server-side executor. /list
// publishes the DocSpace REST tools (`get_file_info`, `delete_file`,
// `archive_room` …) plus three document generators; /call runs one of them AS THE
// CALLER against the portal's own REST API. So the tests that matter prove an
// effect on the portal, read back through the Files API, not a 200.
//
// Reading the answer: a tool that fails still answers 200 and says so inside
// `result` — `{"content":[{"text":"…"}],"isError":true}` — which is the SDK's
// documented contract ("a tool that failed reports its error here rather than
// through a status code"). `readToolResult` unwraps all three shapes.
//
// Every test builds its own tool arguments from the published `inputSchema`
// instead of hard-coding them where it can, so a changed schema is noticed.
//
// Permissions, the AI switch and anonymous access live in the sibling
// `editor-tools.permission.spec.ts` and `editor-tools.ai-disabled.spec.ts`.

const fieldsOf = (...names: string[]) => ({ fields: names });

// `create_room.roomType` is listed in `required` AND carries `default: 6`, and
// the tool really does run without it (BUG XXXXX below). The generic "remove a
// required argument" cases skip a property that has a default, so one known
// schema defect does not hide what they are there to find in the other tools.
const trulyRequired = (tool: EditorTool) =>
  (tool.inputSchema.required ?? []).filter(
    (key) => tool.inputSchema.properties?.[key]?.default === undefined,
  );

async function myFolderId(apiSdk: ApiSDK) {
  const { data } = await apiSdk.forRole("owner").folders.getMyFolder({});
  return data.response!.current!.id!;
}

async function newFile(apiSdk: ApiSDK, title: string) {
  const { data, status } = await apiSdk
    .forRole("owner")
    .files.createFileInMyDocuments({ createFileJsonElement: { title } });
  expect(status, `creating "${title}" through the Files API`).toBe(200);
  return data.response!.id!;
}

async function newRoom(apiSdk: ApiSDK, title: string) {
  const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  expect(status, `creating room "${title}"`).toBe(200);
  return data.response!.id!;
}

async function call(
  api: AiEditorTools,
  body: Parameters<AiEditorTools["callTool"]>[1],
) {
  const { status, data, error } = await api.callTool("owner", body);
  expect(status, `/call answered ${status} ${error ?? ""}`).toBe(200);
  return readToolResult(data?.result);
}

test.describe("AI Editor Tools - GET /list", () => {
  test("GET /api/2.0/ai/editor-tools/list - Owner gets the published tools", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const { status, data, headers } = await api.list("owner");

    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    expect(Object.keys(data ?? {})).toEqual(["tools"]);
    expect(Array.isArray(data?.tools)).toBe(true);
    expect(data!.tools!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/ai/editor-tools/list - every tool matches the SDK shape", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");

    const offenders = tools.flatMap((tool) => {
      const problems: string[] = [];
      if (typeof tool.name !== "string" || tool.name.trim() === "")
        problems.push("name is empty");
      if (typeof tool.description !== "string")
        problems.push("description is not a string");
      if (typeof tool.requireApproval !== "boolean")
        problems.push("requireApproval is not a boolean");
      if (
        !tool.inputSchema ||
        typeof tool.inputSchema !== "object" ||
        Array.isArray(tool.inputSchema)
      )
        problems.push("inputSchema is not an object");
      const extra = Object.keys(tool).filter(
        (k) =>
          !["name", "description", "inputSchema", "requireApproval"].includes(
            k,
          ),
      );
      if (extra.length) problems.push(`unexpected keys ${extra.join(",")}`);
      return problems.map((p) => `${tool.name || "<unnamed>"}: ${p}`);
    });

    expect(offenders).toEqual([]);
  });

  test("GET /api/2.0/ai/editor-tools/list - tool names are unique", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const names = (await api.tools("owner")).map((t) => t.name);

    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates).toEqual([]);
  });

  test("GET /api/2.0/ai/editor-tools/list - every inputSchema is an object schema whose required arguments are declared", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");

    const offenders = tools.flatMap((tool) => {
      const schema = tool.inputSchema;
      const problems: string[] = [];
      if (schema.type !== "object") problems.push(`type is ${schema.type}`);
      const properties = schema.properties;
      if (!properties || typeof properties !== "object")
        problems.push("properties is missing");
      const declared = Object.keys(properties ?? {});
      for (const key of schema.required ?? []) {
        if (!declared.includes(key))
          problems.push(`required "${key}" is not a declared property`);
      }
      if (
        schema.required !== undefined &&
        (!Array.isArray(schema.required) ||
          new Set(schema.required).size !== schema.required.length)
      )
        problems.push("required is not a list of distinct names");
      for (const [key, sub] of Object.entries(properties ?? {})) {
        if (!sub || typeof sub !== "object")
          problems.push(`property "${key}" is not a schema object`);
      }
      return problems.map((p) => `${tool.name}: ${p}`);
    });

    expect(offenders).toEqual([]);
  });

  test("GET /api/2.0/ai/editor-tools/list - repeated reads return the same catalogue", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const first = await api.list("owner");
    const second = await api.list("owner");
    const third = await api.list("owner");

    expect(first.status).toBe(200);
    expect(second.text).toBe(first.text);
    expect(third.text).toBe(first.text);
  });

  test("GET /api/2.0/ai/editor-tools/list - requireApproval is off for read tools and on for the ones that change something", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");

    const READ = /^(get|download)_/;
    const WRITE =
      /^(delete|update|create|upload|move|copy|rename|archive|set|onlyoffice_generate)_/;
    const wrong = tools
      .filter(
        (t) =>
          (READ.test(t.name) && t.requireApproval) ||
          (WRITE.test(t.name) && !t.requireApproval),
      )
      .map((t) => `${t.name}: requireApproval=${t.requireApproval}`);
    const unclassified = tools
      .filter((t) => !READ.test(t.name) && !WRITE.test(t.name))
      .map((t) => t.name);

    // A tool the pattern does not know is listed rather than skipped, so a new
    // tool forces a decision about which side it is on.
    expect(unclassified).toEqual([]);
    expect(wrong).toEqual([]);
  });
});

test.describe("AI Editor Tools - POST /call executes the tool", () => {
  test("POST /api/2.0/ai/editor-tools/call - a read tool with no arguments answers with its content", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const outcome = await call(api, { name: "get_room_types" });

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toContain("Form Filling Room");
  });

  test("POST /api/2.0/ai/editor-tools/call - get_file_info returns the file the Files API holds", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const title = `Autotest ${apiSdk.faker.generateString(6)}.docx`;
    const fileId = await newFile(apiSdk, title);

    const outcome = await call(api, {
      name: "get_file_info",
      arguments: { fileId, filters: fieldsOf("id", "title") },
    });

    expect(outcome.isError, outcome.text).toBe(false);
    const response = outcome.json?.response as {
      id?: number;
      title?: string;
    };
    expect(response?.id).toBe(fileId);
    expect(response?.title).toBe(title);
  });

  test("POST /api/2.0/ai/editor-tools/call - a failing tool is reported inside result, not by the status", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const { status, data } = await api.callTool("owner", {
      name: "delete_file",
      arguments: { fileId: 999999999 },
    });
    const outcome = readToolResult(data?.result);

    expect(status).toBe(200);
    expect(outcome.isError).toBe(true);
    // The REST status the tool met is part of what it reports.
    expect(outcome.text).toContain("404");
  });

  test("POST /api/2.0/ai/editor-tools/call - create_folder really creates the folder", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const parentId = await myFolderId(apiSdk);
    const title = `Autotest ${apiSdk.faker.generateString(6)}`;

    const outcome = await call(api, {
      name: "create_folder",
      arguments: { parentId, title, filters: fieldsOf("id", "title") },
    });
    expect(outcome.isError, outcome.text).toBe(false);

    const { data } = await owner.folders.getFolderByFolderId({
      folderId: parentId,
    });
    expect(
      (data.response?.folders ?? []).map((f) => f.title),
      "the folder the tool reported is in My Documents",
    ).toContain(title);
  });

  test("POST /api/2.0/ai/editor-tools/call - update_file really renames the file", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const fileId = await newFile(
      apiSdk,
      `Autotest ${apiSdk.faker.generateString(6)}.docx`,
    );
    const renamed = `Autotest renamed ${apiSdk.faker.generateString(6)}.docx`;

    const outcome = await call(api, {
      name: "update_file",
      arguments: { fileId, title: renamed },
    });
    expect(outcome.isError, outcome.text).toBe(false);

    const { data } = await owner.files.getFileInfo({ fileId });
    expect(data.response?.title).toBe(renamed);
  });

  test("POST /api/2.0/ai/editor-tools/call - delete_file really deletes the file and only that file", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const folderId = await myFolderId(apiSdk);
    const doomed = await newFile(apiSdk, "Autotest doomed.docx");
    const bystander = await newFile(apiSdk, "Autotest bystander.docx");

    const outcome = await call(api, {
      name: "delete_file",
      arguments: { fileId: doomed },
    });
    expect(outcome.isError, outcome.text).toBe(false);

    const ids = (await listFolderFiles(owner, folderId)).map((f) => f.id);
    expect(ids).toContain(bystander);
    expect(ids).not.toContain(doomed);
  });

  test("POST /api/2.0/ai/editor-tools/call - a generator creates a document in My Documents", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const folderId = await myFolderId(apiSdk);
    const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;

    const outcome = await call(api, {
      name: "onlyoffice_generate_docx",
      arguments: { fileName, description: "A single short paragraph." },
    });
    expect(outcome.isError, outcome.raw).toBe(false);

    const created = generatedFile(outcome);
    expect(created?.title).toBe(`${fileName}.docx`);
    expect(created?.parentId).toBe(folderId);
    const listed = (await listFolderFiles(owner, folderId)).find(
      (f) => f.id === created!.id,
    );
    expect(listed?.title).toBe(`${fileName}.docx`);
  });
});

test.describe("AI Editor Tools - the tool name", () => {
  for (const { name, body } of [
    { name: "an empty name", body: { name: "" } },
    { name: "a null name", body: { name: null } },
    { name: "a missing name", body: {} },
    { name: "a numeric name", body: { name: 7 } },
    { name: "a boolean name", body: { name: true } },
    { name: "an object name", body: { name: { a: 1 } } },
  ]) {
    test(`POST /api/2.0/ai/editor-tools/call - rejects ${name}`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

      const { status, error } = await api.callTool("owner", body);

      expect(error).toBe("Unknown tool name");
      expect(status).toBe(400);
    });
  }

  // The SDK says an unknown or excluded name "is rejected with 400". The server
  // does that only for a name that is not a usable string; any non-empty string it
  // does not know is dispatched and fails inside `result` with a 200.
  for (const { label, name } of [
    { label: "an unknown name", name: "no_such_tool_zz" },
    { label: "a whitespace-only name", name: "   " },
    { label: "a name in the wrong case", name: "DELETE_FILE" },
    { label: "a name with padding", name: " delete_file " },
  ]) {
    test(`BUG XXXXX: POST /api/2.0/ai/editor-tools/call - ${label} is answered 200 instead of the 400 the SDK documents`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

      // Control: the exact name is a real tool, so the refusal below is about the
      // spelling and not about the tool being unavailable to this caller.
      const control = await api.callTool("owner", {
        name: "delete_file",
        arguments: { fileId: 999999999 },
      });
      expect(readToolResult(control.data?.result).text).not.toContain(
        "tool_not_available",
      );

      const { status } = await api.callTool("owner", { name });

      test.fail();
      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/editor-tools/call - a name that is only almost a tool's name runs nothing", async ({
    apiSdk,
  }) => {
    // Whatever status the spelling gets, it must not reach the tool. The exact
    // name deletes a file in the same folder, which shows the file the others
    // aimed at would have been deletable.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const folderId = await myFolderId(apiSdk);
    const spared = await Promise.all(
      ["DELETE_FILE", " delete_file ", "delete_file "].map((_, i) =>
        newFile(apiSdk, `Autotest spared ${i}.docx`),
      ),
    );
    const doomed = await newFile(apiSdk, "Autotest doomed.docx");

    const names = ["DELETE_FILE", " delete_file ", "delete_file "];
    for (const [i, name] of names.entries()) {
      await api.callTool("owner", {
        name,
        arguments: { fileId: spared[i] },
      });
    }
    const exact = await call(api, {
      name: "delete_file",
      arguments: { fileId: doomed },
    });
    expect(exact.isError, exact.text).toBe(false);

    const ids = (await listFolderFiles(owner, folderId)).map((f) => f.id);
    expect(ids).not.toContain(doomed);
    for (const id of spared) expect(ids).toContain(id);
  });
});

test.describe("AI Editor Tools - arguments", () => {
  test("POST /api/2.0/ai/editor-tools/call - arguments that are not an object are treated as empty", async ({
    apiSdk,
  }) => {
    // SDK: "Treated as empty when it is not an object". The reference is the
    // answer to an explicit {} — the same refusal naming the same missing field.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const reference = await call(api, { name: "delete_file", arguments: {} });
    expect(reference.isError).toBe(true);
    expect(reference.text).toContain("fileId");

    for (const [label, value] of [
      ["missing", undefined],
      ["null", null],
      ["a string", "abc"],
      ["an array", [1, 2]],
      ["a number", 5],
    ] as Array<[string, unknown]>) {
      const outcome = await call(api, {
        name: "delete_file",
        ...(value === undefined ? {} : { arguments: value }),
      });
      expect(outcome.text, `arguments as ${label}`).toBe(reference.text);
      expect(outcome.isError, `arguments as ${label}`).toBe(true);
    }
  });

  test("POST /api/2.0/ai/editor-tools/call - an empty arguments object names every missing required argument", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = (await api.tools("owner")).filter(
      (t) => trulyRequired(t).length > 0,
    );
    expect(tools.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const tool of tools) {
      const outcome = await call(api, { name: tool.name, arguments: {} });
      if (!outcome.isError) offenders.push(`${tool.name}: not an error`);
      // A generator reports the first missing parameter only.
      const mustName = tool.name.startsWith("onlyoffice_generate_")
        ? trulyRequired(tool).slice(0, 1)
        : trulyRequired(tool);
      for (const key of mustName) {
        if (!outcome.text.includes(key))
          offenders.push(
            `${tool.name}: "${key}" is not named in "${outcome.text.slice(0, 120)}"`,
          );
      }
    }
    expect(offenders).toEqual([]);
  });

  test("POST /api/2.0/ai/editor-tools/call - removing a required argument, one at a time, is refused for every tool", async ({
    apiSdk,
  }) => {
    // The generic schema test: the cases come from /list, so a new tool or a
    // changed `required` list is covered without touching this file.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");

    const offenders: string[] = [];
    let cases = 0;
    for (const tool of tools) {
      for (const key of trulyRequired(tool)) {
        cases++;
        const args = sampleArguments(tool.inputSchema);
        delete args[key];
        const { status, data } = await api.callTool("owner", {
          name: tool.name,
          arguments: args,
        });
        const outcome = readToolResult(data?.result);
        if (status !== 200 || !outcome.isError || !outcome.text.includes(key))
          offenders.push(
            `${tool.name} without "${key}": ${status} isError=${outcome.isError} "${outcome.text.slice(0, 100)}"`,
          );
      }
    }
    expect(cases).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  test("POST /api/2.0/ai/editor-tools/call - a required argument of the wrong type or null is refused for every tool", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");

    const offenders: string[] = [];
    let cases = 0;
    for (const tool of tools) {
      for (const key of trulyRequired(tool)) {
        const sub = tool.inputSchema.properties?.[key] ?? {};
        const nullable = Array.isArray(sub.type) && sub.type.includes("null");
        const variants: Array<[string, unknown]> = [];
        const wrong = wrongTypeValue(sub);
        if (wrong !== undefined) variants.push(["a wrong type", wrong]);
        // A generator takes a null fileName and writes ".docx" (BUG XXXXX below).
        const isGenerator = tool.name.startsWith("onlyoffice_generate_");
        if (!nullable && !isGenerator) variants.push(["null", null]);
        for (const [label, value] of variants) {
          cases++;
          const args = sampleArguments(tool.inputSchema);
          args[key] = value;
          const { status, data } = await api.callTool("owner", {
            name: tool.name,
            arguments: args,
          });
          const outcome = readToolResult(data?.result);
          if (status !== 200 || !outcome.isError)
            offenders.push(
              `${tool.name}.${key} as ${label}: ${status} isError=${outcome.isError} "${outcome.text.slice(0, 100)}"`,
            );
        }
      }
    }
    expect(cases).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  test("BUG XXXXX: GET /api/2.0/ai/editor-tools/list - a property with a default is published as required, and the tool runs without it", async ({
    apiSdk,
  }) => {
    // create_room lists `roomType` in `required` and gives it `default: 6`. A
    // client that trusts `required` will always send it; one that trusts the
    // default may leave it out. Only one of the two is true, and the call shows
    // which: it creates the room.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");
    const createRoom = tools.find((t) => t.name === "create_room")!;
    expect(createRoom.inputSchema.required).toContain("roomType");
    expect(createRoom.inputSchema.properties?.roomType?.default).toBe(6);

    const args = sampleArguments(createRoom.inputSchema);
    delete args.roomType;
    const outcome = await call(api, { name: "create_room", arguments: args });
    expect(outcome.isError, "the tool does not need roomType").toBe(false);

    const contradictions = tools.flatMap((t) =>
      (t.inputSchema.required ?? [])
        .filter((k) => t.inputSchema.properties?.[k]?.default !== undefined)
        .map((k) => `${t.name}.${k}`),
    );
    test.fail();
    expect(
      contradictions,
      "required properties that also have a default",
    ).toEqual([]);
  });

  for (const { tool, key } of [
    { tool: "onlyoffice_generate_docx", key: "fileName" },
    { tool: "onlyoffice_generate_presentation", key: "fileName" },
    { tool: "onlyoffice_generate_form", key: "fileName" },
  ]) {
    test(`BUG XXXXX: POST /api/2.0/ai/editor-tools/call - ${tool} with a null ${key} creates a document with an empty name`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
      const owner = apiSdk.forRole("owner");
      const folderId = await myFolderId(apiSdk);
      const schema = (await api.tools("owner")).find(
        (t) => t.name === tool,
      )!.inputSchema;
      expect(schema.required).toContain(key);
      const before = (await listFolderFiles(owner, folderId)).map((f) => f.id);

      const args = sampleArguments(schema);
      args[key] = null;
      const outcome = await call(api, { name: tool, arguments: args });

      const created = (await listFolderFiles(owner, folderId)).filter(
        (f) => !before.includes(f.id),
      );
      test.fail();
      expect(
        created.map((f) => f.title),
        "a required argument that is null must not produce a document",
      ).toEqual([]);
      expect(outcome.isError).toBe(true);
    });
  }

  test("BUG XXXXX: POST /api/2.0/ai/editor-tools/call - a property the published schema forbids is accepted and the tool runs", async ({
    apiSdk,
  }) => {
    // Every inputSchema says `additionalProperties:false`; the endpoint publishes
    // it, so a client may treat it as authoritative. The call below carries one
    // property the schema forbids — and creates the folder anyway.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const tools = await api.tools("owner");
    const createFolder = tools.find((t) => t.name === "create_folder")!;
    expect(createFolder.inputSchema.additionalProperties).toBe(false);

    const parentId = await myFolderId(apiSdk);
    const title = `Autotest extra ${apiSdk.faker.generateString(6)}`;
    const outcome = await call(api, {
      name: "create_folder",
      arguments: {
        parentId,
        title,
        filters: fieldsOf("id"),
        zzNotInTheSchema: 1,
      },
    });

    const { data } = await owner.folders.getFolderByFolderId({
      folderId: parentId,
    });
    const created = (data.response?.folders ?? []).some(
      (f) => f.title === title,
    );

    test.fail();
    expect(created, "the folder must not be created").toBe(false);
    expect(outcome.isError).toBe(true);
  });

  test("BUG XXXXX: GET /api/2.0/ai/editor-tools/list - filters.fields items are an enum in practice but the schema publishes a bare string", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");
    const tool = tools.find((t) => t.name === "get_file_info")!;
    const items = (
      tool.inputSchema.properties?.filters?.properties?.fields as
        | { items?: { type?: string; enum?: unknown[] } }
        | undefined
    )?.items;
    expect(items?.type).toBe("string");

    // The green half: the tool does restrict the values. Without it the schema
    // check below would be a claim about a restriction nobody has shown.
    const fileId = await newFile(apiSdk, "Autotest fields.docx");
    const refused = await call(api, {
      name: "get_file_info",
      arguments: { fileId, filters: fieldsOf("zzNotAField") },
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("Invalid option");
    const accepted = await call(api, {
      name: "get_file_info",
      arguments: { fileId, filters: fieldsOf("id") },
    });
    expect(accepted.isError, accepted.text).toBe(false);

    test.fail();
    expect(
      Array.isArray(items?.enum) && items!.enum!.includes("id"),
      "the schema lists the values the tool accepts",
    ).toBe(true);
  });

  test("POST /api/2.0/ai/editor-tools/call - arguments the published schema accepts are never refused at parsing", async ({
    apiSdk,
  }) => {
    // Cross-endpoint: build arguments from what /list says, call /call, and the
    // only thing that must not happen is the "Parsing input." refusal. Read-only
    // tools only — the point is the schema, not the effect, and a read with an
    // invented id ends as a 404 from the portal, which is not a parsing error.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = (await api.tools("owner")).filter(isReadOnly);
    expect(tools.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const tool of tools) {
      for (const all of [false, true]) {
        const args = sampleArguments(tool.inputSchema, { all });
        const outcome = await call(api, { name: tool.name, arguments: args });
        if (outcome.text.startsWith("Parsing input."))
          offenders.push(
            `${tool.name} (${all ? "all properties" : "required only"}): ${outcome.text.slice(0, 160)}`,
          );
      }
    }
    expect(offenders).toEqual([]);
  });
});

test.describe("AI Editor Tools - /list and /call agree", () => {
  test("POST /api/2.0/ai/editor-tools/call - every tool /list publishes is dispatched, none is 'not available'", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools: EditorTool[] = await api.tools("owner");

    const offenders: string[] = [];
    for (const tool of tools) {
      const { status, data } = await api.callTool("owner", {
        name: tool.name,
        arguments: {},
      });
      const outcome = readToolResult(data?.result);
      if (status !== 200 || outcome.text.includes("tool_not_available"))
        offenders.push(`${tool.name}: ${status} ${outcome.text.slice(0, 80)}`);
    }
    expect(offenders).toEqual([]);
  });

  test("POST /api/2.0/ai/editor-tools/call - no argument shape turns into a server error", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const tools = await api.tools("owner");

    const offenders: string[] = [];
    for (const tool of tools) {
      const shapes: unknown[] = [
        {},
        null,
        "x",
        [1],
        { zz: { nested: [null] } },
        ...Object.keys(tool.inputSchema.properties ?? {}).map((k) => ({
          [k]: { a: [1] },
        })),
      ];
      for (const args of shapes) {
        const { status } = await api.callTool("owner", {
          name: tool.name,
          arguments: args,
        });
        if (status >= 500)
          offenders.push(`${tool.name} ${JSON.stringify(args)}: ${status}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

test.describe("AI Editor Tools - entityId", () => {
  const generate = (api: AiEditorTools, fileName: string, entityId?: unknown) =>
    call(api, {
      name: "onlyoffice_generate_docx",
      arguments: { fileName, description: "One short line." },
      ...(entityId === undefined ? {} : { entityId }),
    });

  test("POST /api/2.0/ai/editor-tools/call - an accessible room scopes the generator into that room", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const roomId = await newRoom(apiSdk, "Autotest entity room");
    const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;

    const outcome = await generate(api, fileName, String(roomId));
    expect(outcome.isError, outcome.raw).toBe(false);

    expect(generatedFile(outcome)?.parentId).toBe(roomId);
    const titles = (await listFolderFiles(owner, roomId)).map((f) => f.title);
    expect(titles).toContain(`${fileName}.docx`);
  });

  test("POST /api/2.0/ai/editor-tools/call - without entityId the call is portal-wide and lands in My Documents", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const folderId = await myFolderId(apiSdk);
    const roomId = await newRoom(apiSdk, "Autotest entity room");
    const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;

    const outcome = await generate(api, fileName);
    expect(outcome.isError, outcome.raw).toBe(false);

    expect(generatedFile(outcome)?.parentId).toBe(folderId);
    expect(
      (await listFolderFiles(owner, folderId)).map((f) => f.title),
    ).toContain(`${fileName}.docx`);
    expect(await listFolderFiles(owner, roomId)).toEqual([]);
  });

  // The contract as measured, and the same one `POST /ai/send` has for its
  // entityId: a value that does not name a room is not an error, the call falls
  // back to the portal-wide scope. It is pinned as a contract on purpose; the
  // opposite case — a room that exists but the caller may not use — is a denial,
  // and that half lives in editor-tools.permission.spec.ts so the two cannot be
  // mixed up.
  for (const { label, entityId } of [
    { label: "a room that does not exist", entityId: "999999999" },
    { label: "a non-numeric string", entityId: "abc" },
    { label: "an empty string", entityId: "" },
    { label: "zero", entityId: "0" },
    { label: "a negative id", entityId: "-1" },
    { label: "null", entityId: null },
    { label: "an object", entityId: { a: 1 } },
  ] as Array<{ label: string; entityId: unknown }>) {
    test(`POST /api/2.0/ai/editor-tools/call - entityId as ${label} falls back to the portal scope`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
      const owner = apiSdk.forRole("owner");
      const folderId = await myFolderId(apiSdk);
      const roomId = await newRoom(apiSdk, "Autotest entity room");
      const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;

      const outcome = await generate(api, fileName, entityId);
      expect(outcome.isError, outcome.raw).toBe(false);

      expect(generatedFile(outcome)?.parentId).toBe(folderId);
      expect(
        (await listFolderFiles(owner, folderId)).map((f) => f.title),
      ).toContain(`${fileName}.docx`);
      expect(await listFolderFiles(owner, roomId)).toEqual([]);
    });
  }

  test("POST /api/2.0/ai/editor-tools/call - a REST tool answers the same with and without a made-up entityId", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const fileId = await newFile(apiSdk, "Autotest entity read.docx");
    const args = { fileId, filters: fieldsOf("id", "title") };

    const without = await call(api, { name: "get_file_info", arguments: args });
    const withBogus = await call(api, {
      name: "get_file_info",
      arguments: args,
      entityId: "999999999",
    });

    expect(without.isError, without.text).toBe(false);
    expect(withBogus.text).toBe(without.text);
  });
});
