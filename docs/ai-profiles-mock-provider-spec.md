# Mock provider for `POST /api/2.0/ai/profiles/list-provider-models`

Status: specification only. Nothing is implemented, hosted or committed.

## 1. Why it is needed

`list-provider-models` is the one profile route that opens an outbound connection
to a caller-supplied host. Today the suite can reach only two outcomes of the
provider: the real DeepSeek API answering 200, and the same API rejecting a bogus
key (400). Everything about how the portal reacts to a provider that misbehaves
(429, 5xx, broken JSON, timeouts, redirects, bad certificates) is untested
because no controllable provider exists.

## 2. Hard constraints

* The portals under test are SaaS portals. Since 2026-08-18 the portal refuses a
  `baseUrl` whose host does not resolve or resolves to a private, loopback or
  link-local address (`400 baseUrl host is not allowed` /
  `baseUrl host could not be resolved`). A mock on a laptop, a LAN or a
  localhost tunnel is therefore **refused by design**.
* The mock must be a **publicly resolvable HTTPS host that the portal can reach
  over the internet**, with a certificate chain the portal trusts for the
  "healthy" scenarios.
* The portal's outbound timeouts are not documented. Measured so far: a filtered
  public port answers `502 provider is unreachable` after ~3 s. The timeout for a
  server that accepts the connection and then stays silent is unknown and has to
  be measured with the `hang` scenario before any timeout test is written.
* The exact outbound requests per transport (path, method, auth header) are not
  documented either. See section 6, phase 0.

## 3. Addressing and isolation

Tests run in parallel workers on separate portals, so every request must be
attributable.

```
https://<mock-host>/s/<scenario>/<run-id>/v1
```

* `<scenario>` selects the behaviour (section 4).
* `<run-id>` is a per-test random token chosen by the test. It scopes the request
  log, so a test can assert "the portal sent exactly N requests" or "sent none".
* The portal appends whatever path its transport uses after `/v1` (for example
  `/models`). The mock matches on the `<scenario>` prefix and answers any path
  below it, and records the path it saw.

Routing is by path rather than by hostname, except for the certificate
scenarios, which need distinct hostnames (section 4.5).

## 4. Scenarios

### 4.1 Well-formed answers

| Scenario | Behaviour |
|---|---|
| `ok` | 200, three models, in the shape of the requested transport |
| `ok-empty` | 200, valid envelope, zero models |
| `ok-large` | 200, 2000 models (checks paging, truncation and response size handling) |
| `ok-duplicates` | 200, the same `id` twice with different names |
| `ok-unicode` | 200, model ids and names containing non-ASCII text |
| `ok-extra-fields` | 200, unknown extra fields on every model and on the envelope |

Response shapes. OpenAI-compatible (deepseek, openai and most others):

```json
{"object":"list","data":[{"id":"mock-model-1","object":"model","created":1700000000,"owned_by":"mock"}]}
```

The anthropic, genai (Google) and local (ollama, lm-studio, gpt4all) transports
each expect their own shape. The mock must produce the shape the transport parses;
which shape that is has to be taken from the phase 0 recording, not guessed.

### 4.2 Malformed answers (HTTP 200 with a bad body)

| Scenario | Body |
|---|---|
| `bad-json` | truncated JSON: `{"object":"list","data":[` |
| `html` | `<html><body>Not an API</body></html>` with `text/html` |
| `not-array` | `{"object":"list","data":{"id":"x"}}` |
| `wrong-types` | `id` as a number, `name` as an object, `capabilities`-like fields as strings |
| `missing-id` | models without an `id` |
| `empty-body` | 200, `Content-Length: 0` |
| `wrong-content-type` | valid JSON served as `text/plain` |
| `gzip-bomb` | small compressed body that expands past a stated limit (only if the portal decompresses; see section 5) |

### 4.3 HTTP errors

`status-401`, `status-403`, `status-404`, `status-429` (with and without
`Retry-After`), `status-500`, `status-502`, `status-503`. Each returns a small
JSON error body in the shape of a real provider (`{"error":{"message":"..."}}`).
`status-200-with-error` returns 200 with an error body, which some providers do.

### 4.4 Timing and connection behaviour

