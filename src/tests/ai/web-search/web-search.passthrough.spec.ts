import { expect } from "@playwright/test";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  enableAiGateway,
  getServiceOperations,
  operationKey,
  operationSource,
  setAiSearchAddon,
  waitForMatchingServiceOperation,
} from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiWebSearch,
  WEB_SEARCH_PASSTHROUGH_ENGINE,
} from "@/src/helpers/ai-web-search";
import { ApiSDK, UserType } from "@/src/services/api-sdk";
import { PaymentApi } from "@/src/services/payment-api";
import { Role } from "@/src/services/token-store";

// POST /ai/websearch/v1/search and /contents — the routes the document editor's
// AI plugin uses. The plugin holds only a placeholder configuration; the portal
// resolves the active provider and its key itself, forwards the body and relays
// the provider's status, body and content type.
//
// Measured 2026-10-09 against a live portal (see the notes in each block):
//
//   * with no configuration both answer 404 `{"error":"Web search is not
//     configured"}` — the portal's own envelope;
//   * with the AI search add-on on, the body is validated by the GATEWAY and its
//     errors come back in the gateway's envelope
//     `{"error":{"code":"gateway_error","message":..,"type":"bad_request"}}`;
//   * the body must name an `engine` — `exa` is the only one the gateway knows;
//   * search: `{engine, query, numResults?}` -> `{requestId, results:[{title,
//     url, text}]}`; contents: `{engine, urls:[..]}` -> the same shape;
//   * Guest and a portal with AI switched off get 403, Anonymous 401, every
//     other role 200.
//
// The only provider a portal can have is the add-on's (the manual configuration
// path is retired — see web-search.spec.ts), so every call that reaches the
// provider here is a REAL search billed to the wallet at ~$0.008. Each test
// keeps the number of those to the minimum its claim needs; the cases that are
// refused before the provider (validation, role, AI switch) are free.
//
// What is deliberately NOT here, and why:
//   * 429 / 502 relay and the provider timeout: they need a provider that can
//     be told to rate-limit or fail. The portal dials a fixed gateway, there is
//     no way to point it at a stub from a test, and faking the response would
//     only test the stub.
//   * the outgoing `metadata` (`source_id` / `source_type` / `source_title`):
//     the gateway request is not observable, but its EFFECT is — the billing row
//     of the search carries the same attribution. The attribution test asserts
//     that instead, and says so.
//   * cancelling the upstream request on client disconnect: no upstream to watch.

const SEARCH_BODY = {
  engine: WEB_SEARCH_PASSTHROUGH_ENGINE,
  query: "ONLYOFFICE Docs",
  numResults: 1,
};

const SECRET_FIELD = /"(key|apiKey|api_key|token|secret|authorization)"\s*:/i;

const MEMBER_ROLES: Array<{ type: UserType; role: Role }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
];

/** AI Features and the AI search add-on on — the portal state every test starts from. */
async function enableWebSearch(apiSdk: ApiSDK, paymentsApi: PaymentApi) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);
  await setAiSearchAddon(ownerApi.payment, true);
  return ownerApi;
}

