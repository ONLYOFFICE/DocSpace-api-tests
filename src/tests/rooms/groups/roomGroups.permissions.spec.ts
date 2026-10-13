import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import type { UserType } from "@/src/services/api-sdk";
import {
  createRoomId,
  createRoomIds,
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
        const { data: list } = await api.groups.getRoomGroups();
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
    // group in the caller's own listing.
    for (const role of gatedRoles) {
      test(`BUG 82598: ${role} - create rejected for an inaccessible room still leaves a group (partial create)`, async ({
        apiSdk,
      }) => {
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
        const { data: list } = await api.groups.getRoomGroups();
        expect(list.response!.map((g) => g.name)).not.toContain(
          `${role} No Access`,
        );
      });
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

      const { data: ownerList } = await owner.groups.getRoomGroups();
      const { data: adminList } = await adminApi.groups.getRoomGroups({});

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
    // read/update returning 404 for cross-user access.
    for (const role of [
      "DocSpaceAdmin",
      "RoomAdmin",
      "User",
      "Guest",
    ] as const) {
      test(`BUG 82597: ${role} deleting the owner's group should be 403, not a 200 no-op`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, `DelIso ${role} Room`);
        const { id } = await createRoomGroup(owner.groups, {
          name: `Owner Del Group vs ${role}`,
          rooms: [roomId],
        });

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);

        const { status } = await api.groups.deleteRoomGroup({ id });

        // The owner's group must survive the forbidden delete attempt.
        const survive = await owner.groups.getRoomGroupInfo({ id });
        expect(survive.status).toBe(200);
        expect(survive.data.response!.name).toBe(`Owner Del Group vs ${role}`);

        // Correct contract: the cross-user delete is refused with 403.
        expect(status).toBe(403);
      });
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

  // ---------------------------------------------------------------------------
  // Coverage additions (audit of this file): update with rooms the caller
  // cannot reach, lost access, cross-user update, end-to-end isolation.
  // ---------------------------------------------------------------------------
  test.describe("Update with rooms the caller cannot reach", () => {
    // Same room-access gate as create: 403 and nothing applied. DocSpaceAdmin is
    // excluded because it can reach the owner's rooms.
    const gatedRoles: UserType[] = ["RoomAdmin", "User", "Guest"];

    for (const role of gatedRoles) {
      test(`${role} cannot add or detach a room it cannot access through update — group unchanged`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const { api, data: member } = await apiSdk.addAuthenticatedMember(
          "owner",
          role,
        );
        const memberId = member.response!.id!;

        const ownTitle = `${role} Own Room`;
        let ownRoom: number;
        if (role === "RoomAdmin") {
          ownRoom = await createRoomId(api.rooms, ownTitle);
        } else {
          ownRoom = await createRoomId(owner.rooms, ownTitle);
          const sec = await owner.rooms.setRoomSecurity({
            id: ownRoom,
            roomInvitationRequest: {
              invitations: [{ id: memberId, access: FileShare.ContentCreator }],
              notify: false,
            },
          });
          expect(sec.status).toBe(200);
        }
        const foreignRoom = await createRoomId(
          owner.rooms,
          `${role} Foreign Room`,
        );

        const { id } = await createRoomGroup(api.groups, {
          name: `${role} Gate Group`,
          rooms: [ownRoom],
        });

        const expectUnchanged = async () => {
          const { data, status } = await api.groups.getRoomGroupInfo({ id });
          expect(status).toBe(200);
          expect(data.response!.name).toBe(`${role} Gate Group`);
          expect(data.response!.totalRooms).toBe(1);
          expect(data.response!.rooms!.map((r) => r.title)).toEqual([ownTitle]);
        };

        await test.step("adding the foreign room is refused (403)", async () => {
          const { status } = await api.groups.updateRoomGroup({
            id,
            updateRoomGroupRequest: { roomsToAdd: [foreignRoom] },
          });
          expect(status).toBe(403);
          await expectUnchanged();
        });

        await test.step("detaching a foreign room that is not in the group is refused (403)", async () => {
          const { status } = await api.groups.updateRoomGroup({
            id,
            updateRoomGroupRequest: { roomsToRemove: [foreignRoom] },
          });
          expect(status).toBe(403);
          await expectUnchanged();
        });
      });
    }

    test("User keeps the ability to detach a room it has lost access to", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const { api, data: member } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const memberId = member.response!.id!;
      const roomId = await createRoomId(owner.rooms, "Lost Access Room");
      expect(
        (
          await owner.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [{ id: memberId, access: FileShare.ContentCreator }],
              notify: false,
            },
          })
        ).status,
      ).toBe(200);
      const { id } = await createRoomGroup(api.groups, {
        name: "Lost Access Group",
        rooms: [roomId],
      });

      // premise: the access is really gone
      expect(
        (
          await owner.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [{ id: memberId, access: FileShare.None }],
              notify: false,
            },
          })
        ).status,
      ).toBe(200);
      expect((await api.rooms.getRoomInfo({ id: roomId })).status).toBe(403);

      const { status, data } = await api.groups.updateRoomGroup({
        id,
        updateRoomGroupRequest: { roomsToRemove: [roomId] },
      });
      expect(status).toBe(200);
      expect(data.response!.totalRooms).toBe(0);
      const after = await api.groups.getRoomGroupInfo({ id });
      expect(after.data.response!.totalRooms).toBe(0);
      expect(after.data.response!.rooms ?? []).toHaveLength(0);
      expect((await owner.rooms.getRoomInfo({ id: roomId })).status).toBe(200);
    });

    // Candidate defect: after access is revoked the group keeps serving LIVE
    // data of the room. Observed 2026-10-12 in rooms[] of getRoomGroupInfo and
    // getRoomGroups while getRoomInfo answers 403: title (follows renames),
    // filesCount, foldersCount, usedSpace, tags, created/updated, createdBy and
    // updatedBy (displayName, avatar, profileUrl), roomType; security flags are
    // all false but a stale access value is still returned. Only the title is
    // asserted here.
    test.fail(
      "BUG 84474: a group keeps exposing the live title of a room the member lost access to",
      async ({ apiSdk }) => {
        const owner = apiSdk.forRole("owner");
        const { api, data: member } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );
        const memberId = member.response!.id!;
        const roomId = await createRoomId(owner.rooms, "Leak Before");
        expect(
          (
            await owner.rooms.setRoomSecurity({
              id: roomId,
              roomInvitationRequest: {
                invitations: [
                  { id: memberId, access: FileShare.ContentCreator },
                ],
                notify: false,
              },
            })
          ).status,
        ).toBe(200);
        const { id } = await createRoomGroup(api.groups, {
          name: "Leak Group",
          rooms: [roomId],
        });

        // positive control: while access exists the member sees the room
        const seen = await api.groups.getRoomGroupInfo({ id });
        expect(seen.data.response!.rooms!.map((r) => r.title)).toContain(
          "Leak Before",
        );

        // access revoked, then the owner renames the room
        expect(
          (
            await owner.rooms.setRoomSecurity({
              id: roomId,
              roomInvitationRequest: {
                invitations: [{ id: memberId, access: FileShare.None }],
                notify: false,
              },
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await owner.rooms.updateRoom({
              id: roomId,
              updateRoomRequest: { title: "Leak After Revoke" },
            })
          ).status,
        ).toBe(200);
        expect((await api.rooms.getRoomInfo({ id: roomId })).status).toBe(403);

        const info = await api.groups.getRoomGroupInfo({ id });
        const { data: list } = await api.groups.getRoomGroups();
        const listed = list.response!.find((g) => g.id === id)!;
        expect(info.data.response!.rooms!.map((r) => r.title)).not.toContain(
          "Leak After Revoke",
        );
        expect(listed.rooms!.map((r) => r.title)).not.toContain(
          "Leak After Revoke",
        );
      },
    );
  });

  test.describe("Cross-user update", () => {
    for (const role of [
      "DocSpaceAdmin",
      "RoomAdmin",
      "User",
      "Guest",
    ] as const) {
      test(`${role} cannot add rooms to or detach rooms from the owner's group`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [inGroup, extra] = await createRoomIds(
          owner.rooms,
          2,
          `XUpd ${role}`,
        );
        const { id } = await createRoomGroup(owner.groups, {
          name: `XUpd Group ${role}`,
          rooms: [inGroup],
        });

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);

        const expectOwnerGroupIntact = async () => {
          const dto = (await owner.groups.getRoomGroupInfo({ id })).data
            .response!;
          expect(dto.name).toBe(`XUpd Group ${role}`);
          expect(dto.totalRooms).toBe(1);
          expect(dto.rooms!.map((r) => r.title)).toEqual([`XUpd ${role} 1`]);
        };

        await test.step("add is 404 and changes nothing", async () => {
          const { status } = await api.groups.updateRoomGroup({
            id,
            updateRoomGroupRequest: { roomsToAdd: [extra] },
          });
          expect(status).toBe(404);
          await expectOwnerGroupIntact();
        });

        await test.step("detach is 404 and changes nothing", async () => {
          const { status } = await api.groups.updateRoomGroup({
            id,
            updateRoomGroupRequest: { roomsToRemove: [inGroup] },
          });
          expect(status).toBe(404);
          await expectOwnerGroupIntact();
        });

        await test.step("the owner's group is not listed for the other user", async () => {
          const { data } = await api.groups.getRoomGroups();
          expect(data.response!.map((g) => g.id)).not.toContain(id);
        });
      });
    }
  });

  test.describe("End-to-end isolation of two users sharing a room", () => {
    test("owner's and admin's groups over the same room never affect each other", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const { api: admin } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const [shared, ownerOnly] = await createRoomIds(
        owner.rooms,
        2,
        "E2E Iso",
      );

      const { id: ownerGroup } = await createRoomGroup(owner.groups, {
        name: "E2E Owner Group",
        icon: "heart",
        rooms: [shared, ownerOnly],
      });
      const { id: adminGroup } = await createRoomGroup(admin.groups, {
        name: "E2E Admin Group",
        icon: "flag",
        rooms: [shared],
      });

      const view = async (groups: typeof owner.groups, id: number) => {
        const dto = (await groups.getRoomGroupInfo({ id })).data.response!;
        return {
          name: dto.name,
          icon: dto.icon?.id,
          rooms: dto.rooms!.map((r) => r.title).sort(),
          total: dto.totalRooms,
        };
      };

      const ownerBaseline = await view(owner.groups, ownerGroup);
      const adminBaseline = await view(admin.groups, adminGroup);
      expect(ownerBaseline.total).toBe(2);
      expect(adminBaseline.rooms).toEqual(["E2E Iso 1"]);

      await test.step("each listing contains only its own group", async () => {
        const ownerIds = (
          await owner.groups.getRoomGroups()
        ).data.response!.map((g) => g.id);
        const adminIds = (
          await admin.groups.getRoomGroups()
        ).data.response!.map((g) => g.id);
        expect(ownerIds).toContain(ownerGroup);
        expect(ownerIds).not.toContain(adminGroup);
        expect(adminIds).toContain(adminGroup);
        expect(adminIds).not.toContain(ownerGroup);
      });

      await test.step("neither user can address the other's group", async () => {
        expect(
          (await admin.groups.getRoomGroupInfo({ id: ownerGroup })).status,
        ).toBe(404);
        expect(
          (await owner.groups.getRoomGroupInfo({ id: adminGroup })).status,
        ).toBe(404);
      });

      await test.step("the owner edits their group -> the admin's group is unchanged", async () => {
        expect(
          (
            await owner.groups.updateRoomGroup({
              id: ownerGroup,
              updateRoomGroupRequest: {
                groupName: "E2E Owner Renamed",
                roomsToRemove: [shared],
              },
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await owner.groups.changeRoomGroupIcon({
              id: ownerGroup,
              iconRequest: { icon: "folder" },
            })
          ).status,
        ).toBe(200);
        expect(await view(admin.groups, adminGroup)).toEqual(adminBaseline);
        expect(await view(owner.groups, ownerGroup)).toEqual({
          name: "E2E Owner Renamed",
          icon: "folder",
          rooms: ["E2E Iso 2"],
          total: 1,
        });
      });

      await test.step("the admin edits and deletes their group -> the owner's group is unchanged", async () => {
        const ownerBefore = await view(owner.groups, ownerGroup);
        expect(
          (
            await admin.groups.updateRoomGroup({
              id: adminGroup,
              updateRoomGroupRequest: {
                groupName: "E2E Admin Renamed",
                roomsToAdd: [ownerOnly],
              },
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await admin.groups.changeRoomGroupIcon({
              id: adminGroup,
              iconRequest: { icon: "star" },
            })
          ).status,
        ).toBe(200);
        expect(await view(owner.groups, ownerGroup)).toEqual(ownerBefore);

        expect(
          (await admin.groups.deleteRoomGroup({ id: adminGroup })).status,
        ).toBe(200);
        expect(await view(owner.groups, ownerGroup)).toEqual(ownerBefore);
        expect(
          (await admin.groups.getRoomGroupInfo({ id: adminGroup })).status,
        ).toBe(404);
      });

      await test.step("the shared room itself survives both group deletions", async () => {
        expect((await owner.rooms.getRoomInfo({ id: shared })).status).toBe(
          200,
        );
        expect((await owner.rooms.getRoomInfo({ id: ownerOnly })).status).toBe(
          200,
        );
      });
    });
  });
});
