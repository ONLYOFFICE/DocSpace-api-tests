import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import type { ApiSDK } from "@/src/services/api-sdk";

// SSRF-01 (BUG 82548): filehandler.ashx — server fetches arbitrary URLs via the
// fileuri parameter and saves the response body as a file in the user's "My
// Documents" folder. Confirmed on both self-hosted and cloud (onlyoffice.io).
//
// Fix required: validate fileuri against an allow-list of trusted Document Server
// origins or strip it from the client request entirely. Block loopback,
// link-local (169.254.x.x), RFC-1918, and ULA ranges before establishing any
// connection.
//
// Oracle. With `response=message` the handler answers 200 with a one-line body:
//   "ok: File created in folder ..."       — response body was fetched and saved;
//   "error: Connection refused (host:port)" — the server DID open a connection
//                                             and the target just was not
//                                             listening.
// "No file appeared" alone is therefore a false negative: an unreachable
// loopback/private target leaves no file yet proves the outbound attempt. A
// proper fix rejects the URL before connecting, so the body must carry neither
// an "ok:" nor a network-level error. Measured 2026-09-15: 127.0.0.1 → Connection
// refused; 169.254.169.254 → 0-byte file (IMDSv2 answers 401 with an empty
// body); *.svc.cluster.local → 474-byte health payload; 10.x → the handler
// hangs ~90 s until CloudFront returns 504 (not asserted here for that reason).

const OUTBOUND_ATTEMPT_RE =
  /connection refused|timed out|no such host|network is unreachable|host is down|name or service not known/i;

async function createFileFromUri(
  apiSdk: ApiSDK,
  fileuri: string,
  title: string,
) {
  const response = await apiSdk.request.get(
    `${apiSdk.tokenStore.portalBaseUrl}/filehandler.ashx?action=create` +
      `&fileuri=${encodeURIComponent(fileuri)}` +
      `&title=${encodeURIComponent(title)}&response=message`,
    {
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
        Origin: `https://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  const body = await response.text();

  const { data } = await apiSdk.forRole("owner").folders.getMyFolder();
  const file = data.response?.files?.find((f) => f.title === title);

  return { status: response.status(), body, file };
}

function expectUriRejectedBeforeConnecting(result: {
  status: number;
  body: string;
  file: unknown;
}) {
  expect(
    result.body,
    "the server opened an outbound connection to the fileuri host",
  ).not.toMatch(OUTBOUND_ATTEMPT_RE);
  expect(
    result.body,
    "the fileuri response body was saved as a file",
  ).not.toMatch(/^ok:/i);
  expect(result.file, "a file was created from fileuri").toBeUndefined();
}

test.describe("GET /filehandler.ashx - fileuri parameter must not trigger outbound HTTP requests", () => {
  test.fail(
    "BUG 82548: GET /filehandler.ashx - loopback fileuri is rejected before connecting",
    async ({ apiSdk }) => {
      const result = await createFileFromUri(
        apiSdk,
        "http://127.0.0.1:9999/ssrf-canary",
        "ssrf-loopback.txt",
      );
      expectUriRejectedBeforeConnecting(result);
    },
  );

  test.fail(
    "BUG 82548: GET /filehandler.ashx - link-local fileuri (169.254.x.x) is rejected before connecting",
    async ({ apiSdk }) => {
      const result = await createFileFromUri(
        apiSdk,
        "http://169.254.169.254/latest/meta-data/",
        "ssrf-imds.txt",
      );
      expectUriRejectedBeforeConnecting(result);
    },
  );

  test.fail(
    "BUG 82548: GET /filehandler.ashx - internal Kubernetes service fileuri is rejected before connecting",
    async ({ apiSdk }) => {
      const result = await createFileFromUri(
        apiSdk,
        "http://files.docspace.svc.cluster.local:5050/health",
        "ssrf-k8s.txt",
      );
      expectUriRejectedBeforeConnecting(result);
    },
  );
});

// SSRF-02: POST /api/2.0/files/thirdparty (WebDAV) — server performs outbound WebDAV PROPFIND
// to any URL provided by the user without validation. Confirmed on both self-hosted and cloud.
//
// Fix required: validate url against an allow-list or block private IP ranges
// (loopback, link-local RFC-3927, RFC-1918, ULA) before establishing any connection,
// with re-validation at connect time to prevent DNS-rebinding.

// Third-party providers are off on a fresh portal, and `save-third-party` then
// answers 403 "Access denied" before it ever looks at the url — which would make
// these tests pass for a reason that has nothing to do with SSRF. Every case
// therefore enables the feature first.
async function saveWebDavProvider(
  apiSdk: ApiSDK,
  url: string,
  customerTitle: string,
) {
  await apiSdk.request.put(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/thirdparty`,
    {
      data: { set: true },
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
        Origin: `https://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );

  return apiSdk.forRole("owner").thirdPartyIntegration.saveThirdParty({
    thirdPartyRequestDto: {
      url,
      login: "ssrf-test",
      password: "ssrf-test",
      providerKey: "WebDav",
      customerTitle,
    },
  });
}

test.describe("POST /api/2.0/files/thirdparty - WebDAV provider URL must be validated before outbound PROPFIND", () => {
  test.fail(
    "BUG 82560: WebDAV provider creation allows SSRF — server performs PROPFIND to arbitrary URL without validation",
    async ({ apiSdk }) => {
      const { data, status } = await saveWebDavProvider(
        apiSdk,
        "http://127.0.0.1:9999/webdav-canary",
        "ssrf-webdav-loopback",
      );

      expect(status, JSON.stringify(data)).toBe(400);
      expect((data as any).providerId).toBeUndefined();
    },
  );

  test.fail(
    "BUG 82560: POST /api/2.0/files/thirdparty - should reject WebDAV provider with link-local URL (169.254.x.x)",
    async ({ apiSdk }) => {
      const { data, status } = await saveWebDavProvider(
        apiSdk,
        "http://169.254.169.254/",
        "ssrf-webdav-imds",
      );

      expect(status, JSON.stringify(data)).toBe(400);
      expect((data as any).providerId).toBeUndefined();
    },
  );

  test.fail(
    "BUG 82560: POST /api/2.0/files/thirdparty - should reject WebDAV provider with RFC-1918 private IP",
    async ({ apiSdk }) => {
      const { data, status } = await saveWebDavProvider(
        apiSdk,
        "http://192.168.0.1/webdav",
        "ssrf-webdav-rfc1918",
      );

      expect(status, JSON.stringify(data)).toBe(400);
      expect((data as any).providerId).toBeUndefined();
    },
  );
});