test.describe("AI Web Search passthrough - no configuration", () => {
  test("POST /api/2.0/ai/websearch/v1/search, contents - a portal without web search answers 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    expect(
      (await webSearch.isConfigured("owner")).data,
      "the premise: nothing is configured",
    ).toBe(false);

    // The bodies are well-formed, so the 404 is about the missing
    // configuration and not about the request.
    const search = await webSearch.passthroughSearch("owner", SEARCH_BODY);
    expect(search.status, search.text).toBe(404);
    expect(search.data).toEqual({ error: "Web search is not configured" });

    const contents = await webSearch.passthroughContents("owner", {
      engine: WEB_SEARCH_PASSTHROUGH_ENGINE,
      urls: ["https://example.com"],
    });
    expect(contents.status, contents.text).toBe(404);
    expect(contents.data).toEqual({ error: "Web search is not configured" });
  });

  test("POST /api/2.0/ai/websearch/v1/search, contents - switching the add-on off takes the routes back to 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // `engine` is deliberately missing: the request is refused by the gateway
    // for it, which proves it got that far without spending a search.
    const reaches = async () => ({
      search: await webSearch.passthroughSearch("owner", {}),
      contents: await webSearch.passthroughContents("owner", {}),
    });

    const on = await reaches();
    expect(on.search.status, on.search.text).toBe(400);
    expect(on.search.data?.error?.message).toBe("engine is required");
    expect(on.contents.status, on.contents.text).toBe(400);

    await setAiSearchAddon(ownerApi.payment, false);

    const off = await reaches();
    expect(off.search.status, off.search.text).toBe(404);
    expect(off.search.data).toEqual({ error: "Web search is not configured" });
    expect(off.contents.status, off.contents.text).toBe(404);
  });

  test("POST /api/2.0/ai/websearch/v1/search, contents - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // A configured portal, so the 401 is the authentication and not the 404.
    expect(
      (await webSearch.passthroughSearch("anonymous", SEARCH_BODY)).status,
    ).toBe(401);
    expect(
      (
        await webSearch.passthroughContents("anonymous", {
          engine: WEB_SEARCH_PASSTHROUGH_ENGINE,
          urls: ["https://example.com"],
        })
      ).status,
    ).toBe(401);
  });
});

