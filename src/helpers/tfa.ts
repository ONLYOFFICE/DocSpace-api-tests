import { generate, createGuardrails } from "otplib";
import { expect } from "@playwright/test";
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
 * TFA-aware login dance, and stores it on the given role.
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
 * Polls until a given MessageAction id shows up in an audit trail / login
 * history query. Confirmed live: writing an event and it becoming visible via
 * getAuditEventsByFilter/getLoginEventsByFilter is eventually consistent, not
 * immediate - a query made right after the triggering action can miss it.
 * Filtering by `action` is also confirmed loose (the server includes other,
 * unrelated recent events alongside matches), so this checks the returned
 * list for the id rather than trusting the filter to have narrowed it down.
 */
export async function expectActionRecorded(
  fetchEvents: () => Promise<{
    status: number;
    data: { response?: Array<{ actionId?: number }> };
  }>,
  actionId: number,
) {
  await expect
    .poll(async () => {
      const { status, data } = await fetchEvents();
      if (status !== 200) return false;
      return data.response?.some((e) => e.actionId === actionId) ?? false;
    })
    .toBe(true);
}
