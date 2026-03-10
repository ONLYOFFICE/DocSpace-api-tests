import { APIResponse } from "@playwright/test";

export async function parseResponse(response: APIResponse) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned non-JSON response (${response.status()} ${response.url()}): ${text.slice(0, 200)}`,
    );
  }
}