test.describe("AI Web Search passthrough - search", () => {
  test("POST /api/2.0/ai/websearch/v1/search - a search answers the provider's results and exposes no secret", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Cyrillic on purpose: the body is forwarded as it came, so a query the
    // portal mangled on the way would come back as unrelated results.
    const { status, data, text, headers } = await webSearch.passthroughSearch(
      "owner",
      {
        engine: WEB_SEARCH_PASSTHROUGH_ENGINE,
        query: "редактор документов ONLYOFFICE",
        numResults: 2,
      },
    );

    expect(status, text).toBe(200);
    expect(headers["content-type"], "the provider's content type").toMatch(
      /^application\/json/,
    );
    expect(data?.requestId, "the provider's request id").toEqual(
      expect.any(String),
    );

    const results = data?.results ?? [];
    expect(results.length, "a search returns something").toBeGreaterThan(0);
    expect(results.length, "numResults caps the answer").toBeLessThanOrEqual(2);
    for (const result of results) {
      expect(result.title?.length, "a result has a title").toBeGreaterThan(0);
      expect(result.url, "a result is a link").toMatch(/^https?:\/\/\S+$/);
      expect(result.text, "a result carries its text").toEqual(
        expect.any(String),
      );
    }

    // The caller never sends a key and the portal never hands one back: the
    // plugin runs in the browser, so anything here is visible to the page.
    expect(text, "no credential field in the relayed body").not.toMatch(
      SECRET_FIELD,
    );
    expect(
      Object.keys(headers).filter((name) =>
        /authorization|api-key|x-api/i.test(name),
      ),
      "no credential header on the response",
    ).toEqual([]);
  });

  test("POST /api/2.0/ai/websearch/v1/search - a body the gateway refuses is refused before any search is billed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const before = new Set(
      (await getServiceOperations(ownerApi.payment, "aiSearch")).map(
        operationKey,
      ),
    );

    const refused: Array<[string, unknown, string]> = [
      ["an empty object", {}, "engine is required"],
      ["null", null, "engine is required"],
      ["an array", [], "engine is required"],
      ["a string", "hello", "engine is required"],
      ["an empty engine", { engine: "", query: "x" }, "engine is required"],
      ["no query", { engine: "exa" }, "query is required"],
      ["an empty query", { engine: "exa", query: "" }, "query is required"],
      ...["bogus-engine", "auto", "neural", "onlyoffice", "google"].map(
        (engine): [string, unknown, string] => [
          `engine ${engine}`,
          { engine, query: "x" },
          "unknown engine",
        ],
      ),
      [
        "numResults 0",
        { engine: "exa", query: "x", numResults: 0 },
        "numResults must be greater than 0",
      ],
      [
        "numResults -1",
        { engine: "exa", query: "x", numResults: -1 },
        "numResults must be greater than 0",
      ],
    ];

    for (const [label, body, message] of refused) {
      const { status, data, text } = await webSearch.passthroughSearch(
        "owner",
        body,
      );
      expect(status, `${label}: ${text}`).toBe(400);
      expect(data?.error, label).toEqual({
        code: "gateway_error",
        message,
        type: "bad_request",
      });
    }

    // The control: the same route with a good body is billed, and it is the
    // only thing that is. Billing lands after the response, so a count taken
    // straight away could miss a late refused-request row; waiting for the real
    // search's own row first means everything earlier has landed too.
    const ok = await webSearch.passthroughSearch("owner", SEARCH_BODY);
    expect(ok.status, ok.text).toBe(200);
    const charged = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiSearch",
      before,
      (operation) => operation.description === "Web search",
    );
    expect(charged, "the real search is billed").toBeDefined();

    const fresh = (await getServiceOperations(ownerApi.payment, "aiSearch"))
      .map(operationKey)
      .filter((key) => !before.has(key));
    expect(
      fresh,
      `${refused.length} refused requests plus one real search must add one charge`,
    ).toHaveLength(1);
  });

  // The gateway reads the body into a typed struct. A field of the wrong JSON
  // type is a client error like the missing-field ones above, which the same
  // gateway answers 400 `bad_request` — but these answer 500
  // `internal_server_error` and put the Go struct and field names in the
  // message. Measured 2026-10-09:
  //   {engine: 1}               -> 500 `bind "engine" from body: json: cannot
  //                                unmarshal number into Go struct field
  //                                SearchRequest.engine of type string`
  //   {engine:"exa", query: 5}  -> 500, same shape, SearchRequest.query
  //   {engine:"exa", query: {}} -> 500, same shape
  //   {engine:"exa", query:"a", numResults:"x"} -> 500, ...numResults of type int
  test("BUG XXXXX: POST /api/2.0/ai/websearch/v1/search - a field of the wrong type answers 400, not a 500 that names the gateway's Go structs", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Control: a MISSING field is already a clean 400 on this route.
    const control = await webSearch.passthroughSearch("owner", {
      engine: "exa",
    });
    expect(control.status, "a missing query is a clean 400").toBe(400);

    const bodies: Array<[string, unknown]> = [
      ["engine as a number", { engine: 1, query: "x" }],
      ["query as a number", { engine: "exa", query: 5 }],
      ["query as an object", { engine: "exa", query: {} }],
      [
        "numResults as a string",
        { engine: "exa", query: "x", numResults: "x" },
      ],
    ];
    const observed: string[] = [];
    for (const [label, body] of bodies) {
      const { status, text } = await webSearch.passthroughSearch("owner", body);
      observed.push(
        `${label}: ${status}${/Go struct/.test(text) ? " (leaks Go struct names)" : ""}`,
      );
    }

    test.fail();
    expect(
      observed,
      "a wrongly typed field is a 400 and does not leak internals",
    ).toEqual(bodies.map(([label]) => `${label}: 400`));
  });
});

