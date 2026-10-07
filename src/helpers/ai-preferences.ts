import { AiHttp, AgentRole } from "./ai-http";

// "Deep mode" is the reasoning / extended-thinking switch of section 10. SDK 4.0.0
// added a depth on top of it (the "reasoning level"), so there are now two views
// of one stored setting:
//
//   GET    /ai/preferences/get-reasoning-level[?entityId=] -> bare "off"|"low"|"medium"|"high"|"max"
//   PUT    /ai/preferences/set-reasoning-level  { value, entityId? }
//
// The deep-mode routes below predate it and are still live. Their contract with
// the level routes is measured in preferences.spec.ts, not assumed here.
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
//
// The tool-permission mode lives in the same family (measured 2026-10-05):
//
//   GET    /ai/preferences/get-tool-permission-mode  -> bare JSON string
//   PUT    /ai/preferences/set-tool-permission-mode  { value: "ask"|"auto"|"allow" }
//
// It is also reported as a number by `/ai/config` and `/ai/config/user`
// (ask 0, auto 1, allow 2). There is no clear/is-set route (both 404), so a
// mode cannot be reset — rely on the throwaway portal instead of cleaning up.
// Anything but one of the three strings is a 400, a number included.

export const TOOL_PERMISSION_MODES = [
  { value: "ask", numeric: 0, label: "Ask every time" },
  { value: "auto", numeric: 1, label: "Auto approve" },
  { value: "allow", numeric: 2, label: "Allow without asking" },
] as const;

export type ToolPermissionMode =
  (typeof TOOL_PERMISSION_MODES)[number]["value"];

export class AiPreferences extends AiHttp {
  private scope(entityId?: number | string) {
    return entityId === undefined
      ? ""
      : `?entityId=${encodeURIComponent(String(entityId))}`;
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

  /**
   * `clear-deep-mode` only reads its body: the same id in the query string is a
   * 400 (measured 2026-10-07), so this is the "wrong place" form for tests.
   */
  clearDeepModeByQuery(role: AgentRole, entityId: number | string) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      `/api/2.0/ai/preferences/clear-deep-mode${this.scope(entityId)}`,
    );
  }

  getReasoningLevel(role: AgentRole, entityId?: number | string) {
    return this.call<string>(
      role,
      "get",
      `/api/2.0/ai/preferences/get-reasoning-level${this.scope(entityId)}`,
    );
  }

  /** `body` is wide on purpose: negative tests send a value outside the enum. */
  setReasoningLevel(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/preferences/set-reasoning-level",
      body,
    );
  }

  getToolPermissionMode(role: AgentRole) {
    return this.call<ToolPermissionMode>(
      role,
      "get",
      "/api/2.0/ai/preferences/get-tool-permission-mode",
    );
  }

  /** `body` is wide on purpose: negative tests send the wrong key or type. */
  setToolPermissionMode(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/preferences/set-tool-permission-mode",
      body,
    );
  }
}
