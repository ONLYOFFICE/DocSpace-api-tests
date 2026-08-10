import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";

// Who may read and who may change the portal's model assignments.
//
// Reads are open to every member and refused for a Guest; writes are
// administrator-only, which is what section 5.1's "an ordinary user may only
// read" asks for. The split is per role, not per assignment, so one read and one
// write per role is the whole matrix.

const ROLES: Array<{
  label: string;
  type: UserType;
  role: AgentRole;
  canRead: boolean;
  canWrite: boolean;
}> = [
  {
    label: "DocSpaceAdmin",
    type: "DocSpaceAdmin",
    role: "docSpaceAdmin",
    canRead: true,
    canWrite: true,
  },
  {
    label: "RoomAdmin",
    type: "RoomAdmin",
    role: "roomAdmin",
    canRead: true,
    canWrite: false,
  },
  { label: "User", type: "User", role: "user", canRead: true, canWrite: false },
  {
    label: "Guest",
    type: "Guest",
    role: "guest",
    canRead: false,
    canWrite: false,
  },
];

test.describe("AI Assignments - anonymous access", () => {
  test("GET|PUT|DELETE /api/2.0/ai/assignments/* - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["get-all-assignments", profiles.getAllAssignments("anonymous")],
      ["get-assignment", profiles.getAssignment("anonymous", "Chat")],
      ["resolve-for-action", profiles.resolveForAction("anonymous", "Chat")],
      [
        "try-resolve-for-action",
        profiles.tryResolveForAction("anonymous", "Chat"),
      ],
      [
        "assign",
        profiles.assign("anonymous", {
          actionType: "Chat",
          profileId: text.id,
        }),
      ],
      ["bulk-assign", profiles.bulkAssign("anonymous", { Chat: text.id })],
      ["unassign", profiles.unassign("anonymous", { actionType: "Chat" })],
      [
        "cascade-profile-delete",
        profiles.cascadeProfileDelete("anonymous", { profileId: text.id }),
      ],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} as anonymous`).toBe(401);
    }

    // The refused write really wrote nothing.
    await apiSdk.authenticateOwner();
    const read = await profiles.getAssignment("owner", "Chat");
    expect(read.data).toBeNull();
  });
});

test.describe("AI Assignments - read permissions", () => {
  for (const { label, type, role, canRead } of ROLES) {
    test(`GET /api/2.0/ai/assignments/get-all-assignments - ${label} ${canRead ? "reads" : "cannot read"} the assignments`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const catalogue = await profiles.catalogue("owner");
      const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

      const { data: seeded } = await profiles.assign("owner", {
        actionType: "Summarization",
        profileId: text.id,
      });
      expect(seeded?.success, "the seeded assignment").toBe(true);

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await profiles.expectActingAs(role, memberData.response!.id!, label);

      const all = await profiles.getAllAssignments(role);
      const single = await profiles.getAssignment(role, "Summarization");
      const resolved = await profiles.resolveForAction(role, "Chat");

      if (!canRead) {
        expect(all.status).toBe(403);
        expect(single.status).toBe(403);
        expect(resolved.status).toBe(403);
        return;
      }

      expect(all.status).toBe(200);
      expect(all.data!.Summarization).toBe(text.id);
      expect(single.status).toBe(200);
      expect(single.data).toBe(text.id);

      // Resolution is what the chat surface actually calls, and it hands back the
      // whole profile — a member must still not get a credential out of it.
      expect(resolved.status).toBe(200);
      expect(resolved.data?.profile?.key).toBe("onlyoffice");
      expect(JSON.stringify(resolved.data)).not.toMatch(
        /sk-[A-Za-z0-9_-]{16,}/,
      );
    });
  }
});

test.describe("AI Assignments - write permissions", () => {
  for (const { label, type, role, canWrite } of ROLES) {
    test(`PUT|DELETE /api/2.0/ai/assignments/* - ${label} ${canWrite ? "may" : "may not"} change an assignment`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const catalogue = await profiles.catalogue("owner");
      const seed = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);
      const attempt = AiProfiles.byCapabilities(
        catalogue,
        AI_CAPS.textVisionTools,
      );

      const { data: seeded } = await profiles.assign("owner", {
        actionType: "Chat",
        profileId: seed.id,
      });
      expect(seeded?.success, "the seeded assignment").toBe(true);

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await profiles.expectActingAs(role, memberData.response!.id!, label);

      const assign = await profiles.assign(role, {
        actionType: "Chat",
        profileId: attempt.id,
      });
      const bulk = await profiles.bulkAssign(role, {
        Summarization: attempt.id,
      });
      const unassign = await profiles.unassign(role, { actionType: "Chat" });

      if (canWrite) {
        expect(assign.status).toBe(200);
        expect(assign.data?.success).toBe(true);
        expect(bulk.status).toBe(200);
        expect(bulk.data?.success).toBe(true);
        expect(unassign.status).toBe(200);

        await apiSdk.authenticateOwner();
        const read = await profiles.getAssignment("owner", "Chat");
        expect(read.data, "the admin's unassign took effect").toBeNull();
        return;
      }

      expect(assign.status).toBe(403);
      expect(bulk.status).toBe(403);
      expect(unassign.status).toBe(403);

      // The seeded binding is intact, so the 403s were real refusals.
      await apiSdk.authenticateOwner();
      const read = await profiles.getAssignment("owner", "Chat");
      expect(read.data, "the assignment is unchanged").toBe(seed.id);
      const summarization = await profiles.getAssignment(
        "owner",
        "Summarization",
      );
      expect(summarization.data).toBeNull();
    });
  }
});
