import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// SSRF-01: filehandler.ashx — server fetches arbitrary URLs via fileuri parameter
// and saves the response body as a file in the user's "My Documents" folder.
// Confirmed on both self-hosted and cloud (onlyoffice.io).
//
// Fix required: validate fileuri against an allow-list of trusted Document Server origins
// or strip it from the client request entirely. Block loopback, link-local (169.254.x.x),
// RFC-1918, and ULA ranges before establishing any connection.

test.describe("GET /filehandler.ashx - fileuri parameter must not trigger outbound HTTP requests", () => {
  test("GET /filehandler.ashx - should not create file from loopback URL", async ({
    apiSdk,
  }) => {
    const baseUrl = apiSdk.tokenStore.portalBaseUrl;
    const token = apiSdk.tokenStore.getToken("owner");

    await apiSdk.request.get(
      `${baseUrl}/filehandler.ashx?action=create` +
        `&fileuri=${encodeURIComponent("http://127.0.0.1:9999/ssrf-canary")}` +
        `&title=ssrf-loopback.txt&response=message`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: `https://${apiSdk.tokenStore.newTenantDomain}`,
        },
      },
    );

    const { data } = await apiSdk.forRole("owner").folders.getMyFolder();
    const ssrfFile = data.response?.files?.find(
      (f: any) => f.title === "ssrf-loopback.txt",
    );

    expect(ssrfFile).toBeUndefined();
  });

  test("GET /filehandler.ashx - should not create file from link-local URL (169.254.x.x)", async ({
    apiSdk,
  }) => {
    const baseUrl = apiSdk.tokenStore.portalBaseUrl;
    const token = apiSdk.tokenStore.getToken("owner");

    await apiSdk.request.get(
      `${baseUrl}/filehandler.ashx?action=create` +
        `&fileuri=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}` +
        `&title=ssrf-imds.txt&response=message`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: `https://${apiSdk.tokenStore.newTenantDomain}`,
        },
      },
    );

    const { data } = await apiSdk.forRole("owner").folders.getMyFolder();
    const ssrfFile = data.response?.files?.find(
      (f: any) => f.title === "ssrf-imds.txt",
    );

    expect(ssrfFile).toBeUndefined();
  });

  test("GET /filehandler.ashx - should not create file from internal Kubernetes service URL", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82548: filehandler.ashx allows SSRF — server fetches fileuri without URL validation",
    );

    const baseUrl = apiSdk.tokenStore.portalBaseUrl;
    const token = apiSdk.tokenStore.getToken("owner");

    await apiSdk.request.get(
      `${baseUrl}/filehandler.ashx?action=create` +
        `&fileuri=${encodeURIComponent("http://files.docspace.svc.cluster.local:5050/health")}` +
        `&title=ssrf-k8s.txt&response=message`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: `https://${apiSdk.tokenStore.newTenantDomain}`,
        },
      },
    );

    const { data } = await apiSdk.forRole("owner").folders.getMyFolder();
    const ssrfFile = data.response?.files?.find(
      (f: any) => f.title === "ssrf-k8s.txt",
    );

    expect(ssrfFile).toBeUndefined();
  });
});

// SSRF-02: POST /api/2.0/files/thirdparty (WebDAV) — server performs outbound WebDAV PROPFIND
// to any URL provided by the user without validation. Confirmed on both self-hosted and cloud.
//
// Fix required: validate url against an allow-list or block private IP ranges
// (loopback, link-local RFC-3927, RFC-1918, ULA) before establishing any connection,
// with re-validation at connect time to prevent DNS-rebinding.

test.describe("POST /api/2.0/files/thirdparty - WebDAV provider URL must be validated before outbound PROPFIND", () => {
  test("POST /api/2.0/files/thirdparty - should reject WebDAV provider with loopback URL", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82560: WebDAV provider creation allows SSRF — server performs PROPFIND to arbitrary URL without validation",
    );

    const baseUrl = apiSdk.tokenStore.portalBaseUrl;
    const ownerToken = apiSdk.tokenStore.getToken("owner");

    await apiSdk.request.put(`${baseUrl}/api/2.0/files/thirdparty`, {
      data: { set: true },
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        Origin: `https://${apiSdk.tokenStore.newTenantDomain}`,
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: "http://127.0.0.1:9999/webdav-canary",
          login: "ssrf-test",
          password: "ssrf-test",
          providerKey: "WebDav",
          customerTitle: "ssrf-webdav-loopback",
        },
      });

    expect(status).toBe(400);
    expect((data as any).providerId).toBeUndefined();
  });

  test("POST /api/2.0/files/thirdparty - should reject WebDAV provider with link-local URL (169.254.x.x)", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82560: WebDAV provider creation allows SSRF — server performs PROPFIND to arbitrary URL without validation",
    );

    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: "http://169.254.169.254/",
          login: "ssrf-test",
          password: "ssrf-test",
          providerKey: "WebDav",
          customerTitle: "ssrf-webdav-imds",
        },
      });

    expect(status).toBe(400);
    expect((data as any).providerId).toBeUndefined();
  });

  test("POST /api/2.0/files/thirdparty - should reject WebDAV provider with RFC-1918 private IP", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82560: WebDAV provider creation allows SSRF — server performs PROPFIND to arbitrary URL without validation",
    );

    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: "http://192.168.0.1/webdav",
          login: "ssrf-test",
          password: "ssrf-test",
          providerKey: "WebDav",
          customerTitle: "ssrf-webdav-rfc1918",
        },
      });

    expect(status).toBe(400);
    expect((data as any).providerId).toBeUndefined();
  });
});
