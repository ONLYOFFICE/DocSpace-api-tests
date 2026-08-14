import { generate, createGuardrails } from "otplib";
import { Page } from "@playwright/test";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

// DocSpace issues an 80-bit (10-byte) TFA secret, shorter than otplib's
// default 128-bit minimum — relax the guardrail to match.
const tfaGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

/** Computes a valid TOTP code for a DocSpace TFA app secret via otplib. */
export function totpCode(secret: string): Promise<string> {
  return generate({ secret, guardrails: tfaGuardrails });
}

/**
 * Enables the TFA App requirement on the portal. This immediately invalidates
 * the caller's current session token — any further authenticated call with it
 * returns 401 until the account completes the TFA login flow (see linkTfaApp).
 */
export async function enableTfaApp(apiSdk: ApiSDK, role: Role) {
  const { status } = await apiSdk.forRole(role).tfaSettings.updateTfaSettings({
    tfaRequestsDto: { type: TfaRequestsDtoType.App },
  });
  if (status !== 200) {
    throw new Error(`enableTfaApp: updateTfaSettings failed with ${status}`);
  }
}

/**
 * Exchanges a TOTP code for a real token via the second half of the
 * TFA-aware login dance, and stores it on the given role. Shared by
 * linkTfaApp (first-time link, code comes from a fresh login's tfaKey) and
 * refreshTfaSessionToken (re-authenticating an already-linked account, code
 * comes from its already-known secret).
 */
async function exchangeTfaCodeForToken(
  apiSdk: ApiSDK,
  role: Role,
  credentials: { userName: string; password: string },
  code: string,
): Promise<string> {
  const { data, status } = await apiSdk
    .forRole(role)
    .authentication.authenticateMeFromBodyWithCode({
      code,
      authWithCodeRequestsDto: { ...credentials, code, session: true },
    });
  const token = data.response?.token;
  if (status !== 200 || !token) {
    throw new Error(
      `exchangeTfaCodeForToken: authenticateMeFromBodyWithCode failed with ${status}`,
    );
  }
  apiSdk.tokenStore.setToken(role, token);
  return token;
}

/**
 * Links TFA App to the given role's account by completing the TFA-aware login
 * flow: once TFA App is mandatory (see enableTfaApp — must already be enabled,
 * by an owner/admin, before calling this), a normal login no longer returns a
 * token — it returns a `tfaKey` (the app secret) instead, since the account
 * has no app linked yet. Submitting a second login with a TOTP code computed
 * from that secret both confirms the link and returns a real token, which
 * replaces the role's stored token in the SDK. Returns the secret so callers
 * can generate further valid codes (e.g. for the backup-codes flow).
 *
 * For "owner" this also enables TFA App first, since owner is normally the
 * one turning the policy on for the whole portal before anyone can link.
 */
export async function linkTfaApp(
  apiSdk: ApiSDK,
  role: Role,
  credentials: { userName: string; password: string } = {
    userName: config.DOCSPACE_OWNER_EMAIL,
    password: config.DOCSPACE_OWNER_PASSWORD,
  },
): Promise<string> {
  if (role === "owner") {
    // Best-effort: if TFA App is already enabled and owner's token is stale
    // (e.g. a previous enable already invalidated it), this 401s - fine, the
    // login below authenticates via credentials in the body, not this token.
    await enableTfaApp(apiSdk, role).catch(() => {});
  }

  const { data: login, status: loginStatus } = await apiSdk
    .forRole(role)
    .authentication.authenticateMe({
      authRequestsDto: { ...credentials, session: true },
    });
  const secret = login.response?.tfaKey;
  if (loginStatus !== 200 || !secret) {
    throw new Error(`linkTfaApp: authenticateMe failed with ${loginStatus}`);
  }

  const code = await totpCode(secret);
  await exchangeTfaCodeForToken(apiSdk, role, credentials, code);

  return secret;
}