| Scenario | Behaviour |
|---|---|
| `slow-<n>` | answers `ok` after `n` seconds (n in 1, 5, 15, 30, 60) |
| `hang` | accepts the connection and the request, never answers |
| `drop` | closes the connection after reading the request, no response |
| `drop-mid-body` | sends headers and half of the body, then resets the connection |
| `slow-body` | sends one byte per second |
| `big-body` | streams a body larger than any plausible limit (bounded by section 5) |

### 4.5 Redirects and certificates

| Scenario | Behaviour |
|---|---|
| `redirect-public` | 302 to `/s/ok/<run-id>/v1` on the same host |
| `redirect-other-host` | 302 to a second public mock hostname |
| `redirect-loop` | redirects to itself |
| `redirect-chain-<n>` | n consecutive redirects, then `ok` |
| `redirect-internal` | 302 to `http://127.0.0.1/`, `http://169.254.169.254/`, `http://[::1]/`. **Canary environments only**, disabled by default (section 5) |
| certificates | separate hostnames: `self-signed.<mock-host>`, `expired.<mock-host>`, `wrong-host.<mock-host>`, `untrusted-root.<mock-host>`, each serving `ok` |
| `http-downgrade` | an HTTPS mock hostname redirecting to plain `http://` |

### 4.6 Authentication

Tests must never need a real key. The mock accepts a fixed documented key
(`mock-valid-key`) and answers any other key with the transport's native 401 shape,
so "valid key" and "invalid key" are both exercisable without a real credential.
`auth-none` accepts any key including none (the local-provider case).

### 4.7 Observation endpoints

```
GET /_/requests/<run-id>          -> list of received requests
DELETE /_/requests/<run-id>       -> clear
```

Each entry: timestamp, method, full path and query, header **names**, the
`Authorization` scheme, and a hash of the credential (length and the first 8
characters of its SHA-256), never the credential itself. Protected by a bearer token
that the suite reads from the environment. This is what turns "no connection was
made" and "exactly one request was sent" into assertions.

## 5. Security requirements

The mock is a public service that the portal will deliberately call. It must not
become a foothold.

* **Never store or log a credential.** Record only the hash prefix in 4.7. Redact
  `Authorization`, `x-api-key` and any `key=` query parameter everywhere, including
  access logs and error traces.
* **No open-proxy behaviour.** The mock never fetches anything on a caller's
  behalf. Redirect targets are a fixed allowlist in configuration, not taken from
  the request.
* **`redirect-internal` is off by default** and enabled only by an explicit
  environment flag in an isolated canary environment. On a shared portal, a
  redirect to `127.0.0.1` or `169.254.169.254` would exercise the portal's own
  network if its guard did not re-check redirect targets, which is exactly the
  failure the scenario exists to find. It must not run against shared
  infrastructure.
* **Bounded resources:** a maximum body size and duration per scenario, a maximum
  number of concurrent connections, per-IP rate limiting, and a hard cap on
  `slow-*` and `hang` so the mock cannot be used to hold open connections
  indefinitely.
* **Isolated hosting:** its own domain and its own network segment, not inside the
  DocSpace or CI network, running as an unprivileged user, with no access to
  internal services or secrets.
* **No content that could be mistaken for a real provider's credentials or
  branding.** Model names are `mock-*`. Error text says it is a mock.
* **Admin access** (4.7, configuration) behind a token, TLS only, token rotated
  with the suite's other secrets.
* **Retention:** request logs expire after 24 hours.
* **Abuse:** the host appears in a public DNS name and will be probed by scanners.
  Unknown paths answer 404 with no information, and scenario endpoints cost nothing
  to answer.

## 6. Configuration

Environment variables of the mock:

```
MOCK_LISTEN=0.0.0.0:443
MOCK_TLS_CERT / MOCK_TLS_KEY            # trusted certificate for the main host
MOCK_VALID_KEY=mock-valid-key
MOCK_ADMIN_TOKEN=<secret>
MOCK_ENABLE_INTERNAL_REDIRECTS=false    # canary only
MOCK_REDIRECT_ALLOWLIST=<second-public-host>
MOCK_MAX_BODY_BYTES=...
MOCK_MAX_HOLD_SECONDS=...
MOCK_LOG_RETENTION_HOURS=24
```

Environment variables of the suite (`config`):

