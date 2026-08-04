import { AiHttp, AgentRole } from "./ai-http";
import { AiProfile } from "./ai-agent-chat";

// The AI profile catalogue and the per-action model assignments — verified
// against a live portal on 2026-08-04.
//
//   GET    /ai/profiles/list                                 AiProfile[]
//   GET    /ai/profiles/get-by-id?id=                        AiProfile | null
//   GET    /ai/profiles/list-models?profileId=                (500 — BUG 82790)
//   POST   /ai/profiles/list-provider-models { providerType, baseUrl, apiKey }
//   POST   /ai/profiles/test-connection      bare profileId string
//   POST   /ai/profiles/create               AiCreateProfileInput
//   PUT    /ai/profiles/update               AiProfile
//   DELETE /ai/profiles/delete               bare profileId string
//
//   GET    /ai/assignments/get-all-assignments[?entityId=]   actionType -> profileId
//   GET    /ai/assignments/get-assignment?actionType=        bare profileId string | null
//   GET    /ai/assignments/resolve-for-action?actionType=[&entityId=]
//   GET    /ai/assignments/try-resolve-for-action?actionType=[&entityId=]
//   PUT    /ai/assignments/assign            { actionType, profileId }
//   PUT    /ai/assignments/bulk-assign       flat { [actionType]: profileId } map
//   DELETE /ai/assignments/unassign          { actionType }
//   DELETE /ai/assignments/cascade-profile-delete { profileId }
//
// Three things about this surface break the usual assertion habits:
//
//   * The portal runs the built-in "ONLYOFFICE AI" gateway, and its catalogue is
//     read-only: create/update/delete answer 403 for the Owner. An *unknown*
//     providerType is caught before that gate and comes back as HTTP 200 with
//     `{success:false, error:{field:"name", ...}}` — so the soft-error shape is
//     what proves validation ran, and 403 is what proves the gate exists.
//   * Business failures are HTTP 200 with `success:false` almost everywhere
//     (capability mismatch, profile not found). Only missing/malformed *plumbing*
//     (no actionType, a non-GUID id) is a real 400. Asserting the status alone
//     passes on a refused assignment.
//   * `get-by-id` answers 200 with a `null` body for a well-formed unknown GUID
//     instead of 404, exactly like threads/get-by-id (BUG 82718).
//
// Capability bitmask, decoded from the live catalogue: 1 = text, 2 = image
// generation, 128 = vision, 256 = tools. Text+vision+tools profiles read 385,
// text+tools ones 257, image-only ones 2. Tests pick a profile by capability
// rather than by model name so a catalogue refresh does not break them.

export const AI_CAPS = {
  /** text + vision + tools — e.g. gpt-5.6-sol, claude-sonnet-5 */
  textVisionTools: 385,
  /** text + tools, no vision — e.g. deepseek-v4-pro, glm-5.2 */
  textTools: 257,
  /** image generation only — e.g. gpt-5.4-image-2 */
  imageOnly: 2,
} as const;

/** Every action type the assignment API accepts. */
export const AI_ACTION_TYPES = [
  "Default",
  "Chat",
  "Code",
  "Summarization",
  "Translation",
  "TextAnalyze",
  "ImageGeneration",
  "OCR",
  "Vision",
] as const;

export type AiActionType = (typeof AI_ACTION_TYPES)[number];

/** The `{success:false, error:{field, message}}` envelope this surface uses. */
export type AiSoftResult = {
  success?: boolean;
  error?: { field?: string; message?: string };
};

export type AiBulkResult = AiSoftResult & {
  errors?: Array<{ actionType?: string; error?: { message?: string } }>;
};

export type AiResolvedAssignment = {
  profileId?: string;
  profile?: AiProfile;
};

/** `{field, message}` — note this one is NOT wrapped in `success`. */
export type AiConnectionResult = {
  field?: string;
  message?: string;
};

export type AiProviderModel = {
  id?: string;
  name?: string;
  provider?: string;
  reasoning?: boolean;
  capabilities?: number;
};

export class AiProfiles extends AiHttp {
  // ---------------------------------------------------------------- catalogue

  listProfiles(role: AgentRole) {
    return this.call<AiProfile[]>(role, "get", "/api/2.0/ai/profiles/list");
  }

  getProfileById(role: AgentRole, id: string) {
    return this.call<AiProfile | null>(
      role,
      "get",
      `/api/2.0/ai/profiles/get-by-id?id=${encodeURIComponent(id)}`,
    );
  }

  listModels(role: AgentRole, profileId: string) {
    return this.call<unknown>(
      role,
      "get",
      `/api/2.0/ai/profiles/list-models?profileId=${encodeURIComponent(profileId)}`,
    );
  }

