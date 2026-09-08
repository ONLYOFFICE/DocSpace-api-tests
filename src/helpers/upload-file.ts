import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

// Workaround: SDK's uploadFile sends Content-Type: application/json, serializing
// File objects as {} and causing the server to return "No input files" (403).
// This helper sends proper multipart/form-data instead.
//
// `uploadFileViaSession` mirrors the UI's chunked-session flow for Knowledge
// folder uploads (session → chunk → finalize) instead of the simple
// POST /upload path. The Knowledge indexer is only reliably triggered by the
// session flow; a direct upload sets vectorizationStatus to Completed but
// the knowledge search index is not populated.
export async function uploadFileToFolder(
  apiSdk: ApiSDK,
  role: Role | null,
  folderId: number | string | "@my",
  fileBuffer: Buffer | null,
  fileName: string,
  options?: {
    mimeType?: string;
    createNewIfExist?: boolean;
    storeOriginalFile?: boolean;
  },
) {
  const formData = new FormData();
  if (fileBuffer !== null) {
    formData.append(
      "file",
      new Blob([new Uint8Array(fileBuffer)], {
        type: options?.mimeType ?? "application/octet-stream",
      }),
      fileName,
    );
  }
  const queryParams = new URLSearchParams();
  if (options?.createNewIfExist !== undefined) {
    queryParams.set("createNewIfExist", String(options.createNewIfExist));
  }
  if (options?.storeOriginalFile !== undefined) {
    queryParams.set("storeOriginalFile", String(options.storeOriginalFile));
  }

  const headers: Record<string, string> = {
    Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
  };
  if (role !== null) {
    headers["Authorization"] = `Bearer ${apiSdk.tokenStore.getToken(role)}`;
  }

  const qs = queryParams.toString();
  const url = `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/${folderId}/upload${qs ? `?${qs}` : ""}`;
  const axiosInstance = apiSdk.createAxiosInstance();
  const response = await axiosInstance.post(url, formData, { headers });
  return { data: response.data, status: response.status };
}

/**
 * Uploads a file using the three-step session protocol the UI uses:
 *   POST /files/{folderId}/session        — create session
 *   POST /files/{folderId}/session/{id}/upload?chunkNumber=1  — send bytes
 *   PUT  /files/{folderId}/session/{id}/finalize  — commit
 *
 * Use this for Knowledge folder uploads. The direct POST /upload path sets
 * vectorizationStatus to Completed but does not actually populate the
 * knowledge search index; the session flow does.
 *
 * Returns the uploaded file entry from the finalize response
 * (`response.file`). The caller is responsible for asserting on `status`.
 */
export async function uploadFileViaSession(
  apiSdk: ApiSDK,
  role: Role,
  folderId: number,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = "application/octet-stream",
): Promise<{ status: number; data: unknown }> {
  const axiosInstance = apiSdk.createAxiosInstance();
  const base = `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files`;
  const auth = `Bearer ${apiSdk.tokenStore.getToken(role)}`;
  const origin = `http://${apiSdk.tokenStore.newTenantDomain}`;
  const jsonHeaders = {
    Authorization: auth,
    Origin: origin,
    "Content-Type": "application/json",
  };

  // 1. Create session
  const sessionResp = await axiosInstance.post(
    `${base}/${folderId}/session`,
    {
      fileName,
      fileSize: fileBuffer.length,
      relativePath: "",
      encrypted: false,
      createOn: new Date().toISOString(),
      CreateNewIfExist: true,
    },
    { headers: jsonHeaders },
  );
  if (sessionResp.status !== 200) {
    return { status: sessionResp.status, data: sessionResp.data };
  }

  const sessionId = sessionResp.data?.response?.id as string | undefined;
  if (!sessionId) {
    throw new Error(
      `No session ID in createUploadSession response: ${JSON.stringify(sessionResp.data)}`,
    );
  }

  // 2. Upload chunk
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
    fileName,
  );
  await axiosInstance.post(
    `${base}/${folderId}/session/${sessionId}/upload?chunkNumber=1`,
    formData,
    { headers: { Authorization: auth, Origin: origin } },
  );

  // 3. Finalize — response: { response: { file: { id, title, folderId, ... } } }
  const finalizeResp = await axiosInstance.put(
    `${base}/${folderId}/session/${sessionId}/finalize`,
    {},
    { headers: jsonHeaders },
  );

  // Re-shape response so uploadedEntry() can read it: wrap response.file as response
  const file = finalizeResp.data?.response?.file;
  return {
    status: finalizeResp.status,
    data: { response: file },
  };
}