test.describe("AI Web Search passthrough - contents", () => {
  test("POST /api/2.0/ai/websearch/v1/search, contents - the contents of a page found by a real search come back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const found = await webSearch.passthroughSearch("owner", SEARCH_BODY);
    expect(found.status, found.text).toBe(200);
    const url = found.data?.results?.[0]?.url;
    expect(url, "the search found a page to fetch").toMatch(/^https?:\/\//);

    // The follow-up the route exists for: it takes what `search` returned.
    const { status, data, text, headers } = await webSearch.passthroughContents(
      "owner",
      { engine: WEB_SEARCH_PASSTHROUGH_ENGINE, urls: [url] },
    );

    expect(status, text).toBe(200);
    expect(headers["content-type"]).toMatch(/^application\/json/);
    expect(data?.requestId).toEqual(expect.any(String));
    expect(data?.results?.length, "the page was fetched").toBeGreaterThan(0);
    const [page] = data!.results!;
    expect(page.url, "the contents are of the page that was asked for").toBe(
      url,
    );
    expect(page.text?.length, "the page has text").toBeGreaterThan(0);
    expect(text).not.toMatch(SECRET_FIELD);
  });

  test("POST /api/2.0/ai/websearch/v1/contents - a body the gateway refuses is a 400 in its envelope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const refused: Array<[string, unknown, string]> = [
      ["an empty object", {}, "engine is required"],
      [
        "an unknown engine",
        { engine: "zzz", urls: ["https://example.com"] },
        "unknown engine",
      ],
      ["no urls", { engine: "exa" }, "urls is required"],
      ["an empty urls list", { engine: "exa", urls: [] }, "urls is required"],
    ];

    for (const [label, body, message] of refused) {
      const { status, data, text } = await webSearch.passthroughContents(
        "owner",
        body,
      );
      expect(status, `${label}: ${text}`).toBe(400);
      expect(data?.error, label).toEqual({
        code: "gateway_error",
        message,
        type: "bad_request",
      });
    }
  });

  // Same defect as the search one above, on the second route.
  test("BUG XXXXX: POST /api/2.0/ai/websearch/v1/contents - urls of the wrong type answers 400, not a 500 that names the gateway's Go structs", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const control = await webSearch.passthroughContents("owner", {
      engine: "exa",
    });
    expect(control.status, "a missing urls is a clean 400").toBe(400);

    const { status, text } = await webSearch.passthroughContents("owner", {
      engine: "exa",
      urls: "https://example.com",
    });

    test.fail();
    expect(status, `urls as a string answered ${status}: ${text}`).toBe(400);
  });

  // Which side refuses a URL is a contract question this test answers by
  // observation: the portal does not dial the page itself — the provider does —
  // so there is no portal-side private-address guard on this route and the
  // protection is the provider's. What can be pinned is the outcome: nothing
  // comes back for a page that cannot be fetched, and no error is raised.
  test("POST /api/2.0/ai/websearch/v1/contents - a URL the provider cannot fetch yields no result instead of an error or foreign content", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Control: a fetchable page is answered, so the empty results below are
    // about the URLs and not about the route returning nothing.
    const control = await webSearch.passthroughContents("owner", {
      engine: WEB_SEARCH_PASSTHROUGH_ENGINE,
      urls: ["https://example.com"],
    });
    expect(control.status, control.text).toBe(200);
    expect(control.data?.results?.length).toBeGreaterThan(0);

    for (const [label, url] of [
      ["not a URL", "not a url"],
      ["a page that does not exist", "https://example.com/not-here-404"],
      ["a loopback address", "http://127.0.0.1/"],
      ["an unresolvable host", "https://web-search-attacker.invalid/"],
    ] as const) {
      const { status, data, text } = await webSearch.passthroughContents(
        "owner",
        { engine: WEB_SEARCH_PASSTHROUGH_ENGINE, urls: [url] },
      );
      expect(status, `${label}: ${text}`).toBe(200);
      expect(data?.results, label).toEqual([]);
    }
  });
});