```
AI_MOCK_PROVIDER_URL=https://<mock-host>     # unset => the mock-dependent tests do not exist in the run
AI_MOCK_ADMIN_TOKEN=<secret>
AI_MOCK_CANARY=false                          # true only against an isolated portal
```

Phase 0, before any assertion is written: run each transport once against a
`record` scenario that answers 404 to everything and returns the request log, so
that the real outbound path, method and auth header per transport are known.

## 7. Contract decisions needed before tests

Tests must assert the intended contract, not whatever the portal currently
returns. These need an answer from the backend team first:

| Provider behaviour | Status and message the portal should return |
|---|---|
| 401 | 400, key rejected (already the case for DeepSeek) |
| 403 | ? |
| 404 on the models path | 400 invalid base URL (already the case for the OpenAI-compatible check)? |
| 429 | ? (502, 429 passthrough?) |
| 500, 502, 503 | 502 |
| invalid JSON, HTML, wrong shape | 502 or 400? |
| empty model list | 200 `[]` |
| duplicate ids | passthrough or de-duplicated |
| silent server (`hang`) | 504 or 502, and the maximum wait |
| connection dropped | 502 |
| redirect to a public host | followed or refused |
| redirect to a private host | refused |
| invalid or untrusted certificate | refused, with which status |

## 8. Future tests

All in `src/tests/ai/profiles/profiles.spec.ts`, each following the suite's
conventions (exact status, side-effect check first, positive control). A scenario
whose contract is not yet agreed becomes a `test.fail()` only after a defect is
confirmed against an agreed contract.

1. `ok`, per transport: structure of every model, `provider` echo, capability
   mask, no duplicate ids.
2. `ok-empty`: 200 with an empty array, not an error.
3. `ok-large`: complete list, and a response time bound.
4. `ok-duplicates`, `ok-unicode`, `ok-extra-fields`: behaviour agreed in section 7.
5. `bad-json`, `html`, `not-array`, `wrong-types`, `missing-id`, `empty-body`,
   `wrong-content-type`: not a 200, no stack trace, no internal address, and the
   body is the route's `{error}` shape.
6. `status-401/403/404/429/500/502/503`: one parameterised test with the agreed
   status per row; the response never echoes the key.
7. `slow-<n>`: answered within the agreed limit; `hang`, `drop`, `drop-mid-body`,
   `slow-body`: a bounded failure, never a hang of the portal's request.
8. `big-body`: refused or truncated, with a bounded response.
9. `redirect-public`, `redirect-other-host`, `redirect-loop`,
   `redirect-chain-<n>`: behaviour agreed in section 7, and the request log shows
   the hops that were really made.
10. certificates: each bad certificate is refused, the request log shows no
    request, and the `ok` control on the trusted host succeeds.
11. `http-downgrade`: refused or flagged.
12. Authentication: `mock-valid-key` returns models, any other key returns the
    key error, no key works on `auth-none` for the local transports.
13. Header-unsafe keys against the mock: the request log shows **no request
    arrived**, which proves the failure of the BUG XXXXX unicode-key test happens
    before the connection and not at the provider.
14. Request hygiene, from the request log: the portal sends the key only in the
    expected header, sends no cookies and no portal tokens, and the User-Agent and
    Origin are what the contract says.
15. Concurrency: parallel discovery calls from different roles attribute to the
    right `<run-id>`.
16. Canary only (`AI_MOCK_CANARY=true`): `redirect-internal` to each internal
    target, the request log of a controlled canary service behind it shows zero
    hits.
17. Guest and AI-off: the same scenarios from a Guest (BUG 82824) and with AI off
    (BUG 82810) must show **zero** requests in the log once those bugs are fixed;
    today the log would show one, which makes the egress visible.
18. No profile is created and no key persists in the catalogue after any of the
    above.

## 9. Not covered by the mock

* Alternative IP notations (decimal, hex, octal) and the IPv6 literal variants
  that the host guard classifies. That is the guard's address normalisation, and
  needs the isolated canary of `ssrf-payloads.ts`, not a provider.
* DNS names that resolve to a private address, or to several addresses of which
  one is private. This needs a DNS zone the suite controls, and carries the same
  risk as the internal redirect, so it is canary-only.
* The manual-provider create, update and delete paths. They are unreachable on a
  gateway build whatever the provider does.
