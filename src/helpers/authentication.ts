import { expect } from "@playwright/test";
import { MessageAction } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { generateTOTPAtCounter } from "../utils/totp";

export type Credentials = { userName: string; password: string };

/** Owner creates a User; returns the id together with the login credentials. */
export async function createUser(apiSdk: ApiSDK, password?: string) {
  const { data, status, userData } = await apiSdk.addMember(
    "owner",
    "User",
    password ? { password } : {},
  );
  expect(status, "setup: owner creates the user").toBe(200);
  return { id: data.response!.id!, ...userData };
}

const AUTH_COOKIE = "asc_auth_key";

function headers(sdk: ApiSDK, extra: Record<string, string> = {}) {
  return { Origin: `http://${sdk.tokenStore.newTenantDomain}`, ...extra };
}

function url(sdk: ApiSDK, path: string) {
  return `${sdk.tokenStore.portalBaseUrl}/api/2.0/${path}`;
}

function setCookieHeaders(response: {
  headersArray(): Array<{ name: string; value: string }>;
}) {
  return response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
}

/**
 * POST /authentication sent through the SDK's request context, so the auth
 * cookie lands in that context's jar and the raw Set-Cookie headers can be
 * inspected. Returns the cookie as a ready-to-send `Cookie` header value.
 */
export async function rawLogin(
  sdk: ApiSDK,
  credentials: Credentials,
  extra: { session?: boolean } = {},
) {
  const response = await sdk.request.post(url(sdk, "authentication"), {
    data: { ...credentials, ...extra },
    headers: headers(sdk, { Cookie: "" }),
  });
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const setCookie = setCookieHeaders(response);
  const authCookie = setCookie
    .map((v) => v.split(";")[0])
    .find((v) => v.startsWith(`${AUTH_COOKIE}=`));
  return {
    status: response.status(),
    body,
    token: body?.response?.token as string | undefined,
    setCookie,
    cookie: authCookie ?? "",
  };
}

/**
 * GET /authentication with explicit credentials. `Cookie` is always sent
 * explicitly (empty by default) so the context's cookie jar never silently
 * authenticates a call that is meant to prove a Bearer token or a cookie alone.
 */
export async function authState(
  sdk: ApiSDK,
  credentials: {
    bearer?: string;
    cookie?: string;
    authorization?: string;
  } = {},
) {
  const extra: Record<string, string> = { Cookie: credentials.cookie ?? "" };
  if (credentials.authorization !== undefined) {
    extra.Authorization = credentials.authorization;
  } else if (credentials.bearer !== undefined) {
    extra.Authorization = `Bearer ${credentials.bearer}`;
  }
  const response = await sdk.request.get(url(sdk, "authentication"), {
    headers: headers(sdk, extra),
  });
  const body = await response.json();
  return {
    status: response.status(),
    authenticated: body.response as boolean | undefined,
  };
}

/** GET /people/@self with explicit credentials - a real protected endpoint. */
export async function getSelfRaw(
  sdk: ApiSDK,
  credentials: { bearer?: string; cookie?: string } = {},
) {
  const extra: Record<string, string> = { Cookie: credentials.cookie ?? "" };
  if (credentials.bearer !== undefined) {
    extra.Authorization = `Bearer ${credentials.bearer}`;
  }
  const response = await sdk.request.get(url(sdk, "people/@self"), {
    headers: headers(sdk, extra),
  });
  let body: any;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return {
    status: response.status(),
    email: body?.response?.email as string | undefined,
  };
}

/** POST /authentication/logout with explicit credentials. */
export async function rawLogout(
  sdk: ApiSDK,
  credentials: { bearer?: string; cookie?: string } = {},
) {
  const extra: Record<string, string> = { Cookie: credentials.cookie ?? "" };
  if (credentials.bearer !== undefined) {
    extra.Authorization = `Bearer ${credentials.bearer}`;
  }
  const response = await sdk.request.post(url(sdk, "authentication/logout"), {
    headers: headers(sdk, extra),
  });
  let body: any;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return {
    status: response.status(),
    body,
    setCookie: setCookieHeaders(response),
  };
}

/**
 * The short invitation/room link (`/s/<id>`) redirects to the confirm page
 * whose query string carries the confirmation key. That redirect is the only
 * way to get a real key without reading an email.
 */
export async function resolveConfirmLink(sdk: ApiSDK, shortLink: string) {
  const response = await sdk.request.get(shortLink, {
    maxRedirects: 0,
    headers: { Cookie: "" },
  });
  expect(response.status()).toBe(302);
  const location = response.headers()["location"];
  expect(location).toBeTruthy();
  const params = new URL(location, sdk.tokenStore.portalBaseUrl).searchParams;
  return {
    key: params.get("key") ?? "",
    uid: params.get("uid") ?? "",
    type: params.get("type") ?? "",
  };
}

/**
 * Ids of Logout (1006) login-history events of one user. The action filter of
 * getLoginEventsByFilter is loose, so the action id is re-checked here.
 */
async function logoutEventIds(apiSdk: ApiSDK, userId: string) {
  const { data, status } = await apiSdk
    .forRole("owner")
    .loginHistory.getLoginEventsByFilter({ action: MessageAction.Logout });
  expect(status).toBe(200);
  return new Set(
    (data.response ?? [])
      .filter((e) => e.actionId === MessageAction.Logout && e.userId === userId)
      .map((e) => e.id),
  );
}

/** Snapshot of the user's Logout events, to be passed to expectNewLogoutEvent. */
export function snapshotLogoutEvents(apiSdk: ApiSDK, userId: string) {
  return logoutEventIds(apiSdk, userId);
}

/** Polls until a Logout event that was not in `baseline` shows up for the user. */
export async function expectNewLogoutEvent(
  apiSdk: ApiSDK,
  userId: string,
  baseline: Set<number | undefined>,
) {
  await expect
    .poll(async () => {
      const ids = await logoutEventIds(apiSdk, userId);
      return [...ids].some((id) => !baseline.has(id));
    })
    .toBe(true);
}

/** TOTP code for the 30-second step `offset` steps away from now. */
export function totpAtOffset(secret: string, offset = 0) {
  return generateTOTPAtCounter(
    secret,
    Math.floor(Date.now() / 1000 / 30) + offset,
  );
}
