import { test, expect } from "@playwright/test";

import config from "../../../config";
import {
  assertTestEnvironment,
  cleanupRegisteredPortal,
  getSelf,
  ownerLogin,
  registerOnce,
  uniquePortalName,
} from "../../helpers/apisystem-registration";

const owner = {
  email: config.DOCSPACE_OWNER_EMAIL,
  password: config.DOCSPACE_OWNER_PASSWORD,
};

// Deliberately NOT using the `api` fixture from @/src/fixtures: it registers a
// portal of its own, and these tests are about the registration endpoints.
test.describe("apisystem - portal registration", () => {
  test.beforeAll(() => {
    assertTestEnvironment();
  });

  test("POST /apisystem/portal/register - registers a portal the owner can log in to", async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext({ timeout: 30000 });
    const portalName = uniquePortalName("apisystem-register");
    let portal: { portalName: string; domain: string } | undefined;
    let ownerToken: string | undefined;
    let cleanupError: Error | undefined;

    try {
      const response =
        await test.step("register the portal (single attempt)", () =>
          registerOnce(context, "register", portalName, {
            portalName,
            firstName: "admin-zero",
            lastName: "admin-zero",
            email: owner.email,
            password: owner.password,
            language: "en",
          }));

      const body = await response.json().catch(() => ({}));
      // Record what exists before asserting so cleanup still runs on a bad answer.
      if (typeof body?.tenant?.domain === "string") {
        portal = { portalName, domain: body.tenant.domain };
      } else if (response.ok()) {
        // A success without a domain: a portal may exist that we cannot address.
        test.info().annotations.push({
          type: "possible-orphan",
          description: `register returned ${response.status()} without tenant.domain for "${portalName}"`,
        });
      }

      expect(response.status()).toBe(200);
      expect(typeof body.tenant?.domain).toBe("string");
      expect(typeof body.tenant?.ownerId).toBe("string");
      expect(body.tenant.domain.endsWith(".onlyoffice.io")).toBe(true);

      await test.step("the owner can log in to the new portal", async () => {
        const login = await ownerLogin(
          context,
          portal!,
          owner.email,
          owner.password,
        );
        expect(login.status).toBe(200);
        expect(login.token).toBeTruthy();
        ownerToken = login.token;
      });

      await test.step("the portal serves the registered owner's profile", async () => {
        const { status, profile } = await getSelf(
          context,
          portal!.domain,
          ownerToken!,
        );
        expect(status).toBe(200);
        expect(profile?.id).toBe(body.tenant.ownerId);
        expect(profile?.email?.toLowerCase()).toBe(owner.email.toLowerCase());
      });
    } finally {
      cleanupError = await cleanupRegisteredPortal(
        context,
        portal,
        ownerToken,
        owner,
      );
      if (cleanupError) {
        console.warn(cleanupError.message);
        test.info().annotations.push({
          type: "cleanup-failed",
          description: cleanupError.message,
        });
      }
      await context.dispose();
    }

    // Reached only when the test body passed: a failed cleanup then fails the
    // test, while an earlier error propagates untouched from the try block.
    expect(cleanupError, "portal cleanup").toBeUndefined();
  });
});
