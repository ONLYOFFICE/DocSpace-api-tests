import { request } from "@playwright/test";
import API from "@/src/services/api";

/**
 * Creates one throwaway portal and deletes it before the suite starts. If
 * either half is broken the run is aborted here, instead of creating a portal
 * per test and leaving every one of them behind.
 */
export default async function preflight() {
  const context = await request.newContext({ timeout: 30000 });
  const api = new API(context);
  const started = Date.now();

  try {
    await api.setup();
    console.log(`Preflight: portal ${api.portalDomain} created`);

    await api.cleanup();
    await api.apisystem.expectPortalGone();
    console.log(
      `Preflight: portal ${api.portalDomain} deleted and verified gone in ${Math.round((Date.now() - started) / 1000)}s`,
    );
  } catch (error) {
    throw new Error(
      `Preflight failed — the suite will not start.\n` +
        `Creating or deleting a portal does not work, so a full run would ` +
        `orphan a portal per test.\n` +
        `Reason: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await context.dispose();
  }
}
