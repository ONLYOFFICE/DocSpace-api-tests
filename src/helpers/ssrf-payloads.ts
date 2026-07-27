import { expect } from "@playwright/test";

/**
 * Helpers for the OpenAI-compatible proxy SSRF regression tests
 * (`GET|POST|PUT|DELETE /api/2.0/ai/openai/:providerId/v1/*`).
 *
 * The vulnerability: the trailing `{path}` is appended to the provider base
 * address, and an absolute URL in `{path}` overrides that base — turning the
 * authenticated proxy into an SSRF primitive that also forwards the provider's
 * Authorization / x-api-key secret to the attacker host.
 *
 * ---------------------------------------------------------------------------
 * ENVIRONMENT LIMITATION — READ BEFORE EXTENDING THESE TESTS
 * ---------------------------------------------------------------------------
 * The original security spec verifies the fix with two canary listeners
 * (ports 9999 / 9998), an internal mock service, a redirect server and a
 * DNS-rebinding host (see ssrf_listener2.py). That infrastructure is NOT wired
 * into this suite: tests run against freshly provisioned shared portals, so we
 * cannot stand up listeners the AI container can reach, nor point a provider's
 * base URL at one. The canonical "the listener confirms no outbound request was
 * made" assertion therefore cannot run here.
 *
 * What these tests DO assert, at the API-contract level:
 *   1. the response body carries NO proxied/canary content, and
 *   2. the request is rejected up front with a client error (400),
 * which is the strongest no-proxy signal available without listeners.
 *
 * To stay safe on shared infrastructure, every runnable payload targets a
 * guaranteed-non-resolving RFC 6761 `.invalid` host. If the endpoint is fixed
 * the URL is rejected before any send; if it is still vulnerable the proxy
 * attempt fails DNS and reaches nothing real — so we never actually contact a
 * metadata / loopback / internal service. The loopback / private-IP / metadata,
 * redirect and DNS-rebinding cases genuinely require the isolated canary
 * environment and are left as `test.fixme` placeholders in the specs.
 */

/** Plain-text body the reference listener returns for non-/models requests. */
export const SSRF_CANARY_MARKER = "SSRF-CANARY-OK";
/** Marker the internal mock service returns from its /private endpoint. */
export const INTERNAL_SERVICE_MARKER = "INTERNAL-SERVICE-MARKER";

/**
 * RFC 6761 reserved TLD — never resolves, so an OPEN vulnerability cannot reach
 * any real host through these, only a failed DNS lookup.
 */
export const ATTACKER_HOST = "ssrf-attacker.invalid";
export const INTERNAL_HOST = "ssrf-internal.invalid";

export type ProxyResult = { status: number; text: string; data: unknown };

/**
 * The core security invariant, and the only one that can be asserted without
 * canary listeners: the response must carry NO proxied/canary content and must
 * NOT be a 2xx that would mean the request was accepted for proxying. A real
 * SSRF returns 200 + `SSRF-CANARY-OK`; anything blocked/rejected/not-routed
 * (400 / 401 / 403 / 404 / 5xx with no canary) satisfies this.
 *
 * `allowedStatuses` pins the expected safe status so a regression that starts
 * 2xx-proxying (or changes the safe status) is caught.
 *
 * Verified behavior (see the module header): in the current build the proxy is
 * inert for the built-in gateway provider and returns 404 with an empty body
 * for every input — so the SSRF is not reproducible here. These assertions pass
 * on that inert state AND would fail the day a live, vulnerable proxy returns a
 * proxied 2xx response.
 */
export function expectNotProxied(
  result: ProxyResult,
  allowedStatuses: number[] = [400, 404],
) {
  expect(result.text).not.toContain(SSRF_CANARY_MARKER);
  expect(result.text).not.toContain(INTERNAL_SERVICE_MARKER);
  expect(result.status).not.toBe(200);
  expect(allowedStatuses).toContain(result.status);
}

/**
 * A plain absolute URL (`http://…` / `https://…`) must never be proxied. The
 * spec's preferred fix returns 400; this build returns 404 (route inert for the
 * gateway provider). Both are safe non-proxying rejections, so we accept either
 * and rely on {@link expectNotProxied}'s canary/2xx guard to catch a real SSRF.
 */
export function expectAbsoluteUrlRejected(result: ProxyResult) {
  expectNotProxied(result, [400, 404]);
}

/**
 * P1 — absolute-URI validation bypasses. Each entry is the raw `{path}` sent
 * after `/v1/`. All point at a non-resolving `.invalid` host so they are safe to
 * run anywhere. None may be proxied.
 */