  /**
   * The only route on this surface that really reaches out to the provider: it
   * validates the key against the upstream API and returns its model catalogue.
   * That makes it both the key-validation endpoint of section 4.2 and a live
   * egress surface — see profiles.permission.spec.ts for who can reach it.
   */
  listProviderModels(
    role: AgentRole,
    body: { providerType?: string; baseUrl?: string; apiKey?: string },
  ) {
    return this.call<AiProviderModel[]>(
      role,
      "post",
      "/api/2.0/ai/profiles/list-provider-models",
      body,
    );
  }

  testConnection(role: AgentRole, profileId: unknown) {
    return this.call<AiConnectionResult>(
      role,
      "post",
      "/api/2.0/ai/profiles/test-connection",
      profileId,
    );
  }

  createProfile(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiSoftResult & { profile?: AiProfile }>(
      role,
      "post",
      "/api/2.0/ai/profiles/create",
      body,
    );
  }

  updateProfile(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiSoftResult & { profile?: AiProfile }>(
      role,
      "put",
      "/api/2.0/ai/profiles/update",
      body,
    );
  }

  deleteProfile(role: AgentRole, profileId: unknown) {
    return this.call<AiSoftResult>(
      role,
      "delete",
      "/api/2.0/ai/profiles/delete",
      profileId,
    );
  }

  // -------------------------------------------------------------- assignments

  getAllAssignments(role: AgentRole, entityId?: number | string) {
    const query = entityId === undefined ? "" : `?entityId=${entityId}`;
    return this.call<Record<string, string>>(
      role,
      "get",
      `/api/2.0/ai/assignments/get-all-assignments${query}`,
    );
  }

  getAssignment(role: AgentRole, actionType: string) {
    return this.call<string | null>(
      role,
      "get",
      `/api/2.0/ai/assignments/get-assignment?actionType=${encodeURIComponent(actionType)}`,
    );
  }

  resolveForAction(
    role: AgentRole,
    actionType: string,
    entityId?: number | string,
  ) {
    const scope = entityId === undefined ? "" : `&entityId=${entityId}`;
    return this.call<AiResolvedAssignment>(
      role,
      "get",
      `/api/2.0/ai/assignments/resolve-for-action?actionType=${encodeURIComponent(actionType)}${scope}`,
    );
  }

  tryResolveForAction(
    role: AgentRole,
    actionType: string,
    entityId?: number | string,
  ) {
    const scope = entityId === undefined ? "" : `&entityId=${entityId}`;
    return this.call<AiResolvedAssignment>(
      role,
      "get",
      `/api/2.0/ai/assignments/try-resolve-for-action?actionType=${encodeURIComponent(actionType)}${scope}`,
    );
  }

  assign(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiSoftResult>(
      role,
      "put",
      "/api/2.0/ai/assignments/assign",
      body,
    );
  }

  /**
   * The body is the flat `{ [actionType]: profileId }` map itself — the SDK's
   * `requestBody` is the generator's parameter name, not a JSON property.
   *
   * Keys are matched against the ActionType enum case-sensitively and anything
   * that does not match is dropped in silence, so a `success:true` does not mean
   * the whole payload was understood.
   */
  bulkAssign(role: AgentRole, assignments: Record<string, unknown>) {
    return this.call<AiBulkResult>(
      role,
      "put",
      "/api/2.0/ai/assignments/bulk-assign",
      assignments,
    );
  }

  unassign(role: AgentRole, body: unknown) {
    return this.call<AiSoftResult>(
      role,
      "delete",
      "/api/2.0/ai/assignments/unassign",
      body,
    );
  }

  cascadeProfileDelete(role: AgentRole, body: unknown) {
    return this.call<AiSoftResult>(
      role,
      "delete",
      "/api/2.0/ai/assignments/cascade-profile-delete",
      body,
    );
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Setup-only. Throws unless a real catalogue came back, so a test that needs a
   * profile fails on its setup line instead of carrying an empty array into its
   * assertions.
   */
  async catalogue(role: AgentRole = "owner"): Promise<AiProfile[]> {
    const { status, data, error } = await this.listProfiles(role);
    if (status !== 200 || !Array.isArray(data) || data.length === 0) {
      throw new Error(
        `GET /ai/profiles/list failed: ${status} ${error ?? "(empty catalogue)"}`,
      );
    }
    return data;
  }

  /**
   * Picks one profile per capability class. Throws when the catalogue no longer
   * offers one, because silently skipping the case would turn a shrunken
   * catalogue into a green run.
   */
  static byCapabilities(
    profiles: AiProfile[],
    capabilities: number,
  ): AiProfile {
    const match = profiles.find(
      (profile) => profile.capabilities === capabilities,
    );
    if (!match) {
      throw new Error(
        `No profile with capabilities ${capabilities} in the catalogue: ` +
          profiles.map((p) => `${p.modelId}:${p.capabilities}`).join(", "),
      );
    }
    return match;
  }
}
