import { APIRequestContext, APIResponse } from "@playwright/test";

import config from "../../config";

/**
 * Helpers for the apisystem portal-registration smoke tests.
 *
 * Deliberately independent of `Apisystem.createPortal()` and of the `api`
 * fixture: the fixture registers a portal for every test and silently retries
 * the registration call, which is exactly what a registration test must not do.
 */

const TEST_ENV_DOMAIN = "onlyoffice.io";

export interface RegisteredPortal {
  portalName: string;
  domain: string;
  ownerId: string;
  body: Record<string, unknown>;
}

/** Thrown when the registration request may have created a portal but the answer was lost. */
export class RegistrationOutcomeUnknownError extends Error {
  constructor(
    public readonly portalName: string,
    cause: unknown,
  ) {
    super(
      `Registration outcome is UNDETERMINED for portal name "${portalName}": ` +
        `the request failed before a response arrived (${String(cause)}). ` +
        `The portal may exist; it was NOT retried. Check apisystem for "${portalName}" and delete it manually.`,
    );
  }
}

export function uniquePortalName(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${random}-${stamp}`;
}

/**
 * The tests must run only against the test environment the rest of the suite
 * uses (`*.onlyoffice.io`). A different registration host is refused so a
 * mis-set PORTAL_REGISTRATION_URL cannot create portals anywhere else.
 */
export function assertTestEnvironment(): void {
  const host = new URL(config.PORTAL_REGISTRATION_URL).hostname;
  if (host !== TEST_ENV_DOMAIN) {
    throw new Error(
      `Refusing to register portals on "${host}": apisystem tests only run against ${TEST_ENV_DOMAIN}`,
    );
  }
}

export function registrationUrl(endpoint: string): string {
  return `${config.PORTAL_REGISTRATION_URL.replace(/\/$/, "")}/${endpoint}`;
}

/** One registration attempt. Never retried: a lost answer is reported, not repeated. */
export async function registerOnce(
  context: APIRequestContext,
  endpoint: string,
  portalName: string,
  data: Record<string, unknown>,
): Promise<APIResponse> {
  try {
    return await context.post(registrationUrl(endpoint), { data });
  } catch (error) {
    throw new RegistrationOutcomeUnknownError(portalName, error);
  }
}

export async function ownerLogin(
  context: APIRequestContext,
  portal: Pick<RegisteredPortal, "domain" | "portalName">,
  userName: string,
  password: string,
): Promise<{ status: number; token?: string }> {
  const response = await context.post(
    `https://${portal.domain}/api/2.0/authentication`,
    {
      data: { userName, password },
      headers: { Origin: `http://${portal.portalName}` },
    },
  );
  const body = await response.json().catch(() => ({}));
  return { status: response.status(), token: body?.response?.token };
}

export async function getSelf(
  context: APIRequestContext,
  domain: string,
  token: string,
) {
  const response = await context.get(`https://${domain}/api/2.0/people/@self`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status(), profile: body?.response };
}

export async function deleteRegisteredPortal(
  context: APIRequestContext,
  portal: Pick<RegisteredPortal, "domain" | "portalName">,
  token: string,
): Promise<number> {
  const response = await context.delete(
    `https://${portal.domain}/api/2.0/portal/deleteportalimmediately`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: `http://${portal.portalName}`,
      },
      data: { reference: `${portal.portalName}.${TEST_ENV_DOMAIN}` },
      timeout: 120000,
    },
  );
  return response.status();
}

/**
 * Best-effort removal of a portal the test registered. Never throws: it returns
 * the problem so the caller can report it without replacing the test's own error.
 */
export async function cleanupRegisteredPortal(
  context: APIRequestContext,
  portal: Pick<RegisteredPortal, "domain" | "portalName"> | undefined,
  knownToken: string | undefined,
  owner: { email: string; password: string },
): Promise<Error | undefined> {
  if (!portal) return undefined;
  try {
    // Re-login only if the test never obtained an owner token.
    const token =
      knownToken ??
      (await ownerLogin(context, portal, owner.email, owner.password)).token;
    if (!token) throw new Error("owner token unavailable for cleanup");
    const status = await deleteRegisteredPortal(context, portal, token);
    if (status !== 200) throw new Error(`delete returned ${status}`);
    return undefined;
  } catch (error) {
    return new Error(
      `Portal cleanup failed for ${portal.domain} (${portal.portalName}) — portal may be orphaned. Reason: ${error}`,
    );
  }
}
