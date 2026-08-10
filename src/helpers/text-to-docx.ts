import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";
import { extractDocxText } from "./docx";

// `POST /api/2.0/ai/text-to-docx` answers 202 and builds the document in the
// background, so every assertion about it needs the target folder polled. The
// helpers below keep that polling — and the typing of a folder listing, which
// the SDK hands back as `FileEntryBaseDto` without the file fields — out of the
// tests.

type RoleApi = ReturnType<ApiSDK["forRole"]>;

export type FolderFile = {
  id: number;
  title: string;
  fileExst?: string;
  pureContentLength?: number;
};

/** Longest observed delay between the 202 and the file appearing: ~10 s. */
export const EXPORT_SETTLE_MS = 20000;

/**
 * Files of a folder, and it throws unless the listing really succeeded.
 *
 * That matters more than it looks: the SDK never throws on an HTTP error, so a
 * 403 or 404 would otherwise arrive as `response: undefined` and be flattened
 * into an empty array — which is exactly the shape a passing "no document was
 * created" assertion expects. A read that failed must never be able to look
 * like an empty folder.
 */
export async function listFolderFiles(
  api: RoleApi,
  folderId: number,
): Promise<FolderFile[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  if (status !== 200 || !data.response) {
    throw new Error(
      `could not list folder ${folderId}: ${status} — the caller cannot read it, so nothing can be concluded about its contents`,
    );
  }
  return (data.response.files ?? []) as unknown as FolderFile[];
}

/**
 * The title the portal's own Files API gives a file created with `title`.
 *
 * Used as the oracle for what a normalised file name should look like: the
 * export derives a file name from its `title` too, so hard-coding whatever it
 * currently produces would freeze a defect as the contract.
 */
export async function filesApiTitleFor(
  api: RoleApi,
  folderId: number,
  title: string,
): Promise<string> {
  const { data, status } = await api.files.createFile({
    folderId,
    createFileJsonElement: { title },
  });
  if (status !== 200 || !data.response?.title) {
    throw new Error(
      `the Files API refused the control title ${JSON.stringify(title)}: ${status}`,
    );
  }
  return data.response.title;
}

/**
 * Baseline for "one file appeared" / "nothing appeared" assertions.
 *
 * A freshly created portal — and a freshly created member — keeps filling My
 * Documents with the sample documents in the background, so a listing taken
 * straight away grows on its own and makes any count or id-set comparison
 * against it wrong. Reads until two consecutive listings hold the same files.
 */
export async function waitForStableFolderFiles(
  api: RoleApi,
  folderId: number,
  timeoutMs = EXPORT_SETTLE_MS,
): Promise<FolderFile[]> {
  const ids = (files: FolderFile[]) =>
    files
      .map((file) => file.id)
      .sort()
      .join(",");

  const deadline = Date.now() + timeoutMs;
  let previous = await listFolderFiles(api, folderId);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const current = await listFolderFiles(api, folderId);
    if (ids(current) === ids(previous) || Date.now() > deadline) return current;
    previous = current;
  }
}

/**
 * Waits for the file a `text-to-docx` call promised, matched on its exact
 * title. Returns `undefined` if it never shows up, so the caller decides
 * whether that is the expected outcome.
 */
export async function waitForExportedFile(
  api: RoleApi,
  folderId: number,
  exactTitle: string,
  timeoutMs = EXPORT_SETTLE_MS,
): Promise<FolderFile | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const files = await listFolderFiles(api, folderId);
    const match = files.find((file) => file.title === exactTitle);
    if (match || Date.now() > deadline) return match;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Gives a refused export as much time to land as an accepted one, so "no file
 * was created" is a real absence rather than an unfinished job.
 */
export function waitForExportToSettle(timeoutMs = EXPORT_SETTLE_MS) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

/**
 * Visible text of an exported document. The presigned stream URL is refused
 * without credentials, so the download carries the caller's bearer token.
 */
export async function readExportedDocxText(
  apiSdk: ApiSDK,
  role: Role,
  fileId: number,
): Promise<string> {
  const { data, status } = await apiSdk
    .forRole(role)
    .files.getPresignedFileUri({ fileId });
  if (status !== 200 || !data.response?.url) {
    throw new Error(`no presigned URI for file ${fileId}: ${status}`);
  }

  const response = await apiSdk.request.get(data.response.url, {
    headers: {
      Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
      Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
    },
  });
  if (response.status() !== 200) {
    throw new Error(`download of file ${fileId} failed: ${response.status()}`);
  }

  return extractDocxText(await response.body());
}
