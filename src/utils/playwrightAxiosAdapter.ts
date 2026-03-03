import { InternalAxiosRequestConfig, AxiosResponse } from "axios";
import { APIRequestContext } from "@playwright/test";

export function createPlaywrightAdapter(request: APIRequestContext) {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const method = (config.method || "GET").toUpperCase();

    let url = config.url || "";
    if (config.baseURL && !url.startsWith("http")) {
      url = config.baseURL.replace(/\/$/, "") + "/" + url.replace(/^\//, "");
    }

    if (config.params && Object.keys(config.params).length > 0) {
      url += "?" + new URLSearchParams(config.params).toString();
    }

    const headers = config.headers as Record<string, string>;

    let data: unknown;
    if (config.data) {
      data =
        typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    }

    const playwrightResponse = await request.fetch(url, {
      method,
      headers,
      ...(data !== undefined ? { data } : {}),
    });

    let responseData: unknown;
    try {
      responseData = await playwrightResponse.json();
    } catch {
      responseData = await playwrightResponse.text();
    }

    return {
      data: responseData,
      status: playwrightResponse.status(),
      statusText: String(playwrightResponse.status()),
      headers: playwrightResponse.headers() as Record<string, string>,
      config,
    };
  };
}
