import { expect } from "@playwright/test";
import type {
  ApiKeyResponseDto,
  CreateApiKeyRequestDto,
} from "@onlyoffice/docspace-api-sdk";
import type { ApiKeysApi } from "@onlyoffice/docspace-api-sdk/dist/api/api-keys/api-keys-api";

// Anything that exposes an `apiKeys` client: forRole(...), forApiKey(...).
type ApiKeysClient = { apiKeys: ApiKeysApi };

// POST /keys is throttled to 5 calls per user (rejected calls count too), so
// every test below keeps its number of createApiKey calls within that budget.
export async function createKey(
  api: ApiKeysClient,
  body: CreateApiKeyRequestDto,
): Promise<ApiKeyResponseDto> {
  const { data, status } = await api.apiKeys.createApiKey({
    createApiKeyRequestDto: body,
  });
  expect(status, "createApiKey (setup)").toBe(200);
  return data.response!;
}

export async function listKeys(
  api: ApiKeysClient,
): Promise<ApiKeyResponseDto[]> {
  const { data, status } = await api.apiKeys.getApiKeys();
  expect(status, "getApiKeys").toBe(200);
  return data.response!;
}

export async function findKey(
  api: ApiKeysClient,
  keyId: string,
): Promise<ApiKeyResponseDto | undefined> {
  return (await listKeys(api)).find((k) => k.id === keyId);
}

// The API returns ISO-8601 strings on the wire although the SDK types these
// fields as ApiDateTime; accept both shapes.
export function toTime(value: unknown): number {
  const raw =
    typeof value === "string"
      ? value
      : (value as { utcTime?: string } | undefined)?.utcTime;
  const time = Date.parse(raw ?? "");
  expect(Number.isNaN(time), `unparsable date: ${JSON.stringify(value)}`).toBe(
    false,
  );
  return time;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
// Clock skew + request latency tolerance for "now"-relative date checks.
export const DATE_TOLERANCE_MS = 5 * 60 * 1000;

export function expectNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(DATE_TOLERANCE_MS);
}