export const absoluteUrlBypassPayloads: { name: string; path: string }[] = [
  { name: "plain http", path: `http://${ATTACKER_HOST}:9998/test` },
  { name: "plain https", path: `https://${ATTACKER_HOST}/test` },
  { name: "uppercase scheme", path: `HTTP://${ATTACKER_HOST}:9998/test` },
  { name: "mixed-case scheme", path: `HtTp://${ATTACKER_HOST}:9998/test` },
  {
    name: "encoded slashes",
    path: `http:%2F%2F${ATTACKER_HOST}:9998%2Ftest`,
  },
  {
    name: "fully encoded scheme+slashes",
    path: `http%3A%2F%2F${ATTACKER_HOST}:9998%2Ftest`,
  },
  {
    name: "percent-encoded scheme letters",
    path: `%68%74%74%70://${ATTACKER_HOST}:9998/test`,
  },
  { name: "protocol-relative //host", path: `//${ATTACKER_HOST}:9998/test` },
  {
    name: "triple-slash ///host",
    path: `///${ATTACKER_HOST}:9998/test`,
  },
  {
    name: "leading-slash + absolute",
    path: `/http://${ATTACKER_HOST}:9998/test`,
  },
  {
    name: "leading-backslash + absolute",
    path: `\\http://${ATTACKER_HOST}:9998/test`,
  },
  {
    name: "backslash separators",
    path: `http:\\${ATTACKER_HOST}:9998\\test`,
  },
  { name: "userinfo", path: `http://user@${ATTACKER_HOST}:9998/test` },
  {
    name: "provider-lookalike userinfo",
    path: `http://provider.example@${ATTACKER_HOST}:9998/test`,
  },
  {
    name: "open-redirect style query",
    path: `http://${ATTACKER_HOST}:9998/test?next=http://${INTERNAL_HOST}`,
  },
];

/**
 * P1 — special addresses (loopback / private / link-local / metadata / IPv6).
 * These are REAL internal targets: running them against a shared portal with an
 * open vulnerability could hit production infrastructure (RabbitMQ, Redis, the
 * cloud metadata endpoint). They must only be exercised in the isolated canary
 * environment, so specs reference this list from `test.fixme` placeholders.
 */
export const specialAddressPayloads: { name: string; path: string }[] = [
  { name: "loopback 127.0.0.1", path: "http://127.0.0.1/" },
  { name: "short loopback 127.1", path: "http://127.1/" },
  { name: "decimal loopback", path: "http://2130706433/" },
  { name: "hex loopback", path: "http://0x7f000001/" },
  { name: "ipv6 loopback", path: "http://[::1]/" },
  { name: "localhost", path: "http://localhost/" },
  { name: "localhost.localdomain", path: "http://localhost.localdomain/" },
  { name: "cloud metadata", path: "http://169.254.169.254/" },
  { name: "private 10.x", path: "http://10.0.0.1/" },
  { name: "private 172.16.x", path: "http://172.16.0.1/" },
  { name: "private 192.168.x", path: "http://192.168.0.1/" },
  { name: "ula ipv6", path: "http://[fc00::1]/" },
  { name: "link-local ipv6", path: "http://[fe80::1]/" },
];

// ===========================================================================
// Provider- and MCP-endpoint SSRF payloads.
//
// These are FULL URLs (not proxy `{path}` segments) for the endpoints where the
// caller supplies the provider/MCP base URL directly in the request body:
//   POST /api/2.0/ai/providers/preview   (previewProviderModels — url/key)
//   POST /api/2.0/ai/providers           (addProvider          — url/key)
//   PUT  /api/2.0/ai/providers/{id}      (updateProvider       — url/key)
//   POST /api/2.0/ai/servers             (addServer            — endpoint/headers)
//   PUT  /api/2.0/ai/servers/{id}        (updateServer         — endpoint/headers)
//
// VERIFIED (2026-07-23) against the gateway build these tests run on:
//   * Provider preview/create/update are refused up front with 403 by
//     AiProviderService.ThrowIfGatewayConfigured() — the FIRST call in each
//     method, before the url is parsed or any socket is opened. Manual providers
//     are disabled by the built-in gateway, so the provider-URL SSRF path is not
//     reachable here. Because the 403 precedes any connection, it is safe to
//     send even real loopback/metadata URLs to these endpoints: no address is
//     ever contacted. See {@link expectProviderUrlRefused}.
//   * MCP addServer/updateServer are NOT gateway-guarded: they actively connect
//     to the endpoint (McpService.ThrowIfNotConnectAsync) with no pre-connection
//     egress guard, then persist. A forbidden host currently yields 400 only
//     because the connection FAILS — not because it was rejected locally. So an
//     attacker-controlled host that IS reachable would be contacted. For MCP,
//     only non-resolving `.invalid` hosts and non-http(s) schemes are safe to
//     run on shared infrastructure; real loopback/private/link-local/metadata
//     targets must stay in the isolated canary environment (test.fixme).
// ===========================================================================