test.describe("AI Web Search passthrough - permissions", () => {
  test("POST /api/2.0/ai/websearch/v1/search, contents - DocSpaceAdmin, RoomAdmin and User may use them, a Guest gets 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Every member is created while the shared context is the owner's, then
    // authenticated one at a time (a member cannot create members, and two
    // authentications back to back flake with 401).
    const members = [];
    for (const { type, role } of [
      ...MEMBER_ROLES,
      { type: "Guest" as UserType, role: "guest" as Role },
    ]) {
      const { data, userData } = await apiSdk.addMember("owner", type);
      expect(data.response?.id, `${type} was created`).toBeTruthy();
      members.push({ type, role, userData, id: data.response!.id! });
    }

    for (const { type, role, userData, id } of members) {
      await apiSdk.authenticateMember(userData, type);
      await webSearch.expectActingAs(role, id, type);

      const search = await webSearch.passthroughSearch(role, SEARCH_BODY);
      // `engine` missing instead of a second real search: for the roles that
      // are allowed this proves the request reached the gateway.
      const contents = await webSearch.passthroughContents(role, {});

      if (type === "Guest") {
        expect(search.status, `Guest search: ${search.text}`).toBe(403);
        expect(search.data).toEqual({ error: "Forbidden" });
        expect(contents.status, `Guest contents: ${contents.text}`).toBe(403);
        expect(contents.data).toEqual({ error: "Forbidden" });
      } else {
        expect(search.status, `${type} search: ${search.text}`).toBe(200);
        expect(search.data?.results?.length, `${type} search`).toBeGreaterThan(
          0,
        );
        expect(contents.status, `${type} contents: ${contents.text}`).toBe(400);
        expect(contents.data?.error?.message, type).toBe("engine is required");
      }
    }
  });

  test("POST /api/2.0/ai/websearch/v1/search, contents - the portal AI switch refuses both with 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Control, taken before the switch: a body without `engine` is a gateway 400,
    // so a 403 after it is the switch and not a route that refuses this request.
    expect((await webSearch.passthroughSearch("owner", {})).status).toBe(400);
    expect((await webSearch.passthroughContents("owner", {})).status).toBe(400);

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    const search = await webSearch.passthroughSearch("owner", SEARCH_BODY);
    expect(search.status, search.text).toBe(403);
    const contents = await webSearch.passthroughContents("owner", {
      engine: WEB_SEARCH_PASSTHROUGH_ENGINE,
      urls: ["https://example.com"],
    });
    expect(contents.status, contents.text).toBe(403);

    // The switch hides the feature, it does not cancel the add-on.
    await setPortalAiAccess(ownerApi, true);
    expect((await webSearch.passthroughSearch("owner", {})).status).toBe(400);
  });
});

