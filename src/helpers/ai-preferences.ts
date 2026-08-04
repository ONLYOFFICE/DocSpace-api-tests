import { AiHttp, AgentRole } from "./ai-http";

// "Deep mode" is the reasoning / extended-thinking switch of section 10, and it
// is the only reasoning-related surface the API exposes — verified live
// 2026-08-04.
//
//   GET    /ai/preferences/get-deep-mode[?entityId=]     -> bare true/false
//   GET    /ai/preferences/is-deep-mode-set[?entityId=]  -> bare true/false
//   PUT    /ai/preferences/set-deep-mode   { value, entityId? }
//   DELETE /ai/preferences/clear-deep-mode { entityId? }
//
// The state is per user *and* per entity: the portal-wide value (no entityId) and
// an agent's value are stored separately and neither one shadows the other, and a
// second user reads their own default rather than the owner's value.
//
// Two shapes bite here:
//   * `clear-deep-mode` needs `{ entityId }`. A bare entityId string answers
//     200 `{success:true}` and clears nothing — a test that only asserts the
//     status passes while the value is still set.
//   * `get-deep-mode` returns a bare JSON boolean, not an envelope, so `data`
//     is `false` on a real "off" and `undefined` on a refusal. Assert the status
//     first, then the value.

export class AiPreferences extends AiHttp {
  private scope(entityId?: number | string) {
    return entityId === undefined ? "" : `?entityId=${entityId}`;
  }

  getDeepMode(role: AgentRole, entityId?: number | string) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/preferences/get-deep-mode${this.scope(entityId)}`,
    );
  }

  isDeepModeSet(role: AgentRole, entityId?: number | string) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/preferences/is-deep-mode-set${this.scope(entityId)}`,
    );
  }

  setDeepMode(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/preferences/set-deep-mode",
      body,
    );
  }

  clearDeepMode(role: AgentRole, body: unknown) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      "/api/2.0/ai/preferences/clear-deep-mode",
      body,
    );
  }
}
