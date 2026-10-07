import { AiHttp, AgentRole } from "./ai-http";

// Editor tools: the tools an editor (the document editor's AI panel) may offer
// the user and run through the portal.
//
//   GET  /api/2.0/ai/editor-tools/list   { tools: [{ name, description, inputSchema, requireApproval }] }
//   POST /api/2.0/ai/editor-tools/call   { name, arguments?, entityId? } -> { result: string }
//
// Per the SDK: an unknown or editor-excluded `name` is a 400, `arguments` is
// treated as empty when it is not an object, `entityId` is a STRING (the room
// the call is scoped to; left out for a portal-wide call), and a tool that
// fails reports the error inside `result` rather than through a status code.
//
// The SDK client exists (EditorToolsApi) but, like the rest of the AI stack, the
// suite drives the route with raw requests so a test can send a name of the
// wrong type or a null entityId — the SDK types would refuse to compile those.

export type EditorTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requireApproval: boolean;
};

export type EditorToolsList = { tools?: EditorTool[] };

export type EditorToolCallResult = { result?: string };

/** The subset of JSON Schema the argument generators understand. */
export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

/**
 * Body of `POST /ai/editor-tools/call`. Wider than the DTO on purpose: negative
 * tests send a null name, a numeric entityId or an `arguments` that is a string.
 */
export type EditorToolCallBody = {
  name?: unknown;
  arguments?: unknown;
  entityId?: unknown;
};

export class AiEditorTools extends AiHttp {
  list(role: AgentRole) {
    return this.call<EditorToolsList>(
      role,
      "get",
      "/api/2.0/ai/editor-tools/list",
    );
  }

  callTool(role: AgentRole, body: EditorToolCallBody) {
    return this.call<EditorToolCallResult>(
      role,
      "post",
      "/api/2.0/ai/editor-tools/call",
      body,
    );
  }

  /** The published list, asserted to be usable. Throws instead of returning []. */
  async tools(role: AgentRole): Promise<EditorTool[]> {
    const { status, data } = await this.list(role);
    if (status !== 200 || !Array.isArray(data?.tools)) {
      throw new Error(
        `GET /ai/editor-tools/list as ${role} answered ${status}, no tools array`,
      );
    }
    return data.tools;
  }
}

function typeOf(schema: JsonSchema): string {
  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== "null")
    : schema.type;
  if (type) return type;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  if (schema.enum) return typeof schema.enum[0];
  return "string";
}

/**
 * A value that satisfies `schema`. Deliberately plain — it is here to build an
 * argument set the published schema accepts, not to fuzz it. `salt` keeps two
 * strings from colliding when a test needs them to differ.
 */
export function sampleValue(schema: JsonSchema, salt = "x"): unknown {
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  switch (typeOf(schema)) {
    case "string": {
      if (schema.format === "uuid")
        return "00000000-0000-0000-0000-000000000000";
      const min = schema.minLength ?? 1;
      const base = `Autotest ${salt}`;
      return base.length >= min ? base : base.padEnd(min, "x");
    }
    case "integer":
    case "number": {
      const min = schema.minimum ?? 1;
      const max = schema.maximum ?? Math.max(min, 1);
      return Math.min(Math.max(1, min), max);
    }
    case "boolean":
      return true;
    case "array": {
      // Empty unless the schema demands items: `filters.fields` items carry an
      // enum the published schema does not mention, so any invented string would
      // be rejected for a reason the schema cannot explain.
      const count = schema.minItems ?? 0;
      return Array.from({ length: count }, () =>
        sampleValue(schema.items ?? { type: "string" }, salt),
      );
    }
    case "object":
      return sampleArguments(schema, { all: false, salt });
    default:
      return "Autotest";
  }
}

/** Arguments for a tool: only the required properties, or every property. */
export function sampleArguments(
  schema: JsonSchema,
  options: { all?: boolean; salt?: string } = {},
): Record<string, unknown> {
  const { all = false, salt = "x" } = options;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const args: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(properties)) {
    if (all || required.has(key))
      args[key] = sampleValue(sub, `${salt}-${key}`);
  }
  return args;
}

/** A value of the wrong JSON type for `schema`, or undefined if none is obvious. */
export function wrongTypeValue(schema: JsonSchema): unknown {
  switch (typeOf(schema)) {
    case "string":
      return 12345;
    case "integer":
    case "number":
      return "not-a-number";
    case "boolean":
      return "not-a-boolean";
    case "array":
      return "not-an-array";
    case "object":
      return "not-an-object";
    default:
      return undefined;
  }
}

export type ToolOutcome = {
  /** The `result` string as the endpoint sent it. */
  raw: string;
  /** True when the tool itself reports a failure (the HTTP status stays 200). */
  isError: boolean;
  /** Human-readable text: the tool's `content[].text`, or the plain result. */
  text: string;
  /** `text` parsed as JSON when it is JSON (REST tools), else the parsed `raw`. */
  json?: Record<string, unknown>;
};

function tryParse(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Unwraps `AiEditorToolsCall200Response.result`. Three shapes were measured:
 *
 *   REST tools   `{"content":[{"type":"text","text":"…"}],"isError":true|undefined}`
 *   generators   `{"data":{id,title,parentId,parentTitle,url}}` on success
 *   failures     plain text `Tool "x" failed: …` (unknown tool, generator errors)
 */
export function readToolResult(result: string | undefined): ToolOutcome {
  const raw = result ?? "";
  const outer = tryParse(raw);
  if (outer && Array.isArray(outer.content)) {
    const text = (outer.content as Array<{ text?: string }>)
      .map((part) => part.text ?? "")
      .join("\n");
    return {
      raw,
      isError: outer.isError === true,
      text,
      json: tryParse(text),
    };
  }
  if (outer) return { raw, isError: false, text: raw, json: outer };
  return { raw, isError: /^Tool ".*" failed:/s.test(raw), text: raw };
}

/** The file a generator reports having created. */
export function generatedFile(
  outcome: ToolOutcome,
):
  | { id: number; title: string; parentId: number; parentTitle: string }
  | undefined {
  const data = outcome.json?.data as
    | { id: number; title: string; parentId: number; parentTitle: string }
    | undefined;
  return data;
}

export const GENERATOR_TOOLS = [
  "onlyoffice_generate_docx",
  "onlyoffice_generate_presentation",
  "onlyoffice_generate_form",
];

/** Tools whose `requireApproval` is false are the read-only ones (SDK wording). */
export const isReadOnly = (tool: EditorTool) => !tool.requireApproval;
