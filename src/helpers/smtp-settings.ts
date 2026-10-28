import { expect } from "@playwright/test";
import config from "@/config";
import { ApiSDK } from "@/src/services/api-sdk";
import type { SmtpOperationStatusDto } from "@onlyoffice/docspace-api-sdk";

type SmtpOperationResponse = SmtpOperationStatusDto | undefined;

export const smtpSettingsDto = {
  host: config.QA_MAIL_DOMAIN,
  port: 587,
  senderAddress: config.QA_MAIL_LOGIN,
  senderDisplayName: "DocSpace Autotest",
  credentialsUserName: config.QA_MAIL_LOGIN,
  credentialsUserPassword: config.QA_MAIL_PASSWORD,
  enableSSL: true,
  enableAuth: true,
  useNtlm: false,
  isDefaultSettings: false,
};

type RoleApi = ReturnType<ApiSDK["forRole"]>;

/**
 * Waits for the SMTP test job and returns the answer that reported it finished.
 *
 * The first answer with `completed: true` also discards the job, and every
 * later poll comes back 200 with no `response` at all. So the finished answer —
 * the only one that carries the SMTP `error` — must be captured the moment it
 * arrives; re-polling after reading it loses it and leaves nothing but
 * `completed: undefined`. Every answer seen so far goes into the failure
 * message, so an unreachable relay shows up as its own `error` text.
 */
export async function waitForSmtpOperation(
  api: RoleApi,
  timeoutMs = 30_000,
): Promise<NonNullable<SmtpOperationResponse>> {
  const seen: unknown[] = [];
  let finished: SmtpOperationResponse;

  await expect(async () => {
    const { data, status } = await api.smtpSettings.getSmtpOperationStatus();
    seen.push({ status, response: data.response ?? null });

    expect(status, `status polls so far: ${JSON.stringify(seen)}`).toBe(200);
    expect(
      data.response?.completed,
      `status polls so far: ${JSON.stringify(seen)}`,
    ).toBe(true);
    finished = data.response;
  }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: timeoutMs });

  return finished!;
}
