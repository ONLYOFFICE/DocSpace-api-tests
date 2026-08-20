import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

// Workaround: SDK's uploadFile sends Content-Type: application/json, serializing
// File objects as {} and causing the server to return "No input files" (403).
// This helper sends proper multipart/form-data instead.
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