/**
 * Refreshes a role's stored token after linking TFA through a real browser
 * flow (see followTfaConfirmLink) rather than linkTfaApp's own API-only
 * dance. Browser-completing a link leaves the stored Bearer token stale
 * (same as any TFA-enabling action) - without this, the fixture's own
 * teardown login can't authenticate and the portal is orphaned.
 */
export async function refreshTfaSessionToken(
  apiSdk: ApiSDK,
  role: Role,
  credentials: { userName: string; password: string },
  secret: string,
): Promise<void> {
  const code = await totpCode(secret);
  await exchangeTfaCodeForToken(apiSdk, role, credentials, code);
}

/**
 * Disables TFA App as owner, for use in test.afterEach so the fixture's own
 * owner-password re-login (which cleans up the portal) can succeed. If the
 * test left TFA enabled without ever completing the login flow, owner's
 * token is stale and this first attempt 401s - fall back to completing the
 * TFA login (linkTfaApp) to get a working token, then disable again.
 * Best-effort throughout: if the fallback also fails, the portal stays
 * orphaned, same as before this helper existed.
 */
export async function resetTfaAfterTest(apiSdk: ApiSDK) {
  const disable = () =>
    apiSdk.forRole("owner").tfaSettings.updateTfaSettings({
      tfaRequestsDto: { type: TfaRequestsDtoType.None },
    });

  const { status } = await disable().catch(() => ({ status: 0 }));
  if (status === 200) return;

  await linkTfaApp(apiSdk, "owner")
    .then(disable)
    .catch(() => {});
}

/**
 * Parses a raw `Set-Cookie` response header into a {name, value} pair, e.g.
 * for the httpOnly confirmation-key cookie DocSpace's confirm-link endpoints
 * (updateTfaSettingsLink) return alongside a URL that's meaningless without
 * it. Only the first cookie in the header is used - these endpoints only
 * ever set the one.
 */
export function parseSetCookieHeader(raw: string | string[]): {
  name: string;
  value: string;
} {
  const header = Array.isArray(raw) ? raw[0] : raw;
  const [name, value] = header.split(";")[0].split("=");
  return { name, value };
}

/**
 * Puts a DocSpace confirm-link cookie onto the given page's browser context.
 * Confirm links (from updateTfaSettingsLink, getTfaConfirmData, etc.) rely on
 * an httpOnly cookie delivered alongside the URL - a real browser session
 * that made the request would already have it, but our Bearer-token API
 * client doesn't share cookies with `page`, so it has to be transplanted
 * manually before navigating.
 */
export async function addTfaConfirmCookie(
  page: Page,
  portalDomain: string,
  cookie: { name: string; value: string },
) {
  await page.context().addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: portalDomain,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

/**
 * Scrapes the TFA app secret DocSpace displays in plaintext on a
 * TfaActivation confirm page ("...manually enter the given secret key into
 * your app: XXXX"), for accounts not yet linked. Throws if the page doesn't
 * show one - e.g. a TfaAuth confirm page for an already-linked account only
 * asks for a code, it doesn't display the secret again.
 */
export async function extractTfaSetupSecret(page: Page): Promise<string> {
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/secret key into your app:\s*([A-Z0-9]+)/i);
  if (!match) {
    throw new Error(
      "extractTfaSetupSecret: no secret key found on the confirm page",
    );
  }
  return match[1];
}

/**
 * Fills and submits a TFA confirm page's code field, then waits for
 * navigation away from the confirm URL as proof it was accepted. The submit
 * button's testid differs by confirm type - e.g. "app_connect_button" for
 * TfaActivation (first-time link), "app_code_continue_button" for TfaAuth
 * (re-verifying an already-linked account).
 */
export async function submitTfaConfirmCode(
  page: Page,
  code: string,
  submitButtonTestId: string,
) {
  await page.getByTestId("app_code_input").fill(code);
  await page.getByTestId(submitButtonTestId).click();
  await page.waitForURL((url) => !url.pathname.includes("/confirm/"));
}
