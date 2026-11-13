import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

/**
 * POST /portal/moduleevents takes no user session: an integration module
 * identifies itself with the `X-Module-Key` header, whose hash the installation
 * administrator writes into the server configuration. That key cannot be issued
 * through the API, so only the gate in front of the operation is testable here -
 * which is the part that matters, the route being anonymous.
 */

const anEvent = { user: "nobody@example.com", event: "autotest", message: "1" };

test.describe("POST /portal/moduleevents - Send a module event", () => {
  test("POST /portal/moduleevents - A missing key and a key no module is configured for are both refused", async ({
    apiSdk,
  }) => {
    const anonymous = apiSdk.forAnonymous();

    const { status: noKey } = await anonymous.moduleEvents.sendModuleEvent({
      sendModuleEventRequest: anEvent,
    });
    expect(noKey).toBe(401);

    // Matched in constant time against the configured hashes, so an unknown key
    // is turned away exactly like a missing one.
    const { status: unknownKey } = await anonymous.moduleEvents.sendModuleEvent(
      {
        xModuleKey: `mk_${apiSdk.faker.generateString(32)}`,
        sendModuleEventRequest: anEvent,
      },
    );
    expect(unknownKey).toBe(401);
  });

  test("POST /portal/moduleevents - A portal session is no substitute for the module key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .moduleEvents.sendModuleEvent({ sendModuleEventRequest: anEvent });

    // The key is the module's identity, not a permission anybody on the portal
    // can hold, so even the owner is refused.
    expect(status).toBe(401);
  });
});
