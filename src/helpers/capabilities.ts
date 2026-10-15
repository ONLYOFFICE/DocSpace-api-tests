import { APIResponse, expect } from "@playwright/test";
import type { CapabilitiesDto } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";

// `ldapDomain` is the only optional field and the live portal omits the key
// while LDAP is off, so a missing key, null and "" all mean "empty" for the
// string fields.
export const isEmptyText = (value: string | null | undefined) =>
  value === undefined || value === null || value === "";

const providerList = (capabilities: CapabilitiesDto) =>
  capabilities.providers ?? [];

/**
 * Everything the SDK documents about the shape of a capabilities payload, plus
 * the invariants it states between fields. Conditional invariants only bite
 * when the portal is in that state - the suite never reconfigures a portal, so
 * the LDAP-on and SSO-on branches stay unexercised here.
 */
export function expectCapabilitiesContract(
  capabilities: CapabilitiesDto | undefined,
): asserts capabilities is CapabilitiesDto {
  expect(capabilities, "response object present").toBeDefined();
  const c = capabilities as CapabilitiesDto;

  expect(typeof c.ldapEnabled, "ldapEnabled is boolean").toBe("boolean");
  expect(typeof c.oauthEnabled, "oauthEnabled is boolean").toBe("boolean");
  expect(typeof c.identityServerEnabled, "identityServerEnabled").toBe(
    "boolean",
  );

  // required but nullable: the key must be there, as a string or null
  for (const [name, value] of [
    ["ssoLabel", c.ssoLabel],
    ["ssoUrl", c.ssoUrl],
  ] as const) {
    expect(value === null || typeof value === "string", `${name} type`).toBe(
      true,
    );
  }
  expect(c.providers === null || Array.isArray(c.providers)).toBe(true);

  // optional and nullable
  if (c.ldapDomain !== undefined && c.ldapDomain !== null) {
    expect(typeof c.ldapDomain).toBe("string");
  }

  const providers = providerList(c);
  for (const provider of providers) {
    expect(typeof provider, `provider ${String(provider)} is a string`).toBe(
      "string",
    );
    expect(provider.trim(), "provider key is a non-empty string").not.toBe("");
  }
  expect(
    new Set(providers).size,
    `no duplicate providers in ${JSON.stringify(providers)}`,
  ).toBe(providers.length);

  // documented invariants
  if (!c.ldapEnabled) {
    expect(
      isEmptyText(c.ldapDomain),
      "ldapDomain is empty while ldapEnabled is false",
    ).toBe(true);
  }
  if (!c.oauthEnabled) {
    expect(providers, "providers is empty while oauthEnabled is false").toEqual(
      [],
    );
  }
  if (isEmptyText(c.ssoUrl)) {
    expect(
      isEmptyText(c.ssoLabel),
      "ssoLabel is empty whenever ssoUrl is",
    ).toBe(true);
  } else {
    const url = new URL(c.ssoUrl as string);
    expect(["http:", "https:"]).toContain(url.protocol);
  }
}

/**
 * What must be identical between any two callers of the same portal. The
 * providers list is ordered for the caller's country, so it is compared as a
 * set, never by position.
 */
export function portalWideView(capabilities: CapabilitiesDto) {
  return {
    ldapEnabled: capabilities.ldapEnabled,
    ldapDomain: capabilities.ldapDomain ?? "",
    providers: [...providerList(capabilities)].sort(),
    ssoLabel: capabilities.ssoLabel ?? "",
    oauthEnabled: capabilities.oauthEnabled,
    ssoUrl: capabilities.ssoUrl ?? "",
    identityServerEnabled: capabilities.identityServerEnabled,
  };
}

/** Anonymous read through the SDK, asserting the happy path on the way. */
export async function getCapabilities(
  client: Pick<ReturnType<ApiSDK["forAnonymous"]>, "capabilities">,
): Promise<CapabilitiesDto> {
  const { data, status } = await client.capabilities.getPortalCapabilities();
  expect(status).toBe(200);
  expectCapabilitiesContract(data.response);
  return data.response;
}

export const capabilitiesUrl = (sdk: ApiSDK) =>
  `${sdk.tokenStore.portalBaseUrl}/api/2.0/capabilities`;

export async function rawCapabilities(
  sdk: ApiSDK,
  options: {
    method?: string;
    query?: string;
    headers?: Record<string, string>;
    origin?: boolean;
  } = {},
): Promise<APIResponse> {
  const { method = "GET", query = "", headers = {}, origin = true } = options;
  return sdk.request.fetch(`${capabilitiesUrl(sdk)}${query}`, {
    method,
    headers: {
      ...(origin ? { Origin: `http://${sdk.tokenStore.newTenantDomain}` } : {}),
      ...headers,
    },
  });
}
