import { CommonSettingsApi } from "@onlyoffice/docspace-api-sdk";

// The portal AI switch is still PUT /api/2.0/settings/ai-access — verified
// against a live portal on 2026-07-31. Turning it off flips
// `GET /ai/config` -> aiReady/webSearchEnabled/vectorizationEnabled to false
// and makes the AI routes answer 403.
//
// Setup that is never checked is setup that can silently stop working, so
// switching the flag always reads it back: a test that asserts 403 after a
// failed disable call is a false positive.

type AiAccessClient = {
  commonSettings: Pick<
    CommonSettingsApi,
    "getTenantAiAccessSettings" | "setTenantAiAccessSettings"
  >;
};

export type AiAccessResult = {
  /** Status of the PUT that flipped the switch. */
  writeStatus: number;
  /** Status of the GET that read the switch back. */
  readStatus: number;
  /** Value the portal actually stored. */
  enabled?: boolean;
};

export async function setPortalAiAccess(
  api: AiAccessClient,
  enabled: boolean,
): Promise<AiAccessResult> {
  const { status: writeStatus } =
    await api.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled },
    });

  const { status: readStatus, data } =
    await api.commonSettings.getTenantAiAccessSettings();

  return { writeStatus, readStatus, enabled: data.response?.enabled };
}
