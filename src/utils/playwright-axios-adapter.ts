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
    let multipart:
      | Record<
          string,
          | string
          | number
          | boolean
          | { name: string; mimeType: string; buffer: Buffer }
        >
      | undefined;
    if (config.data) {
      if (config.data instanceof FormData) {
        multipart = {};
        for (const [key, value] of config.data.entries()) {
          if (value instanceof Blob) {
            multipart[key] = {
              name: value instanceof File ? value.name : key,
              mimeType: value.type,
              buffer: Buffer.from(await value.arrayBuffer()),
            };
          } else {
            multipart[key] = value;
          }
        }
        delete headers["Content-Type"];
      } else {
        data =
          typeof config.data === "string"
            ? JSON.parse(config.data)
            : config.data;
      }
    }

    if (config.responseType === "stream") {
      const controller = new AbortController();
      const streamTimeout = (config.timeout as number) || 10000;

      const nativeResponse = await fetch(url, {
        method,
        headers: { ...headers, Cookie: "" },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
        signal: controller.signal,
      });

      let streamData = "";
      if (nativeResponse.body) {
        const reader = nativeResponse.body.getReader();
        const decoder = new TextDecoder();
        const timer = setTimeout(() => controller.abort(), streamTimeout);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamData += decoder.decode(value, { stream: true });
          }
        } catch {
          // stream aborted by timeout — expected for SSE
        } finally {
          clearTimeout(timer);
        }
      }

      return {
        data: streamData,
        status: nativeResponse.status,
        statusText: nativeResponse.statusText,
        headers: Object.fromEntries(nativeResponse.headers.entries()),
        config,
      };
    }

    const playwrightResponse = await request.fetch(url, {
      method,
      headers: { ...headers, Cookie: "" },
      ...(multipart !== undefined ? { multipart } : {}),
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
