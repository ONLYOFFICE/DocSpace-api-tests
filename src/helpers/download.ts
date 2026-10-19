import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

/**
 * Downloads the bytes behind a presigned address as the given role.
 *
 * A plain Node fetch is used on purpose: the shared Playwright request context
 * keeps the owner's session cookie, which beats a Bearer header and would make a
 * member's download run as the owner.
 */
export async function downloadAs(apiSdk: ApiSDK, role: Role, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}` },
  });
  return {
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

/** Requests a presigned download address and returns it as a string. */
export async function getDownloadUrl(
  api: ReturnType<ApiSDK["forRole"]>,
  fileId: number,
): Promise<string> {
  const { data, status } = await api.files.getPresignedUri({ fileId });
  if (status !== 200) {
    throw new Error(`getPresignedUri(${fileId}) answered ${status}`);
  }
  return data.response as unknown as string;
}

/** Downloads a file's current version as the given role. */
export async function downloadFile(apiSdk: ApiSDK, role: Role, fileId: number) {
  const url = await getDownloadUrl(apiSdk.forRole(role), fileId);
  return downloadAs(apiSdk, role, url);
}

/** Reads the JSON payload of a JWT without checking its signature. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
