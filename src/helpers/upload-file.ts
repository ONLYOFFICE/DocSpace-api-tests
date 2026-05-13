import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

// Workaround: SDK's uploadFile sends Content-Type: application/json, serializing
// File objects as {} and causing the server to return "No input files" (403).
// This helper sends proper multipart/form-data instead.
export async function uploadFileToFolder(
  apiSdk: ApiSDK,
  role: Role | null,
  folderId: number,
  fileBuffer: Buffer | null,
  fileName: string,
  options?: {
    mimeType?: string;
    createNewIfExist?: boolean;
    storeOriginalFileFlag?: boolean;
    files?: Array<{ buffer: Buffer; fileName: string; mimeType?: string }>;
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
  for (const f of options?.files ?? []) {
    formData.append(
      "files",
      new Blob([new Uint8Array(f.buffer)], {
        type: f.mimeType ?? "application/octet-stream",
      }),
      f.fileName,
    );
  }
  if (options?.createNewIfExist !== undefined) {
    formData.append("createNewIfExist", String(options.createNewIfExist));
  }
  if (options?.storeOriginalFileFlag !== undefined) {
    formData.append(
      "storeOriginalFileFlag",
      String(options.storeOriginalFileFlag),
    );
  }

  const headers: Record<string, string> = {
    Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
  };
  if (role !== null) {
    headers["Authorization"] = `Bearer ${apiSdk.tokenStore.getToken(role)}`;
  }

  const axiosInstance = apiSdk.createAxiosInstance();
  const response = await axiosInstance.post(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/${folderId}/upload`,
    formData,
    { headers },
  );
  return { data: response.data, status: response.status };
}