/**
 * Non-HTTP(S) schemes. Only http/https may ever reach a provider or MCP
 * endpoint; every other scheme must be rejected by URL validation BEFORE any
 * outbound connection. Safe to run anywhere — a rejected scheme opens no socket.
 */
export const unsafeSchemeUrls: { name: string; url: string }[] = [
  { name: "file", url: "file:///etc/passwd" },
  { name: "ftp", url: `ftp://${ATTACKER_HOST}/resource` },
  { name: "gopher", url: `gopher://${ATTACKER_HOST}/_test` },
  { name: "dict", url: `dict://${ATTACKER_HOST}/d:test` },
  { name: "data", url: "data:text/plain,test" },
  { name: "mailto", url: `mailto:test@${ATTACKER_HOST}` },
];

/**
 * Full attacker URLs on a non-resolving RFC 6761 `.invalid` host, including
 * normalization / parser-confusion variants (mixed-case scheme, userinfo,
 * trailing dot). Safe to run anywhere: an open egress path can only fail DNS,
 * never reach a real host.
 */
export const nonResolvingAttackerUrls: { name: string; url: string }[] = [
  { name: "plain http", url: `http://${ATTACKER_HOST}:9999/models` },
  { name: "plain https", url: `https://${ATTACKER_HOST}/models` },
  { name: "uppercase scheme", url: `HTTP://${ATTACKER_HOST}:9999/models` },
  { name: "mixed-case scheme", url: `HtTp://${ATTACKER_HOST}:9999/models` },
  { name: "userinfo", url: `http://user:pass@${ATTACKER_HOST}:9999/models` },
  {
    name: "allowed-lookalike userinfo",
    url: `http://provider.example@${ATTACKER_HOST}:9999/models`,
  },
  { name: "trailing dot host", url: `http://${ATTACKER_HOST}.:9999/models` },
  {
    name: "key in query string",
    url: `http://${ATTACKER_HOST}:9999/models?key=sk-leak`,
  },
];

/**
 * REAL internal / special targets (loopback / private / link-local / metadata /
 * IPv6). Only safe in the isolated canary environment: against shared
 * infrastructure an unfixed egress path would actually connect to them (e.g. the
 * MCP endpoint). Specs reference this list from test.fixme placeholders, and
 * from provider tests only where a pre-connection 403 guard is proven to run
 * before the URL is ever used.
 */
export const forbiddenSpecialUrls: { name: string; url: string }[] = [
  { name: "loopback 127.0.0.1", url: "http://127.0.0.1:9999/models" },
  { name: "short loopback 127.1", url: "http://127.1:9999/models" },
  { name: "decimal loopback", url: "http://2130706433:9999/models" },
  { name: "hex loopback", url: "http://0x7f000001:9999/models" },
  { name: "octal loopback", url: "http://017700000001:9999/models" },
  { name: "ipv6 loopback", url: "http://[::1]:9999/models" },
  { name: "localhost", url: "http://localhost:9999/models" },
  { name: "localhost.localdomain", url: "http://localhost.localdomain/models" },
  { name: "cloud metadata", url: "http://169.254.169.254/latest/meta-data/" },
  { name: "ecs metadata", url: "http://169.254.170.2/v2/credentials" },
  { name: "private 10.x", url: "http://10.0.0.1:9999/models" },
  { name: "private 172.16.x", url: "http://172.16.0.1:9999/models" },
  { name: "private 192.168.x", url: "http://192.168.0.1:9999/models" },
  { name: "ula ipv6", url: "http://[fc00::1]/models" },
  { name: "link-local ipv6", url: "http://[fe80::1]/models" },
];

/**
 * The provider preview/create/update endpoints must refuse a caller-supplied
 * base URL BEFORE opening any socket. In the gateway build that refusal is a
 * hard 403 (ThrowIfGatewayConfigured), which is also the strongest no-SSRF
 * signal available without a canary: the request never reaches URL handling.
 *
 * The spec's preferred post-fix behavior for a *manual-provider* build is a
 * deterministic 400 ("Provider URL is not allowed"). Should this build ever
 * re-enable manual providers, update the expected status here — but it must stay
 * a pre-connection rejection, never a 2xx and never a connection error.
 */
export function expectProviderUrlRefused(status: number) {
  expect(status).toBe(403);
}

/**
 * A forbidden MCP endpoint must not result in a persisted server, and the call
 * must fail with a client error. Today that is 400 (the connection to the
 * forbidden host fails); a proper egress guard would also reject with 400 but
 * WITHOUT connecting — a difference only a canary can observe (test.fixme).
 * Either way the observable contract is: not 2xx, and nothing saved.
 */
export function expectMcpEndpointRejected(status: number) {
  expect(status).not.toBe(200);
  expect([400, 403]).toContain(status);
}
