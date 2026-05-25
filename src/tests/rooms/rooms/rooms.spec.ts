import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomsApi,
  RoomType,
  FileShare,
  LinkType,
  SearchArea,
  RoomDataLifetimePeriod,
} from "@onlyoffice/docspace-api-sdk";
import { createAllRoomTypes } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomFromTemplate } from "@/src/helpers/wait-for-room-from-template";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";
import { createTestImageBuffer } from "@/src/utils/test-image";

function filterRoomsFolder(rooms: RoomsApi, filterValue: string) {
  return rooms.getRoomsFolder({
    filterValue,
  });
}

test.describe("API rooms methods", () => {
  test.describe("POST /files/rooms", () => {
    test("POST /files/rooms - Owner creates a Custom room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Custom Room",
          roomType: RoomType.CustomRoom,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Custom Room");
      expect(data.response!.roomType).toBe(RoomType.CustomRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Collaboration room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Collaboration Room",
          roomType: RoomType.EditingRoom,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Collaboration Room");
      expect(data.response!.roomType).toBe(RoomType.EditingRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Form Filling Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Form Filling Room");
      expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Public room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Public Room",
          roomType: RoomType.PublicRoom,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Public Room");
      expect(data.response!.roomType).toBe(RoomType.PublicRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Owner creates a Virtual data room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Virtual Data Room",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Virtual Data Room");
      expect(data.response!.roomType).toBe(RoomType.VirtualDataRoom);
      expect(data.response!.id!).toBeGreaterThan(0);
    });

    test("POST /files/rooms - Minimal payload applies safe defaults", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Defaults",
          roomType: RoomType.CustomRoom,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.private).toBe(false);
      expect(data.response!.indexing).toBe(false);
      expect(data.response!.denyDownload).toBe(false);
      expect(data.response!.pinned).toBe(false);
    });

    test("POST /files/rooms - Created room is accessible via getRoomInfo", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetInfo",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data: info, status } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });
      expect(status).toBe(200);
      expect(info.response!.id).toBe(roomId);
      expect(info.response!.title).toBe(created.response!.title);
      expect(info.response!.roomType).toBe(created.response!.roomType);
    });

    test("POST /files/rooms - Multiple rooms with the same title are allowed and have unique IDs", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const title = "Duplicate Title";
      const r1 = await ownerApi.rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      const r2 = await ownerApi.rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.data.response!.id).not.toBe(r2.data.response!.id);
      expect(r1.data.response!.title).toBe(title);
      expect(r2.data.response!.title).toBe(title);
    });

    test("POST /files/rooms - Multiple rooms have unique IDs", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ids: number[] = [];
      for (let i = 0; i < 5; i++) {
        const { data } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Unique ${i}`,
            roomType: RoomType.CustomRoom,
          },
        });
        ids.push(data.response!.id!);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  test.describe("POST /files/rooms - title boundaries", () => {
    test("POST /files/rooms - Long valid title (100 chars) is accepted", async ({
      apiSdk,
    }) => {
      const title = "A".repeat(100);
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe(title);
    });

    test("POST /files/rooms - Unicode title: CJK preserved, emoji sanitized to underscores", async ({
      apiSdk,
    }) => {
      const title = "Room 🎉 测试 ファイル";
      const expected = "Room __ 测试 ファイル";
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe(expected);
    });

    test("POST /files/rooms - Special characters in title are sanitized to underscores", async ({
      apiSdk,
    }) => {
      // API replaces ", \, <, > with "_"; & is preserved.
      const title = `Room "with" \\slashes & <html> tags`;
      const expected = `Room _with_ _slashes & _html_ tags`;
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe(expected);
    });

    test("POST /files/rooms - SQL-injection-like title is stored without server error", async ({
      apiSdk,
    }) => {
      const title = "'; DROP TABLE rooms; --";
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(status).toBe(200);
      // Apostrophe, semicolon, dash are not in the forbidden set — stored as-is.
      expect(data.response!.title).toBe(title);
    });

    test("POST /files/rooms - XSS payload in title is sanitized (no server error)", async ({
      apiSdk,
    }) => {
      // <, >, /, " are all replaced with "_".
      const title = `<script>alert("xss")</script>`;
      const expected = `_script_alert(_xss_)__script_`;
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe(expected);
    });

    test("POST /files/rooms - Mixed RTL/LTR title is preserved", async ({
      apiSdk,
    }) => {
      const title = "Mixed العربية 中文 עברית text";
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe(title);
    });
  });

  test.describe("POST /files/rooms - optional fields", () => {
    test("POST /files/rooms - Owner creates a room with custom quota (verified via getRoomInfo)", async ({
      apiSdk,
      paymentsApi,
    }) => {
      // Portal must be paid before quota settings can be enabled.
      await paymentsApi.setupPayment();

      const ownerApi = apiSdk.forRole("owner");
      const myquota = 10 * 1024 * 1024;

      // Per-room quota must be enabled portal-wide first, otherwise quota in createRoom is ignored.
      await ownerApi.settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: {
          enableQuota: true,
          defaultQuota: 100 * 1024 * 1024,
        },
      });

      // createRoom response omits quotaLimit even when quota is set; verify via getRoomInfo.
      const { data: created, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Quota",
          roomType: RoomType.CustomRoom,
          quota: myquota,
        },
      });
      expect(status).toBe(200);
      const roomId = created.response!.id!;

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.quotaLimit).toBe(myquota);
    });

    test("POST /files/rooms - Owner creates a VDR with indexing enabled", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Indexing",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.indexing).toBe(true);
    });

    test("POST /files/rooms - Owner creates a VDR with denyDownload", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest DenyDownload",
          roomType: RoomType.VirtualDataRoom,
          denyDownload: true,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.denyDownload).toBe(true);
    });

    test("POST /files/rooms - Owner creates a VDR with lifetime settings (verified via getRoomInfo)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      // `enabled` is not part of the working request shape — proven by the updateRoom VDR test below.
      // Setting period+value+deletePermanently is enough to enable lifetime.
      const lifetime = {
        period: RoomDataLifetimePeriod.Day,
        value: 30,
        deletePermanently: false,
      };
      const { data: created, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Lifetime",
          roomType: RoomType.VirtualDataRoom,
          lifetime,
        },
      });
      expect(status).toBe(200);
      const roomId = created.response!.id!;

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.lifetime?.period).toBe(RoomDataLifetimePeriod.Day);
      expect(info.response!.lifetime?.value).toBe(30);
      expect(info.response!.lifetime?.deletePermanently).toBe(false);
    });

    test("POST /files/rooms - Owner creates a VDR with watermark", async ({
      apiSdk,
    }) => {
      const watermark = { enabled: true, text: "Confidential", rotate: -45 };
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Watermark",
          roomType: RoomType.VirtualDataRoom,
          watermark,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.watermark?.text).toBe("Confidential");
    });

    test("POST /files/rooms - Owner creates a room with tags attached", async ({
      apiSdk,
    }) => {
      const tags = ["Autotest Alpha", "Autotest Beta"];
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Tags",
          roomType: RoomType.CustomRoom,
          tags,
        },
      });
      expect(status).toBe(200);
      const returned = (data.response!.tags ?? []) as string[];
      for (const t of tags) {
        expect(returned).toContain(t);
      }
    });

    test("POST /files/rooms - Tags created during room creation appear in tag list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const stamp = Date.now();
      const tags = [`autotest-create-${stamp}-a`, `autotest-create-${stamp}-b`];
      const { status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest TagsAutoCreate",
          roomType: RoomType.CustomRoom,
          tags,
        },
      });
      expect(status).toBe(200);

      const { data: tagList } = await ownerApi.rooms.getRoomTagsInfo();
      const all = tagList.response as unknown as string[];
      for (const t of tags) {
        expect(all).toContain(t);
      }
    });

    test("POST /files/rooms - Duplicate tags in request are deduplicated", async ({
      apiSdk,
    }) => {
      const tags = ["autotest-dup", "autotest-dup", "autotest-dup"];
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest DupTags",
          roomType: RoomType.CustomRoom,
          tags,
        },
      });
      expect(status).toBe(200);
      const returned = (data.response!.tags ?? []) as string[];
      const occurrences = returned.filter((t) => t === "autotest-dup").length;
      expect(occurrences).toBe(1);
    });

    test("POST /files/rooms - Owner creates a room with color", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Color",
          roomType: RoomType.CustomRoom,
          color: "FF5733",
        },
      });
      expect(status).toBe(200);
      expect(data.response!.logo?.color).toBe("FF5733");
    });

    test("POST /files/rooms - Owner creates a room with cover", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;

      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Cover",
          roomType: RoomType.CustomRoom,
          cover: coverId,
        },
      });
      expect(status).toBe(200);
      expect(data.response!.logo?.cover?.id).toBe(coverId);
    });

    test.fail(
      "BUG 81582: POST /files/rooms - API silently accepts the undocumented `share` parameter (should reject it, since it is not a real feature)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: memberData } = await apiSdk.addMember("owner", "User");
        const userId = memberData.response!.id!;

        const { status } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest ShareOnCreate",
            roomType: RoomType.CustomRoom,
            share: [{ shareTo: userId, access: FileShare.Editing }],
          },
        });

        // The `share` parameter must not be exposed by createRoom at all
        // (the field appears in OpenAPI/SDK by mistake — no backing implementation).
        // Today the server returns 200 and silently ignores share — that is the bug.
        expect(status).toBe(400);
      },
    );
  });

  test.describe("POST /files/rooms - validation", () => {
    test("POST /files/rooms - Missing title returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          roomType: RoomType.CustomRoom,
        } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Null title returns 400", async ({ apiSdk }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: null,
          roomType: RoomType.CustomRoom,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Empty title returns 400", async ({ apiSdk }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title: "", roomType: RoomType.CustomRoom },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Whitespace-only title returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title: "   ", roomType: RoomType.CustomRoom },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Missing roomType returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title: "Autotest" } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Null roomType returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: null,
        } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Unknown roomType returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: 99999,
        } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Excessively long title (1000 chars) returns 400", async ({
      apiSdk,
    }) => {
      const title = "A".repeat(1000);
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Negative quota is rejected or normalized", async ({
      apiSdk,
      paymentsApi,
    }) => {
      // Portal must be paid before quota settings can be enabled.
      await paymentsApi.setupPayment();

      const ownerApi = apiSdk.forRole("owner");
      const myquota = -100;

      await ownerApi.settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: {
          enableQuota: true,
          defaultQuota: 100 * 1024 * 1024,
        },
      });

      const { data: created, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest NegativeQuota",
          roomType: RoomType.CustomRoom,
          quota: myquota,
        },
      });
      expect(status).toBe(200);
      const roomId = created.response!.id!;

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(
        info.response!.quotaLimit,
        `Negative quota ${myquota} was accepted; getRoomInfo returned quotaLimit=${info.response!.quotaLimit}`,
      ).toBeGreaterThanOrEqual(0);
    });

    test("POST /files/rooms - Invalid lifetime period returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: RoomType.VirtualDataRoom,
          lifetime: { period: 999, value: 10, enabled: true } as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Invalid color (not hex) returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: RoomType.CustomRoom,
          color: "not-a-color",
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Non-existent cover ID returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: RoomType.CustomRoom,
          cover: "this-cover-does-not-exist",
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Invalid tags type (string instead of array) returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: RoomType.CustomRoom,
          tags: "not-an-array",
        } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Null tags is treated as no-op", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest NullTags",
          roomType: RoomType.CustomRoom,
          tags: null,
        },
      });
      expect(status).toBe(200);
      expect((data.response!.tags ?? []).length).toBe(0);
    });

    test("POST /files/rooms - Invalid share payload returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: RoomType.CustomRoom,
          share: "broken",
        } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Invalid chatSettings returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest",
          roomType: RoomType.CustomRoom,
          chatSettings: "broken",
        } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms - Unknown extra fields are silently ignored", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Extra",
          roomType: RoomType.CustomRoom,
          unknownField: "should be ignored",
          somethingElse: 42,
        } as any,
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Extra");
    });
  });

  test.describe("POST /files/rooms - edge cases", () => {
    test("POST /files/rooms - Parallel creation of 5 rooms produces 5 unique IDs", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          ownerApi.rooms.createRoom({
            createRoomRequestDto: {
              title: `Autotest Parallel ${i}`,
              roomType: RoomType.CustomRoom,
            },
          }),
        ),
      );
      for (const r of results) {
        expect(r.status).toBe(200);
      }
      const ids = results.map((r) => r.data.response!.id!);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("POST /files/rooms - Rapid identical requests all succeed and produce unique rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const payload = {
        title: "Autotest Rapid",
        roomType: RoomType.CustomRoom,
      };
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const { data, status } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: payload,
        });
        expect(status).toBe(200);
        ids.push(data.response!.id!);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("POST /files/rooms - Large tags array (50 tags) is accepted", async ({
      apiSdk,
    }) => {
      const stamp = Date.now();
      const tags = Array.from(
        { length: 50 },
        (_, i) => `autotest-bulk-${stamp}-${i}`,
      );
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest LargePayload",
          roomType: RoomType.CustomRoom,
          tags,
        },
      });
      expect(status).toBe(200);
      expect((data.response!.tags ?? []).length).toBeGreaterThanOrEqual(
        tags.length,
      );
    });

    test("POST /files/rooms - Response has expected schema fields", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Schema",
          roomType: RoomType.CustomRoom,
        },
      });
      expect(status).toBe(200);
      const r = data.response!;
      expect(typeof r.id).toBe("number");
      expect(typeof r.title).toBe("string");
      expect(typeof r.roomType).toBe("number");
      expect(r.created).toBeDefined();
      expect(r.createdBy).toBeDefined();
    });

    test("POST /files/rooms - Response does not leak sensitive fields", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Leak",
          roomType: RoomType.CustomRoom,
        },
      });
      const json = JSON.stringify(data);
      expect(json).not.toMatch(/"password"\s*:/i);
      expect(json).not.toMatch(/"bearer"\s*:/i);
      expect(json).not.toMatch(/"connectionstring"\s*:/i);
      expect(json).not.toMatch(/"secret"\s*:/i);
    });
  });

  test("GET /files/rooms - Owner gets rooms list", async ({ api, apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await createAllRoomTypes(apiSdk, "owner");

    await test.step("returns all created rooms with correct count", async () => {
      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.folders!.length).toBe(5);
      expect((data.response!.files as unknown[]).length).toBe(0);
      expect(data.response!.count).toBe(5);
      expect(data.response!.total).toBe(5);
      expect(data.response!.startIndex).toBe(0);
      expect(data.response!.folders![0].ownedBy!.id).toBe(api.adminUserId);
    });

    await test.step("filter by type returns only matching rooms", async () => {
      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.CustomRoom],
      });

      expect(status).toBe(200);
      expect(data.response!.total).toBe(1);
      // TODO(sdk): FolderContentDtoInteger.folders typed as FileEntryBaseDto[] - roomType field missing
      expect((data.response!.folders as any[])[0].roomType).toBe(
        RoomType.CustomRoom,
      );
    });

    await test.step("filterValue search by title", async () => {
      const { data, status } = await filterRoomsFolder(
        ownerApi.rooms,
        "Autotest VDR",
      );

      expect(status).toBe(200);
      expect(data.response!.count).toBe(1);
      expect(data.response!.folders![0].title as string).toContain(
        "Autotest VDR",
      );
    });
  });

  test.describe("PUT /files/rooms/:id", () => {
    test("PUT /files/rooms/:id - Owner updates room title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room Before Update",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      await test.step("update title", async () => {
        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            title: "Autotest Room After Update",
          },
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Autotest Room After Update");
        expect(data.response!.id).toBe(roomId);
      });

      await test.step("GET /files/rooms/:id - confirms title changed", async () => {
        const { data, status } = await ownerApi.rooms.getRoomInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Autotest Room After Update");
      });
    });

    test("PUT /files/rooms/:id - Owner updates all allowed fields for VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest VDR Room",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const roomId = createData.response!.id!;

      await test.step("update all fields", async () => {
        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            title: "Updated VDR Room",
            indexing: true,
            denyDownload: true,
            lifetime: {
              deletePermanently: true,
              period: 0,
              value: 30,
              enabled: true,
            },
            watermark: {
              enabled: true,
              additions: 1,
              text: "Confidential",
              rotate: 0,
              imageScale: 100,
            },
            color: "FF5733",
          },
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Updated VDR Room");
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
        expect(data.response!.logo?.color).toBe("FF5733");
        expect(data.response!.lifetime?.period).toBe(0);
        expect(data.response!.lifetime?.value).toBe(30);
        expect(data.response!.lifetime?.deletePermanently).toBe(true);
        expect(data.response!.watermark?.additions).toBe(1);
        expect(data.response!.watermark?.text).toBe("Confidential");
        expect(data.response!.watermark?.rotate).toBe(0);
        expect(data.response!.watermark?.imageScale).toBe(100);
      });

      await test.step("GET /files/rooms/:id - verify all fields saved", async () => {
        const { data, status } = await ownerApi.rooms.getRoomInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Updated VDR Room");
        expect(data.response!.indexing).toBe(true);
        expect(data.response!.denyDownload).toBe(true);
        expect(data.response!.logo?.color).toBe("FF5733");
        expect(data.response!.lifetime?.period).toBe(0);
        expect(data.response!.lifetime?.value).toBe(30);
        expect(data.response!.watermark?.additions).toBe(1);
        expect(data.response!.watermark?.text).toBe("Confidential");
      });
    });

    // TODO: Need clarification - should API reject VDR-only fields on non-VDR rooms or is this expected behavior?
    test.skip("PUT /files/rooms/:id - Set VDR-only fields on CustomRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Custom Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
          indexing: true,
          denyDownload: true,
          lifetime: {
            deletePermanently: true,
            period: 0,
            value: 30,
            enabled: true,
          },
          watermark: {
            enabled: true,
            additions: 1,
            text: "Confidential",
            rotate: 0,
            imageScale: 100,
          },
        },
      });
      expect(status).toBe(200);
      expect(data.response!.indexing).toBe(true);
      expect(data.response!.denyDownload).toBe(true);
    });

    test("PUT /files/rooms/:id - Update room with empty title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
          title: "",
        },
      });

      // API ignores empty title and keeps the original value
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Room");
    });

    // Room IDs are globally unique, so the API returns 403 instead of 404
    // to prevent enumeration of existing room IDs
    test("PUT /files/rooms/:id - Update non-existent room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.updateRoom({
        id: 999999999,
        updateRoomRequest: {
          title: "Does Not Exist",
        },
      });

      expect(data.statusCode).toBe(403);
    });
  });

  test.describe("PUT /files/rooms/:id/archive", () => {
    test("PUT /files/rooms/:id/archive - Owner archives own room: status, lists, full unarchive cycle", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Lifecycle Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      await test.step("archive returns 200 and operation finishes", async () => {
        const { status } = await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        const operation = await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(operation.finished).toBe(true);
        expect(operation.error).toBe("");
      });

      await test.step("archived room is in Archive list", async () => {
        const { data } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Archive,
        });
        const ids = data.response!.folders!.map((f) => (f as any).id);
        expect(ids).toContain(roomId);
      });

      await test.step("archived room is not in Active list", async () => {
        const { data } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Active,
        });
        const ids = data.response!.folders!.map((f) => (f as any).id);
        expect(ids).not.toContain(roomId);
      });

      await test.step("unarchive returns 200 and operation finishes", async () => {
        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        const operation = await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(operation.finished).toBe(true);
        expect(operation.error).toBe("");
      });

      await test.step("unarchived room is back in Active list", async () => {
        const { data } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Active,
        });
        const ids = data.response!.folders!.map((f) => (f as any).id);
        expect(ids).toContain(roomId);
      });

      await test.step("unarchived room is not in Archive list anymore", async () => {
        const { data } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Archive,
        });
        const ids = data.response!.folders!.map((f) => (f as any).id);
        expect(ids).not.toContain(roomId);
      });
    });

    test("PUT /files/rooms/:id/archive - Room content (file and folder) is preserved after archive", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Content Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest File Before Archive" },
      });
      const fileId = fileData.response!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest Folder Before Archive" },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data: folderContent, status } =
        await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

      expect(status).toBe(200);
      const folderIds = (folderContent.response!.folders ?? []).map(
        (f) => (f as any).id,
      );
      const fileIds = (folderContent.response!.files ?? []).map(
        (f) => (f as any).id,
      );
      expect(folderIds).toContain(folderId);
      expect(fileIds).toContain(fileId);
    });

    test("PUT /files/rooms/:id/archive - Archived room is read-only: write operations are forbidden", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "AutotestArchiveReadonlyTag" },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive ReadOnly Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      await test.step("createFolder in archived room is forbidden", async () => {
        const { status } = await ownerApi.folders.createFolder({
          folderId: roomId,
          createFolder: { title: "Autotest Folder In Archive" },
        });
        expect(status).toBe(403);
      });

      await test.step("updateRoom (rename) on archived room is forbidden", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { title: "Renamed Archived Room" },
        });
        expect(status).toBe(403);
      });

      await test.step("addRoomTags on archived room is forbidden", async () => {
        const { status } = await ownerApi.rooms.addRoomTags({
          id: roomId,
          batchTagsRequestDto: { names: ["AutotestArchiveReadonlyTag"] },
        });
        expect(status).toBe(403);
      });

      await test.step("setRoomSecurity on archived room is forbidden", async () => {
        const { status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.Editing }],
            notify: false,
          },
        });
        expect(status).toBe(403);
      });
    });

    test("BUG 81551: POST /files/{folderId}/file - createFile in archived room returns 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive ReadOnly Room For createFile",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest File In Archive" },
      });

      expect(status).toBe(403);
    });

    test("PUT /files/rooms/:id/archive - Metadata (title, roomType, tags) is preserved through archive → unarchive", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "AutotestMetaTagA" },
      });
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "AutotestMetaTagB" },
      });

      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Metadata Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: {
          names: ["AutotestMetaTagA", "AutotestMetaTagB"],
        },
      });

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      await ownerApi.rooms.unarchiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Archive Metadata Room");
      expect(data.response!.roomType).toBe(RoomType.CustomRoom);
      const tags = (data.response!.tags as string[]) ?? [];
      expect(tags).toContain("AutotestMetaTagA");
      expect(tags).toContain("AutotestMetaTagB");
    });

    test("PUT /files/rooms/:id/archive - Null deleteAfter returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Null deleteAfter",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: null as any },
      });

      expect(status).toBe(400);
    });

    test("PUT /files/rooms/:id/archive - Invalid deleteAfter type (string) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Invalid deleteAfter Type",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: "false" as any },
      });

      expect(status).toBe(400);
    });
  });

  test("PUT /files/rooms/:id/pin and unpin", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Pin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await test.step("pin room", async () => {
      const { data, status } = await ownerApi.rooms.pinRoom({ id: roomId });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    await test.step("unpin room", async () => {
      const { data, status } = await ownerApi.rooms.unpinRoom({ id: roomId });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });
  });

  test.describe("POST /files/roomtemplate", () => {
    test("POST /files/roomtemplate - Owner creates a room template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("create room template", async () => {
        const { data, status } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId,
            title: "Autotest Template",
          },
        });

        expect(status).toBe(200);
        expect(data.response!.error).toBeFalsy();
      });

      await test.step("GET /files/roomtemplate/status - check template status", async () => {
        await expect(async () => {
          const { data, status } =
            await ownerApi.rooms.getRoomTemplateCreatingStatus();
          expect(status).toBe(200);
          expect(data.response!.isCompleted).toBe(true);
        }).toPass({
          intervals: [1_000, 2_000, 5_000],
          timeout: 30_000,
        });

        const { data } = await ownerApi.rooms.getRoomTemplateCreatingStatus();
        expect(data.response!.templateId!).toBeGreaterThan(0);
        expect(data.response!.error).toBeFalsy();
      });
    });

    test("POST /files/roomtemplate - Owner sets and gets room template public settings", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId,
          title: "Autotest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await test.step("GET /files/roomtemplate/:id/public - check default is false", async () => {
        const { data, status } = await ownerApi.rooms.getPublicSettings({
          id: templateId,
        });

        expect(status).toBe(200);
        expect(data.response).toBe(false);
      });

      await test.step("PUT /files/roomtemplate/public - set public to true", async () => {
        const { status } = await ownerApi.rooms.setPublicSettings({
          setPublicDto: {
            id: templateId,
            public: true,
          },
        });

        expect(status).toBe(200);
      });

      await test.step("GET /files/roomtemplate/:id/public - verify changed to true", async () => {
        const { data, status } = await ownerApi.rooms.getPublicSettings({
          id: templateId,
        });

        expect(status).toBe(200);
        expect(data.response).toBe(true);
      });
    });

    // === GET /files/roomtemplate/:id/public - getPublicSettings ===

    test("GET /files/roomtemplate/:id/public - Returns false when template created with explicit public:false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest PublicExplicitFalse Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest PublicExplicitFalse Template",
          public: false,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });

    test("GET /files/roomtemplate/:id/public - Reflects toggle true -> false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest TogglePublicDown Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest TogglePublicDown Template",
          public: true,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: false },
      });

      const { data, status } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });

    test("GET /files/roomtemplate/:id/public - Stable across multiple calls and does not mutate state", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest StableGet Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest StableGet Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const results: boolean[] = [];
      for (let i = 0; i < 3; i++) {
        const { data, status } = await ownerApi.rooms.getPublicSettings({
          id: templateId,
        });
        expect(status).toBe(200);
        results.push(data.response as boolean);
      }
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe(false);
    });

    test("GET /files/roomtemplate/:id/public - Response is a plain boolean, not a nested object", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest PublicShape Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest PublicShape Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(typeof data.response).toBe("boolean");
    });

    test("GET /files/roomtemplate/:id/public - Reflects last value after multiple toggles", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MultiToggle Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest MultiToggle Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      for (const expected of [true, false, true, false]) {
        await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: templateId, public: expected },
        });
        const { data, status } = await ownerApi.rooms.getPublicSettings({
          id: templateId,
        });
        expect(status).toBe(200);
        expect(data.response).toBe(expected);
      }
    });

    test("GET /files/roomtemplate/:id/public - Toggling public flag does not break creating a room from template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest ToggleThenUse Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest ToggleThenUse Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });
      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: false },
      });

      const { data: flag } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(flag.response).toBe(false);

      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Toggled Template",
        },
      });
      expect(status).toBe(200);
      const createdId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(createdId).toBeGreaterThan(0);
    });

    test("GET /files/roomtemplate/:id/public - Still works after source room is deleted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetAfterSrcDeleted Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest GetAfterSrcDeleted Template",
          public: true,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.deleteRoom({
        id: sourceRoomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    test("GET /files/roomtemplate/:id/public - Returns 404 after the template itself is deleted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetAfterTmplDeleted Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest GetAfterTmplDeleted Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.deleteRoom({
        id: templateId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(data.statusCode).toBe(404);
    });

    test.fail(
      "BUG XXXXX: GET /files/roomtemplate/:id/public - Returns 404 when id refers to a regular room, not a template",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest RoomIdNotTemplate",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { data } = await ownerApi.rooms.getPublicSettings({ id: roomId });
        expect(data.statusCode).toBe(404);
      },
    );

    test("GET /files/roomtemplate/:id/public - Non-existing template id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getPublicSettings({
        id: 999999999,
      });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/roomtemplate/:id/public - id:0 returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getPublicSettings({ id: 0 });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/roomtemplate/:id/public - id:-1 returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getPublicSettings({ id: -1 });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/roomtemplate/:id/public - id:'abc' returns 400 (type validation)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getPublicSettings({
        id: "abc" as unknown as number,
      });
      expect(data.statusCode).toBe(400);
    });

    test("GET /files/roomtemplate/:id/public - id:null is rejected by the SDK before the request is sent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.getPublicSettings({
          id: null as unknown as number,
        }),
      ).rejects.toThrow(/Required parameter id was null or undefined/);
    });

    test("GET /files/roomtemplate/:id/public - id:1.5 returns 400 (type validation)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getPublicSettings({ id: 1.5 });
      expect(data.statusCode).toBe(400);
    });

    test("GET /files/roomtemplate/:id/public - MAX_SAFE_INTEGER id returns 400 (Int32 overflow)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getPublicSettings({
        id: Number.MAX_SAFE_INTEGER,
      });
      expect(data.statusCode).toBe(400);
    });

    // === Positive: DTO fields ===

    test("POST /files/roomtemplate - Template is created with color", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Color Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Color Template",
          color: "FF5733",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(info.response!.logo?.color).toBe("FF5733");
    });

    test("POST /files/roomtemplate - Template is created with cover", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Cover Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Cover Template",
          cover: coverId,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(info.response!.logo?.cover?.id).toBe(coverId);
    });

    test("POST /files/roomtemplate - Template is created with tags", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Tags Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const tags = ["TmplTagAlpha", "TmplTagBeta"];
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Tags Template",
          tags,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      const tmplTags = (info.response!.tags ?? []) as string[];
      expect(tmplTags).toEqual(expect.arrayContaining(tags));
    });

    test("POST /files/roomtemplate - Template is created with public:true at creation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest PublicAtCreate Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest PublicAtCreate Template",
          public: true,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    test("POST /files/roomtemplate - Template is created with share user list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData, userData } = await apiSdk.addMember(
        "owner",
        "DocSpaceAdmin",
      );
      const sharedUserId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Share Template",
          share: [userData.email],
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const userApi = await apiSdk.authenticateMember(
        userData,
        "DocSpaceAdmin",
      );
      const { data: info, status } = await userApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(status).toBe(200);
      expect(info.response!.id).toBe(templateId);
      expect(sharedUserId).toBeDefined();
    });

    test("POST /files/roomtemplate - Template is created with groups list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: groupData } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: userId,
          members: [userId],
        },
      });
      const groupId = groupData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Groups Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { status } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Groups Template",
          groups: [groupId],
        },
      });
      expect(status).toBe(200);
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      expect(templateId).toBeGreaterThan(0);
    });

    test("POST /files/roomtemplate - Template is created with quota (verified via getRoomInfo)", async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: {
          enableQuota: true,
          defaultQuota: 100 * 1024 * 1024,
        },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Quota Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const myquota = 10 * 1024 * 1024;
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Quota Template",
          quota: myquota,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(info.response!.quotaLimit).toBe(myquota);
    });

    // === Async / operation tests ===

    test("POST /files/roomtemplate - Response has progress, isCompleted, error, templateId fields", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Op Shape Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Op Shape Template",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof data.response!.progress).toBe("number");
      expect(typeof data.response!.isCompleted).toBe("boolean");
      expect(typeof data.response!.templateId).toBe("number");
      expect(data.response!.error ?? null).toBeFalsy();
    });

    test("POST /files/roomtemplate - Two consecutive templates both complete with distinct templateIds", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomA } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Seq Source A",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: roomB } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Seq Source B",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomA.response!.id!,
          title: "Autotest Seq Template A",
        },
      });
      const templateAId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomB.response!.id!,
          title: "Autotest Seq Template B",
        },
      });
      const templateBId = await waitForRoomTemplate(ownerApi.rooms);

      expect(templateAId).toBeGreaterThan(0);
      expect(templateBId).toBeGreaterThan(0);
      expect(templateAId).not.toBe(templateBId);
    });

    test("POST /files/roomtemplate - Repeated polling after completion returns stable status", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Stable Poll Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Stable Poll Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: first } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      const { data: second } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      const { data: third } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();

      expect(first.response!.isCompleted).toBe(true);
      expect(second.response!.isCompleted).toBe(true);
      expect(third.response!.isCompleted).toBe(true);
      expect(first.response!.templateId).toBe(templateId);
      expect(second.response!.templateId).toBe(templateId);
      expect(third.response!.templateId).toBe(templateId);
    });

    test.fail(
      "BUG 81692: POST /files/roomtemplate - Status does not leak another user's template creation",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );

        const { data: ownerRoom } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Isolation Owner Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: ownerRoom.response!.id!,
            title: "Autotest Isolation Owner Template",
          },
        });
        const ownerTemplateId = await waitForRoomTemplate(ownerApi.rooms);

        const { data: adminStatus } =
          await adminApi.rooms.getRoomTemplateCreatingStatus();
        // Admin did not start any template creation — their status must not reference owner's templateId.
        expect(adminStatus.response?.templateId ?? 0).not.toBe(ownerTemplateId);
      },
    );

    // === Validation: roomId ===

    test("POST /files/roomtemplate - Missing roomId returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTemplate({
        roomTemplateDto: { title: "No RoomId" } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Null roomId returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTemplate({
        roomTemplateDto: { roomId: null, title: "Null RoomId" } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test.fail(
      "BUG 81691: POST /files/roomtemplate - roomId 0 returns 404",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const templateTitle = "Zero RoomId";
        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: { roomId: 0, title: templateTitle },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(templateTitle);
        expect(data.statusCode).toBe(404);
      },
    );

    test.fail(
      "BUG 81691: POST /files/roomtemplate - Non-existent roomId returns 404",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const templateTitle = "Missing RoomId";
        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: { roomId: 999999999, title: templateTitle },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(templateTitle);
        expect(data.statusCode).toBe(404);
      },
    );

    test("POST /files/roomtemplate - Invalid roomId type (string) returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTemplate({
        roomTemplateDto: { roomId: "abc", title: "Str RoomId" } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Invalid roomId type (array) returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTemplate({
        roomTemplateDto: { roomId: [1, 2], title: "Arr RoomId" } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    // === Validation: title ===

    // POST /files/rooms rejects missing title with 400 — createRoomTemplate should match.
    // Currently API returns 200 but async operation hangs (templateId never becomes > 0).
    test.fail(
      "BUG 81690: POST /files/roomtemplate - Missing title returns 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest NoTitle Source",
            roomType: RoomType.CustomRoom,
          },
        });

        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: { roomId: roomData.response!.id! } as any,
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        // No template should appear from a missing-title request.
        const sourceRoomTitle = "Autotest NoTitle Source";
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(sourceRoomTitle);
        expect(data.statusCode).toBe(400);
      },
    );

    test.fail(
      "BUG 81690: POST /files/roomtemplate - Empty title returns 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest EmptyTitle Source",
            roomType: RoomType.CustomRoom,
          },
        });

        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: { roomId: roomData.response!.id!, title: "" },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain("");
        expect(data.statusCode).toBe(400);
      },
    );

    test.fail(
      "BUG 81690: POST /files/roomtemplate - Very long title (1000 chars) is rejected with 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest LongTitle Source",
            roomType: RoomType.CustomRoom,
          },
        });

        const longTitle = "A".repeat(1000);
        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: longTitle,
          },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(longTitle);
        expect(data.statusCode).toBe(400);
      },
    );

    test("POST /files/roomtemplate - Invalid title type (number) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BadTitleType Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: 12345 as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Invalid title type (object) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest ObjTitle Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: { foo: "bar" } as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    // === Validation: optional field types ===

    test("POST /files/roomtemplate - Invalid public type (string) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BadPublic Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest BadPublic Template",
          public: "yes" as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Invalid copyLogo type (string) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BadCopyLogo Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest BadCopyLogo Template",
          copyLogo: "yes" as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Invalid share type (string instead of array) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BadShare Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest BadShare Template",
          share: "user@example.com" as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Invalid groups type (string instead of array) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BadGroups Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest BadGroups Template",
          groups: "group-id" as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/roomtemplate - Invalid tags type (string instead of array) returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BadTags Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest BadTags Template",
          tags: "TagName" as any,
        },
      });
      expect(data.statusCode).toBe(400);
    });

    // === Source room state ===

    test.fail(
      "BUG 81691: POST /files/roomtemplate - Cannot create template from deleted source room (404)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Deleted Src",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const templateTitle = "Should Not Be Created From Deleted";
        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId,
            title: templateTitle,
          },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(templateTitle);
        expect(data.statusCode).toBe(404);
      },
    );

    test.fail(
      "BUG 81691: POST /files/roomtemplate - Cannot create template from archived source room",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Archived Src",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const templateTitle = "Should Not Be Created From Archived";
        const { data } = await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId,
            title: templateTitle,
          },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(templateTitle);
        expect(data.statusCode).toBe(403);
      },
    );

    // === Integration ===

    test("POST /files/roomtemplate - Created template appears in Templates list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Catalog Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const templateTitle = "Autotest Catalog Template";

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: templateTitle,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: list } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Templates,
      });
      const ids = (list.response!.folders ?? []).map((f) => (f as any).id);
      expect(ids).toContain(templateId);
    });

    test("POST /files/roomtemplate - Non-public template is not visible to unrelated user", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest NotShared Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest NotShared Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const { data } = await userApi.rooms.getRoomInfo({ id: templateId });
      expect(data.statusCode).toBe(403);
    });

    // Public templates are visible only to admin-level roles (DocSpaceAdmin, RoomAdmin),
    // not to regular User/Guest. "public: true" is NOT "any authenticated user".
    for (const role of ["DocSpaceAdmin", "RoomAdmin"] as const) {
      test(`POST /files/roomtemplate - Public template is visible to ${role}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest PublicVisible ${role} Source`,
            roomType: RoomType.CustomRoom,
          },
        });

        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: `Autotest PublicVisible ${role} Template`,
            public: true,
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);
        const { data, status } = await api.rooms.getRoomInfo({
          id: templateId,
        });
        expect(status).toBe(200);
        expect(data.response!.id).toBe(templateId);
      });
    }

    for (const role of ["User", "Guest"] as const) {
      test(`POST /files/roomtemplate - Public template is not visible to ${role}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest PublicHidden ${role} Source`,
            roomType: RoomType.CustomRoom,
          },
        });

        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: `Autotest PublicHidden ${role} Template`,
            public: true,
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);
        const { data } = await api.rooms.getRoomInfo({ id: templateId });
        expect(data.statusCode).toBe(403);
      });
    }

    // === Edge cases ===

    test("POST /files/roomtemplate - Cyrillic title is accepted as-is", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Cyrillic Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const title = "Шаблон Кириллица";
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(info.response!.title).toBe(title);
    });

    test("POST /files/roomtemplate - Emoji in title is sanitized to _", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Emoji Source",
          roomType: RoomType.CustomRoom,
        },
      });

      const rawTitle = "Template 🚀 Emoji";
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: rawTitle,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(info.response!.title).not.toContain("🚀");
      expect(info.response!.title).toContain("_");
    });

    test('POST /files/roomtemplate - Forbidden chars in title (" \\ < > /) are sanitized to _', async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Forbidden Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: 'Bad" \\ < > / Template',
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });
      expect(info.response!.title).not.toContain('"');
      expect(info.response!.title).not.toContain("\\");
      expect(info.response!.title).not.toContain("<");
      expect(info.response!.title).not.toContain(">");
      expect(info.response!.title).not.toContain("/");
      expect(info.response!.title).toContain("_");
    });

    test("POST /files/roomtemplate - Duplicate template titles are allowed", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomA } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Dup A",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: roomB } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Dup B",
          roomType: RoomType.CustomRoom,
        },
      });

      const title = "Duplicate Template Title";
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: { roomId: roomA.response!.id!, title },
      });
      const templateAId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: { roomId: roomB.response!.id!, title },
      });
      const templateBId = await waitForRoomTemplate(ownerApi.rooms);

      expect(templateAId).not.toBe(templateBId);
      const { data: infoA } = await ownerApi.rooms.getRoomInfo({
        id: templateAId,
      });
      const { data: infoB } = await ownerApi.rooms.getRoomInfo({
        id: templateBId,
      });
      expect(infoA.response!.title).toBe(title);
      expect(infoB.response!.title).toBe(title);
    });

    test("POST /files/roomtemplate - Template can be created from empty source room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Empty Src",
          roomType: RoomType.CustomRoom,
        },
      });

      const { status } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Empty Template",
        },
      });
      expect(status).toBe(200);
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      expect(templateId).toBeGreaterThan(0);
    });

    test("POST /files/roomtemplate - Template can be created from source room with nested folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Nested Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      const { data: parent } = await ownerApi.folders.createFolder({
        folderId: sourceRoomId,
        createFolder: { title: "Parent" },
      });
      await ownerApi.folders.createFolder({
        folderId: parent.response!.id!,
        createFolder: { title: "Child" },
      });

      const { status } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Nested Template",
        },
      });
      expect(status).toBe(200);
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      expect(templateId).toBeGreaterThan(0);
    });

    test("POST /files/roomtemplate - Template can be created from source room with files", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Files Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      await ownerApi.files.createFile({
        folderId: sourceRoomId,
        createFileJsonElement: { title: "TmplSource.docx" },
      });

      const { status } = await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Files Template",
        },
      });
      expect(status).toBe(200);
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      expect(templateId).toBeGreaterThan(0);
    });
  });

  test("POST /files/tags - Owner creates and deletes tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await test.step("POST /files/tags - create a tag", async () => {
      const { data, status } = await ownerApi.rooms.createRoomTag({
        createTagRequestDto: {
          name: "Autotest Tag",
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response as unknown as string).toBe("Autotest Tag");
      expect(data.count).toBe(1);
    });

    await test.step("GET /files/tags - verify tag exists", async () => {
      const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response as unknown as string[]).toContain("Autotest Tag");
    });

    await test.step("DELETE /files/tags - delete a tag", async () => {
      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: {
          names: ["Autotest Tag"],
        },
      });

      expect(status).toBe(200);
    });

    await test.step("GET /files/tags - verify tag deleted", async () => {
      const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response as unknown as string[]).not.toContain(
        "Autotest Tag",
      );
    });
  });

  test("BUG 72499: DELETE /files/tags - DocSpaceAdmin deletes tag created by Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Tag" },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: ["Autotest Tag"] },
    });

    expect(status).toBe(200);
  });

  // tagName2 = path param ({tagName} in route), tagName = query param ([FromQuery] in DTO)
  test("GET /files/tags/haslinks - Tag not linked to any room returns false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "UnlinkedTag" },
    });

    const { data, status } = await ownerApi.rooms.hasTagLinks({
      tagName2: "UnlinkedTag",
      tagName: "UnlinkedTag",
    });

    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("GET /files/tags/haslinks - Tag linked to a room returns true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "LinkedTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room With Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: roomData.response!.id!,
      batchTagsRequestDto: { names: ["LinkedTag"] },
    });

    const { data, status } = await ownerApi.rooms.hasTagLinks({
      tagName2: "LinkedTag",
      tagName: "LinkedTag",
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test.describe("POST /files/tags - createRoomTag", () => {
    test("POST /files/tags - Same tag can be attached to multiple rooms (global tag behavior)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "SharedGlobalTag" },
      });

      const { data: room1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Shared Room A",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: room2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Shared Room B",
          roomType: RoomType.CustomRoom,
        },
      });
      const room1Id = room1.response!.id!;
      const room2Id = room2.response!.id!;

      const { status: status1 } = await ownerApi.rooms.addRoomTags({
        id: room1Id,
        batchTagsRequestDto: { names: ["SharedGlobalTag"] },
      });
      const { status: status2 } = await ownerApi.rooms.addRoomTags({
        id: room2Id,
        batchTagsRequestDto: { names: ["SharedGlobalTag"] },
      });
      expect(status1).toBe(200);
      expect(status2).toBe(200);

      const { data: info1 } = await ownerApi.rooms.getRoomInfo({ id: room1Id });
      const { data: info2 } = await ownerApi.rooms.getRoomInfo({ id: room2Id });
      expect((info1.response!.tags ?? []) as string[]).toContain(
        "SharedGlobalTag",
      );
      expect((info2.response!.tags ?? []) as string[]).toContain(
        "SharedGlobalTag",
      );
    });

    test("POST /files/tags - Cyrillic tag name is accepted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "Тег Кириллица";
      const { data, status } = await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });

      expect(status).toBe(200);
      expect(data.response as unknown as string).toBe(name);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list.response as unknown as string[]).toContain(name);
    });

    test("POST /files/tags - Emoji in tag name is accepted", async ({
      apiSdk,
    }) => {
      test.fail(
        true,
        "BUG 81682: emoji in tag name returns 500 instead of 200",
      );
      const ownerApi = apiSdk.forRole("owner");
      const name = "Tag 🚀 Emoji";
      const { data, status } = await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });

      expect(status).toBe(200);
      expect(data.response as unknown as string).toBe(name);
    });

    test("POST /files/tags - Empty name returns 400", async ({ apiSdk }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTag({
        createTagRequestDto: { name: "" },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/tags - Spaces-only name returns 400", async ({
      apiSdk,
    }) => {
      test.fail(
        true,
        "BUG 81683: spaces-only tag name is accepted (200) instead of rejected (400)",
      );
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTag({
        createTagRequestDto: { name: "   " },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/tags - Missing name field returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTag({
        createTagRequestDto: {} as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/tags - Null name returns 400", async ({ apiSdk }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTag({
        createTagRequestDto: { name: null } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    for (const invalid of [
      { label: "number", value: 12345 },
      { label: "boolean", value: true },
      { label: "object", value: { foo: "bar" } },
      { label: "array", value: ["a", "b"] },
    ]) {
      test(`POST /files/tags - Non-string name (${invalid.label}) returns 400`, async ({
        apiSdk,
      }) => {
        const { data } = await apiSdk.forRole("owner").rooms.createRoomTag({
          createTagRequestDto: { name: invalid.value } as any,
        });
        expect(data.statusCode).toBe(400);
      });
    }

    test("POST /files/tags - Very long tag name (10000 chars) returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").rooms.createRoomTag({
        createTagRequestDto: { name: "a".repeat(10000) },
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/tags - Duplicate tag name does not create a duplicate entry", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "DuplicateTagOnce";

      const { status: status1 } = await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });
      expect(status1).toBe(200);

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      const occurrences = all.filter((t) => t === name).length;
      expect(occurrences).toBe(1);
    });

    test("POST /files/tags - Tag names are case-insensitive (different case does not create a new tag)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "CaseTag" },
      });
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "casetag" },
      });

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      expect(all).toContain("CaseTag");
      expect(all).not.toContain("casetag");
      const matches = all.filter((t) => t.toLowerCase() === "casetag").length;
      expect(matches).toBe(1);
    });

    test("POST /files/tags - Leading/trailing spaces in tag name are preserved as-is", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "  PaddedTag  ";
      const { data, status } = await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });

      expect(status).toBe(200);
      const stored = data.response as unknown as string;
      expect([name, name.trim()]).toContain(stored);
    });

    test("POST /files/tags - Deleted tag can be re-created with the same name", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "RecreatableTag";

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });
      const { status: deleteStatus } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [name] },
      });
      expect(deleteStatus).toBe(200);

      const { data: list1 } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list1.response as unknown as string[]).not.toContain(name);

      const { data, status } = await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name },
      });
      expect(status).toBe(200);
      expect(data.response as unknown as string).toBe(name);

      const { data: list2 } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list2.response as unknown as string[]).toContain(name);
    });

    test("PUT /files/rooms/:id/tags - addRoomTags auto-creates a tag that was never created via createRoomTag", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "AutoCreatedByAddRoomTags";

      const { data: list0 } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list0.response as unknown as string[]).not.toContain(name);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room Auto-Tag",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: [name] },
      });
      expect(status).toBe(200);

      const { data: list1 } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list1.response as unknown as string[]).toContain(name);

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect((info.response!.tags ?? []) as string[]).toContain(name);
    });
  });

  test.describe("DELETE /files/tags - deleteCustomTags", () => {
    test("DELETE /files/tags - Owner deletes several existing tags in one request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const names = ["BatchTagA", "BatchTagB", "BatchTagC"];
      for (const name of names) {
        await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });
      }

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      for (const name of names) {
        expect(all).not.toContain(name);
      }
    });

    test("DELETE /files/tags - Deleting tag removes it from room where it was attached", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tagName = "AttachedTag";

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagName },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room With Attached Tag",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: [tagName] },
      });

      const { data: infoBefore } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });
      expect((infoBefore.response!.tags ?? []) as string[]).toContain(tagName);

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [tagName] },
      });
      expect(status).toBe(200);

      const { data: infoAfter } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });
      expect((infoAfter.response!.tags ?? []) as string[]).not.toContain(
        tagName,
      );
    });

    test("DELETE /files/tags - Batch delete works when tags are attached to different rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tagA = "MultiRoomTagA";
      const tagB = "MultiRoomTagB";

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagA },
      });
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagB },
      });

      const { data: room1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Multi Room A",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: room2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Multi Room B",
          roomType: RoomType.CustomRoom,
        },
      });
      const room1Id = room1.response!.id!;
      const room2Id = room2.response!.id!;

      await ownerApi.rooms.addRoomTags({
        id: room1Id,
        batchTagsRequestDto: { names: [tagA] },
      });
      await ownerApi.rooms.addRoomTags({
        id: room2Id,
        batchTagsRequestDto: { names: [tagB] },
      });

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [tagA, tagB] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      expect(all).not.toContain(tagA);
      expect(all).not.toContain(tagB);

      const { data: info1 } = await ownerApi.rooms.getRoomInfo({ id: room1Id });
      const { data: info2 } = await ownerApi.rooms.getRoomInfo({ id: room2Id });
      expect((info1.response!.tags ?? []) as string[]).not.toContain(tagA);
      expect((info2.response!.tags ?? []) as string[]).not.toContain(tagB);
    });

    test("DELETE /files/tags - Duplicate names in array delete the tag once without error", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "DuplicateDeleteTag";
      await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [name, name] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list.response as unknown as string[]).not.toContain(name);
    });

    test("DELETE /files/tags - Deleting a non-existent tag is idempotent (no error)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: ["NonExistingTag"] },
      });
      expect(status).toBe(200);
    });

    test("DELETE /files/tags - Batch with existing and non-existing tag deletes the existing one", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const existing = "ExistingMixedTag";
      const missing = "NonExistingMixedTag";

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: existing },
      });

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [existing, missing] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      expect(all).not.toContain(existing);
      expect(all).not.toContain(missing);
    });

    test("DELETE /files/tags - Very long tag name (10000 chars) returns 400", async ({
      apiSdk,
    }) => {
      test.fail(
        true,
        "BUG 81689: very long tag name (10000 chars) is silently accepted (200) instead of validation error (400) — no length guard",
      );
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: ["a".repeat(10000)] },
      });
      expect(status).toBe(400);
    });

    test("DELETE /files/tags - Cyrillic tag name can be deleted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "Тег Кириллица Delete";
      await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [name] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list.response as unknown as string[]).not.toContain(name);
    });

    test("DELETE /files/tags - Tag deletion is case-insensitive (delete by different case)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "CaseSensitiveDeleteTag" },
      });

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: ["casesensitivedeletetag"] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      expect(all).not.toContain("CaseSensitiveDeleteTag");
      expect(
        all.filter((t) => t.toLowerCase() === "casesensitivedeletetag"),
      ).toHaveLength(0);
    });

    test("DELETE /files/tags - Removes tag from all rooms where it was attached", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tagName = "GlobalSharedDeleteTag";

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagName },
      });

      const { data: room1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Global Tag Room A",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: room2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Global Tag Room B",
          roomType: RoomType.CustomRoom,
        },
      });
      const room1Id = room1.response!.id!;
      const room2Id = room2.response!.id!;

      await ownerApi.rooms.addRoomTags({
        id: room1Id,
        batchTagsRequestDto: { names: [tagName] },
      });
      await ownerApi.rooms.addRoomTags({
        id: room2Id,
        batchTagsRequestDto: { names: [tagName] },
      });

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [tagName] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list.response as unknown as string[]).not.toContain(tagName);

      const { data: info1 } = await ownerApi.rooms.getRoomInfo({ id: room1Id });
      const { data: info2 } = await ownerApi.rooms.getRoomInfo({ id: room2Id });
      expect((info1.response!.tags ?? []) as string[]).not.toContain(tagName);
      expect((info2.response!.tags ?? []) as string[]).not.toContain(tagName);
    });

    test("DELETE /files/tags - Does not delete unrelated tags", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tagA = "UnrelatedTagA";
      const tagB = "UnrelatedTagB";
      const tagC = "UnrelatedTagC";

      for (const name of [tagA, tagB, tagC]) {
        await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });
      }

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [tagA] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      expect(all).not.toContain(tagA);
      expect(all).toContain(tagB);
      expect(all).toContain(tagC);
    });

    test("DELETE /files/tags - Does not delete tags with similar names / prefixes", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const exact = "PrefixTag";
      const similar = ["PrefixTag1", "PrefixTag-1", "PrefixTagExtra"];

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: exact },
      });
      for (const name of similar) {
        await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });
      }

      const { status } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [exact] },
      });
      expect(status).toBe(200);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      const all = list.response as unknown as string[];
      expect(all).not.toContain(exact);
      for (const name of similar) {
        expect(all).toContain(name);
      }
    });

    test("DELETE /files/tags - Repeated delete of the same tag is idempotent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "RepeatedDeleteTag";
      await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });

      const { status: firstStatus } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [name] },
      });
      expect(firstStatus).toBe(200);

      const { status: secondStatus } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [name] },
      });
      expect(secondStatus).toBe(200);
    });

    test("DELETE /files/tags - Deleted tag name can be reused and attached to a room again", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const name = "ReusedAfterDeleteTag";

      await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });
      const { status: deleteStatus } = await ownerApi.rooms.deleteCustomTags({
        batchTagsRequestDto: { names: [name] },
      });
      expect(deleteStatus).toBe(200);

      await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room Reuse Tag",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status: attachStatus } = await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: [name] },
      });
      expect(attachStatus).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect((info.response!.tags ?? []) as string[]).toContain(name);
    });
  });

  test.describe("PUT /files/rooms/:id/share", () => {
    test("PUT /files/rooms/:id/share - Owner sets room access rights", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("set access rights for user", async () => {
        const { data, status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.Editing }],
            notify: false,
          },
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response!.members).toBeDefined();
        expect(data.response!.members!.length).toBe(1);
      });

      await test.step("GET /files/rooms/:id/share - verify access rights", async () => {
        const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response!.length).toBe(2);
        expect(data.response![1].sharedToUser?.id).toBe(userId);
      });
    });

    test("PUT /files/rooms/:id/share - Owner revokes room access rights", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      await test.step("revoke access rights", async () => {
        const { data, status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.None }],
            notify: false,
          },
        });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
      });

      await test.step("GET /files/rooms/:id/share - verify access revoked", async () => {
        const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.length).toBe(1);
        expect(data.response![0].sharedToUser?.id).not.toBe(userId);
      });
    });
  });

  test.describe("PUT /files/rooms/:id/share - FillingFormsRoom access levels", () => {
    // RoomManager cannot be set via PUT /files/rooms/:id/share - API rejects it for any room type
    test("PUT /files/rooms/:id/share - RoomManager is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.RoomManager },
          ],
          notify: false,
        },
      });

      expect(data.statusCode).toBe(403);
    });

    // Editing is not a valid access level for FillingFormsRoom - API rejects it
    test("PUT /files/rooms/:id/share - Editing is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      expect(data.statusCode).toBe(403);
    });

    test("PUT /files/rooms/:id/share - FillForms", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    // Read is not a valid access level for FillingFormsRoom - API rejects it
    test("PUT /files/rooms/:id/share - Read is rejected for FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest FillingForms Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const { data: memberData } = await apiSdk.addMember("owner", "User");

      const { data } = await ownerApi.rooms.setRoomSecurity({
        id: roomData.response!.id!,
        roomInvitationRequest: {
          invitations: [
            { id: memberData.response!.id!, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      expect(data.statusCode).toBe(403);
    });
  });

  test.describe("Room links", () => {
    test("GET /files/rooms/:id/links - Owner gets all links of a PublicRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Room",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.response![0].sharedLink?.id).toBeDefined();
      expect(data.response![0].sharedLink?.shareLink).toBeDefined();
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.External);
    });

    test("GET /files/rooms/:id/links/primary - Owner gets auto-created external link of a PublicRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Room",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomId,
        },
      );

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.sharedLink?.id).toBeDefined();
      expect(data.response!.sharedLink?.shareLink).toBeDefined();
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.External);
    });

    test("PUT /files/rooms/:id/links - Owner creates an invitation link for a room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Set Link Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Invitation Link",
          denyDownload: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.sharedLink?.id).toBeDefined();
      expect(data.response!.sharedLink?.shareLink).toBeDefined();
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.Invitation);
      expect(data.response!.sharedLink?.title).toBe("Autotest Invitation Link");
    });
  });

  test.describe("Room from template", () => {
    test("POST /files/rooms/fromtemplate - Owner creates a room from template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Template Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Template",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(roomId).toBeGreaterThan(0);

      const { data: roomInfo, status: roomStatus } =
        await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(roomStatus).toBe(200);
      expect(roomInfo.response!.title).toBe("Room From Template");
      expect(roomInfo.response!.roomType).toBe(RoomType.CustomRoom);
    });

    test("POST /files/rooms/fromtemplate - Owner creates VDR from template and inherits settings", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest VDR Source",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
          denyDownload: true,
          lifetime: {
            deletePermanently: true,
            period: 0,
            value: 30,
            enabled: true,
          },
          watermark: {
            enabled: true,
            additions: 1,
            text: "Confidential",
            rotate: 0,
            imageScale: 100,
          },
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest VDR Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "VDR From Template",
        },
      });

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: roomInfo } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });

      expect(roomInfo.response!.title).toBe("VDR From Template");
      expect(roomInfo.response!.roomType).toBe(RoomType.VirtualDataRoom);
      // indexing and denyDownload are inherited; lifetime and watermark are not (by design)
      expect(roomInfo.response!.indexing).toBe(true);
      expect(roomInfo.response!.denyDownload).toBe(true);
    });

    test("GET /files/rooms/status - Owner gets room creating status after creating from template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Template Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Template",
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
    });

    // === Positive tests ===

    test("POST /files/rooms/fromtemplate - Created room title comes from request, not from source room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sourceTitle = "Autotest Source Room Title";
      const templateTitle = "Autotest Template Title";
      const newRoomTitle = "Autotest New Room Title";

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: sourceTitle,
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: templateTitle,
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: newRoomTitle },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(info.response!.title).toBe(newRoomTitle);
      expect(info.response!.title).not.toBe(sourceTitle);
      expect(info.response!.title).not.toBe(templateTitle);
    });

    test("POST /files/rooms/fromtemplate - Inherits indexing:false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Indexing False Source",
          roomType: RoomType.VirtualDataRoom,
          indexing: false,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Indexing False Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room Indexing False",
        },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(info.response!.indexing).toBe(false);
    });

    test("POST /files/rooms/fromtemplate - Inherits denyDownload:false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest DenyDownload False Source",
          roomType: RoomType.VirtualDataRoom,
          denyDownload: false,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest DenyDownload False Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room DenyDownload False",
        },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(info.response!.denyDownload).toBe(false);
    });

    test("POST /files/rooms/fromtemplate - Lifetime is not inherited from source room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Lifetime Source",
          roomType: RoomType.VirtualDataRoom,
          lifetime: {
            deletePermanently: true,
            period: RoomDataLifetimePeriod.Day,
            value: 30,
            enabled: true,
          },
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Lifetime Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room Without Lifetime",
        },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(info.response!.lifetime?.enabled ?? false).toBe(false);
    });

    test("POST /files/rooms/fromtemplate - Watermark is not inherited from source room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Watermark Source",
          roomType: RoomType.VirtualDataRoom,
          watermark: {
            enabled: true,
            additions: 1,
            text: "Confidential",
            rotate: 0,
            imageScale: 100,
          },
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Watermark Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room Without Watermark",
        },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(info.response!.watermark?.text ?? null).not.toBe("Confidential");
    });

    test("POST /files/rooms/fromtemplate - Inherits roomType+indexing+denyDownload but not lifetime/watermark together", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Combined Source",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
          denyDownload: true,
          lifetime: {
            deletePermanently: true,
            period: RoomDataLifetimePeriod.Day,
            value: 15,
            enabled: true,
          },
          watermark: {
            enabled: true,
            additions: 1,
            text: "Confidential",
            rotate: 0,
            imageScale: 100,
          },
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Combined Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room Combined",
        },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(info.response!.roomType).toBe(RoomType.VirtualDataRoom);
      expect(info.response!.indexing).toBe(true);
      expect(info.response!.denyDownload).toBe(true);
      expect(info.response!.lifetime?.enabled ?? false).toBe(false);
      expect(info.response!.watermark?.text ?? null).not.toBe("Confidential");
    });

    test("POST /files/rooms/fromtemplate - Template can be reused to create multiple rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reuse Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Reuse Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Room A" },
      });
      const roomAId = await waitForRoomFromTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Room B" },
      });
      const roomBId = await waitForRoomFromTemplate(ownerApi.rooms);

      expect(roomAId).toBeGreaterThan(0);
      expect(roomBId).toBeGreaterThan(0);
      expect(roomAId).not.toBe(roomBId);

      const { data: infoA } = await ownerApi.rooms.getRoomInfo({ id: roomAId });
      const { data: infoB } = await ownerApi.rooms.getRoomInfo({ id: roomBId });
      expect(infoA.response!.title).toBe("Room A");
      expect(infoB.response!.title).toBe("Room B");
      expect(infoA.response!.roomType).toBe(RoomType.CustomRoom);
      expect(infoB.response!.roomType).toBe(RoomType.CustomRoom);
    });

    test("POST /files/rooms/fromtemplate - Rooms created from the same template are independent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Independence Source",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Independence Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Independent A" },
      });
      const roomAId = await waitForRoomFromTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Independent B" },
      });
      const roomBId = await waitForRoomFromTemplate(ownerApi.rooms);

      await ownerApi.rooms.updateRoom({
        id: roomAId,
        updateRoomRequest: { title: "Independent A Updated" },
      });

      const { data: infoB } = await ownerApi.rooms.getRoomInfo({ id: roomBId });
      expect(infoB.response!.title).toBe("Independent B");
    });

    // === Async / operation tests ===

    test("POST /files/rooms/fromtemplate - Response operation has progress and isCompleted fields", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Op Shape Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Op Shape Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room Op Shape",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof data.response!.progress).toBe("number");
      expect(typeof data.response!.isCompleted).toBe("boolean");
      expect(data.response!.error ?? null).toBeFalsy();
    });

    test("POST /files/rooms/fromtemplate - Operation eventually completes successfully", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Complete Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Complete Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room Complete",
        },
      });

      await expect(async () => {
        const { data } = await ownerApi.rooms.getRoomCreatingStatus();
        expect(data.response!.isCompleted).toBe(true);
        expect(data.response!.error).toBeFalsy();
        expect(data.response!.roomId).toBeGreaterThan(0);
      }).toPass({
        intervals: [1_000, 2_000, 5_000],
        timeout: 30_000,
      });
    });

    test("POST /files/rooms/fromtemplate - getRoomInfo succeeds after operation completion", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AfterWait Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest AfterWait Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room After Wait",
        },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(status).toBe(200);
      expect(data.response!.id).toBe(roomId);
      expect(data.response!.title).toBe("Room After Wait");
    });

    // === Content / structure tests ===

    test("POST /files/rooms/fromtemplate - Empty source room creates empty room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Empty Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Empty Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Empty Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: content } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(content.response!.folders ?? []).toHaveLength(0);
      expect(content.response!.files ?? []).toHaveLength(0);
    });

    test("POST /files/rooms/fromtemplate - Folder from source room is copied", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      const folderTitle = "Source Folder";
      await ownerApi.folders.createFolder({
        folderId: sourceRoomId,
        createFolder: { title: folderTitle },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Folder Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Folder Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: content } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const folderTitles = (content.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(folderTitles).toContain(folderTitle);
    });

    test.fail(
      "BUG 81666: POST /files/rooms/fromtemplate - Nested folder hierarchy is preserved",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Nested Source",
            roomType: RoomType.CustomRoom,
          },
        });
        const sourceRoomId = roomData.response!.id!;

        const { data: parent } = await ownerApi.folders.createFolder({
          folderId: sourceRoomId,
          createFolder: { title: "Parent" },
        });
        const parentId = parent.response!.id!;
        await ownerApi.folders.createFolder({
          folderId: parentId,
          createFolder: { title: "Child" },
        });

        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: sourceRoomId,
            title: "Autotest Nested Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "Nested Room" },
        });
        const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { data: rootContent } =
          await ownerApi.folders.getFolderByFolderId({
            folderId: roomId,
          });
        const parentInCopy = (rootContent.response!.folders ?? []).find(
          (f) => (f as any).title === "Parent",
        );
        expect(parentInCopy).toBeDefined();
        const copiedParentId = (parentInCopy as any).id as number;

        const { data: parentContent } =
          await ownerApi.folders.getFolderByFolderId({
            folderId: copiedParentId,
          });
        const childTitles = (parentContent.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(childTitles).toContain("Child");
      },
    );

    test("POST /files/rooms/fromtemplate - File from source room is copied", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest File Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      const fileTitle = "Source File";
      await ownerApi.files.createFile({
        folderId: sourceRoomId,
        createFileJsonElement: { title: fileTitle },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest File Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "File Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: content } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const fileTitles = (content.response!.files ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(fileTitles.some((t) => t.startsWith("Source File"))).toBe(true);
    });

    test("POST /files/rooms/fromtemplate - Copied folders/files have ids different from source", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Ids Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      const { data: srcFolder } = await ownerApi.folders.createFolder({
        folderId: sourceRoomId,
        createFolder: { title: "Folder For Ids" },
      });
      const srcFolderId = srcFolder.response!.id!;

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Ids Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Ids Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      expect(roomId).not.toBe(sourceRoomId);

      const { data: content } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const copiedFolder = (content.response!.folders ?? []).find(
        (f) => (f as any).title === "Folder For Ids",
      );
      expect(copiedFolder).toBeDefined();
      expect((copiedFolder as any).id).not.toBe(srcFolderId);
    });

    test("POST /files/rooms/fromtemplate - Deleting content in created room does not affect source room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Isolate Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      await ownerApi.folders.createFolder({
        folderId: sourceRoomId,
        createFolder: { title: "Isolated Folder" },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Isolate Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Isolate Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: copyContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const copyFolder = (copyContent.response!.folders ?? []).find(
        (f) => (f as any).title === "Isolated Folder",
      );
      expect(copyFolder).toBeDefined();

      await ownerApi.folders.deleteFolder({
        folderId: (copyFolder as any).id as number,
        deleteFolder: { deleteAfter: false, immediately: true },
      });
      await waitForOperation(ownerApi.operations);

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: sourceRoomId,
      });
      const srcTitles = (srcContent.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(srcTitles).toContain("Isolated Folder");
    });

    // === Validation tests ===

    test("POST /files/rooms/fromtemplate - Missing templateId returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk
        .forRole("owner")
        .rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { title: "Room" } as any,
        });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms/fromtemplate - Null templateId returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk
        .forRole("owner")
        .rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId: null, title: "Room" } as any,
        });
      expect(data.statusCode).toBe(400);
    });

    test.fail(
      "BUG 81667: POST /files/rooms/fromtemplate - templateId 0 returns 404",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId: 0, title: "Room" },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({});
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain("Room");
        expect(data.statusCode).toBe(404);
      },
    );

    test.fail(
      "BUG 81667: POST /files/rooms/fromtemplate - Non-existent templateId returns 404",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId: 999999999, title: "Room" },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({});
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain("Room");
        expect(data.statusCode).toBe(404);
      },
    );

    test.fail(
      "BUG 81667: POST /files/rooms/fromtemplate - Deleted template returns 404",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Deleted Tmpl Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Deleted Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.deleteRoom({
          id: templateId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { data } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId,
            title: "Room After Delete",
          },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({});
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain("Room After Delete");
        expect(data.statusCode).toBe(404);
      },
    );

    test("POST /files/rooms/fromtemplate - Missing title returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Missing Title Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Missing Title Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test.fail(
      "BUG 81669: POST /files/rooms/fromtemplate - Empty title returns 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Empty Title Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Empty Title Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        const { data } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "" },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({});
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain("");
        expect(data.statusCode).toBe(400);
      },
    );

    test.fail(
      "BUG 81669: POST /files/rooms/fromtemplate - Whitespace-only title returns 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Blank Title Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Blank Title Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        const { data } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "   " },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({});
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain("   ");
        expect(data.statusCode).toBe(400);
      },
    );

    test.fail(
      "BUG 81669: POST /files/rooms/fromtemplate - Excessively long title (1000 chars) returns 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Long Title Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Long Title Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        const longTitle = "A".repeat(1000);
        const { data } = await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId,
            title: longTitle,
          },
        });

        const { data: list } = await ownerApi.rooms.getRoomsFolder({});
        const titles = (list.response!.folders ?? []).map(
          (f) => (f as any).title as string,
        );
        expect(titles).not.toContain(longTitle);
        expect(data.statusCode).toBe(400);
      },
    );

    test('POST /files/rooms/fromtemplate - Forbidden chars in title (" \\ < > /) are sanitized to _', async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Forbidden Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Forbidden Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: 'Bad" \\ < > / Title',
        },
      });
      expect(status).toBe(200);

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      // Forbidden characters are silently replaced with `_`.
      expect(info.response!.title).not.toContain('"');
      expect(info.response!.title).not.toContain("\\");
      expect(info.response!.title).not.toContain("<");
      expect(info.response!.title).not.toContain(">");
      expect(info.response!.title).not.toContain("/");
      expect(info.response!.title).toContain("_");
    });

    test("POST /files/rooms/fromtemplate - Duplicate room titles are allowed", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Dup Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Dup Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { status: statusA } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Duplicate Title" },
      });
      const roomAId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { status: statusB } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Duplicate Title" },
      });
      const roomBId = await waitForRoomFromTemplate(ownerApi.rooms);

      expect(statusA).toBe(200);
      expect(statusB).toBe(200);
      expect(roomAId).not.toBe(roomBId);
    });

    test("POST /files/rooms/fromtemplate - Invalid templateId type returns 400", async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk
        .forRole("owner")
        .rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId: "abc",
            title: "Room",
          } as any,
        });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms/fromtemplate - Invalid title type returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Title Type Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Title Type Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: 123 } as any,
      });
      expect(data.statusCode).toBe(400);
    });

    test("POST /files/rooms/fromtemplate - Unknown extra fields are silently ignored", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Extra Field Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Extra Field Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room With Extra",
          unknownField: "ignored",
        } as any,
      });
      expect(status).toBe(200);

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe("Room With Extra");
    });

    // === Lifecycle / regression tests ===

    test("POST /files/rooms/fromtemplate - Source room deletion does not break template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Src Delete Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Src Delete Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.deleteRoom({
        id: sourceRoomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room After Source Deleted",
        },
      });
      expect(status).toBe(200);

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(roomId).toBeGreaterThan(0);
    });

    test("POST /files/rooms/fromtemplate - Creating room from template does not modify template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Tmpl Unchanged Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Tmpl Unchanged Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: tmplBefore } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Unchanged Template",
        },
      });
      await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: tmplAfter } = await ownerApi.rooms.getRoomInfo({
        id: templateId,
      });

      expect(tmplAfter.response!.id).toBe(tmplBefore.response!.id);
      expect(tmplAfter.response!.title).toBe(tmplBefore.response!.title);
      expect(tmplAfter.response!.roomType).toBe(tmplBefore.response!.roomType);
    });

    test("POST /files/rooms/fromtemplate - Creating room from template does not modify source room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Src Unchanged Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      await ownerApi.folders.createFolder({
        folderId: sourceRoomId,
        createFolder: { title: "Source-Only Folder" },
      });

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Src Unchanged Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data: srcBefore } = await ownerApi.rooms.getRoomInfo({
        id: sourceRoomId,
      });

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room From Unchanged Source",
        },
      });
      await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: srcAfter } = await ownerApi.rooms.getRoomInfo({
        id: sourceRoomId,
      });
      expect(srcAfter.response!.title).toBe(srcBefore.response!.title);

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: sourceRoomId,
      });
      const srcTitles = (srcContent.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(srcTitles).toContain("Source-Only Folder");
    });

    test("POST /files/rooms/fromtemplate - Created room appears in room list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest List Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest List Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Listed Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data: list } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Active,
      });
      const ids = (list.response!.folders ?? []).map((f) => (f as any).id);
      expect(ids).toContain(roomId);
    });

    test("POST /files/rooms/fromtemplate - Created room can be updated", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Update Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Update Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Room Before Update" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Room After Update" },
      });
      expect(status).toBe(200);
      expect(data.response!.title).toBe("Room After Update");
    });

    test("POST /files/rooms/fromtemplate - Created room can be archived and deleted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Archive Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Room To Archive" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      await test.step("archive succeeds", async () => {
        const { status } = await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        const op = await waitForOperation(ownerApi.operations);
        expect(status).toBe(200);
        expect(op.finished).toBe(true);
      });

      await test.step("delete succeeds", async () => {
        const { status } = await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        const op = await waitForOperation(ownerApi.operations);
        expect(status).toBe(200);
        expect(op.finished).toBe(true);
      });
    });
  });

  test.describe("Room index export", () => {
    test("POST /files/rooms/:id/indexexport - Owner starts and gets index export", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Room",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      await test.step("POST /files/rooms/:id/indexexport - start export", async () => {
        const { data, status } = await ownerApi.rooms.startRoomIndexExport({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBeDefined();
        expect(data.response!.error).toBeFalsy();
      });

      await test.step("GET /files/rooms/indexexport - get export status", async () => {
        const { data, status } = await ownerApi.rooms.getRoomIndexExport();

        expect(status).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBeDefined();
      });

      await test.step("DELETE /files/rooms/indexexport - terminate export", async () => {
        const { status } = await ownerApi.rooms.terminateRoomIndexExport();

        expect(status).toBe(200);
      });
    });

    test("BUG 81110: GET /files/rooms/indexexport - Owner export completes without error", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Room",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { indexing: true },
      });
      await ownerApi.folders.getMyFolder({});

      await test.step("GET /files/rooms/indexexport - check no active export", async () => {
        const { status } = await ownerApi.rooms.getRoomIndexExport();
        expect(status).toBe(200);
      });

      await test.step("POST /files/rooms/:id/indexexport - start export", async () => {
        const { data, status } = await ownerApi.rooms.startRoomIndexExport({
          id: roomId,
        });
        expect(status).toBe(200);
        expect(data.response!.id).toBeDefined();
        expect(data.response!.error).toBeFalsy();
      });

      await test.step("GET /files/rooms/indexexport - poll until completed", async () => {
        let exportData: Awaited<
          ReturnType<typeof ownerApi.rooms.getRoomIndexExport>
        >;

        await expect(async () => {
          exportData = await ownerApi.rooms.getRoomIndexExport();
          expect(exportData.status).toBe(200);
          expect(exportData.data.response!.isCompleted).toBe(true);
          expect(exportData.data.response!.error).toBeFalsy();
        }).toPass({
          intervals: [2_000, 5_000, 10_000],
          timeout: 30_000,
        });

        expect(exportData!.data.response!.resultFileId).toBeTruthy();
      });
    });
  });

  // Could not trigger MarkAsNew via API - new items list is always empty. Contract test only.
  test.describe("Room new items", () => {
    test("GET /files/rooms/:id/newitems - Owner gets new items list for a room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest New Items Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getNewRoomItems({
        id: roomData.response!.id!,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(Array.isArray(data.response)).toBe(true);
    });
  });

  test.describe("Room reorder", () => {
    test("PUT /files/rooms/:id/reorder - Owner reorders file indexes inside an empty VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Empty Room",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.reorderRoom({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(roomId);
    });

    test("PUT /files/rooms/:id/reorder - Owner reorders file indexes inside a VDR room with folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Room With Content",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folderA } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder A" },
      });
      const { data: folderB } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder B" },
      });
      const { data: folderC } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder C" },
      });

      // Manually set non-sequential indexes with gaps
      await ownerApi.folders.setFolderOrder({
        folderId: folderA.response!.id!,
        orderRequestDto: { order: 10 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderB.response!.id!,
        orderRequestDto: { order: 50 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderC.response!.id!,
        orderRequestDto: { order: 30 },
      });

      const { data: contentBefore } =
        await ownerApi.folders.getFolderByFolderId({ folderId: roomId });
      const ordersBefore = contentBefore.response!.folders!.map((f) =>
        Number(f.order),
      );
      // Verify indexes have gaps (not sequential 1,2,3)
      expect(ordersBefore).not.toEqual([1, 2, 3]);

      const { data, status } = await ownerApi.rooms.reorderRoom({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(roomId);

      const { data: contentAfter } = await ownerApi.folders.getFolderByFolderId(
        { folderId: roomId },
      );
      // Reorder removes gaps
      expect(
        contentAfter.response!.folders!.map((f) => [f.title, Number(f.order)]),
      ).toEqual([
        ["Folder A", 1],
        ["Folder C", 2],
        ["Folder B", 3],
      ]);
    });
  });

  test.describe("Room invitations", () => {
    test("POST /files/rooms/:id/resend - Owner resends email invitations", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: {
          usersIds: [userId],
          resendAll: false,
        },
      });

      expect(status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - Resend to user not in room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      // Batch operation - non-member IDs are silently skipped (by design)
      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: {
          usersIds: [userId],
          resendAll: false,
        },
      });

      expect(status).toBe(200);
    });
  });

  test("PUT/DELETE /files/rooms/:id/tags - Owner adds and removes tags from a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Tag1" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Tag2" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room with Tags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await test.step("PUT /files/rooms/:id/tags - add tags to room", async () => {
      const { data, status } = await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: {
          names: ["Tag1", "Tag2"],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.id).toBe(roomId);
      expect(data.response!.title).toBe("Autotest Room with Tags");
      expect((data.response!.tags as string[]).length).toBe(2);
      expect(data.response!.tags as string[]).toContain("Tag1");
      expect(data.response!.tags as string[]).toContain("Tag2");
    });

    await test.step("DELETE /files/rooms/:id/tags - remove tag from room", async () => {
      const { data, status } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: {
          names: ["Tag1"],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.id).toBe(roomId);
      expect((data.response!.tags as string[]).length).toBe(1);
      expect(data.response!.tags as string[]).not.toContain("Tag1");
      expect(data.response!.tags as string[]).toContain("Tag2");
    });
  });
});

test.describe("PUT /files/tags - Update tag", () => {
  test("PUT /files/tags - Owner renames a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Rename Old" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Rename Old",
        newName: "Autotest Rename New",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe("Autotest Rename New");
  });

  test("PUT /files/tags - Response has correct structure (statusCode, count, response)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Structure Old" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Structure Old",
        newName: "Autotest Structure New",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof (data.response as unknown as string)).toBe("string");
    expect(data.response as unknown as string).toBe("Autotest Structure New");
  });

  test("PUT /files/tags - Old tag name is no longer in tag list after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Old Name Gone" },
    });

    await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Old Name Gone",
        newName: "Autotest Old Name Replaced",
      },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    const tags = data.response as unknown as string[];
    expect(tags).not.toContain("Autotest Old Name Gone");
  });

  test("PUT /files/tags - New tag name appears in tag list after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest New Name Check Old" },
    });

    await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest New Name Check Old",
        newName: "Autotest New Name Check New",
      },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    const tags = data.response as unknown as string[];
    expect(tags).toContain("Autotest New Name Check New");
  });

  test("PUT /files/tags - Tag attached to a room reflects the new name after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Room Tag Old Name" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room With Renamed Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Room Tag Old Name"] },
    });

    await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Room Tag Old Name",
        newName: "Autotest Room Tag New Name",
      },
    });

    const { data: roomInfo, status } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });

    expect(status).toBe(200);
    const roomTags = (roomInfo as any).response?.tags as string[] | undefined;
    expect(roomTags).toBeDefined();
    expect(roomTags).not.toContain("Autotest Room Tag Old Name");
    expect(roomTags).toContain("Autotest Room Tag New Name");
  });

  test("PUT /files/tags - Renaming a non-existent tag returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest NonExistent Tag 99999",
        newName: "Autotest New Name For NonExistent",
      },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("The record could not be found");
  });

  // Business: renaming a tag to the same name is not allowed — API treats it as a duplicate
  test("PUT /files/tags - Renaming a tag to the same name returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Same Name Tag" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Same Name Tag",
        newName: "Autotest Same Name Tag",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "Tag with name 'Autotest Same Name Tag' already exists",
    );
  });

  // Business: renaming to the name of another existing tag is not allowed — names must be unique
  test("PUT /files/tags - Renaming to an already existing tag name returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Conflict Source" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Conflict Target" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Conflict Source",
        newName: "Autotest Conflict Target",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "Tag with name 'Autotest Conflict Target' already exists",
    );
  });

  test("PUT /files/tags - Empty newName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Empty New Name" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Empty New Name",
        newName: "",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The value cannot be an empty string. (Parameter 'newName')",
    );
  });
});

test.describe("PUT /files/rooms/:id/tags - addRoomTags", () => {
  test("PUT /files/rooms/:id/tags - Owner adds one existing tag to room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "SingleTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Single Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["SingleTag"] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response!.tags as string[]).length).toBe(1);
    expect(data.response!.tags as string[]).toContain("SingleTag");
  });

  test("PUT /files/rooms/:id/tags - Response returns full room object", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "FullRoomTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Full Object",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["FullRoomTag"] },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.title).toBe("Autotest Room Full Object");
    expect(data.response!.roomType).toBe(RoomType.CustomRoom);
    expect(data.response!.tags as string[]).toContain("FullRoomTag");
  });

  test("PUT /files/rooms/:id/tags - Preserves already assigned tags when adding new ones", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "PreservedA" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "PreservedB" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Preserve Tags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["PreservedA"] },
    });

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["PreservedB"] },
    });

    expect(status).toBe(200);
    const tags = data.response!.tags as string[];
    expect(tags.length).toBe(2);
    expect(tags).toContain("PreservedA");
    expect(tags).toContain("PreservedB");
  });

  test("PUT /files/rooms/:id/tags - Idempotent when adding already assigned tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "IdempotentTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Idempotent",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["IdempotentTag"] },
    });

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["IdempotentTag"] },
    });

    expect(status).toBe(200);
    const tags = data.response!.tags as string[];
    expect(tags.length).toBe(1);
    expect(tags).toContain("IdempotentTag");
  });

  test("PUT /files/rooms/:id/tags - Tag can be re-added after deleteRoomTags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "ReAddTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room ReAdd",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ReAddTag"] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ReAddTag"] },
    });

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ReAddTag"] },
    });

    expect(status).toBe(200);
    expect(data.response!.tags as string[]).toContain("ReAddTag");
  });

  test("PUT /files/rooms/:id/tags - Duplicate tag names in request are not duplicated in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "DupTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Duplicate Names",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["DupTag", "DupTag"] },
    });

    expect(status).toBe(200);
    const tags = data.response!.tags as string[];
    expect(tags.filter((t) => t === "DupTag").length).toBe(1);
  });

  // Room IDs are globally unique, so the API should return 403 instead of 404.
  // Currently API returns 500 Internal Server Error instead.
  test.fail(
    "BUG 81544: PUT /files/rooms/:id/tags - Non-existent room id returns 500 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "GhostRoomTag" },
      });

      const { data } = await ownerApi.rooms.addRoomTags({
        id: 999999999,
        batchTagsRequestDto: { names: ["GhostRoomTag"] },
      });

      expect(data.statusCode).toBe(403);
    },
  );

  // Currently API returns 500 Internal Server Error instead of 403 when the room has been deleted.
  test.fail(
    "BUG 81545: PUT /files/rooms/:id/tags - Adding tag to deleted room returns 500 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "DeletedRoomTag" },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room To Delete For Tag",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data } = await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["DeletedRoomTag"] },
      });

      expect(data.statusCode).toBe(403);
    },
  );

  test("PUT /files/rooms/:id/tags - Empty names array is a no-op and returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Empty Names",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [] },
    });

    expect(status).toBe(200);
    const tags = (data.response!.tags as string[]) ?? [];
    expect(tags.length).toBe(0);
  });

  test("PUT /files/rooms/:id/tags - Missing names field returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Missing Names",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: {} as any,
    });

    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/tags - Null names returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Null Names",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: null as any },
    });

    expect(status).toBe(400);
  });

  test("PUT/GET /files/rooms/:id - Added tags appear in getRoomInfo response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "VisibleTag" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Get Info Tags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["VisibleTag"] },
    });

    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.tags as string[]).toContain("VisibleTag");
  });
});

test.describe("PUT /files/fileops/duplicate", () => {
  test("PUT /files/fileops/duplicate - Owner duplicates their own room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room To Duplicate",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: {
        folderIds: [roomId as any],
      },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("BUG 81232: PUT /files/fileops/duplicate - Owner duplicates DocSpaceAdmin's room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin Room For Owner Duplicate",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const ownerApi = apiSdk.forRole("owner");

    await test.step("PUT /files/fileops/duplicate", async () => {
      const { status } = await ownerApi.operations.duplicateBatchItems({
        duplicateRequestDto: {
          folderIds: [roomId as any],
        },
      });
      expect(status).toBe(200);
    });

    await test.step("GET /files/fileops", async () => {
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
      expect(operation.error).toBe("");
    });

    await test.step("GET /files/rooms - duplicate room appears in list", async () => {
      const { data } = await ownerApi.rooms.getRoomsFolder({});
      const titles = data.response!.folders!.map((f) => f.title);
      expect(
        titles.some((t) =>
          t?.includes("Autotest Admin Room For Owner Duplicate"),
        ),
      ).toBe(true);
    });
  });
});

test.describe("PUT /files/fileops/delete - Room deletion with open file", () => {
  test.fail(
    "BUG 81287: PUT /files/fileops/delete - deleting a room with an open file partially removes other files instead of rolling back atomically",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Room With Open File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: f1 } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "file1" },
      });
      const { data: f2 } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "file2" },
      });
      const { data: openedFile } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "opened-file" },
      });

      const file1Id = f1.response!.id!;
      const file2Id = f2.response!.id!;
      const openedFileId = openedFile.response!.id!;

      const { data: editConfig } = await ownerApi.files.openEditFile({
        fileId: openedFileId,
      });
      const docKey = editConfig.response!.document!.key!;
      await ownerApi.files.trackEditFile({
        fileId: openedFileId,
        tabId: crypto.randomUUID(),
        docKeyForTrack: docKey,
        isFinish: false,
      });

      await test.step("PUT /files/fileops/delete - start room deletion", async () => {
        const { status } = await ownerApi.operations.deleteBatchItems({
          deleteBatchRequestDto: {
            folderIds: [roomId],
            immediately: true,
          },
        });
        expect(status).toBe(200);
      });

      await test.step("GET /files/fileops - verify operation failed with open file error", async () => {
        const operation = await waitForOperation(ownerApi.operations);
        expect(operation.finished).toBe(true);
        expect(operation.error).toContain("opened for editing");
      });

      await test.step("GET /files/rooms/:id - verify room still exists", async () => {
        const { status } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(status).toBe(200);
      });

      await test.step("GET /files/file/:id - verify all files still exist", async () => {
        for (const fileId of [file1Id, file2Id, openedFileId]) {
          const { status } = await ownerApi.files.getFileInfo({ fileId });
          expect(status).toBe(200);
        }
      });
    },
  );
});

test.describe("DELETE /files/rooms/:id - functional", () => {
  // ── Positive ──

  test("DELETE /files/rooms/:id - Owner deletes a CustomRoom and it disappears from list and getRoomInfo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Verify Gone",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const operation = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: listData } = await ownerApi.rooms.getRoomsFolder({});
    const ids = (listData.response!.folders ?? []).map((f) => (f as any).id);
    expect(ids).not.toContain(roomId);

    const { data: infoData } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(infoData.statusCode).toBe(404);
  });

  // HTTP returns 200 but the delete operation is not pushed to fileops, so waitForOperation
  // cannot find a matching record — the last poll returns undefined.
  test.fail(
    "BUG 81698: DELETE /files/rooms/:id - deleteAfter:true does not produce a trackable operation",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete deleteAfter true",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      const { status } = await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: true },
      });
      expect(status).toBe(200);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
      expect(operation.error).toBe("");
    },
  );

  for (const { label, roomType } of [
    { label: "CustomRoom", roomType: RoomType.CustomRoom },
    { label: "EditingRoom", roomType: RoomType.EditingRoom },
    { label: "PublicRoom", roomType: RoomType.PublicRoom },
    { label: "FillingFormsRoom", roomType: RoomType.FillingFormsRoom },
    { label: "VirtualDataRoom", roomType: RoomType.VirtualDataRoom },
  ] as const) {
    test(`DELETE /files/rooms/:id - Owner deletes a ${label}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: { title: `Autotest Delete ${label}`, roomType },
      });
      const roomId = createData.response!.id!;

      const { status } = await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      const operation = await waitForOperation(ownerApi.operations);

      expect(status).toBe(200);
      expect(operation.finished).toBe(true);
      expect(operation.error).toBe("");

      const { data: infoData } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });
      expect(infoData.statusCode).toBe(404);
    });
  }

  test("DELETE /files/rooms/:id - response is a FileOperation wrapper with id and finished flag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Response Shape",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(data.response).toBeDefined();
    expect(typeof data.response!.id).toBe("string");
    expect(typeof data.response!.finished).toBe("boolean");
    expect(typeof data.response!.progress).toBe("number");

    await waitForOperation(ownerApi.operations);
  });

  // ── Async / operation behavior ──

  test("DELETE /files/rooms/:id - operation transitions to finished:true with progress 100", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Async",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.error).toBe("");
  });

  test("DELETE /files/rooms/:id - repeated polling of finished operation is stable", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Polling",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const first = await waitForOperation(ownerApi.operations);
    expect(first.finished).toBe(true);

    const { data: opsData } = await ownerApi.operations.getOperationStatuses();
    const ops = opsData.response ?? [];
    if (ops.length > 0) {
      const last = ops[ops.length - 1];
      expect(last.finished).toBe(true);
      expect(last.error).toBe("");
    }
  });

  test("DELETE /files/rooms/:id - two rooms deleted sequentially both vanish", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: a } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Seq Delete A",
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: b } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Seq Delete B",
        roomType: RoomType.CustomRoom,
      },
    });
    const idA = a.response!.id!;
    const idB = b.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: idA,
      deleteRoomRequest: { deleteAfter: false },
    });
    const opA = await waitForOperation(ownerApi.operations);
    expect(opA.finished).toBe(true);

    await ownerApi.rooms.deleteRoom({
      id: idB,
      deleteRoomRequest: { deleteAfter: false },
    });
    const opB = await waitForOperation(ownerApi.operations);
    expect(opB.finished).toBe(true);

    const { data: aInfo } = await ownerApi.rooms.getRoomInfo({ id: idA });
    const { data: bInfo } = await ownerApi.rooms.getRoomInfo({ id: idB });
    expect(aInfo.statusCode).toBe(404);
    expect(bInfo.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - two concurrent deletes both succeed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: a } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Concurrent Delete A",
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: b } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Concurrent Delete B",
        roomType: RoomType.CustomRoom,
      },
    });
    const idA = a.response!.id!;
    const idB = b.response!.id!;

    const [resA, resB] = await Promise.all([
      ownerApi.rooms.deleteRoom({
        id: idA,
        deleteRoomRequest: { deleteAfter: false },
      }),
      ownerApi.rooms.deleteRoom({
        id: idB,
        deleteRoomRequest: { deleteAfter: false },
      }),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    await waitForOperation(ownerApi.operations);

    const { data: aInfo } = await ownerApi.rooms.getRoomInfo({ id: idA });
    const { data: bInfo } = await ownerApi.rooms.getRoomInfo({ id: idB });
    expect(aInfo.statusCode).toBe(404);
    expect(bInfo.statusCode).toBe(404);
  });

  // ── Edge cases ──

  test("DELETE /files/rooms/:id - second delete of already-deleted room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Double Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);
    expect(op.finished).toBe(true);

    const { data } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(data.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - deleting an archived room succeeds", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Archived",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    const archiveOp = await waitForOperation(ownerApi.operations);
    expect(archiveOp.finished).toBe(true);

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const deleteOp = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(deleteOp.finished).toBe(true);
    expect(deleteOp.error).toBe("");

    const { data: infoData } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(infoData.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - room with files is deleted along with its files", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Room With Files",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "delete-me.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);
    expect(op.finished).toBe(true);
    expect(op.error).toBe("");

    const { data: infoData } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(infoData.statusCode).toBe(404);

    const { data: fileInfo } = await ownerApi.files.getFileInfo({ fileId });
    expect(fileInfo.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - tag used only by the deleted room is removed from catalog", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "Autotest Tag Single Use";
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: tagName },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Room With Single-Use Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);
    expect(op.finished).toBe(true);

    const { data: tagsData } = await ownerApi.rooms.getRoomTagsInfo({});
    expect(tagsData.response as unknown as string[]).not.toContain(tagName);
  });

  test("DELETE /files/rooms/:id - tag still used by another room stays in catalog", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "Autotest Tag Shared";
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: tagName },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Room With Shared Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: keeperData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Keeper Room With Shared Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const keeperRoomId = keeperData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });
    await ownerApi.rooms.addRoomTags({
      id: keeperRoomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);
    expect(op.finished).toBe(true);

    const { data: tagsData } = await ownerApi.rooms.getRoomTagsInfo({});
    expect(tagsData.response as unknown as string[]).toContain(tagName);
  });

  test("DELETE /files/rooms/:id - room with cover is deleted successfully", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Room With Cover",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(op.finished).toBe(true);
    expect(op.error).toBe("");
  });

  test("DELETE /files/rooms/:id - room with logo is deleted successfully", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Room With Logo",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const tmpFile = uploadResult.data.response.data as string;
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile },
    });

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(op.finished).toBe(true);
    expect(op.error).toBe("");
  });

  test("DELETE /files/rooms/:id - room shared to user is no longer visible to that user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Shared Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    // Before deletion, the user can read the room.
    const { data: beforeInfo } = await userApi.rooms.getRoomInfo({
      id: roomId,
    });
    expect(beforeInfo.response!.id).toBe(roomId);

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);
    expect(op.finished).toBe(true);

    const { data: afterInfo } = await userApi.rooms.getRoomInfo({ id: roomId });
    expect([403, 404]).toContain(afterInfo.statusCode);

    const { data: list } = await userApi.rooms.getRoomsFolder({});
    const ids = (list.response!.folders ?? []).map((f) => (f as any).id);
    expect(ids).not.toContain(roomId);
  });

  test("DELETE /files/rooms/:id - PublicRoom with primary external link is fully removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete PublicRoom",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
      { id: roomId },
    );
    expect(linkData.response!.sharedLink?.shareLink).toBeDefined();

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);
    expect(op.finished).toBe(true);
    expect(op.error).toBe("");

    const { data: infoData } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(infoData.statusCode).toBe(404);

    const { data: afterLink } =
      await ownerApi.rooms.getRoomsPrimaryExternalLink({ id: roomId });
    expect(afterLink.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - room with per-room quota is deleted successfully", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.settingsQuota.saveRoomQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: 100 * 1024 * 1024,
      },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Quota Room",
        roomType: RoomType.CustomRoom,
        quota: 10 * 1024 * 1024,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(op.finished).toBe(true);
    expect(op.error).toBe("");
  });

  // ── Regression: ops on a deleted room ──

  test("DELETE /files/rooms/:id - changing cover on a deleted room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover After Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    expect(data.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - setting logo on a deleted room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo After Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const tmpFile = uploadResult.data.response.data as string;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile },
    });

    expect(data.statusCode).toBe(404);
  });

  // ── Validation: id ──

  test("DELETE /files/rooms/:id - id:0 returns 404", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoom({
      id: 0,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(data.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - id:-1 returns 404", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoom({
      id: -1,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(data.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - id:999999999 returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoom({
      id: 999999999,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(data.statusCode).toBe(404);
  });

  test("DELETE /files/rooms/:id - id:'abc' returns 404", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoom({
      id: "abc" as unknown as number,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(data.statusCode).toBe(404);
  });

  // ── Validation: body ──

  test("DELETE /files/rooms/:id - deleteAfter omitted is accepted (defaults to false)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete No deleteAfter",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: {},
    });
    const op = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(op.finished).toBe(true);
    expect(op.error).toBe("");
  });

  // Same symptom as deleteAfter:true — HTTP returns 200 but the operation is not pushed to
  // fileops, so waitForOperation cannot find a record.
  test.fail(
    "BUG 81697: DELETE /files/rooms/:id - deleteAfter:null does not produce a trackable operation",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete deleteAfter null",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = createData.response!.id!;

      const { status } = await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: null as unknown as boolean },
      });
      expect(status).toBe(200);

      const op = await waitForOperation(ownerApi.operations);
      expect(op.finished).toBe(true);
    },
  );

  test("DELETE /files/rooms/:id - deleteAfter as string is rejected (400)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete deleteAfter string",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: "false" as unknown as boolean },
    });

    expect(data.statusCode).toBe(400);
  });

  test("DELETE /files/rooms/:id - deleteAfter as number is rejected (400)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete deleteAfter number",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { data } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: 1 as unknown as boolean },
    });

    expect(data.statusCode).toBe(400);
  });

  test("DELETE /files/rooms/:id - extra undocumented field in body is ignored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: createData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Extra Field",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = createData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: {
        deleteAfter: false,
        title: "ignored",
      } as unknown as { deleteAfter: boolean },
    });
    const op = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(op.finished).toBe(true);
  });
});

