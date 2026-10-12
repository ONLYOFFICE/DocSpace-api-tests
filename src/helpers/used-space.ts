import { expect } from "@playwright/test";
import { ApiSDK } from "../services/api-sdk";

type RoleApi = ReturnType<ApiSDK["forRole"]>;

/**
 * Total size of every file under My Documents, subfolders included — the
 * storage area `myDocumentsUsedSpace` reports on.
 */
async function sizeOfMyDocuments(api: RoleApi) {
  const { data: my } = await api.folders.getMyFolder({});
  const pending = [my.response!.current!.id!];
  let total = 0;
  let files = 0;
  while (pending.length > 0) {
    const folderId = pending.pop()!;
    const { data, status } = await api.folders.getFolderByFolderId({
      folderId,
    });
    expect(status, `listing folder ${folderId}`).toBe(200);
    for (const file of (data.response?.files ?? []) as unknown as {
      pureContentLength?: number;
    }[]) {
      total += file.pureContentLength ?? 0;
      files += 1;
    }
    for (const folder of (data.response?.folders ?? []) as unknown as {
      id: number;
    }[]) {
      pending.push(folder.id);
    }
  }
  return { total, files };
}

/**
 * Waits until `myDocumentsUsedSpace` equals the size of the files actually in
 * My Documents.
 *
 * The counter trails the file list: on a fresh portal it can miss a sample
 * document for up to a second or two (measured), or longer under load. Two
 * equal reads in a row prove nothing — a stale counter repeats itself — so the
 * baseline is only taken once the counter agrees with an independent figure.
 * If it never does, this throws with both numbers rather than measuring from a
 * baseline that is known to be wrong.
 */
export async function waitForUsedSpaceToMatchFiles(
  api: RoleApi,
  timeoutMs = 30_000,
) {
  const seen: string[] = [];
  await expect(async () => {
    const { data, status } = await api.folders.getFilesUsedSpace();
    expect(status).toBe(200);
    const used = data.response?.myDocumentsUsedSpace?.usedSpace;
    const { total, files } = await sizeOfMyDocuments(api);
    seen.push(`counter=${used} files(${files})=${total}`);
    expect(
      used,
      `usedSpace never matched the files in My Documents; polls: ${seen.join(" | ")}`,
    ).toBe(total);
  }).toPass({ intervals: [500, 1_000, 2_000], timeout: timeoutMs });
}
