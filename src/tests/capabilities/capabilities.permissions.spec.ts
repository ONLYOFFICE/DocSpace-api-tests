import { expect } from "@playwright/test";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  expectCapabilitiesContract,
  getCapabilities,
  portalWideView,
  rawCapabilities,
} from "@/src/helpers/capabilities";

type MemberType = "DocSpaceAdmin" | "RoomAdmin" | "User" | "Guest";

const MEMBER_TYPES: MemberType[] = [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
];

test.describe("GET /api/2.0/capabilities - permissions", () => {
  test("GET /api/2.0/capabilities - Owner sees the same portal settings as an anonymous caller", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const anonymous = portalWideView(
      await getCapabilities(isolatedSdk.forAnonymous()),
    );
    const owner = portalWideView(
      await getCapabilities(apiSdk.forRole("owner")),
    );

    expect(owner).toEqual(anonymous);
  });

  // One member per test: a second addAuthenticatedMember in the same test
  // flakes with 401 on this suite's shared request context.
  for (const type of MEMBER_TYPES) {
    test(`GET /api/2.0/capabilities - ${type} sees the same portal settings as an anonymous caller`, async ({
      apiSdk,
      isolatedSdk,
    }) => {
      const { api, data: created } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      // the account is real and of the requested type, so a match below is
      // not an anonymous request in disguise
      expect(created.response?.id).toBeDefined();

      const { data, status } = await api.capabilities.getPortalCapabilities();
      expect(status).toBe(200);
      expectCapabilitiesContract(data.response);

      const anonymous = await getCapabilities(isolatedSdk.forAnonymous());
      expect(portalWideView(data.response)).toEqual(portalWideView(anonymous));
    });
  }
});

// OBSERVED, not contractual. A caller whose bearer is stale or garbage should
// still be able to load the login page. The SDK docs only say the data is what a
// login client needs before anyone has signed in; that credentials are ignored
// (rather than rejected with 401) was measured on 2026-10-15. A failure here
// means "behaviour changed - triage against the docs", NOT "product defect":
// do not file a BUG or wrap these in test.fail without that check. Select with
// --grep @observed / --grep-invert @observed.
test.describe(
  "GET /api/2.0/capabilities - invalid credentials (observed)",
  { tag: "@observed" },
  () => {
    const BAD_AUTHORIZATION: Array<[string, string]> = [
      ["random bearer token", "Bearer abcdefghijklmnopqrstuvwxyz0123456789"],
      ["empty bearer token", "Bearer "],
      ["bearer without a token", "Bearer"],
      ["unknown scheme", "Foo bar"],
      ["basic scheme", "Basic dTpw"],
    ];

    for (const [label, authorization] of BAD_AUTHORIZATION) {
      test(`GET /api/2.0/capabilities - ${label} is ignored`, async ({
        isolatedSdk,
      }) => {
        const baseline = portalWideView(
          await getCapabilities(isolatedSdk.forAnonymous()),
        );

        const response = await rawCapabilities(isolatedSdk, {
          headers: { Authorization: authorization },
        });

        expect(response.status()).toBe(200);
        const { response: payload } = await response.json();
        expectCapabilitiesContract(payload);
        expect(portalWideView(payload)).toEqual(baseline);
      });
    }

    test("GET /api/2.0/capabilities - A deactivated user's token still reads the login options", async ({
      apiSdk,
      isolatedSdk,
    }) => {
      // owner setup first, then the member signs in through the isolated
      // context so the shared one keeps acting as the owner
      const { userData, data: created } = await apiSdk.addMember(
        "owner",
        "User",
      );
      const userId = created.response!.id!;
      const member = await isolatedSdk.authenticateMember(userData, "User");

      const baseline = portalWideView(
        await getCapabilities(isolatedSdk.forAnonymous()),
      );

      await test.step("token works while the user is active", async () => {
        expect(portalWideView(await getCapabilities(member))).toEqual(baseline);
      });

      await test.step("owner deactivates the user", async () => {
        const { status } = await apiSdk
          .forRole("owner")
          .userStatus.updateUserStatus({
            status: EmployeeStatus.Terminated,
            updateMembersRequestDto: { userIds: [userId] },
          });
        expect(status).toBe(200);
      });

      await test.step("the same token still reads capabilities", async () => {
        expect(portalWideView(await getCapabilities(member))).toEqual(baseline);
      });
    });
  },
);
