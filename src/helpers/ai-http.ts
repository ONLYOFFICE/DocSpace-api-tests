import { APIRequestContext } from "@playwright/test";
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
  ): Promise<{ status: number; data: T | undefined; error?: string }> {
    const response = await this.request[method](
      `${this.tokenStore.portalBaseUrl}${path}`,
      {
        headers: this.headers(role),
        ...(body === undefined ? {} : { data: body }),
        timeout: 120000,
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

    return { status: response.status(), data: parsed as T | undefined, error };
  }
}