// The document the search is made for is what the wallet report's Source column
// names. The route's contract: `entityId` + `entityKind` name the document; with
// the ONLYOFFICE provider the entry is resolved under the CALLER's credentials
// and sent to the gateway as `metadata`, and an entry the caller cannot open
// sends none.
//
// The gateway request is not observable from here, but the billing row it
// produces is — the row carries `sourceType` / `sourceId` / `sourceTitle`, which
// is that metadata after the gateway has used it. So this asserts the contract
// through its visible effect. It is NOT a proof of the wire format.
//
// Measured 2026-10-09: `entityKind=file` attributes (sourceType "File",
// sourceId, sourceTitle = the file's title); `entityKind` of another spelling
// ("File", "document", "room", "agent", "zzz"), a missing `entityKind`, an id
// that does not exist or is not a number all answer 200 and attribute nothing.
// Only the lowercase spelling is pinned below: the others are not documented.
test.describe("AI Web Search passthrough - billing attribution", () => {
  test("POST /api/2.0/ai/websearch/v1/search - a search is attributed to a document its caller can open, and to nothing otherwise", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ownerApi = await enableWebSearch(apiSdk, paymentsApi);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const title = `Autotest Attribution ${apiSdk.faker.generateString(8)}.docx`;
    const { data: file, status: createStatus } =
      await ownerApi.files.createFile({
        folderId: myFolder.response!.current!.id!,
        createFileJsonElement: { title },
      });
    expect(createStatus).toBe(200);
    const fileId = file.response!.id!;
    const fileTitle = file.response!.title!;

    const reader = await apiSdk.addMember("owner", "User");
    const stranger = await apiSdk.addMember("owner", "User");
    const readerId = reader.data.response!.id!;
    const strangerId = stranger.data.response!.id!;

    // Read-only is enough to open it: attribution is about visibility, not edit.
    const { status: shareStatus } = await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: readerId, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(shareStatus).toBe(200);

    const before = new Set(
      (await getServiceOperations(ownerApi.payment, "aiSearch")).map(
        operationKey,
      ),
    );
    const search = async (
      role: Role,
      entity: { entityId?: number | string; entityKind?: string },
      label: string,
    ) => {
      const { status, text } = await webSearch.passthroughSearch(
        role,
        SEARCH_BODY,
        entity,
      );
      expect(status, `${label}: ${text}`).toBe(200);
    };

    // 3 searches by the owner: attributed, id only, an id that does not exist.
    await search("owner", { entityId: fileId, entityKind: "file" }, "owner");
    await search("owner", { entityId: fileId }, "owner without kind");
    await search(
      "owner",
      { entityId: 999999999, entityKind: "file" },
      "owner, unknown id",
    );

    await apiSdk.authenticateMember(reader.userData, "User");
    await webSearch.expectActingAs("user", readerId, "the reader");
    await search("user", { entityId: fileId, entityKind: "file" }, "reader");

    await apiSdk.authenticateMember(stranger.userData, "User");
    await webSearch.expectActingAs("user", strangerId, "the stranger");
    await search("user", { entityId: fileId, entityKind: "file" }, "stranger");

    await apiSdk.authenticateOwner();

    // Billing is written after the call answers: wait for all five rows rather
    // than reading once, and then read them as a set.
    const expectedRows = 5;
    let fresh: Awaited<ReturnType<typeof getServiceOperations>> = [];
    await expect(async () => {
      fresh = (await getServiceOperations(ownerApi.payment, "aiSearch")).filter(
        (operation) => !before.has(operationKey(operation)),
      );
      expect(fresh).toHaveLength(expectedRows);
    }).toPass({ intervals: [3000, 5000], timeout: 180000 });

    expect(
      fresh.filter((row) => !row.participantName),
      "every row names who searched",
    ).toEqual([]);
    for (const row of fresh) {
      expect(row.service).toBe("ai-search");
      expect(row.description).toBe("Web search");
    }

    const byUser = (id: string) =>
      fresh.filter((operation) => operation.participantName === id);
    const ownerId = await webSearch.whoAmI("owner");

    const ownerRows = byUser(ownerId);
    expect(ownerRows, "three searches by the owner").toHaveLength(3);
    const attributed = ownerRows.filter(
      (row) => operationSource(row).id !== undefined,
    );
    expect(
      attributed.map((row) => operationSource(row)),
      "exactly the search with a valid document and kind is attributed",
    ).toEqual([{ type: "File", id: String(fileId), title: fileTitle }]);
    for (const row of ownerRows.filter((row) => !attributed.includes(row))) {
      expect(
        operationSource(row),
        "no kind, or an id that does not exist, attributes nothing",
      ).toEqual({ type: undefined, id: undefined, title: undefined });
    }

    // A reader sees the document, so it is attributed to them as well.
    const readerRows = byUser(readerId);
    expect(readerRows).toHaveLength(1);
    expect(operationSource(readerRows[0])).toEqual({
      type: "File",
      id: String(fileId),
      title: fileTitle,
    });

    // A user who cannot open it gets the search — and an unattributed row that
    // does not carry the document's id or title.
    const strangerRows = byUser(strangerId);
    expect(strangerRows).toHaveLength(1);
    expect(operationSource(strangerRows[0])).toEqual({
      type: undefined,
      id: undefined,
      title: undefined,
    });
    expect(
      JSON.stringify(strangerRows[0]),
      "the closed document's title is not disclosed",
    ).not.toContain(fileTitle);
  });
});