test.describe("DELETE /files/rooms/:id/tags - deleteRoomTags", () => {
  // ── Positive ──

  test("DELETE /files/rooms/:id/tags - Owner detaches several tags in one request", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Several",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["TagA", "TagB", "TagC"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["TagA", "TagB"] },
    });

    expect(status).toBe(200);
    const tags = data.response!.tags as string[];
    expect(tags).toEqual(["TagC"]);
  });

  test("DELETE /files/rooms/:id/tags - Detached tag remains in global tags catalog", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "GlobalCatalogTag";

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: tagName },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Keeps Catalog",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
    expect(list.response as unknown as string[]).toContain(tagName);
  });

  test("DELETE /files/rooms/:id/tags - Detach from one room does not affect same tag on another room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "SharedRoomsTag";

    const { data: room1Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Tag Room 1",
        roomType: RoomType.CustomRoom,
      },
    });
    const room1Id = room1Data.response!.id!;

    const { data: room2Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Tag Room 2",
        roomType: RoomType.CustomRoom,
      },
    });
    const room2Id = room2Data.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: room1Id,
      batchTagsRequestDto: { names: [tagName] },
    });
    await ownerApi.rooms.addRoomTags({
      id: room2Id,
      batchTagsRequestDto: { names: [tagName] },
    });

    await ownerApi.rooms.deleteRoomTags({
      id: room1Id,
      batchTagsRequestDto: { names: [tagName] },
    });

    const { data: info1 } = await ownerApi.rooms.getRoomInfo({ id: room1Id });
    const { data: info2 } = await ownerApi.rooms.getRoomInfo({ id: room2Id });

    expect((info1.response!.tags ?? []) as string[]).not.toContain(tagName);
    expect((info2.response!.tags ?? []) as string[]).toContain(tagName);
  });

  test("DELETE /files/rooms/:id/tags - Detach one tag from a room with many tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Many Tags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const all = ["Many1", "Many2", "Many3", "Many4", "Many5"];
    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: all },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Many3"] },
    });

    expect(status).toBe(200);
    const tags = data.response!.tags as string[];
    expect(tags).not.toContain("Many3");
    expect(tags.length).toBe(4);
    for (const t of ["Many1", "Many2", "Many4", "Many5"]) {
      expect(tags).toContain(t);
    }
  });

  test("DELETE /files/rooms/:id/tags - Detach all tags leaves room with empty tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach All",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const names = ["All1", "All2", "All3"];
    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names },
    });

    expect(status).toBe(200);
    const tags = (data.response!.tags ?? []) as string[];
    expect(tags.length).toBe(0);
  });

  test("DELETE /files/rooms/:id/tags - Repeated detach of the same tag is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Idempotent",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["IdemTag"] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["IdemTag"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["IdemTag"] },
    });

    expect(status).toBe(200);
    const tags = (data.response!.tags ?? []) as string[];
    expect(tags).not.toContain("IdemTag");
  });

  test("DELETE /files/rooms/:id/tags - Detaches tag with cyrillic name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "Тег Кириллица";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cyrillic Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain(tagName);
  });

  test("DELETE /files/rooms/:id/tags - Detaches tag with spaces inside name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "release candidate";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Spaces Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain(tagName);
  });

  test("DELETE /files/rooms/:id/tags - Detaches tag with special characters in name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "tag-1_qa.test";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Special Chars Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain(tagName);
  });

  // ── Validation: room id ──

  // Room IDs are globally unique, so the API should return 403 instead of 404/500.
  // Mirrors BUG 81544 in addRoomTags.
  test.fail(
    "BUG 81544: DELETE /files/rooms/:id/tags - Non-existent room id returns 500 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.deleteRoomTags({
        id: 999999999,
        batchTagsRequestDto: { names: ["GhostTag"] },
      });
      expect(data.statusCode).toBe(403);
    },
  );

  // Mirrors BUG 81545 in addRoomTags — deleted room returns 500 instead of 403.
  test.fail(
    "BUG 81545: DELETE /files/rooms/:id/tags - Detaching tag from deleted room returns 500 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Detach From Deleted Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["NoTag"] },
      });

      expect(data.statusCode).toBe(403);
    },
  );

  test("DELETE /files/rooms/:id/tags - Detaching tag from archived room is forbidden (403)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach From Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ArchivedRoomTag"] },
    });
    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ArchivedRoomTag"] },
    });

    expect(status).toBe(403);
  });

  test("BUG 81703: DELETE /files/rooms/:id/tags - Invalid string room id does not return 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoomTags({
      id: "not-a-number" as unknown as number,
      batchTagsRequestDto: { names: ["X"] },
    });
    expect(data.statusCode).toBe(404);
  });

  test("BUG 81704: DELETE /files/rooms/:id/tags - Room id 0 returns 500 instead of 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoomTags({
      id: 0,
      batchTagsRequestDto: { names: ["X"] },
    });
    expect(data.statusCode).toBe(404);
  });

  // Note: missing room id (item 20) is enforced by the SDK route — the endpoint
  // cannot be invoked without an id, so there is no API-level test for it.

  // ── Validation: names body ──

  test("DELETE /files/rooms/:id/tags - Missing body returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Missing Body",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: undefined as unknown as { names: string[] },
    });

    expect(status).toBe(400);
  });

  test("DELETE /files/rooms/:id/tags - Missing names field returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Missing Names",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: {} as unknown as { names: string[] },
    });

    expect(status).toBe(400);
  });

  test("DELETE /files/rooms/:id/tags - Null names returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Null Names",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: null as unknown as string[] },
    });

    expect(status).toBe(400);
  });

  test("DELETE /files/rooms/:id/tags - Empty names array is a no-op and returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Empty Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["StayTag"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).toContain("StayTag");
  });

  for (const invalid of [
    { label: "string", value: "TagA" },
    { label: "number", value: 12345 },
    { label: "object", value: { foo: "bar" } },
  ]) {
    test(`DELETE /files/rooms/:id/tags - Non-array names (${invalid.label}) returns 400`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Non-array Names ${invalid.label}`,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: invalid.value } as unknown as {
          names: string[];
        },
      });

      expect(status).toBe(400);
    });
  }

  for (const invalid of [{ label: "number", value: 42 }]) {
    test(`DELETE /files/rooms/:id/tags - names array containing ${invalid.label} returns 400`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Bad Element ${invalid.label}`,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: {
          names: ["Valid", invalid.value as unknown as string],
        },
      });

      expect(status).toBe(400);
    });
  }

  test("BUG 81705: DELETE /files/rooms/:id/tags - names array containing null returns 200 instead of 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Bad Element null",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: {
        names: ["Valid", null as unknown as string],
      },
    });

    expect(status).toBe(400);
  });

  // deleteRoomTags treats empty/whitespace strings as non-matching names — no-op 200
  test("DELETE /files/rooms/:id/tags - names array containing empty string is a no-op (200)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Empty String Name",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Keep"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [""] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).toContain("Keep");
  });

  test("DELETE /files/rooms/:id/tags - names array containing spaces-only string is a no-op (200)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Spaces String Name",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Keep"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["   "] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).toContain("Keep");
  });

  test("DELETE /files/rooms/:id/tags - Duplicate names in array are handled (single detach effect)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Duplicate Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["DupDetach", "OtherTag"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["DupDetach", "DupDetach"] },
    });

    expect(status).toBe(200);
    const tags = (data.response!.tags ?? []) as string[];
    expect(tags).not.toContain("DupDetach");
    expect(tags).toContain("OtherTag");
  });

  // Mirrors BUG 81689 (deleteCustomTags) — likely no length guard on detach name either.
  test.fail(
    "BUG 81689: DELETE /files/rooms/:id/tags - Very long tag name (10000 chars) is silently accepted (200) instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Long Name Detach",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["a".repeat(10000)] },
      });

      expect(status).toBe(400);
    },
  );

  // ── Functional edge cases ──

  test("DELETE /files/rooms/:id/tags - Detach tag that exists in catalog but is not attached to this room is a no-op", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "CatalogOnly" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Not Attached",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["CatalogOnly"] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain(
      "CatalogOnly",
    );

    const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
    expect(list.response as unknown as string[]).toContain("CatalogOnly");
  });

  test("DELETE /files/rooms/:id/tags - Detach tag that does not exist in catalog is a no-op", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Ghost Tag",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["NeverExisted"] },
    });

    expect(status).toBe(200);
  });

  test("DELETE /files/rooms/:id/tags - Detach mix of attached and non-attached tags removes only attached ones", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Mix Attached",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["AttachedX"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["AttachedX", "NotAttachedY"] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain("AttachedX");
    expect((data.response!.tags ?? []) as string[]).not.toContain(
      "NotAttachedY",
    );
  });

  test("DELETE /files/rooms/:id/tags - Detach mix of valid and invalid (empty string) names: valid tag is removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Mix Valid Invalid",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ValidTag"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ValidTag", ""] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain("ValidTag");
  });

  test("DELETE /files/rooms/:id/tags - Case-insensitive: different-case name detaches the tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Case Insensitive Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["QA"] },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["qa"] },
    });

    expect(status).toBe(200);
    const tags = (data.response!.tags ?? []) as string[];
    expect(tags.filter((t) => t.toLowerCase() === "qa").length).toBe(0);
  });

  test("DELETE /files/rooms/:id/tags - Global tag deletion already removes tag from room, subsequent detach is a no-op", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "AboutToVanish";

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: tagName },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach After Global Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: [tagName] },
    });

    const { data: infoAfterGlobalDelete } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });
    expect(
      (infoAfterGlobalDelete.response!.tags ?? []) as string[],
    ).not.toContain(tagName);

    const { status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    expect(status).toBe(200);
  });

  test("DELETE /files/rooms/:id/tags - add -> detach -> add again restores tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const tagName = "AddDetachAddTag";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Add Detach Add",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });
    const { data, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [tagName] },
    });

    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).toContain(tagName);
  });

  test("DELETE /files/rooms/:id/tags - Detach does not change room title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const title = "Autotest Title Preserved On Detach";
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["TitleTag"] },
    });

    const { data } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["TitleTag"] },
    });

    expect(data.response!.title).toBe(title);
  });

  test("DELETE /files/rooms/:id/tags - Detach does not change room type", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Type Preserved On Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["TypeTag"] },
    });

    const { data } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["TypeTag"] },
    });

    expect(data.response!.roomType).toBe(RoomType.CustomRoom);
  });

  test("DELETE /files/rooms/:id/tags - Detach does not change cover/color/logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Preserved On Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId =
      (coversData.response as unknown as { id: string }[])?.[0]?.id ?? "";

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    const { data: infoBefore } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });
    const logoBefore = JSON.stringify(infoBefore.response!.logo ?? {});

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["CoverTag"] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["CoverTag"] },
    });

    const { data: infoAfter } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });
    expect(JSON.stringify(infoAfter.response!.logo ?? {})).toBe(logoBefore);
  });

  test("DELETE /files/rooms/:id/tags - Detach does not change sharing settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Sharing Preserved On Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });
    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["SharingTag"] },
    });

    const { data: shareBefore } = await ownerApi.rooms.getRoomSecurityInfo({
      id: roomId,
    });

    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["SharingTag"] },
    });

    const { data: shareAfter } = await ownerApi.rooms.getRoomSecurityInfo({
      id: roomId,
    });

    expect(JSON.stringify(shareAfter.response)).toBe(
      JSON.stringify(shareBefore.response),
    );
  });

  test("DELETE /files/rooms/:id/tags - Detach does not affect files/folders inside room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Contents Preserved On Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Inner Folder" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ContentsTag"] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ContentsTag"] },
    });

    const { data: content, status } =
      await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
    expect(status).toBe(200);
    const ids = (content.response!.folders ?? []).map(
      (f) => (f as { id: number }).id,
    );
    expect(ids).toContain(folderId);
  });

  test("DELETE /files/rooms/:id/tags - Rooms list reflects updated tags after detach", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomTitle = "Autotest List Reflects Detach";
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title: roomTitle, roomType: RoomType.CustomRoom },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ListTag"] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["ListTag"] },
    });

    const { data: rooms } = await filterRoomsFolder(ownerApi.rooms, roomTitle);
    const room = rooms.response!.folders!.find(
      (f) => (f as unknown as { id: number }).id === roomId,
    );
    expect(room).toBeDefined();
    expect(
      ((room as unknown as { tags?: string[] }).tags ?? []) as string[],
    ).not.toContain("ListTag");
  });

  test("DELETE /files/rooms/:id/tags - getRoomInfo reflects updated tags after detach", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetRoomInfo Detach",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["InfoTag"] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["InfoTag"] },
    });

    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(status).toBe(200);
    expect((data.response!.tags ?? []) as string[]).not.toContain("InfoTag");
  });

  // ── Integration with related endpoints ──

  test("DELETE /files/rooms/:id/tags - Full lifecycle: createTag -> addRoomTags -> deleteRoomTags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "LifecycleTag";

    await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Lifecycle",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: attached } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });
    expect((attached.response!.tags ?? []) as string[]).toContain(name);

    const { data: detached, status } = await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });
    expect(status).toBe(200);
    expect((detached.response!.tags ?? []) as string[]).not.toContain(name);
  });

  test("DELETE /files/rooms/:id/tags - After detach, global tag can still be deleted via DELETE /files/tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "GlobalDeletableTag";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Global Deletable",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });

    const { status } = await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: [name] },
    });
    expect(status).toBe(200);

    const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
    expect(list.response as unknown as string[]).not.toContain(name);
  });

  test("DELETE /files/rooms/:id/tags - After global delete, tag can be reattached because addRoomTags auto-creates it", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "RecreatableViaAdd";

    await ownerApi.rooms.createRoomTag({ createTagRequestDto: { name } });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reattach After Global Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });
    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });

    await ownerApi.rooms.deleteCustomTags({
      batchTagsRequestDto: { names: [name] },
    });

    const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
    expect(list.response as unknown as string[]).not.toContain(name);

    // addRoomTags auto-creates missing tag — see [[add_room_tags_creates_tags]]
    const { data: reattached, status } = await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });
    expect(status).toBe(200);
    expect((reattached.response!.tags ?? []) as string[]).toContain(name);
  });

  test("DELETE /files/rooms/:id/tags - deleteRoomTags does NOT create missing tag in catalog", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "NeverCreatedByDetach";

    const { data: list0 } = await ownerApi.rooms.getRoomTagsInfo();
    expect(list0.response as unknown as string[]).not.toContain(name);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Does Not Create",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });

    const { data: list1 } = await ownerApi.rooms.getRoomTagsInfo();
    expect(list1.response as unknown as string[]).not.toContain(name);
  });
});
