import { expect } from "@playwright/test";
import { AiHttp, AgentRole } from "./ai-http";
import { AiAgentChat, AiThreadMessage } from "./ai-agent-chat";

// Web Search provider configuration — re-measured live 2026-08-18.
//
//   GET    /ai/web-search/is-configured[?entityId=]      -> bare true/false
//   GET    /ai/web-search/get-active-config[?entityId=]  -> config | null
//   PUT    /ai/web-search/configure        { config: {...}, entityId? }
//   PUT    /ai/web-search/set-active-config{ config: {...}, entityId? }
//   POST   /ai/web-search/test-connection  { provider, key?, baseUrl? }
//   DELETE /ai/web-search/clear            { entityId? }
//
// entityId existence is validated on the two GET routes above (measured
// 2026-08-26): omitting it, or an empty `entityId=`, still reads the bare
// true/false / config|null shown above, but any non-empty entityId that does
// not resolve to a real entity — "0", "-1", huge numbers, non-numeric — 404s
// with `{"error":"Entity \"<value>\" not found"}"` instead. `clear` and the
// threads routes are unaffected by the same bogus entityId, so this is scoped
// to these two GET routes, not a shared resolver. See
// [[ai_web_search_contract]] / [[ai_full_suite_run_2026_08_26]].
//
// HOW WEB SEARCH IS ACTUALLY SWITCHED ON
//
// Not through any of these routes. The product moved it to Billing → Add-ons:
// enabling the **AI search** wallet service (`TenantWalletService.AISearch`,
// -18, via `POST /portal/payment/servicestate` — see `setAiSearchAddon`)
// configures the portal's own ONLYOFFICE provider and bills the searches to the
// wallet. No Exa key is needed any more. Measured 2026-08-18:
//
//   * with the add-on on, `is-configured` flips to `true` and
//     `get-active-config` answers `{provider:"onlyoffice", baseUrl:<the portal's
//     own URL>}` — no key field at all, portal-wide and echoed in every entity
//     scope (agent, room). Turning the add-on off flips both back to
//     `false`/`null`.
//   * the model then really searches: the assistant reply carries a `tool-call`
//     part with `toolName:"web_search"`, `args {query, aiChatIntent}` and a
//     `result` holding `{data:[{title,url,favicon,text,author}]}` — that array is
//     the clickable source list the UI renders. It is server-executed, so there
//     is no `tool-call-pending` pause and no approval.
//   * with the add-on off the tool is gone from the model's toolset: the reply
//     has text parts only and the model says it has no web search. This — not
//     `/ai/tools/list-system-tools`, which answers `{}` for everyone — is where
//     "its tools disappear from the list" is observable.
//   * `clear` is **403 for every role including the owner** while the add-on
//     provides the configuration, and does not undo it. It only answers
//     `{success:true}` in the unconfigured state. The add-on itself can only be
//     flipped by the owner and a DocSpaceAdmin (RoomAdmin/User/Guest → 403).
//
// The manual-configuration half below is RETIRED: a key is not entered on the
// Web Search page or anywhere else in the product. The routes are still
// reachable, so they are covered as live-route regression and security checks —
// if they are removed, delete those tests instead of fixing them.
//
//   * `test-connection` WORKS, and is the only half of it that does.
//     Two provider names are recognised — `exa` and `onlyoffice` — and the call
//     really goes out: a valid Exa key answers with a bare `true`, a wrong one
//     with `{field:"key", message:"Invalid API key"}`. Every other name is
//     `{field:"name", message:"Unknown web-search provider: X"}`. (The earlier
//     note here said no name was recognised at all; that was true on 2026-08-04
//     and is not any more.)
//   * `configure` and `set-active-config` answer **500 for every body** — BUG
//     82812, re-measured 2026-08-18 against seven spellings of the config,
//     `provider`/`name` and `key`/`apiKey` included. With no manual path in the
//     product, the behaviour to ask for is a deterministic **403** (what `clear`
//     already answers on the same billing-owned state), not a working save — the
//     `test.fail` tests are written that way.
//
// The 500 lands *before* both the authorization check and the portal AI switch
// (a Guest gets 500 instead of 403, and so does a caller on an AI-disabled
// portal), and it is the odd one out: `clear`, the same kind of write against
// the same billing-owned state, refuses cleanly with 403. `test-connection` has
// the mirror-image problem — gated by neither role nor switch, so a Guest who
// cannot read the configuration can still spend the portal's egress on it. All
// of these are in web-search.spec.ts.

/** The two names this portal accepts; every other candidate is "Unknown". */
export const WEB_SEARCH_RECOGNISED_PROVIDERS = ["exa", "onlyoffice"] as const;

/** `test-connection` messages, keyed by what they mean. */
export const WEB_SEARCH_MESSAGES = {
  providerRequired: "Provider is required",
  invalidKey: "Invalid API key",
  emptyKey: "Empty key",
  baseUrlRequired: "Base URL is required for cloud provider",
} as const;

