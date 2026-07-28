import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import type { UserType } from "@/src/services/api-sdk";
import {
  createRoomId,
  createRoomGroup,
  roomGroupRaw,
} from "@/src/helpers/room-groups";

test.describe("API room groups permissions", () => {
  // Room groups are a per-user feature: any role that can access the rooms it
  // references may create and manage its OWN groups. Access is gated by the
  // rooms passed in, NOT by the caller's role. These tests therefore separate
  // "can the role manage its own group" (capability) from "can the role touch
  // another user's room/group" (cross-user isolation).

  test.describe("Role capabilities - own groups", () => {
    // Every role gets the SAME full capability check (create, read, update,
    // re-icon, list, delete) so coverage is uniform. The only difference is how
    // the role obtains an accessible room: DocSpaceAdmin/RoomAdmin create their
    // own, while User/Guest (who cannot create rooms) get one shared by owner.
    const capabilityRoles: UserType[] = [
      "DocSpaceAdmin",
      "RoomAdmin",
      "User",
      "Guest",
    ];
    for (const role of capabilityRoles) {
      test(`${role} can create, read, update, re-icon, list and delete its own room group`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const { api, data: member } = await apiSdk.addAuthenticatedMember(
          "owner",
          role,
        );
        const userId = member.response!.id!;

        // Provision a room this role can put in a group.
        let roomId: number;
        if (role === "DocSpaceAdmin" || role === "RoomAdmin") {
          roomId = await createRoomId(api.rooms, `${role} Own Room`);
        } else {
          roomId = await createRoomId(owner.rooms, `${role} Shared Room`);
          const sec = await owner.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [{ id: userId, access: FileShare.ContentCreator }],
              notify: false,
            },
          });
          expect(sec.status).toBe(200);
        }

        // create — belongs to THIS user with the requested contents.
        const { id, data: created } = await createRoomGroup(api.groups, {
          name: `${role} Own Group`,
          rooms: [roomId],
        });
        expect(created.userId).toBe(userId);
        expect(created.name).toBe(`${role} Own Group`);
        expect(created.totalRooms).toBe(1);

        // read
        const read = await api.groups.getRoomGroupInfo({ id });
        expect(read.status).toBe(200);
        expect(read.data.response!.name).toBe(`${role} Own Group`);

        // update — renames (verified via a re-read, not just status).
        const upd = await api.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: `${role} Renamed` },
        });
        expect(upd.status).toBe(200);
        expect(
          (await api.groups.getRoomGroupInfo({ id })).data.response!.name,
        ).toBe(`${role} Renamed`);

        // re-icon — change persists.
        const ic = await api.groups.changeRoomGroupIcon({
          id,
          iconRequest: { icon: "heart" },
        });
        expect(ic.status).toBe(200);
        expect(
          (await api.groups.getRoomGroupInfo({ id })).data.response!.icon!.id,
        ).toBe("heart");

        // list — the group is visible in the role's own listing.
        const { data: list } = await api.groups.getRoomGroups({ id: 0 });
        expect(list.response!.map((g) => g.id)).toContain(id);

        // delete — then gone.
        expect((await api.groups.deleteRoomGroup({ id })).status).toBe(200);
        expect((await api.groups.getRoomGroupInfo({ id })).status).toBe(404);
      });
    }
  });

  test.describe("Room-access gate on create", () => {
    // Passing a room the caller cannot access is rejected with 403 regardless
    // of role — this is what the old "role cannot create a group" tests were
    // actually exercising. DocSpaceAdmin is excluded: it can reach the owner's
    // rooms, so the gate does not apply.
    const gatedRoles: UserType[] = ["RoomAdmin", "User", "Guest"];

    // Security property: the request is forbidden (403).
    for (const role of gatedRoles) {
      test(`${role} cannot add the owner's (inaccessible) room to a group — 403`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, `Gate ${role} Room`);

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);

        const { status } = await api.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: `${role} No Access`,
            icon: "star",
            rooms: [roomId],
          },
        });
        expect(status).toBe(403);
      });
    }

    // Atomicity: the rejected create must not leave a (partially created, empty)
    // group in the caller's own listing. The API currently DOES create it, so
    // this is a bug — the same partial-create defect seen for missing/invalid
    // rooms, here on the access-denied path.
    for (const role of gatedRoles) {
      test.fail(
        `BUG XXXXX: ${role} - create rejected for an inaccessible room still leaves a group (partial create)`,
        async ({ apiSdk }) => {
          const owner = apiSdk.forRole("owner");
          const roomId = await createRoomId(owner.rooms, `Gate ${role} Room`);

          const { api } = await apiSdk.addAuthenticatedMember("owner", role);

          await api.groups.addRoomGroup({
            roomGroupRequestDto: {
              name: `${role} No Access`,
              icon: "star",
              rooms: [roomId],
            },
          });

          // Correct contract: nothing is created in the caller's listing.
          const { data: list } = await api.groups.getRoomGroups({ id: 0 });
          expect(list.response!.map((g) => g.name)).not.toContain(
            `${role} No Access`,
          );
        },
      );
    }
  });

  test.describe("Cross-user data isolation", () => {
    test("GET /files/group - a user's list contains only its own groups", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const ownerRoom = await createRoomId(owner.rooms, "Owner List Room");
      await createRoomGroup(owner.groups, {
        name: "Owner Only Group",
        rooms: [ownerRoom],
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const adminRoom = await createRoomId(adminApi.rooms, "Admin List Room");
      await createRoomGroup(adminApi.groups, {
        name: "Admin Only Group",
        rooms: [adminRoom],
      });

      const { data: ownerList } = await owner.groups.getRoomGroups({ id: 0 });
      const { data: adminList } = await adminApi.groups.getRoomGroups({
        id: 0,
      });

      const ownerNames = ownerList.response!.map((g) => g.name);
      const adminNames = adminList.response!.map((g) => g.name);

      expect(ownerNames).toContain("Owner Only Group");
      expect(ownerNames).not.toContain("Admin Only Group");
      expect(adminNames).toContain("Admin Only Group");
      expect(adminNames).not.toContain("Owner Only Group");
    });

    // No non-owner role — not even DocSpaceAdmin — can read, update or re-icon
    // another user's group; all return 404 and leave it unchanged.
    for (const role of [
      "DocSpaceAdmin",
      "RoomAdmin",
      "User",
      "Guest",
    ] as const) {
      test(`${role} cannot read, update or re-icon the owner's group`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, `Iso ${role} Room`);
        const { id } = await createRoomGroup(owner.groups, {
          name: `Owner Group vs ${role}`,
          icon: "star",
          rooms: [roomId],
        });

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);

        await test.step("read is 404", async () => {
          expect((await api.groups.getRoomGroupInfo({ id })).status).toBe(404);
        });

        await test.step("update is 404, name unchanged", async () => {
          expect(
            (
              await api.groups.updateRoomGroup({
                id,
                updateRoomGroupRequest: { groupName: "Hacked" },
              })
            ).status,
          ).toBe(404);
          const { data } = await owner.groups.getRoomGroupInfo({ id });
          expect(data.response!.name).toBe(`Owner Group vs ${role}`);
        });

        await test.step("change icon is 404, icon unchanged", async () => {
          expect(
            (
              await api.groups.changeRoomGroupIcon({
                id,
                iconRequest: { icon: "heart" },
              })
            ).status,
          ).toBe(404);
          const { data } = await owner.groups.getRoomGroupInfo({ id });
          expect(data.response!.icon!.id).toBe("star");
        });
      });
    }

    // Deleting another user's group must be forbidden (403), consistent with
    // read/update returning 404 for cross-user access. The API currently
    // accepts the request as a silent 200 no-op (the group survives, but the
    // status is wrong), so this is a bug.
    for (const role of [
      "DocSpaceAdmin",
      "RoomAdmin",
      "User",
      "Guest",
    ] as const) {
      test.fail(
        `BUG XXXXX: ${role} deleting the owner's group should be 403, not a 200 no-op`,
        async ({ apiSdk }) => {
          const owner = apiSdk.forRole("owner");
          const roomId = await createRoomId(owner.rooms, `DelIso ${role} Room`);
          const { id } = await createRoomGroup(owner.groups, {
            name: `Owner Del Group vs ${role}`,
            rooms: [roomId],
          });

          const { api } = await apiSdk.addAuthenticatedMember("owner", role);

          const { status } = await api.groups.deleteRoomGroup({ id });

          // The owner's group must survive regardless (holds under both the
          // current no-op and the correct 403 behaviour).
          const survive = await owner.groups.getRoomGroupInfo({ id });
          expect(survive.status).toBe(200);
          expect(survive.data.response!.name).toBe(
            `Owner Del Group vs ${role}`,
          );

          // Correct contract: the cross-user delete is refused with 403.
          expect(status).toBe(403);
        },
      );
    }
  });

  test.describe("Anonymous access control", () => {
    test("POST /files/group - anonymous returns 401", async ({ apiSdk }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        role: null,
        path: "",
        body: { name: "Anon", icon: "star", rooms: [1] },
      });
      expect(status).toBe(401);
    });

    test("GET /files/group/:id - anonymous returns 401", async ({ apiSdk }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        role: null,
        method: "GET",
        path: "/1",
      });
      expect(status).toBe(401);
    });

    test("GET /files/group - anonymous returns 401", async ({ apiSdk }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        role: null,
        method: "GET",
        path: "",
      });
      expect(status).toBe(401);
    });

    test("PUT /files/group/:id - anonymous returns 401", async ({ apiSdk }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        role: null,
        method: "PUT",
        path: "/1",
        body: { groupName: "Hacked" },
      });
      expect(status).toBe(401);
    });

    test("POST /files/group/:id/icon - anonymous returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        role: null,
        method: "POST",
        path: "/1/icon",
        body: { icon: "heart" },
      });
      expect(status).toBe(401);
    });

    test("DELETE /files/group/:id - anonymous returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        role: null,
        method: "DELETE",
        path: "/1",
      });
      expect(status).toBe(401);
    });
  });

  test.describe("Invalid token access control", () => {
    test("POST /files/group - invalid token returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        token: "garbage.token",
        path: "",
        body: { name: "Bad Token", icon: "star", rooms: [1] },
      });
      expect(status).toBe(401);
    });

    test("GET /files/group/:id - invalid token returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        method: "GET",
        path: "/1",
        token: "garbage.token",
      });
      expect(status).toBe(401);
    });

    test("GET /files/group - invalid token returns 401", async ({ apiSdk }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        method: "GET",
        path: "",
        token: "garbage.token",
      });
      expect(status).toBe(401);
    });

    test("PUT /files/group/:id - invalid token returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        method: "PUT",
        path: "/1",
        token: "garbage.token",
        body: { groupName: "X" },
      });
      expect(status).toBe(401);
    });

    test("POST /files/group/:id/icon - invalid token returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        method: "POST",
        path: "/1/icon",
        token: "garbage.token",
        body: { icon: "heart" },
      });
      expect(status).toBe(401);
    });

    test("DELETE /files/group/:id - invalid token returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        method: "DELETE",
        path: "/1",
        token: "garbage.token",
      });
      expect(status).toBe(401);
    });
  });
});
