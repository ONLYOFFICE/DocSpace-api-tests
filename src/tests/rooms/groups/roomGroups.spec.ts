import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { createAllRoomTypes, createPrivateRoom } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import {
  VALID_GROUP_ICONS,
  createRoomId,
  createRoomIds,
  createRoomGroup,
  expectRoomGroupShape,
  roomGroupRaw,
} from "@/src/helpers/room-groups";

test.describe("API room groups methods", () => {
  test.describe("POST /files/group", () => {
    test.describe("positive", () => {
      test("POST /files/group - Owner creates a group with all room types", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const rooms = await createAllRoomTypes(apiSdk, "owner");
        const roomIds = rooms.map((r) => r.id);

        const { data, status } = await ownerApi.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Autotest Group",
            icon: "star",
            rooms: roomIds,
          },
        });

        expect(status).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.name).toBe("Autotest Group");
        expect(data.response!.id).toBeDefined();
        expect(data.response!.totalRooms).toBe(rooms.length);

        const { data: verify, status: getStatus } =
          await ownerApi.groups.getRoomGroupInfo({ id: data.response!.id! });
        expect(getStatus).toBe(200);
        expect(verify.response!.name).toBe("Autotest Group");
        expect(verify.response!.totalRooms).toBe(rooms.length);
      });

      test("POST /files/group - Owner creates a group with one room", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Single Room");

        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "One Room",
            icon: "star",
            rooms: [roomId],
          },
        });

        expect(status).toBe(200);
        expectRoomGroupShape(data.response);
        expect(data.response!.name).toBe("One Room");
        expect(data.response!.icon!.id).toBe("star");
        expect(data.response!.userId).toBeTruthy();
        expect(data.response!.totalRooms).toBe(1);
        expect(data.response!.rooms!.map((r) => r.title)).toContain(
          "Single Room",
        );
      });

      test("POST /files/group - Owner creates a group with several rooms", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const ids = await createRoomIds(owner.rooms, 3, "Multi Room");

        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Many Rooms", icon: "star", rooms: ids },
        });

        expect(status).toBe(200);
        expectRoomGroupShape(data.response);
        expect(data.response!.totalRooms).toBe(3);
        const titles = data.response!.rooms!.map((r) => r.title);
        for (let i = 1; i <= 3; i++) {
          expect(titles).toContain(`Multi Room ${i}`);
        }
      });

      test("POST /files/group - Owner creates a group with a private room", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const { data: room } = await createPrivateRoom(apiSdk, "owner", {
          title: "Private Group Room",
          roomType: RoomType.CustomRoom,
        });
        const roomId = room.response!.id!;

        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Private Group",
            icon: "star",
            rooms: [roomId],
          },
        });

        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
        expect(data.response!.rooms!.map((r) => r.title)).toContain(
          "Private Group Room",
        );
      });

      test("POST /files/group - Owner creates several groups with distinct ids", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Distinct");

        const { data: g1 } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Group One", icon: "star", rooms: [r1] },
        });
        const { data: g2 } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Group Two", icon: "star", rooms: [r2] },
        });

        expect(g1.response!.id).not.toBe(g2.response!.id);

        const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
        const names = list.response!.map((g) => g.name);
        expect(names).toContain("Group One");
        expect(names).toContain("Group Two");
      });

      test("POST /files/group - duplicate group names are allowed", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "DupName");

        const { status: s1, data: g1 } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Same Name", icon: "star", rooms: [r1] },
        });
        const { status: s2, data: g2 } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Same Name", icon: "star", rooms: [r2] },
        });

        expect(s1).toBe(200);
        expect(s2).toBe(200);
        expect(g1.response!.id).not.toBe(g2.response!.id);
      });

      test("POST /files/group - two groups can share the same room", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Shared Room");

        const { status: s1 } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Shares A",
            icon: "star",
            rooms: [roomId],
          },
        });
        const { status: s2 } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Shares B",
            icon: "star",
            rooms: [roomId],
          },
        });

        expect(s1).toBe(200);
        expect(s2).toBe(200);
      });

      for (const icon of VALID_GROUP_ICONS) {
        test(`POST /files/group - Owner creates a group with icon "${icon}"`, async ({
          apiSdk,
        }) => {
          const owner = apiSdk.forRole("owner");
          const roomId = await createRoomId(owner.rooms, `Icon Room ${icon}`);

          const { data, status } = await owner.groups.addRoomGroup({
            roomGroupRequestDto: {
              name: `Icon ${icon}`,
              icon,
              rooms: [roomId],
            },
          });

          expect(status).toBe(200);
          expect(data.response!.icon!.id).toBe(icon);
        });
      }

      test("POST /files/group - long but valid name is accepted", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Long Name Room");
        const name = apiSdk.faker.generateString(64);

        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name, icon: "star", rooms: [roomId] },
        });

        expect(status).toBe(200);
        expect(data.response!.name).toBe(name);
      });

      const unicodeNames = [
        { label: "cyrillic", name: "Мои любимые комнаты" },
        { label: "hieroglyphs", name: "我的房间列表" },
        { label: "emoji", name: "Rooms 😀🚀🌟" },
        { label: "combining", name: "Café Ñoño déjà" },
        { label: "internal-spaces", name: "My favorite rooms" },
      ];
      for (const { label, name } of unicodeNames) {
        test(`POST /files/group - name with ${label} is stored intact`, async ({
          apiSdk,
        }) => {
          const owner = apiSdk.forRole("owner");
          const roomId = await createRoomId(owner.rooms, `Uni ${label}`);

          const { data, status } = await owner.groups.addRoomGroup({
            roomGroupRequestDto: { name, icon: "star", rooms: [roomId] },
          });

          expect(status).toBe(200);
          expect(data.response!.name).toBe(name);
        });
      }

      test("BUG 82573: POST /files/group - leading/trailing spaces in the name should be trimmed, but are stored verbatim", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Trim Room");

        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "  Padded Name  ",
            icon: "star",
            rooms: [roomId],
          },
        });

        expect(status).toBe(200);
        // Correct contract: the stored name is trimmed to "Padded Name".
        expect(data.response!.name).toBe("Padded Name");
      });

      test("POST /files/group - created group is retrievable via getRoomGroupInfo", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Retrieve Room");

        const { data: created } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Retrievable",
            icon: "heart",
            rooms: [roomId],
          },
        });
        const groupId = created.response!.id!;

        const { data: got, status } = await owner.groups.getRoomGroupInfo({
          id: groupId,
        });

        expect(status).toBe(200);
        expect(got.response!.id).toBe(groupId);
        expect(got.response!.name).toBe(created.response!.name);
        expect(got.response!.icon!.id).toBe(created.response!.icon!.id);
        expect(got.response!.totalRooms).toBe(created.response!.totalRooms);
      });

      test("POST /files/group - created group appears in getRoomGroups", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Listed Room");

        const { data: created } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "In The List",
            icon: "star",
            rooms: [roomId],
          },
        });

        const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
        const found = list.response!.find((g) => g.id === created.response!.id);
        expect(found).toBeDefined();
        expect(found!.name).toBe("In The List");
      });
    });

    // `rooms: null` and non-array → 400 (body validation); an EMPTY array →
    // 403 with the business message "At least one room must be provided"
    // (intended business rule, not a validation error).
    test.describe("rooms validation", () => {
      test("POST /files/group - empty rooms array is rejected and creates nothing", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const { status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Empty Rooms", icon: "star", rooms: [] },
        });
        // Business rule "at least one room" — the 403 code itself is debatable
        // (400/409 would be more conventional) but the request is correctly
        // refused; the important assertion is that nothing gets created.
        expect(status).toBe(403);

        const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
        expect(list.response!.map((g) => g.name)).not.toContain("Empty Rooms");
      });

      test("BUG 82575: POST /files/group - missing required rooms field should be a 400 body-validation error, not 403", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "No Rooms Field", icon: "star" },
        });
        expect(status).toBe(400);
      });

      test("POST /files/group - rooms: null returns 400", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "Null Rooms", icon: "star", rooms: null },
        });
        expect(status).toBe(400);
      });

      const nonArrayRooms: [string, unknown][] = [
        ["string", "abc"],
        ["number", 5],
        ["object", { a: 1 }],
      ];
      for (const [label, rooms] of nonArrayRooms) {
        test(`POST /files/group - rooms as ${label} returns 400`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            path: "",
            body: { name: `Rooms ${label}`, icon: "star", rooms },
          });
          expect(status).toBe(400);
        });
      }

      test("BUG 82575: POST /files/group - numeric-string room id should be a 400 type error, not coerced (currently 403 not-found)", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "String Id", icon: "star", rooms: ["999999"] },
        });
        expect(status).toBe(400);
      });

      test("BUG 82575: POST /files/group - null room element should be a 400 type error, not silently dropped (currently 403)", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "Null Elem", icon: "star", rooms: [null] },
        });
        expect(status).toBe(400);
      });

      test("BUG 82576: POST /files/group - fractional room id returns 500 instead of 400", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "Float Id", icon: "star", rooms: [1.5] },
        });
        expect(status).toBe(400);
      });

      test("BUG 82577: POST /files/group - non-existent room id should return 404, not 403", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "Room non-existent", icon: "star", rooms: [999999] },
        });
        expect(status).toBe(404);
      });

      const invalidValueIds: [string, number][] = [
        ["zero", 0],
        ["negative", -1],
      ];
      for (const [label, id] of invalidValueIds) {
        test(`BUG 82575: POST /files/group - ${label} room id should be a 400 invalid-value error, not 403`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            path: "",
            body: { name: `Room ${label}`, icon: "star", rooms: [id] },
          });
          expect(status).toBe(400);
        });
      }

      // Confirmed contract: the create is intentionally NOT atomic. The
      // response reports the non-existent room (403), but the group is still
      // created from the rooms that could be resolved.
      test("POST /files/group - mixed valid+non-existent rooms: refused with 403 but the group is still created (non-atomic by design)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const validId = await createRoomId(owner.rooms, "Atomic Valid");

        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: {
            name: "Atomic Create",
            icon: "star",
            rooms: [validId, 999999],
          },
        });

        const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
        expect(list.response!.map((g) => g.name)).toContain("Atomic Create");
        expect(status).toBe(403);
      });

      test("BUG 82587: POST /files/group - duplicate room ids cause 500 instead of dedup", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Dup Room");

        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "Dup Rooms", icon: "star", rooms: [roomId, roomId] },
        });

        // Correct contract: dedup and succeed with a single room.
        expect(status).toBe(200);
      });
    });

    test.describe("name validation", () => {
      const badNames: [string, unknown][] = [
        ["missing", undefined],
        ["null", null],
        ["empty", ""],
        ["whitespace-only", "   "],
      ];
      for (const [label, name] of badNames) {
        test(`POST /files/group - ${label} name returns 400`, async ({
          apiSdk,
        }) => {
          const roomId = await createRoomId(
            apiSdk.forRole("owner").rooms,
            "Nm",
          );
          const body: Record<string, unknown> = {
            icon: "star",
            rooms: [roomId],
          };
          if (name !== undefined) body.name = name;
          const { status } = await roomGroupRaw(apiSdk, { path: "", body });
          expect(status).toBe(400);
        });
      }

      test("POST /files/group - too long name returns 400 (not 500)", async ({
        apiSdk,
      }) => {
        const roomId = await createRoomId(
          apiSdk.forRole("owner").rooms,
          "TooLong",
        );
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: { name: "n".repeat(300), icon: "star", rooms: [roomId] },
        });
        expect(status).toBe(400);
      });
    });

    test.describe("icon validation", () => {
      // "none" is covered by the dedicated BUG 80921 regression test below.
      const badIcons: [string, unknown][] = [
        ["missing", undefined],
        ["null", null],
        ["empty", ""],
        ["whitespace-only", "   "],
        ["unknown", "invalid-icon-name"],
      ];
      for (const [label, icon] of badIcons) {
        test(`POST /files/group - ${label} icon returns 400`, async ({
          apiSdk,
        }) => {
          const roomId = await createRoomId(
            apiSdk.forRole("owner").rooms,
            "Ic",
          );
          const body: Record<string, unknown> = {
            name: "Icon Val",
            rooms: [roomId],
          };
          if (icon !== undefined) body.icon = icon;
          const { status } = await roomGroupRaw(apiSdk, { path: "", body });
          expect(status).toBe(400);
        });
      }

      test("BUG 80921: POST /files/group - invalid icon value 'none' returns 400", async ({
        apiSdk,
      }) => {
        const roomId = await createRoomId(
          apiSdk.forRole("owner").rooms,
          "Room for Invalid Icon Group",
        );

        const { status } = await apiSdk.forRole("owner").groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Invalid Icon Group",
            icon: "none",
            rooms: [roomId],
          },
        });

        expect(status).toBe(400);
      });
    });

    test.describe("body / method contract", () => {
      test("POST /files/group - empty body returns 400", async ({ apiSdk }) => {
        const { status } = await roomGroupRaw(apiSdk, { path: "", body: {} });
        expect(status).toBe(400);
      });

      test("POST /files/group - missing body returns 415", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          omitBody: true,
        });
        expect(status).toBe(415);
      });

      test("POST /files/group - malformed JSON returns 400 (not 500)", async ({
        apiSdk,
      }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: "{ not valid json ",
          contentType: "application/json",
        });
        expect(status).toBe(400);
      });

      test("POST /files/group - text/plain content type returns 415", async ({
        apiSdk,
      }) => {
        const roomId = await createRoomId(apiSdk.forRole("owner").rooms, "CT");
        const { status } = await roomGroupRaw(apiSdk, {
          path: "",
          body: JSON.stringify({ name: "CT", icon: "star", rooms: [roomId] }),
          contentType: "text/plain",
        });
        expect(status).toBe(415);
      });

      for (const method of ["PUT", "DELETE", "PATCH"]) {
        test(`${method} /files/group - unsupported method returns 405`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            method,
            path: "",
            body: {},
          });
          expect(status).toBe(405);
        });
      }
    });
  });

  test.describe("GET /files/group/{id}", () => {
    test("GET /files/group/:id - returns full DTO with matching fields", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const ids = await createRoomIds(owner.rooms, 2, "Info Room");
      const { id, data: created } = await createRoomGroup(owner.groups, {
        name: "Info Group",
        icon: "heart",
        rooms: ids,
      });

      const { data, status } = await owner.groups.getRoomGroupInfo({ id });

      expect(status).toBe(200);
      expectRoomGroupShape(data.response);
      expect(data.response!.id).toBe(id);
      expect(data.response!.name).toBe("Info Group");
      expect(data.response!.icon!.id).toBe("heart");
      expect(data.response!.userId).toBe(created.userId);
      expect(data.response!.totalRooms).toBe(2);
      expect(data.response!.totalRooms).toBe(data.response!.rooms!.length);
    });

    test("GET /files/group/:id - single-room group", async ({ apiSdk }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "One");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Single",
        rooms: [roomId],
      });

      const { data, status } = await owner.groups.getRoomGroupInfo({ id });
      expect(status).toBe(200);
      expect(data.response!.totalRooms).toBe(1);
      expect(data.response!.rooms!.map((r) => r.title)).toContain("One");
    });

    test("GET /files/group/:id - includeMembers=true and =false return consistent core fields", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Members Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Members Group",
        rooms: [roomId],
      });

      const { data: withMembers, status: s1 } =
        await owner.groups.getRoomGroupInfo({ id, includeMembers: true });
      const { data: without, status: s2 } = await owner.groups.getRoomGroupInfo(
        { id, includeMembers: false },
      );

      expect(s1).toBe(200);
      expect(s2).toBe(200);
      expect(withMembers.response!.id).toBe(without.response!.id);
      expect(withMembers.response!.name).toBe(without.response!.name);
      expect(withMembers.response!.totalRooms).toBe(
        without.response!.totalRooms,
      );
    });

    const notFoundIds = [
      "0",
      "-1",
      "999999",
      "1.5",
      "not-a-number",
      "99999999999999999999",
    ];
    for (const id of notFoundIds) {
      test(`GET /files/group/${id} - returns 404`, async ({ apiSdk }) => {
        const { status } = await roomGroupRaw(apiSdk, {
          method: "GET",
          path: `/${id}`,
        });
        expect(status).toBe(404);
      });
    }

    test("GET /files/group/:id - deleted group returns 404", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Del Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "To Delete",
        rooms: [roomId],
      });
      await owner.groups.deleteRoomGroup({ id });

      const { status } = await owner.groups.getRoomGroupInfo({ id });
      expect(status).toBe(404);
    });

    test("GET /files/group/:id - invalid includeMembers returns 400", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Bad Param");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Bad Param Group",
        rooms: [roomId],
      });

      const { status } = await roomGroupRaw(apiSdk, {
        method: "GET",
        path: `/${id}`,
        query: "includeMembers=abc",
      });
      expect(status).toBe(400);
    });
  });

  test.describe("GET /files/group", () => {
    test("GET /files/group - empty list when no groups exist", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const { data, status } = await owner.groups.getRoomGroups({ id: 0 });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/group - list with a single group and full structure", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "List One Room");
      await createRoomGroup(owner.groups, {
        name: "Only Group",
        rooms: [roomId],
      });

      const { data, status } = await owner.groups.getRoomGroups({ id: 0 });
      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expectRoomGroupShape(data.response![0]);
      expect(data.response![0].name).toBe("Only Group");
    });

    test("GET /files/group - all created groups are present with correct totalRooms", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [r1, r2, r3] = await createRoomIds(owner.rooms, 3, "List Room");
      await createRoomGroup(owner.groups, { name: "LG1", rooms: [r1] });
      await createRoomGroup(owner.groups, { name: "LG2", rooms: [r2, r3] });

      const { data } = await owner.groups.getRoomGroups({ id: 0 });
      const g1 = data.response!.find((g) => g.name === "LG1");
      const g2 = data.response!.find((g) => g.name === "LG2");
      expect(g1!.totalRooms).toBe(1);
      expect(g2!.totalRooms).toBe(2);
    });

    test("GET /files/group - deleted group disappears from the list", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Vanish Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Vanishing",
        rooms: [roomId],
      });

      await owner.groups.deleteRoomGroup({ id });

      const { data } = await owner.groups.getRoomGroups({ id: 0 });
      expect(data.response!.map((g) => g.id)).not.toContain(id);
    });

    test("GET /files/group - updated name and icon are reflected in the list", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Reflect Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Before Update",
        icon: "star",
        rooms: [roomId],
      });

      await owner.groups.updateRoomGroup({
        id,
        updateRoomGroupRequest: { groupName: "After Update" },
      });
      await owner.groups.changeRoomGroupIcon({
        id,
        iconRequest: { icon: "heart" },
      });

      const { data } = await owner.groups.getRoomGroups({ id: 0 });
      const g = data.response!.find((x) => x.id === id);
      expect(g!.name).toBe("After Update");
      expect(g!.icon!.id).toBe("heart");
    });

    test("GET /files/group - updated room set is reflected in the list", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [r1, r2] = await createRoomIds(owner.rooms, 2, "Set Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Set Group",
        rooms: [r1],
      });

      await owner.groups.updateRoomGroup({
        id,
        updateRoomGroupRequest: { roomsToAdd: [r2] },
      });

      const { data } = await owner.groups.getRoomGroups({ id: 0 });
      const g = data.response!.find((x) => x.id === id);
      expect(g!.totalRooms).toBe(2);
    });

    test("GET /files/group - SDK id parameter is rudimentary (123 behaves like 0)", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Rudiment Room");
      await createRoomGroup(owner.groups, {
        name: "Rudiment",
        rooms: [roomId],
      });

      const { data: zero } = await owner.groups.getRoomGroups({ id: 0 });
      const { data: onetwothree } = await owner.groups.getRoomGroups({
        id: 123,
      });
      expect(onetwothree.response!.map((g) => g.name).sort()).toEqual(
        zero.response!.map((g) => g.name).sort(),
      );
    });

    test("GET /files/group - raw request without id parameter still returns 200", async ({
      apiSdk,
    }) => {
      const { status } = await roomGroupRaw(apiSdk, {
        method: "GET",
        path: "",
      });
      expect(status).toBe(200);
    });

    test("GET /files/group - SDK throws locally when id is omitted", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      // id is required by the SDK (assertParamExists) even though the backend ignores it
      await expect(
        owner.groups.getRoomGroups({} as unknown as { id: number }),
      ).rejects.toThrow();
    });
  });

  test.describe("PUT /files/group/{id}", () => {
    test.describe("rename", () => {
      test("PUT /files/group/:id - renaming leaves icon and rooms untouched", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Rename Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Old Name",
          icon: "heart",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: "New Name" },
        });

        expect(status).toBe(200);
        expect(data.response!.name).toBe("New Name");
        expect(data.response!.icon!.id).toBe("heart");
        expect(data.response!.totalRooms).toBe(1);
        expect(data.response!.rooms!.map((r) => r.title)).toContain(
          "Rename Room",
        );
      });

      test("PUT /files/group/:id - rename to a Unicode name", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Uni Rename");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Plain",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: "Переименовано 名字 🎯" },
        });
        expect(status).toBe(200);
        expect(data.response!.name).toBe("Переименовано 名字 🎯");
      });

      test("PUT /files/group/:id - rename with internal spaces is preserved", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Space Rename");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Plain",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: "My favorite rooms" },
        });
        expect(status).toBe(200);
        expect(data.response!.name).toBe("My favorite rooms");
      });

      test("PUT /files/group/:id - rename to an existing group's name is allowed", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "DupRename");
        await createRoomGroup(owner.groups, { name: "Taken", rooms: [r1] });
        const { id } = await createRoomGroup(owner.groups, {
          name: "Original",
          rooms: [r2],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: "Taken" },
        });
        expect(status).toBe(200);
        expect(data.response!.name).toBe("Taken");
      });

      test("BUG 82590: PUT /files/group/:id - groupName: null is accepted as a no-op (200) but should be 400 like create", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "NullName Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Keep Me",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { groupName: null },
        });

        const after = await owner.groups.getRoomGroupInfo({ id });
        expect(after.data.response!.name).toBe("Keep Me");
        expect(status).toBe(400);
      });

      test("PUT /files/group/:id - too long name returns 400 without changing state", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "LongName Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Short",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { groupName: "n".repeat(300) },
        });
        expect(status).toBe(400);

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.name).toBe("Short");
      });

      test("BUG 82590: PUT /files/group/:id - empty name is accepted (200) but should be rejected (400)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "EmptyName Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Named",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { groupName: "" },
        });

        const after = await owner.groups.getRoomGroupInfo({ id });
        expect(after.data.response!.name).toBe("Named");
        expect(status).toBe(400);
      });

      test("BUG 82590: PUT /files/group/:id - whitespace-only name is accepted (200) but should be rejected (400)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "SpaceName Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Named",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { groupName: "   " },
        });

        const after = await owner.groups.getRoomGroupInfo({ id });
        expect(after.data.response!.name).toBe("Named");
        expect(status).toBe(400);
      });
    });

    test.describe("add rooms", () => {
      test("PUT /files/group/:id - add several rooms", async ({ apiSdk }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2, r3] = await createRoomIds(owner.rooms, 3, "AddMulti");
        const { id } = await createRoomGroup(owner.groups, {
          name: "AddMulti Group",
          rooms: [r1],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToAdd: [r2, r3] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(3);
      });

      test("PUT /files/group/:id - adding an already-present room is a no-op (no duplication)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "AlreadyIn");
        const { id } = await createRoomGroup(owner.groups, {
          name: "AlreadyIn Group",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToAdd: [roomId] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
      });

      test("PUT /files/group/:id - empty roomsToAdd is a no-op", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "EmptyAdd");
        const { id } = await createRoomGroup(owner.groups, {
          name: "EmptyAdd Group",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToAdd: [] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
      });

      test("BUG 82591: PUT /files/group/:id - roomsToAdd: null is accepted as a no-op (200) but should be 400 like create", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "NullAdd");
        const { id } = await createRoomGroup(owner.groups, {
          name: "NullAdd Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { roomsToAdd: null },
        });

        const after = await owner.groups.getRoomGroupInfo({ id });
        expect(after.data.response!.totalRooms).toBe(1);
        expect(status).toBe(400);
      });

      test("PUT /files/group/:id - adding a non-existent room leaves the group unchanged", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "AddMissing");
        const { id } = await createRoomGroup(owner.groups, {
          name: "AddMissing Group",
          rooms: [roomId],
        });

        await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { roomsToAdd: [999999] },
        });

        // No-side-effect invariant: the rejected room is not added.
        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.totalRooms).toBe(1);
      });

      test("BUG 82592: PUT /files/group/:id - adding a non-existent room should return 404, not 403", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "AddMissing404");
        const { id } = await createRoomGroup(owner.groups, {
          name: "AddMissing404 Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { roomsToAdd: [999999] },
        });
        expect(status).toBe(404);
      });

      // Confirmed contract: the update is intentionally NOT atomic, same as
      // create. The response reports the non-existent room (403), but the
      // rooms that could be resolved are still added.
      test("PUT /files/group/:id - adding valid+non-existent rooms: refused with 403 but the valid room is still added (non-atomic by design)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const seed = await createRoomId(owner.rooms, "AtomicSeed");
        const valid = await createRoomId(owner.rooms, "AtomicValidAdd");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Atomic Add Group",
          rooms: [seed],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { roomsToAdd: [valid, 999999] },
        });

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.rooms!.map((r) => r.title)).toContain(
          "AtomicValidAdd",
        );
        expect(status).toBe(403);
      });

      test("BUG 82594: PUT /files/group/:id - duplicate room ids in roomsToAdd cause 500 instead of dedup", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const seed = await createRoomId(owner.rooms, "DupAddSeed");
        const dup = await createRoomId(owner.rooms, "DupAddRoom");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Dup Add Group",
          rooms: [seed],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { roomsToAdd: [dup, dup] },
        });
        expect(status).toBe(200);
      });
    });

    test.describe("remove rooms", () => {
      test("PUT /files/group/:id - remove a room decreases totalRooms", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Remove");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Remove Group",
          rooms: [r1, r2],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToRemove: [r2] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
        expect(data.response!.rooms!.map((r) => r.title)).not.toContain(
          "Remove 2",
        );
      });

      test("PUT /files/group/:id - removing a valid room that is not a member is a no-op (200)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const member = await createRoomId(owner.rooms, "Member");
        const outsider = await createRoomId(owner.rooms, "Outsider");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Outsider Group",
          rooms: [member],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToRemove: [outsider] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
      });

      test("BUG 82595: PUT /files/group/:id - removing a non-existent room should return 404, not 403", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "RemoveMissing");
        const { id } = await createRoomGroup(owner.groups, {
          name: "RemoveMissing Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: { roomsToRemove: [999999] },
        });
        expect(status).toBe(404);
      });

      test("PUT /files/group/:id - empty roomsToRemove is a no-op", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "EmptyRemove");
        const { id } = await createRoomGroup(owner.groups, {
          name: "EmptyRemove Group",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToRemove: [] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
      });

      // By design: create refuses an empty group, but update MAY empty an
      // existing group by removing its last room (200). The asymmetry is
      // intentional, so this is a positive test.
      test("PUT /files/group/:id - removing the last room leaves an empty group (200)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Last");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Emptying Group",
          rooms: [r1, r2],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToRemove: [r1, r2] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(0);
        expect(data.response!.rooms).toEqual([]);
      });
    });

    test.describe("add and remove together", () => {
      test("PUT /files/group/:id - add one and remove another in a single request", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Swap");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Swap Group",
          rooms: [r1],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToAdd: [r2], roomsToRemove: [r1] },
        });
        expect(status).toBe(200);
        expect(data.response!.totalRooms).toBe(1);
        const titles = data.response!.rooms!.map((r) => r.title);
        expect(titles).toContain("Swap 2");
        expect(titles).not.toContain("Swap 1");
      });

      test("PUT /files/group/:id - rename and change rooms in one request", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Combo");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Combo Before",
          rooms: [r1],
        });

        const { data, status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: {
            groupName: "Combo After",
            roomsToAdd: [r2],
          },
        });
        expect(status).toBe(200);
        expect(data.response!.name).toBe("Combo After");
        expect(data.response!.totalRooms).toBe(2);
      });
    });

    test.describe("empty / malformed bodies", () => {
      test("PUT /files/group/:id - empty object body is a no-op (200)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "EmptyObj");
        const { id } = await createRoomGroup(owner.groups, {
          name: "EmptyObj Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: {},
        });
        expect(status).toBe(200);

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.name).toBe("EmptyObj Group");
        expect(data.response!.totalRooms).toBe(1);
      });

      test("PUT /files/group/:id - missing body returns 415", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "NoBody");
        const { id } = await createRoomGroup(owner.groups, {
          name: "NoBody Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          omitBody: true,
        });
        expect(status).toBe(415);
      });

      test("PUT /files/group/:id - malformed JSON returns 400", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "BadJson");
        const { id } = await createRoomGroup(owner.groups, {
          name: "BadJson Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: "{ broken",
          contentType: "application/json",
        });
        expect(status).toBe(400);
      });

      test("PUT /files/group/:id - text/plain content type returns 415", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "TextPlain");
        const { id } = await createRoomGroup(owner.groups, {
          name: "TextPlain Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "PUT",
          path: `/${id}`,
          body: JSON.stringify({ groupName: "X" }),
          contentType: "text/plain",
        });
        expect(status).toBe(415);
      });
    });

    test.describe("id", () => {
      const badIds = ["0", "-1", "999999", "not-a-number"];
      for (const id of badIds) {
        test(`PUT /files/group/${id} - non-addressable group returns 404`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            method: "PUT",
            path: `/${id}`,
            body: { groupName: "X" },
          });
          expect(status).toBe(404);
        });
      }

      test("PUT /files/group/:id - deleted group returns 404", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "DelUpd");
        const { id } = await createRoomGroup(owner.groups, {
          name: "DelUpd Group",
          rooms: [roomId],
        });
        await owner.groups.deleteRoomGroup({ id });

        const { status } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: "X" },
        });
        expect(status).toBe(404);
      });
    });

    test.describe("sequential updates", () => {
      test("PUT /files/group/:id - two sequential updates both apply", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Seq");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Seq One",
          rooms: [r1],
        });

        await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { groupName: "Seq Two" },
        });
        const { data } = await owner.groups.updateRoomGroup({
          id,
          updateRoomGroupRequest: { roomsToAdd: [r2] },
        });

        expect(data.response!.name).toBe("Seq Two");
        expect(data.response!.totalRooms).toBe(2);
      });
    });
  });

  test.describe("POST /files/group/{id}/icon", () => {
    test.describe("positive", () => {
      test("POST /files/group/:id/icon - new icon is reflected via getRoomGroupInfo and getRoomGroups", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Icon Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Icon Group",
          icon: "star",
          rooms: [roomId],
        });

        const { data, status } = await owner.groups.changeRoomGroupIcon({
          id,
          iconRequest: { icon: "heart" },
        });
        expect(status).toBe(200);
        expect(data.response!.id).toBe(id);

        const { data: info } = await owner.groups.getRoomGroupInfo({ id });
        expect(info.response!.icon!.id).toBe("heart");

        const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
        expect(list.response!.find((g) => g.id === id)!.icon!.id).toBe("heart");
      });

      test("POST /files/group/:id/icon - name and rooms are unchanged after an icon change", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Icon Keep Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Icon Keep",
          icon: "star",
          rooms: [roomId],
        });

        await owner.groups.changeRoomGroupIcon({
          id,
          iconRequest: { icon: "flag" },
        });

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.name).toBe("Icon Keep");
        expect(data.response!.totalRooms).toBe(1);
        expect(data.response!.rooms!.map((r) => r.title)).toContain(
          "Icon Keep Room",
        );
      });

      test("POST /files/group/:id/icon - sequential icon changes each take effect", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Seq Icon Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Seq Icon",
          icon: "star",
          rooms: [roomId],
        });

        for (const icon of ["heart", "flag", "folder"]) {
          const { status } = await owner.groups.changeRoomGroupIcon({
            id,
            iconRequest: { icon },
          });
          expect(status).toBe(200);
          const { data } = await owner.groups.getRoomGroupInfo({ id });
          expect(data.response!.icon!.id).toBe(icon);
        }
      });

      test("POST /files/group/:id/icon - re-applying the current icon is idempotent", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Idem Icon Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Idem Icon",
          icon: "heart",
          rooms: [roomId],
        });

        const { status } = await owner.groups.changeRoomGroupIcon({
          id,
          iconRequest: { icon: "heart" },
        });
        expect(status).toBe(200);

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.icon!.id).toBe("heart");
      });

      for (const icon of VALID_GROUP_ICONS) {
        test(`POST /files/group/:id/icon - accepts valid icon "${icon}"`, async ({
          apiSdk,
        }) => {
          const owner = apiSdk.forRole("owner");
          const roomId = await createRoomId(owner.rooms, `IconVal ${icon}`);
          const { id } = await createRoomGroup(owner.groups, {
            name: `IconVal ${icon}`,
            icon: "star",
            rooms: [roomId],
          });

          const { status } = await owner.groups.changeRoomGroupIcon({
            id,
            iconRequest: { icon },
          });
          expect(status).toBe(200);
          const { data } = await owner.groups.getRoomGroupInfo({ id });
          expect(data.response!.icon!.id).toBe(icon);
        });
      }
    });

    test.describe("no-op bodies", () => {
      test("POST /files/group/:id/icon - empty object body is a no-op (icon unchanged)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "NoopEmpty");
        const { id } = await createRoomGroup(owner.groups, {
          name: "NoopEmpty Group",
          icon: "heart",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "POST",
          path: `/${id}/icon`,
          body: {},
        });
        expect(status).toBe(200);

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.icon!.id).toBe("heart");
      });

      test("POST /files/group/:id/icon - icon: null is a no-op (icon unchanged)", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "NoopNull");
        const { id } = await createRoomGroup(owner.groups, {
          name: "NoopNull Group",
          icon: "heart",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "POST",
          path: `/${id}/icon`,
          body: { icon: null },
        });
        expect(status).toBe(200);

        const { data } = await owner.groups.getRoomGroupInfo({ id });
        expect(data.response!.icon!.id).toBe("heart");
      });
    });

    test.describe("validation", () => {
      const badIcons: [string, unknown][] = [
        ["whitespace-only", "   "],
        ["none", "none"],
        ["unknown", "invalid-icon-name"],
        ["number", 5],
        ["boolean", true],
        ["array", [1]],
        ["object", { a: 1 }],
        ["too-long", "x".repeat(300)],
      ];
      for (const [label, icon] of badIcons) {
        test(`POST /files/group/:id/icon - ${label} icon returns 400`, async ({
          apiSdk,
        }) => {
          const owner = apiSdk.forRole("owner");
          const roomId = await createRoomId(owner.rooms, `IconBad ${label}`);
          const { id } = await createRoomGroup(owner.groups, {
            name: `IconBad ${label}`,
            rooms: [roomId],
          });

          const { status } = await roomGroupRaw(apiSdk, {
            method: "POST",
            path: `/${id}/icon`,
            body: { icon },
          });
          expect(status).toBe(400);
        });
      }

      // Confirmed contract: unlike every other invalid icon value above, an
      // empty string is the accepted way to CLEAR the icon — 200 and the
      // stored icon is wiped (`icon: null` stays a no-op, see above).
      test("POST /files/group/:id/icon - empty-string icon is accepted (200) and clears the icon", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "EmptyIcon");
        const { id } = await createRoomGroup(owner.groups, {
          name: "EmptyIcon Group",
          icon: "heart",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "POST",
          path: `/${id}/icon`,
          body: { icon: "" },
        });
        expect(status).toBe(200);

        const after = await owner.groups.getRoomGroupInfo({ id });
        expect(after.data.response!.icon?.id).toBeUndefined();
      });

      test("POST /files/group/:id/icon - missing body returns 415", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "IconNoBody");
        const { id } = await createRoomGroup(owner.groups, {
          name: "IconNoBody Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "POST",
          path: `/${id}/icon`,
          omitBody: true,
        });
        expect(status).toBe(415);
      });

      test("POST /files/group/:id/icon - text/plain content type returns 415", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "IconTextPlain");
        const { id } = await createRoomGroup(owner.groups, {
          name: "IconTextPlain Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "POST",
          path: `/${id}/icon`,
          body: JSON.stringify({ icon: "heart" }),
          contentType: "text/plain",
        });
        expect(status).toBe(415);
      });
    });

    test.describe("id", () => {
      // 999999 (non-existent) is covered by the BUG 80922 regression test below.
      const badIds = ["0", "-1", "not-a-number"];
      for (const id of badIds) {
        test(`POST /files/group/${id}/icon - non-addressable group returns 404`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            method: "POST",
            path: `/${id}/icon`,
            body: { icon: "heart" },
          });
          expect(status).toBe(404);
        });
      }

      test("BUG 80922: POST /files/group/:id/icon - Owner gets 404 changing icon on non-existent group", async ({
        apiSdk,
      }) => {
        const { status } = await apiSdk
          .forRole("owner")
          .groups.changeRoomGroupIcon({
            id: 999999,
            iconRequest: { icon: "heart" },
          });
        expect(status).toBe(404);
      });

      test("POST /files/group/:id/icon - deleted group returns 404", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "IconDel");
        const { id } = await createRoomGroup(owner.groups, {
          name: "IconDel Group",
          rooms: [roomId],
        });
        await owner.groups.deleteRoomGroup({ id });

        const { status } = await owner.groups.changeRoomGroupIcon({
          id,
          iconRequest: { icon: "heart" },
        });
        expect(status).toBe(404);
      });
    });
  });

  test.describe("DELETE /files/group/{id}", () => {
    test.describe("positive", () => {
      test("DELETE /files/group/:id - deleted group disappears from getRoomGroups", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "DelList Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "DelList Group",
          rooms: [roomId],
        });

        const { status } = await owner.groups.deleteRoomGroup({ id });
        expect(status).toBe(200);

        const { data } = await owner.groups.getRoomGroups({ id: 0 });
        expect(data.response!.map((g) => g.id)).not.toContain(id);
      });

      test("DELETE /files/group/:id - deleting one group does not affect others", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Keep");
        const { id: toDelete } = await createRoomGroup(owner.groups, {
          name: "To Delete",
          rooms: [r1],
        });
        const { id: toKeep } = await createRoomGroup(owner.groups, {
          name: "To Keep",
          rooms: [r2],
        });

        await owner.groups.deleteRoomGroup({ id: toDelete });

        const { status } = await owner.groups.getRoomGroupInfo({ id: toKeep });
        expect(status).toBe(200);
      });

      test("DELETE /files/group/:id - deleting a group does not delete its rooms", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Surviving Room");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Room Survives Group",
          rooms: [roomId],
        });

        await owner.groups.deleteRoomGroup({ id });

        const { status } = await owner.rooms.getRoomInfo({ id: roomId });
        expect(status).toBe(200);
      });

      test("DELETE /files/group/:id - group with several rooms is deleted", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const ids = await createRoomIds(owner.rooms, 3, "MultiDel");
        const { id } = await createRoomGroup(owner.groups, {
          name: "MultiDel Group",
          rooms: ids,
        });

        const { status } = await owner.groups.deleteRoomGroup({ id });
        expect(status).toBe(200);
        const { status: getStatus } = await owner.groups.getRoomGroupInfo({
          id,
        });
        expect(getStatus).toBe(404);
      });

      test("DELETE /files/group/:id - includeMembers=true and =false both succeed", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "IncMembers");
        const { id: g1 } = await createRoomGroup(owner.groups, {
          name: "IncMembers True",
          rooms: [r1],
        });
        const { id: g2 } = await createRoomGroup(owner.groups, {
          name: "IncMembers False",
          rooms: [r2],
        });

        const { status: s1 } = await owner.groups.deleteRoomGroup({
          id: g1,
          includeMembers: true,
        });
        const { status: s2 } = await owner.groups.deleteRoomGroup({
          id: g2,
          includeMembers: false,
        });
        expect(s1).toBe(200);
        expect(s2).toBe(200);
      });

      test("DELETE /files/group/:id - a new group with the same name can be created afterwards", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const [r1, r2] = await createRoomIds(owner.rooms, 2, "Recreate");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Recreatable",
          rooms: [r1],
        });
        await owner.groups.deleteRoomGroup({ id });

        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Recreatable",
            icon: "star",
            rooms: [r2],
          },
        });
        expect(status).toBe(200);
        expect(data.response!.name).toBe("Recreatable");
      });
    });

    test.describe("idempotency and bad ids", () => {
      test("BUG 82596: DELETE /files/group/:id - repeating the delete should return 404 on the already-deleted group, not 200", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "Repeat Del");
        const { id } = await createRoomGroup(owner.groups, {
          name: "Repeat Del Group",
          rooms: [roomId],
        });

        const { status: first } = await owner.groups.deleteRoomGroup({ id });
        expect(first).toBe(200);

        const { status: second } = await owner.groups.deleteRoomGroup({ id });
        expect(second).toBe(404);
      });

      const missingIds = ["0", "-1", "999999"];
      for (const id of missingIds) {
        test(`BUG 82596: DELETE /files/group/${id} - non-existent id should return 404, not 200`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            method: "DELETE",
            path: `/${id}`,
          });
          expect(status).toBe(404);
        });
      }

      const routingFailIds = ["1.5", "not-a-number"];
      for (const id of routingFailIds) {
        test(`DELETE /files/group/${id} - non-integer id returns 404`, async ({
          apiSdk,
        }) => {
          const { status } = await roomGroupRaw(apiSdk, {
            method: "DELETE",
            path: `/${id}`,
          });
          expect(status).toBe(404);
        });
      }

      test("DELETE /files/group/:id - invalid includeMembers returns 400", async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const roomId = await createRoomId(owner.rooms, "DelBadParam");
        const { id } = await createRoomGroup(owner.groups, {
          name: "DelBadParam Group",
          rooms: [roomId],
        });

        const { status } = await roomGroupRaw(apiSdk, {
          method: "DELETE",
          path: `/${id}`,
          query: "includeMembers=abc",
        });
        expect(status).toBe(400);
      });
    });
  });

  test.describe("end-to-end CRUD", () => {
    test("full lifecycle: create -> get -> list -> rename -> add -> remove -> icon -> delete", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [r1, r2] = await createRoomIds(owner.rooms, 2, "Life");

      let groupId!: number;
      await test.step("create", async () => {
        const { data, status } = await owner.groups.addRoomGroup({
          roomGroupRequestDto: { name: "Lifecycle", icon: "star", rooms: [r1] },
        });
        expect(status).toBe(200);
        groupId = data.response!.id!;
      });

      await test.step("get by id", async () => {
        const { data, status } = await owner.groups.getRoomGroupInfo({
          id: groupId,
        });
        expect(status).toBe(200);
        expect(data.response!.name).toBe("Lifecycle");
      });

      await test.step("appears in list", async () => {
        const { data } = await owner.groups.getRoomGroups({ id: 0 });
        expect(data.response!.map((g) => g.id)).toContain(groupId);
      });

      await test.step("rename", async () => {
        const { data } = await owner.groups.updateRoomGroup({
          id: groupId,
          updateRoomGroupRequest: { groupName: "Lifecycle Renamed" },
        });
        expect(data.response!.name).toBe("Lifecycle Renamed");
      });

      await test.step("add a room", async () => {
        const { data } = await owner.groups.updateRoomGroup({
          id: groupId,
          updateRoomGroupRequest: { roomsToAdd: [r2] },
        });
        expect(data.response!.totalRooms).toBe(2);
      });

      await test.step("remove a room", async () => {
        const { data } = await owner.groups.updateRoomGroup({
          id: groupId,
          updateRoomGroupRequest: { roomsToRemove: [r1] },
        });
        expect(data.response!.totalRooms).toBe(1);
      });

      await test.step("change icon", async () => {
        const { data } = await owner.groups.changeRoomGroupIcon({
          id: groupId,
          iconRequest: { icon: "heart" },
        });
        expect(data.response!.icon!.id).toBe("heart");
      });

      await test.step("delete and confirm gone", async () => {
        const { status } = await owner.groups.deleteRoomGroup({ id: groupId });
        expect(status).toBe(200);
        const { status: getStatus } = await owner.groups.getRoomGroupInfo({
          id: groupId,
        });
        expect(getStatus).toBe(404);
      });
    });

    test("create -> rename leaves icon and rooms unchanged across all read methods", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "CR Rename");
      const { id } = await createRoomGroup(owner.groups, {
        name: "CR Before",
        icon: "flag",
        rooms: [roomId],
      });

      await owner.groups.updateRoomGroup({
        id,
        updateRoomGroupRequest: { groupName: "CR After" },
      });

      const { data: info } = await owner.groups.getRoomGroupInfo({ id });
      expect(info.response!.icon!.id).toBe("flag");
      expect(info.response!.totalRooms).toBe(1);

      const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
      const g = list.response!.find((x) => x.id === id)!;
      expect(g.name).toBe("CR After");
      expect(g.icon!.id).toBe("flag");
    });

    test("create -> add room is visible through getRoomGroupInfo and getRoomGroups", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [r1, r2] = await createRoomIds(owner.rooms, 2, "CR Add");
      const { id } = await createRoomGroup(owner.groups, {
        name: "CR Add Group",
        rooms: [r1],
      });

      const { data: upd } = await owner.groups.updateRoomGroup({
        id,
        updateRoomGroupRequest: { roomsToAdd: [r2] },
      });
      expect(upd.response!.totalRooms).toBe(2);

      const { data: info } = await owner.groups.getRoomGroupInfo({ id });
      expect(info.response!.totalRooms).toBe(2);

      const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
      expect(list.response!.find((x) => x.id === id)!.totalRooms).toBe(2);
    });

    test("create -> remove room is visible through getRoomGroupInfo and getRoomGroups", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const [r1, r2] = await createRoomIds(owner.rooms, 2, "CR Remove");
      const { id } = await createRoomGroup(owner.groups, {
        name: "CR Remove Group",
        rooms: [r1, r2],
      });

      await owner.groups.updateRoomGroup({
        id,
        updateRoomGroupRequest: { roomsToRemove: [r2] },
      });

      const { data: info } = await owner.groups.getRoomGroupInfo({ id });
      expect(info.response!.totalRooms).toBe(1);

      const { data: list } = await owner.groups.getRoomGroups({ id: 0 });
      expect(list.response!.find((x) => x.id === id)!.totalRooms).toBe(1);
    });

    test("renaming a room is reflected in the group's room list", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Room Old Title");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Room Rename Group",
        rooms: [roomId],
      });

      await owner.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Room New Title" },
      });

      const { data } = await owner.groups.getRoomGroupInfo({ id });
      expect(data.response!.rooms!.map((r) => r.title)).toContain(
        "Room New Title",
      );
    });

    test("BUG 82601: archiving the only room should empty the group (0), unarchiving should restore it (1)", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Archive Member");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Archive Member Group",
        rooms: [roomId],
      });

      await owner.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(owner.operations);

      const { data: archived } = await owner.groups.getRoomGroupInfo({ id });
      expect(archived.response!.totalRooms).toBe(0);
      expect(archived.response!.rooms).toEqual([]);

      await owner.rooms.unarchiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(owner.operations);

      // Unarchiving restores membership in the same group.
      const { data: restored } = await owner.groups.getRoomGroupInfo({ id });
      expect(restored.response!.totalRooms).toBe(1);
      expect(restored.response!.rooms!.map((r) => r.title)).toContain(
        "Archive Member",
      );
    });

    test("a room archived and then unarchived returns to the same group", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "RoundTrip Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "RoundTrip Group",
        rooms: [roomId],
      });

      await owner.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(owner.operations);

      await owner.rooms.unarchiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(owner.operations);

      // After the archive -> unarchive round-trip the room is back in the very
      // same group it belonged to.
      const { data } = await owner.groups.getRoomGroupInfo({ id });
      expect(data.response!.rooms!.map((r) => r.title)).toContain(
        "RoundTrip Room",
      );
      expect(data.response!.totalRooms).toBe(1);
    });

    test("deleting a room removes it from the group (no dangling reference)", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Doomed Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Doomed Room Group",
        rooms: [roomId],
      });

      await owner.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(owner.operations);
      await owner.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(owner.operations);

      const { data } = await owner.groups.getRoomGroupInfo({ id });
      expect(data.response!.totalRooms).toBe(0);
      expect(data.response!.rooms).toEqual([]);
    });

    test("a group persists and stays accessible after the owner re-authenticates", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createRoomId(owner.rooms, "Persist Room");
      const { id } = await createRoomGroup(owner.groups, {
        name: "Persistent Group",
        rooms: [roomId],
      });

      const reOwner = await apiSdk.authenticateOwner();
      const { data, status } = await reOwner.groups.getRoomGroupInfo({ id });
      expect(status).toBe(200);
      expect(data.response!.name).toBe("Persistent Group");
    });
  });
});