/**
 * The pre-connection `baseUrl` guard, shared with `/ai/profiles` (the fix for
 * BUG 83005). These come back as `{error}` with HTTP 400 — a different envelope
 * from the `{field, message}` a provider-level failure uses, because the request
 * is refused before any socket is opened.
 */
export const WEB_SEARCH_BASE_URL_ERRORS = {
  notAllowed: "baseUrl host is not allowed",
  unresolvable: "baseUrl host could not be resolved",
  invalid: "baseUrl is not a valid URL",
} as const;

export const WEB_SEARCH_PROVIDER_CANDIDATES = [
  "exa",
  "onlyoffice",
  "tavily",
  "brave",
  "google",
  "bing",
  "serper",
  "searxng",
  "duckduckgo",
] as const;

/** The tool the engine offers the model once the add-on is on. */
export const WEB_SEARCH_TOOL_NAME = "web_search";

/** One entry of the clickable source list the UI renders under an answer. */
export type WebSearchSource = {
  title?: string;
  url?: string;
  favicon?: string;
  text?: string;
  author?: string;
};

/**
 * The `web_search` tool calls in one assistant reply, with their results parsed.
 *
 * The sources live in the tool call's `result` (a JSON *string*), not in a field
 * of their own on the message — so this is the only place the "clickable list of
 * sources" exists in the API, and every sources assertion goes through here.
 * Returns an empty array when the model did not search, which is what the
 * add-on-off case asserts.
 */
export function webSearchCalls(message: AiThreadMessage): Array<{
  query?: string;
  intent?: string;
  sources: WebSearchSource[];
}> {
  const parts = Array.isArray(message.content) ? message.content : [];

  return parts
    .filter(
      (part) =>
        part.type === "tool-call" && part.toolName === WEB_SEARCH_TOOL_NAME,
    )
    .map((part) => {
      let sources: WebSearchSource[] = [];
      if (part.result !== undefined) {
        const parsed =
          typeof part.result === "string"
            ? (JSON.parse(part.result) as { data?: WebSearchSource[] })
            : (part.result as { data?: WebSearchSource[] });
        sources = parsed?.data ?? [];
      }
      return {
        query: part.args?.query as string | undefined,
        intent: part.args?.aiChatIntent as string | undefined,
        sources,
      };
    });
}

/**
 * Asserts a reply really was produced by a web search: the tool ran, it ran on a
 * non-empty query, and it came back with sources that could be rendered as
 * links. `expectHealthyAssistantReply` is the companion check on the text — an
 * answer can carry a tool call and still have failed.
 */
export function expectWebSearchSources(message: AiThreadMessage): void {
  const calls = webSearchCalls(message);
  expect(
    calls.length,
    `the reply must carry a ${WEB_SEARCH_TOOL_NAME} tool call; parts were ${JSON.stringify(
      (Array.isArray(message.content) ? message.content : []).map(
        (part) => part.toolName ?? part.type,
      ),
    )}`,
  ).toBeGreaterThan(0);

  for (const call of calls) {
    expect(
      call.query?.length,
      "the search ran on a non-empty query",
    ).toBeGreaterThan(0);
    expect(call.sources.length, "the search returned sources").toBeGreaterThan(
      0,
    );

    for (const source of call.sources) {
      expect(
        source.title?.length,
        "a source needs a title to be shown",
      ).toBeGreaterThan(0);
      // Clickable is the requirement: an absolute http(s) URL, not a snippet.
      expect(source.url, `source "${source.title}" must be a link`).toMatch(
        /^https?:\/\/\S+$/,
      );
    }
  }

  expect(
    AiAgentChat.messageText(message).length,
    "the answer itself is not empty",
  ).toBeGreaterThan(0);
}

export type AiWebSearchConfig = {
  provider?: string;
  key?: string;
  baseUrl?: string;
  isCloudProvider?: boolean;
  headers?: Record<string, string>;
};

export type AiWebSearchTestResult = {
  field?: string;
  message?: string;
};

export class AiWebSearch extends AiHttp {
  private scope(entityId?: number | string) {
    return entityId === undefined ? "" : `?entityId=${entityId}`;
  }

  isConfigured(role: AgentRole, entityId?: number | string) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/web-search/is-configured${this.scope(entityId)}`,
    );
  }

  getActiveConfig(role: AgentRole, entityId?: number | string) {
    return this.call<AiWebSearchConfig | null>(
      role,
      "get",
      `/api/2.0/ai/web-search/get-active-config${this.scope(entityId)}`,
    );
  }

  configure(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/web-search/configure",
      body,
    );
  }

  setActiveConfig(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/web-search/set-active-config",
      body,
    );
  }

  testConnection(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiWebSearchTestResult>(
      role,
      "post",
      "/api/2.0/ai/web-search/test-connection",
      body,
    );
  }

  clear(role: AgentRole, body: unknown) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      "/api/2.0/ai/web-search/clear",
      body,
    );
  }
}
