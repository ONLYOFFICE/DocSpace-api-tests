import { ApiSDK } from "../services/api-sdk";
import { readIconAsBase64 } from "../utils/icon.utils";

export const OAUTH_LOGO = `data:image/png;base64,${readIconAsBase64("src/assets/mcp-icon.png")}`;

export type OAuthApi = ReturnType<ApiSDK["forRole"]>;

export async function getSignature(api: OAuthApi): Promise<string> {
  const { data } = await api.oauth2.generateJwtToken();
  return (data as any).response as string;
}

export async function createOAuthClient(
  api: OAuthApi,
  signature: string,
  name = "Autotest OAuth Client",
): Promise<string> {
  const { data } = await api.clientManagement.createClient(
    {
      createClientRequest: {
        name,
        logo: OAUTH_LOGO,
        website_url: "https://example.com",
        terms_url: "https://example.com/terms",
        policy_url: "https://example.com/policy",
        redirect_uris: new Set(["https://example.com/callback"]),
        allowed_origins: new Set(["https://example.com"]),
        logout_redirect_uri: "https://example.com/logout",
        scopes: new Set(["accounts.self:read"]),
      },
    },
    { headers: { "x-signature": signature } },
  );
  return data.client_id as string;
}
