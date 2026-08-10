import { APIRequestContext, expect } from "@playwright/test";
import { TokenStore, Role } from "../services/token-store";

// Shared plumbing for the rewritten AI stack. The SDK clients for these areas
// point at routes the portal removed, so the live surface is driven with raw
// requests. Errors come back as `{"error":"..."}` — there is no `statusCode`
// field and no `error.message`, unlike the old envelopes.
//
// Caveat that bites every caller: `apiSdk.request` is one shared context and
// its session cookie beats the bearer token. Do all owner-side setup before
// authenticating a member, and call `apiSdk.authenticateOwner()` before
// verifying state as the owner afterwards.

export type AgentRole = Role | "anonymous";

export type Envelope<T> = {
  response?: T;
  count?: number;
  statusCode?: number;
};

export class AiHttp {
  constructor(
    protected readonly request: APIRequestContext,
    protected readonly tokenStore: TokenStore,
  ) {}

  protected headers(role: AgentRole) {
    const headers: Record<string, string> = {
      Origin: `http://${this.tokenStore.newTenantDomain}`,
      "Content-Type": "application/json",
    };
    if (role !== "anonymous") {
      headers.Authorization = `Bearer ${this.tokenStore.getToken(role)}`;
    }
    return headers;
  }

  protected async call<T>(
    role: AgentRole,
    method: "get" | "post" | "put" | "delete",
    path: string,
    body?: unknown,
    options?: {
      /**
       * Client-side cap on the request. Only worth setting for the streaming
       * routes: a stream that never finishes (see the `generate_image` hang in
       * the image-generation block of chat/chat.spec.ts) would otherwise burn the
       * default two minutes before the test can look at what was persisted.
       */
      timeoutMs?: number;
    },
  ): Promise<{
    status: number;
    data: T | undefined;
    error?: string;
    /** Raw body — the only way to see inside a streamed (non-JSON) response. */
    text: string;
  }> {
    const response = await this.request[method](
      `${this.tokenStore.portalBaseUrl}${path}`,
      {
        headers: this.headers(role),
        ...(body === undefined ? {} : { data: body }),
        timeout: options?.timeoutMs ?? 120000,
      },
    );

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }

    const error =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : undefined;

    return {
      status: response.status(),
      data: parsed as T | undefined,
      error,
      text,
    };
  }

  /**
   * Asserts which user a role's requests are actually acting as.
   *
   * `apiSdk.request` is one shared context whose session cookie beats the bearer
   * token, so a missed `authenticateOwner()` silently sends a "member reads the
   * owner's data" call as the owner — which would turn a leak test green. Any
   * test whose conclusion depends on *who* made the call should pin it with this
   * first.
   */
  async whoAmI(role: AgentRole): Promise<string> {
    const { status, data } = await this.call<{
      response?: { id?: string };
    }>(role, "get", "/api/2.0/people/@self");
    expect(status, `GET /people/@self as ${role}`).toBe(200);
    const id = data?.response?.id;
    expect(id, `GET /people/@self as ${role} returned no id`).toBeTruthy();
    return id as string;
  }

  async expectActingAs(role: AgentRole, userId: string, label: string = role) {
    expect(
      await this.whoAmI(role),
      `the request context is acting as ${label}`,
    ).toBe(userId);
  }

  async expectNotActingAs(role: AgentRole, userId: string, label: string) {
    expect(
      await this.whoAmI(role),
      `the request context must not be acting as ${label}`,
    ).not.toBe(userId);
  }
}
