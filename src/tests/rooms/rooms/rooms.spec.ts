import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomsApi,
  RoomType,
  FileShare,
  LinkType,
  SearchArea,
  RoomDataLifetimePeriod,
  EmployeeStatus,
  SortOrder,
  UserInvitation,
  RoomLinkRequest,
} from "@onlyoffice/docspace-api-sdk";
import type { ApiSDK } from "@/src/services/api-sdk";
import {
  activeAreaRoomCount,
  createAllRoomTypes,
  createPrivateRoom,
  ensureEncryptionKeys,
  privateSupportedRoomTypes,
  privateUnsupportedRoomTypes,
} from "@/src/helpers/rooms";
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

  test.describe("POST /files/rooms - Private rooms", () => {
    for (const { label, roomType } of privateSupportedRoomTypes) {
      test(`POST /files/rooms - Owner creates a private ${label} room`, async ({
        apiSdk,
      }) => {
        const { data, status } = await createPrivateRoom(apiSdk, "owner", {
          title: `Autotest Private ${label}`,
          roomType,
        });

        expect(status).toBe(200);
        expect(data.response!.private).toBe(true);
        expect(data.response!.roomType).toBe(roomType);
      });
    }

    test("POST /files/rooms - Private flag persists in getRoomInfo", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await createPrivateRoom(apiSdk, "owner", {
        title: "Autotest Private Persist",
        roomType: RoomType.CustomRoom,
      });
      const roomId = created.response!.id!;

      const { data: info, status } = await ownerApi.rooms.getRoomInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(info.response!.private).toBe(true);
    });

    for (const { label, roomType } of privateUnsupportedRoomTypes) {
      test(`POST /files/rooms - Private ${label} room is rejected (link-based room)`, async ({
        apiSdk,
      }) => {
        // Public and FillingForms rooms auto-create external links, which are
        // incompatible with the private/encrypted flag.
        await ensureEncryptionKeys(apiSdk, "owner");
        const { status } = await apiSdk.forRole("owner").rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Private ${label}`,
            roomType,
            private: true,
          },
        });

        expect(status).toBe(403);
      });
    }

    test("POST /files/rooms - private:true without encryption keys is rejected", async ({
      apiSdk,
    }) => {
      // A private room needs the caller's encryption keys to exist first.
      const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Private No Keys",
          roomType: RoomType.CustomRoom,
          private: true,
        },
      });

      expect(status).toBe(403);
      expect(
        (data as { error?: { message?: string } }).error?.message,
      ).toContain("encryption key");
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
    const created = await createAllRoomTypes(apiSdk, "owner");

    await test.step("returns all created rooms with correct count", async () => {
      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      // The form filling room is NOT here - it lives in searchArea=Forms (see
      // the step below), so the default view lists four of the five rooms.
      expect(data.response!.folders!.length).toBe(activeAreaRoomCount);
      expect((data.response!.files as unknown[]).length).toBe(0);
      expect(data.response!.count).toBe(activeAreaRoomCount);
      expect(data.response!.total).toBe(activeAreaRoomCount);
      expect(data.response!.startIndex).toBe(0);
      expect(data.response!.folders![0].ownedBy!.id).toBe(api.adminUserId);
      expect(
        (data.response!.folders as any[]).map((f) => f.roomType),
      ).not.toContain(RoomType.FillingFormsRoom);
    });

    await test.step("the form filling room is listed in the Forms area", async () => {
      const formRoomId = created.find(
        (r) => r.roomType === RoomType.FillingFormsRoom,
      )!.id;

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });

      expect(status).toBe(200);
      expect((data.response!.folders as any[]).map((f) => f.id)).toEqual([
        formRoomId,
      ]);
      // ...and searchArea=Any spans both areas, so all five are reachable.
      const { data: any_ } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Any,
      });
      expect(any_.response!.total).toBe(created.length);
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

  // Comprehensive coverage of PUT /files/rooms/:id (updateRoom).
  // Behaviors below were verified empirically against the live backend.
  test.describe("PUT /files/rooms/:id - field coverage", () => {
    async function mkRoom(
      ownerApi: ReturnType<ApiSDK["forRole"]>,
      title: string,
      roomType: RoomType = RoomType.CustomRoom,
    ) {
      const { data } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: { title, roomType },
      });
      return data.response!.id!;
    }

    test("PUT /files/rooms/:id - Partial update keeps other fields", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;
      const roomId = await mkRoom(ownerApi, "Autotest Partial Base");

      // Seed several fields, then update ONLY the title.
      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
          tags: ["AutotestPartialTag"],
          color: "AABBCC",
          cover: coverId,
        },
      });

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Autotest Partial Updated" },
      });
      expect(status).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe("Autotest Partial Updated");
      expect(info.response!.tags).toContain("AutotestPartialTag");
      expect(info.response!.logo?.color).toBe("AABBCC");
      expect(info.response!.logo?.cover?.id).toBe(coverId);
    });

    test("PUT /files/rooms/:id - Empty body is a no-op", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Empty Body");

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {},
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Empty Body");

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe("Autotest Empty Body");
    });

    // Forbidden chars in the title are silently replaced with `_` (one per code
    // unit — an emoji is a surrogate pair, so it becomes `__`). No 400.
    for (const { raw, sanitized } of [
      { raw: 'Room "Test"', sanitized: "Room _Test_" },
      { raw: "Room <Test>", sanitized: "Room _Test_" },
      { raw: "Room / Test", sanitized: "Room _ Test" },
      { raw: "Room \\ Test", sanitized: "Room _ Test" },
      { raw: "Party 🎉 Time", sanitized: "Party __ Time" },
    ]) {
      test(`PUT /files/rooms/:id - Title "${raw}" is sanitized to "${sanitized}"`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(ownerApi, "Autotest Sanitize Base");

        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { title: raw },
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe(sanitized);

        const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.response!.title).toBe(sanitized);
      });
    }

    test("PUT /files/rooms/:id - Single-char title is accepted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Min Title Base");

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "A" },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe("A");
    });

    test("PUT /files/rooms/:id - Title at max length (170) is accepted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Max Title Base");
      const title = "L".repeat(170);

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe(title);
    });

    test("PUT /files/rooms/:id - Title over max length (171) is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const original = "Autotest Overlong Base";
      const roomId = await mkRoom(ownerApi, original);

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "L".repeat(171) },
      });

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe(original);
      expect(status).toBe(400);
    });

    test("PUT /files/rooms/:id - Whitespace-only title is a no-op", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const original = "Autotest Whitespace Base";
      const roomId = await mkRoom(ownerApi, original);

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "   " },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe(original);
    });

    test("PUT /files/rooms/:id - Null title is a no-op", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const original = "Autotest Null Title Base";
      const roomId = await mkRoom(ownerApi, original);

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: null },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe(original);
    });

    test("PUT /files/rooms/:id - Tags: add, replace, clear, dedupe", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Tags Room");

      async function tagsOf() {
        const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        return (data.response!.tags ?? []) as string[];
      }

      await test.step("add single tag", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { tags: ["AutotestTagA"] },
        });
        expect(status).toBe(200);
        expect(await tagsOf()).toEqual(["AutotestTagA"]);
      });

      await test.step("add multiple tags (order not guaranteed)", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { tags: ["AutotestTagB", "AutotestTagC"] },
        });
        expect(status).toBe(200);
        expect(await tagsOf()).toEqual(
          expect.arrayContaining(["AutotestTagB", "AutotestTagC"]),
        );
      });

      await test.step("replace list", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { tags: ["AutotestTagD"] },
        });
        expect(status).toBe(200);
        expect(await tagsOf()).toEqual(["AutotestTagD"]);
      });

      await test.step("clear via empty array", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { tags: [] },
        });
        expect(status).toBe(200);
        expect(await tagsOf()).toEqual([]);
      });

      await test.step("duplicates are deduplicated", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { tags: ["AutotestDup", "AutotestDup"] },
        });
        expect(status).toBe(200);
        expect(await tagsOf()).toEqual(["AutotestDup"]);
      });
    });

    test("PUT /files/rooms/:id - Overlong tag is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Long Tag Room");

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { tags: ["T".repeat(300)] },
      });

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.tags ?? []).toEqual([]);
      expect(status).toBe(400);
    });

    // Tags are NOT sanitized the way titles are — forbidden chars are stored verbatim.
    test("PUT /files/rooms/:id - Tag with forbidden chars is stored verbatim", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Tag Chars Room");
      const tag = 'Bad<>/"\\';

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { tags: [tag] },
      });

      expect(status).toBe(200);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.tags).toContain(tag);
    });

    test("PUT /files/rooms/:id - Color: set, replace, empty resets, null no-op", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Color Room");

      async function colorOf() {
        const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        return data.response!.logo?.color;
      }

      await test.step("set valid color", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { color: "FF5733" },
        });
        expect(status).toBe(200);
        expect(await colorOf()).toBe("FF5733");
      });

      await test.step("replace color", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { color: "00AA00" },
        });
        expect(status).toBe(200);
        expect(await colorOf()).toBe("00AA00");
      });

      await test.step("empty string resets to a new valid hex", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { color: "" },
        });
        expect(status).toBe(200);
        const reset = await colorOf();
        expect(reset).toMatch(/^[0-9A-Fa-f]{6}$/);
        expect(reset).not.toBe("00AA00");
      });

      await test.step("null is a no-op", async () => {
        const before = await colorOf();
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { color: null },
        });
        expect(status).toBe(200);
        expect(await colorOf()).toBe(before);
      });
    });

    test("PUT /files/rooms/:id - Color with leading '#' is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Color Hash Room");
      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { color: "FF5733" },
      });

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { color: "#FF5733" },
      });

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.logo?.color).toBe("FF5733");
      expect(status).toBe(400);
    });

    // The API validates SOME color formats (rejects "#FF5733" with 400) but
    // still accepts clearly-invalid non-hex values, which is inconsistent.
    for (const color of ["ZZZZZZ", "123"]) {
      test.fail(
        `BUG 82364: PUT /files/rooms/:id - Invalid color "${color}" should return 400 (validation), but API accepts it (200)`,
        async ({ apiSdk }) => {
          const ownerApi = apiSdk.forRole("owner");
          const roomId = await mkRoom(ownerApi, "Autotest Bad Color Room");

          const { status } = await ownerApi.rooms.updateRoom({
            id: roomId,
            updateRoomRequest: { color },
          });

          expect(status).toBe(400);
        },
      );
    }

    test("PUT /files/rooms/:id - Cover: set, replace, empty clears, null no-op", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;
      const coverId2 = covers.response![1]!.id!;
      const roomId = await mkRoom(ownerApi, "Autotest Cover Room");

      async function coverOf() {
        const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        return data.response!.logo?.cover?.id;
      }

      await test.step("set valid cover", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { cover: coverId },
        });
        expect(status).toBe(200);
        expect(await coverOf()).toBe(coverId);
      });

      await test.step("replace cover", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { cover: coverId2 },
        });
        expect(status).toBe(200);
        expect(await coverOf()).toBe(coverId2);
      });

      await test.step("empty string clears cover", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { cover: "" },
        });
        expect(status).toBe(200);
        expect(await coverOf()).toBeUndefined();
      });
    });

    test("PUT /files/rooms/:id - Invalid cover id is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;
      const roomId = await mkRoom(ownerApi, "Autotest Bad Cover Room");
      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { cover: coverId },
      });

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { cover: "does-not-exist" },
      });

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.logo?.cover?.id).toBe(coverId);
      expect(status).toBe(400);
    });

    test("PUT /files/rooms/:id - Toggle indexing off on VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest VDR Index Off",
        RoomType.VirtualDataRoom,
      );
      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { indexing: true },
      });

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { indexing: false },
      });

      expect(status).toBe(200);
      expect(data.response!.indexing).toBe(false);
    });

    // The backend does not restrict `indexing` to VDR rooms — a CustomRoom accepts it.
    test("PUT /files/rooms/:id - CustomRoom accepts indexing:true", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Custom Index");

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { indexing: true },
      });

      expect(status).toBe(200);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.indexing).toBe(true);
    });

    test("PUT /files/rooms/:id - Toggle denyDownload on VDR room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest Deny Download",
        RoomType.VirtualDataRoom,
      );

      const on = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { denyDownload: true },
      });
      expect(on.status).toBe(200);
      expect(on.data.response!.denyDownload).toBe(true);

      const off = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { denyDownload: false },
      });
      expect(off.status).toBe(200);
      expect(off.data.response!.denyDownload).toBe(false);
    });

    test("PUT /files/rooms/:id - Watermark: change and disable on VDR", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest Watermark",
        RoomType.VirtualDataRoom,
      );

      await test.step("enable then change watermark", async () => {
        await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            watermark: {
              enabled: true,
              additions: 1,
              text: "Conf",
              rotate: 0,
              imageScale: 100,
            },
          },
        });

        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            watermark: {
              enabled: true,
              additions: 2,
              text: "Secret",
              rotate: 45,
              imageScale: 50,
            },
          },
        });
        expect(status).toBe(200);

        const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.response!.watermark?.text).toBe("Secret");
        expect(info.response!.watermark?.additions).toBe(2);
        expect(info.response!.watermark?.rotate).toBe(45);
        expect(data.response!.watermark?.text).toBe("Secret");
      });

      await test.step("disable watermark", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { watermark: { enabled: false } },
        });
        expect(status).toBe(200);

        const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.response!.watermark?.text).toBeUndefined();
      });
    });

    test("PUT /files/rooms/:id - Lifetime: change, disable, reject negative", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest Lifetime",
        RoomType.VirtualDataRoom,
      );

      await test.step("set then change lifetime", async () => {
        await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            lifetime: {
              deletePermanently: true,
              period: 0,
              value: 30,
              enabled: true,
            },
          },
        });

        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            lifetime: {
              deletePermanently: false,
              period: 1,
              value: 6,
              enabled: true,
            },
          },
        });
        expect(status).toBe(200);

        const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.response!.lifetime?.value).toBe(6);
        expect(info.response!.lifetime?.period).toBe(1);
        expect(info.response!.lifetime?.deletePermanently).toBe(false);
      });

      await test.step("disable lifetime", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { lifetime: { enabled: false } },
        });
        expect(status).toBe(200);

        const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.response!.lifetime).toBeUndefined();
      });

      await test.step("negative lifetime value is rejected", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            lifetime: {
              deletePermanently: true,
              period: 0,
              value: -5,
              enabled: true,
            },
          },
        });
        expect(status).toBe(400);
      });
    });

    test("PUT /files/rooms/:id - Form settings on FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest Form Settings",
        RoomType.FillingFormsRoom,
      );

      async function formSettings() {
        const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        return {
          send: (data.response as any).sendFormToExternalDB as boolean,
          xlsx: (data.response as any).saveFormAsXLSX as boolean,
        };
      }

      await test.step("enable both", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            sendFormToExternalDB: true,
            saveFormAsXLSX: true,
          },
        });
        expect(status).toBe(200);
        expect(await formSettings()).toEqual({ send: true, xlsx: true });
      });

      await test.step("disable one (partial)", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { saveFormAsXLSX: false },
        });
        expect(status).toBe(200);
        expect(await formSettings()).toEqual({ send: true, xlsx: false });
      });

      await test.step("disable both", async () => {
        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: {
            sendFormToExternalDB: false,
            saveFormAsXLSX: false,
          },
        });
        expect(status).toBe(200);
        expect(await formSettings()).toEqual({ send: false, xlsx: false });
      });
    });

    // chatSettings only belongs to an AI room: the field is part of the room DTO
    // for RoomType.AiRoom (which reports security.UseChat) and absent on a plain
    // CustomRoom. Sending it for a CustomRoom must be a validation error, but the
    // API answers 200 and drops it on the floor, so the caller believes it
    // configured a chat that does not exist. The no-op is verified first, so only
    // the status drives the expected failure.
    test("PUT /files/rooms/:id - chatSettings on CustomRoom is rejected", async ({
      apiSdk,
    }) => {
      test.fail(
        true,
        "BUG 82798: updateRoom accepts chatSettings on a non-AI room with 200 and silently ignores it instead of 400",
      );
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Chat Settings");

      const { status, data } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
          chatSettings: {
            providerId: -1,
            modelId: "gpt-5.5",
            prompt: "Hi",
            internal: true,
          },
        },
      });

      // Nothing was stored: neither the update response nor a fresh read carries
      // chatSettings (an AI room would - see the AI room coverage below).
      expect((data.response as any)?.chatSettings).toBeUndefined();
      const after = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect((after.data.response as any)?.chatSettings).toBeUndefined();
      expect(status).toBe(400);
    });

    test("PUT /files/rooms/:id - chatSettings applies to an AI room", async ({
      apiSdk,
    }) => {
      // Positive control for the test above: the same field IS honoured on an AI
      // room, so the CustomRoom no-op is about the room type and not about the
      // field being unsupported everywhere.
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AI Chat Settings",
          roomType: RoomType.AiRoom,
        },
      });
      const roomId = created.response!.id!;
      expect((created.response as any).chatSettings).toBeDefined();

      const { status, data } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { chatSettings: { prompt: "Autotest prompt" } },
      });

      expect(status).toBe(200);
      expect((data.response as any).chatSettings?.prompt).toBe(
        "Autotest prompt",
      );
      const after = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect((after.data.response as any).chatSettings?.prompt).toBe(
        "Autotest prompt",
      );
    });

    test("PUT /files/rooms/:id - Update multiple fields in one request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;
      const roomId = await mkRoom(ownerApi, "Autotest Multi Field");

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: {
          title: "Autotest Multi Field Updated",
          tags: ["AutotestMultiTag"],
          color: "123ABC",
          cover: coverId,
          denyDownload: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe("Autotest Multi Field Updated");

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe("Autotest Multi Field Updated");
      expect(info.response!.tags).toContain("AutotestMultiTag");
      expect(info.response!.logo?.color).toBe("123ABC");
      expect(info.response!.logo?.cover?.id).toBe(coverId);
      expect(info.response!.denyDownload).toBe(true);
    });

    test("PUT /files/rooms/:id - Re-applying the same values is idempotent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Idempotent");
      const body = {
        title: "Autotest Idempotent Final",
        tags: ["AutotestIdemTag"],
        color: "ABCDEF",
      };

      const first = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: body,
      });
      const second = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: body,
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe("Autotest Idempotent Final");
      expect(info.response!.tags).toEqual(["AutotestIdemTag"]);
      expect(info.response!.logo?.color).toBe("ABCDEF");
    });

    test("PUT /files/rooms/:id - Sequential updates: last write wins", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Sequential");

      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Autotest Sequential First" },
      });
      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Autotest Sequential Second" },
      });
      expect(status).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.title).toBe("Autotest Sequential Second");
    });

    test("PUT /files/rooms/:id - Successful response matches FolderIntegerWrapper shape", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Shape");

      const { data, status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Autotest Shape Updated" },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(roomId);
      expect(data.response!.title).toBe("Autotest Shape Updated");
    });

    test("PUT /files/rooms/:id - Update does not reset members, pin, owner", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Side Effects");

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const memberId = memberData.response!.id!;
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: memberId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.pinRoom({ id: roomId });

      const { data: before } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      const ownerId = before.response!.createdBy?.id;

      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Autotest Side Effects Updated" },
      });

      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.id).toBe(roomId);
      expect(info.response!.pinned).toBe(true);
      expect(info.response!.createdBy?.id).toBe(ownerId);

      const { data: security } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const memberIds = security.response!.map((m) => m.sharedToUser?.id);
      expect(memberIds).toContain(memberId);
    });

    test("PUT /files/rooms/:id - id=0 returns 403", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.updateRoom({
        id: 0,
        updateRoomRequest: { title: "x" },
      });
      expect(status).toBe(403);
    });

    test("PUT /files/rooms/:id - id=-1 returns 403", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.updateRoom({
        id: -1,
        updateRoomRequest: { title: "x" },
      });
      expect(status).toBe(403);
    });

    test("PUT /files/rooms/:id - Non-numeric id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.updateRoom({
        id: "abc" as unknown as number,
        updateRoomRequest: { title: "x" },
      });
      expect(status).toBe(404);
    });

    test("PUT /files/rooms/:id - Float id returns 404", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.updateRoom({
        id: 1.5 as unknown as number,
        updateRoomRequest: { title: "x" },
      });
      expect(status).toBe(404);
    });

    test("PUT /files/rooms/:id - Null id throws at SDK level", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.updateRoom({
          id: null as unknown as number,
          updateRoomRequest: { title: "x" },
        }),
      ).rejects.toThrow(/Required parameter id/);
    });

    test("PUT /files/rooms/:id - Updating a deleted room does not resurrect it", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest Deleted Room");
      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Resurrect" },
      });
      expect(status).toBe(403);

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const ids = (list.response!.folders as any[]).map((f) => f.id);
      expect(ids).not.toContain(roomId);
    });

    // Wrong-typed fields are rejected with 400 and leave the room unchanged.
    for (const { name, body } of [
      { name: "title (number)", body: { title: 123 } },
      { name: "tags (string)", body: { tags: "notarray" } },
      { name: "color (number)", body: { color: 123 } },
      { name: "denyDownload (string)", body: { denyDownload: "yes" } },
      { name: "indexing (string)", body: { indexing: "no" } },
    ]) {
      test(`PUT /files/rooms/:id - Wrong type for ${name} returns 400`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const original = "Autotest Wrong Type Base";
        const roomId = await mkRoom(ownerApi, original);

        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: body as any,
        });

        const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.response!.title).toBe(original);
        expect(status).toBe(400);
      });
    }

    // Undocumented parameters should be rejected (see the `share` param, BUG 81582),
    // but the API silently ignores them and applies the known fields.
    test.fail(
      "BUG 82365: PUT /files/rooms/:id - Unknown field should be rejected (400) but is silently ignored (200)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(ownerApi, "Autotest Unknown Field");

        const { status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { title: "ok", totallyBogus: 123 } as any,
        });

        expect(status).toBe(400);
      },
    );
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

  // PUT /files/rooms/:id/unarchive — unarchiveRoom.
  // Moves a room from Archive back to the active Rooms list. The call is
  // asynchronous: it returns a FileOperationWrapper (data.response is a
  // FileOperationDto) and the state change is only guaranteed once the operation
  // reported by getOperationStatuses is finished — hence waitForOperation after
  // every successful call. Owner happy-path lists/metadata/pin coverage lives in
  // the "PUT /files/rooms/:id/archive" block above; this block covers request
  // body variants, id validation, the async contract, and integration cycles.
  test.describe("PUT /files/rooms/:id/unarchive", () => {
    type RoleApi = ReturnType<ApiSDK["forRole"]>;

    async function createArchivedRoom(
      api: RoleApi,
      title: string,
      roomType: RoomType = RoomType.CustomRoom,
      extra: Record<string, unknown> = {},
    ) {
      const { data } = await api.rooms.createRoom({
        createRoomRequestDto: { title, roomType, ...extra },
      });
      const roomId = data.response!.id!;
      await api.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(api.operations);
      return roomId;
    }

    async function isInActiveList(
      api: { rooms: RoomsApi },
      roomId: number,
    ): Promise<boolean> {
      const { data } = await api.rooms.getRoomsFolder({
        searchArea: SearchArea.Active,
      });
      return data.response!.folders!.some((f) => (f as any).id === roomId);
    }

    async function isInArchiveList(
      api: { rooms: RoomsApi },
      roomId: number,
    ): Promise<boolean> {
      const { data } = await api.rooms.getRoomsFolder({
        searchArea: SearchArea.Archive,
      });
      return data.response!.folders!.some((f) => (f as any).id === roomId);
    }

    test.describe("Request body variants", () => {
      test("PUT /files/rooms/:id/unarchive - Works without a request body", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive No Body",
        );

        const { status } = await ownerApi.rooms.unarchiveRoom({ id: roomId });
        const operation = await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(operation.finished).toBe(true);
        expect(operation.error).toBe("");
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);
        expect(await isInArchiveList(ownerApi, roomId)).toBe(false);
      });

      test("PUT /files/rooms/:id/unarchive - Works with empty body {}", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Empty Body",
        );

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: {},
        });
        const operation = await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(operation.finished).toBe(true);
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);
      });

      test("PUT /files/rooms/:id/unarchive - Works with deleteAfter: true", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive deleteAfter true",
        );

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: true },
        });

        // deleteAfter: true still restores the room. Unlike deleteAfter: false it
        // enqueues no async operation (getOperationStatuses stays empty) — the
        // room is moved back to Active synchronously, so poll the list directly
        // instead of waitForOperation.
        expect(status).toBe(200);
        await expect(async () => {
          expect(await isInActiveList(ownerApi, roomId)).toBe(true);
        }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
        expect(await isInArchiveList(ownerApi, roomId)).toBe(false);
      });

      test("PUT /files/rooms/:id/unarchive - Unknown body fields are ignored", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Extra Fields",
        );

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false, bogus: "x", n: 1 } as any,
        });
        const operation = await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(operation.finished).toBe(true);
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);
      });

      test("PUT /files/rooms/:id/unarchive - Invalid deleteAfter type (string) returns 400", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Bad deleteAfter",
        );

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: "false" as any },
        });

        // Room must stay archived on a rejected request.
        expect(await isInArchiveList(ownerApi, roomId)).toBe(true);
        expect(status).toBe(400);
      });
    });

    test.describe("Async operation contract", () => {
      test("PUT /files/rooms/:id/unarchive - Response is a FileOperationWrapper", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Wrapper",
        );

        const { data, status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBeDefined();
        expect(typeof data.response!.progress).toBe("number");
        expect(typeof data.response!.finished).toBe("boolean");
      });

      test("PUT /files/rooms/:id/unarchive - Second call while the operation is running does not corrupt state", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Double Call",
        );

        const first = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        const second = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        const operation = await waitForOperation(ownerApi.operations);

        // Neither call should 500; the room ends up active and consistent.
        expect(first.status).toBe(200);
        expect([200, 403]).toContain(second.status);
        expect(operation.finished).toBe(true);
        expect(operation.error).toBe("");
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);
        expect(await isInArchiveList(ownerApi, roomId)).toBe(false);
      });

      test("PUT /files/rooms/:id/unarchive - Unarchiving an already active room is a no-op (200)", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Repeat",
        );

        await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        // Room is already active; a second unarchive must not error or re-archive it.
        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);
        expect(await isInArchiveList(ownerApi, roomId)).toBe(false);
      });

      test("PUT /files/rooms/:id/unarchive - Active (never archived) room returns 200 and stays active", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: created } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Unarchive Never Archived",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = created.response!.id!;

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);
        expect(await isInArchiveList(ownerApi, roomId)).toBe(false);
      });
    });

    test.describe("Invalid id validation", () => {
      test("PUT /files/rooms/:id/unarchive - Non-existent room id returns 404", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        const { data } = await ownerApi.rooms.unarchiveRoom({
          id: 999999999,
          archiveRoomRequest: { deleteAfter: false },
        });

        expect(data.statusCode).toBe(404);
      });

      test("PUT /files/rooms/:id/unarchive - Deleted room id returns 404", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: created } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Unarchive Deleted Room",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = created.response!.id!;

        await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { data } = await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });

        expect(data.statusCode).toBe(404);
      });

      test("PUT /files/rooms/:id/unarchive - id = 0 must not return 200", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: 0,
          archiveRoomRequest: { deleteAfter: false },
        });

        expect(status).not.toBe(200);
      });

      test("PUT /files/rooms/:id/unarchive - Negative id must not return 200", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: -1,
          archiveRoomRequest: { deleteAfter: false },
        });

        expect(status).not.toBe(200);
      });

      test("PUT /files/rooms/:id/unarchive - Missing id throws before the request is sent", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        await expect(
          ownerApi.rooms.unarchiveRoom({
            archiveRoomRequest: { deleteAfter: false },
          } as any),
        ).rejects.toThrow();
      });

      test("PUT /files/rooms/:id/unarchive - Non-numeric id does not succeed", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        const { status } = await ownerApi.rooms.unarchiveRoom({
          id: "abc" as any,
          archiveRoomRequest: { deleteAfter: false },
        });

        expect(status).not.toBe(200);
      });
    });

    test.describe("Integration cycles", () => {
      test("PUT /files/rooms/:id/unarchive - Room can be archived, unarchived, then archived again", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Re-archive",
        );

        await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);
        expect(await isInActiveList(ownerApi, roomId)).toBe(true);

        const { status } = await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        const operation = await waitForOperation(ownerApi.operations);

        expect(status).toBe(200);
        expect(operation.finished).toBe(true);
        expect(await isInArchiveList(ownerApi, roomId)).toBe(true);
        expect(await isInActiveList(ownerApi, roomId)).toBe(false);
      });

      test("PUT /files/rooms/:id/unarchive - Unarchived room can be renamed again", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Rename",
        );

        // Rename is forbidden while archived (read-only), allowed once restored.
        const archivedRename = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { title: "Should Fail While Archived" },
        });
        expect(archivedRename.status).toBe(403);

        await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { data, status } = await ownerApi.rooms.updateRoom({
          id: roomId,
          updateRoomRequest: { title: "Renamed After Unarchive" },
        });

        expect(status).toBe(200);
        expect(data.response!.title).toBe("Renamed After Unarchive");
      });

      test("PUT /files/rooms/:id/unarchive - Unarchived room can be shared again", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: memberData } = await apiSdk.addMember("owner", "User");
        const userId = memberData.response!.id!;

        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive Share",
        );

        await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.Editing }],
            notify: false,
          },
        });

        expect(status).toBe(200);
      });

      test("PUT /files/rooms/:id/unarchive - Room content (file and folder) survives archive → unarchive", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Unarchive Content Round-Trip",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { data: fileData } = await ownerApi.files.createFile({
          folderId: roomId,
          createFileJsonElement: { title: "Autotest File Round-Trip" },
        });
        const fileId = fileData.response!.id!;

        const { data: folderData } = await ownerApi.folders.createFolder({
          folderId: roomId,
          createFolder: { title: "Autotest Folder Round-Trip" },
        });
        const folderId = folderData.response!.id!;

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

      test("PUT /files/rooms/:id/unarchive - Unarchived VDR room can start index export", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createArchivedRoom(
          ownerApi,
          "Autotest Unarchive VDR IndexExport",
          RoomType.VirtualDataRoom,
          { indexing: true },
        );

        await ownerApi.rooms.unarchiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { data, status } = await ownerApi.rooms.startRoomIndexExport({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.id).toBeDefined();
        expect(data.response!.error).toBeFalsy();

        await ownerApi.rooms.terminateRoomIndexExport();
      });
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

  // Behavior of pinRoom/unpinRoom verified empirically (see memory pin_room_behavior):
  // - pinned rooms float to the top of getRoomsFolder as a group, regardless of sort;
  // - pinning is PER-USER, not global (each user has independent pin state);
  // - pin is idempotent; missing numeric id -> 403 "The required folder was not found"
  //   (not 404), "abc" -> 404, null/undefined -> SDK throws;
  // - archived/deleted rooms cannot be pinned; pin does not survive archive.
  test.describe("PUT /files/rooms/:id/pin", () => {
    async function createRoom(
      api: { rooms: RoomsApi },
      title: string,
      roomType: RoomType = RoomType.CustomRoom,
    ) {
      const { data } = await api.rooms.createRoom({
        createRoomRequestDto: { title, roomType },
      });
      return data.response!.id!;
    }

    // Locate a room in the caller's getRoomsFolder view. Form filling rooms are
    // not in the default Active area - they list under searchArea=Forms - so the
    // area has to be passed explicitly for them.
    async function findRoomRow(
      api: { rooms: RoomsApi },
      roomId: number,
      searchArea: SearchArea = SearchArea.Active,
    ) {
      const { data } = await api.rooms.getRoomsFolder({ searchArea });
      const folders = data.response!.folders!;
      const matches = folders.filter((f) => (f as any).id === roomId);
      const row = matches[0] as any;
      return {
        folders,
        row,
        count: matches.length,
        index: row ? folders.indexOf(row) : -1,
      };
    }

    // Assert the real effect of pinning: the room is present, flagged pinned in the
    // list, appears exactly once, and sits above the first unpinned room.
    async function expectPinnedOnTop(
      api: { rooms: RoomsApi },
      roomId: number,
      searchArea: SearchArea = SearchArea.Active,
    ) {
      const { folders, row, count, index } = await findRoomRow(
        api,
        roomId,
        searchArea,
      );
      expect(count, `room ${roomId} should appear exactly once`).toBe(1);
      expect(row.pinned).toBe(true);
      const firstUnpinned = folders.findIndex((f) => !(f as any).pinned);
      if (firstUnpinned !== -1) {
        expect(index).toBeLessThan(firstUnpinned);
      }
    }

    test.describe("Contract / basic response", () => {
      test("PUT /files/rooms/:id/pin - Owner can pin own room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Contract");

        const { data, status } = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBe(roomId);
        expect(data.response!.pinned).toBe(true);
      });

      test("PUT /files/rooms/:id/pin - Response has FolderIntegerWrapper shape", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Shape");

        const { data } = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(data.status).toBeDefined();
        expect(data.statusCode).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBe(roomId);
        expect(data.response!.title).toBe("Autotest Pin Shape");
        expect(data.response!.roomType).toBe(RoomType.CustomRoom);
        expect(typeof data.response!.pinned).toBe("boolean");
      });

      test("PUT /files/rooms/:id/pin - No request body is required", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin No Body");

        // Only the path id is passed - no body.
        const { status, data } = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(status).toBe(200);
        expect(data.response!.pinned).toBe(true);
      });
    });

    test.describe("Functional behavior", () => {
      test("PUT /files/rooms/:id/pin - Pinned room appears above unpinned rooms", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await createRoom(ownerApi, "Autotest Pin Order A");
        const b = await createRoom(ownerApi, "Autotest Pin Order B");
        await createRoom(ownerApi, "Autotest Pin Order C");

        await ownerApi.rooms.pinRoom({ id: b });

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const folders = data.response!.folders!;
        const pinnedIndex = folders.findIndex((f) => (f as any).id === b);
        const firstUnpinnedIndex = folders.findIndex((f) => !(f as any).pinned);

        expect((folders[pinnedIndex] as any).pinned).toBe(true);
        expect(pinnedIndex).toBeLessThan(firstUnpinnedIndex);
      });

      test("PUT /files/rooms/:id/pin - Several pinned rooms appear before unpinned rooms", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await createRoom(ownerApi, "Autotest MultiPin A");
        const b = await createRoom(ownerApi, "Autotest MultiPin B");
        await createRoom(ownerApi, "Autotest MultiPin C");
        const d = await createRoom(ownerApi, "Autotest MultiPin D");

        await ownerApi.rooms.pinRoom({ id: b });
        await ownerApi.rooms.pinRoom({ id: d });

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const folders = data.response!.folders!;
        const pinnedFlags = folders.map((f) => (f as any).pinned);
        // Pinned section is a contiguous prefix: no unpinned room precedes a pinned one.
        const lastPinned = pinnedFlags.lastIndexOf(true);
        const firstUnpinned = pinnedFlags.indexOf(false);

        expect(folders.filter((f) => (f as any).pinned).length).toBe(2);
        expect(lastPinned).toBeLessThan(firstUnpinned);
      });

      test("PUT /files/rooms/:id/pin - Pinning a room does not remove it from the list", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Stays");

        await ownerApi.rooms.pinRoom({ id: roomId });

        const { row, count } = await findRoomRow(ownerApi, roomId);
        // Still present (exactly once) and now flagged pinned - not removed.
        expect(count).toBe(1);
        expect(row.pinned).toBe(true);
      });

      test("PUT /files/rooms/:id/unpin - Unpinning returns room to the unpinned group", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const a = await createRoom(ownerApi, "Autotest Unpin Group A");
        const b = await createRoom(ownerApi, "Autotest Unpin Group B");

        await ownerApi.rooms.pinRoom({ id: a });
        await ownerApi.rooms.pinRoom({ id: b });
        await ownerApi.rooms.unpinRoom({ id: b });

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const folders = data.response!.folders!;
        const aRow = folders.find((f) => (f as any).id === a) as any;
        const bRow = folders.find((f) => (f as any).id === b) as any;
        const aIndex = folders.indexOf(aRow);
        const bIndex = folders.indexOf(bRow);

        expect(aRow.pinned).toBe(true);
        expect(bRow.pinned).toBe(false);
        // Still-pinned A is above the now-unpinned B.
        expect(aIndex).toBeLessThan(bIndex);
      });

      test("PUT /files/rooms/:id/pin - Pinning is idempotent", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Idempotent");

        const first = await ownerApi.rooms.pinRoom({ id: roomId });
        const second = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const occurrences = data.response!.folders!.filter(
          (f) => (f as any).id === roomId,
        );
        expect(occurrences.length).toBe(1);
        expect((occurrences[0] as any).pinned).toBe(true);
      });

      test("PUT /files/rooms/:id/pin - Pin works again after unpin", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Again");

        await ownerApi.rooms.pinRoom({ id: roomId });
        await ownerApi.rooms.unpinRoom({ id: roomId });
        const repin = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(repin.status).toBe(200);
        expect(repin.data.response!.pinned).toBe(true);
      });

      test("PUT /files/rooms/:id/pin - Pinning is per-user, not global", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin PerUser");

        const { api: userApi, data: userData } =
          await apiSdk.addAuthenticatedMember("owner", "User");
        await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [
              { id: userData.response!.id!, access: FileShare.Read },
            ],
            notify: false,
          },
        });

        // Returns the pinned flag for the SAME room as seen by this caller. Asserts the
        // room is actually visible first - otherwise a missing room would read as
        // `undefined` and masquerade as a per-user difference.
        const pinStateFor = async (api: { rooms: RoomsApi }, who: string) => {
          const list = await api.rooms.getRoomsFolder({});
          const matches = list.data.response!.folders!.filter(
            (f) => (f as any).id === roomId,
          );
          expect(
            matches.length,
            `room ${roomId} should be visible exactly once to ${who}`,
          ).toBe(1);
          return (matches[0] as any).pinned as boolean;
        };

        await test.step("owner pins - the SAME room is pinned for owner but not for the member", async () => {
          await ownerApi.rooms.pinRoom({ id: roomId });
          // Same room id, same moment, opposite pinned flags => state is per-user.
          expect(await pinStateFor(ownerApi, "owner")).toBe(true);
          expect(await pinStateFor(userApi, "member")).toBe(false);
        });

        await test.step("each user's pin state is fully independent and can be inverted", async () => {
          await userApi.rooms.pinRoom({ id: roomId });
          await ownerApi.rooms.unpinRoom({ id: roomId });
          // Owner unpinning does not touch the member's own pin; the two views are now
          // the mirror image of step 1 - impossible unless pin state is stored per-user.
          expect(await pinStateFor(ownerApi, "owner")).toBe(false);
          expect(await pinStateFor(userApi, "member")).toBe(true);
        });
      });

      test("PUT /files/rooms/:id/pin - Pinning one room does not pin another", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const pinned = await createRoom(ownerApi, "Autotest Pin Isolated A");
        const other = await createRoom(ownerApi, "Autotest Pin Isolated B");

        await ownerApi.rooms.pinRoom({ id: pinned });

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const otherRow = data.response!.folders!.find(
          (f) => (f as any).id === other,
        ) as any;
        expect(otherRow.pinned).toBe(false);
      });
    });

    test.describe("Sorting / ordering", () => {
      test("PUT /files/rooms/:id/pin - Pinned room stays above unpinned when sorting by title", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        // "Z" would sort last by title ascending, but pinning floats it to the top.
        const zRoom = await createRoom(ownerApi, "ZZZ Autotest Pin Sort");
        await createRoom(ownerApi, "AAA Autotest Pin Sort");
        await createRoom(ownerApi, "MMM Autotest Pin Sort");

        await ownerApi.rooms.pinRoom({ id: zRoom });

        const { data } = await ownerApi.rooms.getRoomsFolder({
          sortBy: "title",
          sortOrder: SortOrder.Ascending,
        });
        const folders = data.response!.folders!;
        const zIndex = folders.findIndex((f) => (f as any).id === zRoom);
        const firstUnpinned = folders.findIndex((f) => !(f as any).pinned);

        expect((folders[zIndex] as any).pinned).toBe(true);
        expect(zIndex).toBeLessThan(firstUnpinned);
      });

      test("PUT /files/rooms/:id/pin - Pinned room stays above unpinned when sorting by created date", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        // The oldest room would normally be last with Descending-by-created.
        const oldest = await createRoom(ownerApi, "Autotest Pin Created Old");
        await createRoom(ownerApi, "Autotest Pin Created Mid");
        await createRoom(ownerApi, "Autotest Pin Created New");

        await ownerApi.rooms.pinRoom({ id: oldest });

        const { data } = await ownerApi.rooms.getRoomsFolder({
          sortBy: "DateAndTime",
          sortOrder: SortOrder.Descending,
        });
        const folders = data.response!.folders!;
        const oldestIndex = folders.findIndex((f) => (f as any).id === oldest);
        const firstUnpinned = folders.findIndex((f) => !(f as any).pinned);

        expect((folders[oldestIndex] as any).pinned).toBe(true);
        expect(oldestIndex).toBeLessThan(firstUnpinned);
      });

      test("PUT /files/rooms/:id/pin - Multiple pinned rooms have a stable order across calls", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const b = await createRoom(ownerApi, "Autotest Pin Stable B");
        const d = await createRoom(ownerApi, "Autotest Pin Stable D");
        await createRoom(ownerApi, "Autotest Pin Stable A");

        await ownerApi.rooms.pinRoom({ id: b });
        await ownerApi.rooms.pinRoom({ id: d });

        const order1 = (await ownerApi.rooms.getRoomsFolder({})).data
          .response!.folders!.filter((f) => (f as any).pinned)
          .map((f) => (f as any).id);
        const order2 = (await ownerApi.rooms.getRoomsFolder({})).data
          .response!.folders!.filter((f) => (f as any).pinned)
          .map((f) => (f as any).id);

        expect(order1).toEqual(order2);
      });
    });

    test.describe("Room types", () => {
      for (const { name, roomType } of [
        { name: "CustomRoom", roomType: RoomType.CustomRoom },
        { name: "PublicRoom", roomType: RoomType.PublicRoom },
        { name: "FillingFormsRoom", roomType: RoomType.FillingFormsRoom },
        { name: "EditingRoom", roomType: RoomType.EditingRoom },
        { name: "VirtualDataRoom", roomType: RoomType.VirtualDataRoom },
      ] as const) {
        test(`PUT /files/rooms/:id/pin - Can pin a ${name}`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          // Form filling rooms are listed in their own Forms area, so both the
          // extra room and the assertion have to use that area for them.
          const searchArea =
            roomType === RoomType.FillingFormsRoom
              ? SearchArea.Forms
              : SearchArea.Active;
          const roomId = await createRoom(
            ownerApi,
            `Autotest Pin ${name}`,
            roomType,
          );
          // An extra unpinned room so the "floats to the top" check is meaningful.
          await createRoom(ownerApi, `Autotest Pin ${name} Other`, roomType);

          const { status, data } = await ownerApi.rooms.pinRoom({ id: roomId });

          expect(status).toBe(200);
          expect(data.response!.pinned).toBe(true);
          // Effect: the room is actually pinned in the list and sits above unpinned rooms.
          await expectPinnedOnTop(ownerApi, roomId, searchArea);
        });
      }
    });

    test.describe("Invalid id validation", () => {
      // An invalid/non-existent numeric id should be a validation error (400), but the
      // API currently returns 403 "The required folder was not found". Marked test.fail
      // until the bug is fixed; when it starts returning 400 the test will report an
      // unexpected pass, signaling test.fail can be removed.
      for (const id of [0, -1, 999999999]) {
        test.fail(
          `BUG 81850: PUT /files/rooms/:id/pin - id=${id} should return 400 (validation), but API returns 403`,
          async ({ apiSdk }) => {
            const ownerApi = apiSdk.forRole("owner");
            const { status } = await ownerApi.rooms.pinRoom({ id });

            expect(status).toBe(400);
          },
        );
      }

      test('PUT /files/rooms/:id/pin - non-numeric id "abc" returns 404', async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { status } = await ownerApi.rooms.pinRoom({
          id: "abc" as unknown as number,
        });

        expect(status).toBe(404);
      });

      test("PUT /files/rooms/:id/pin - id=null throws at SDK level", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await expect(
          ownerApi.rooms.pinRoom({ id: null as unknown as number }),
        ).rejects.toThrow(/Required parameter id/);
      });

      test("PUT /files/rooms/:id/pin - id=undefined throws at SDK level", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await expect(
          ownerApi.rooms.pinRoom({ id: undefined as unknown as number }),
        ).rejects.toThrow(/Required parameter id/);
      });
    });

    test.describe("Deleted / archived rooms", () => {
      test("PUT /files/rooms/:id/pin - Cannot pin a deleted room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Deleted");

        await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { status, data } = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe(
          "The required folder was not found",
        );
      });

      test("PUT /files/rooms/:id/pin - Cannot pin an archived room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Archived");

        await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { status, data } = await ownerApi.rooms.pinRoom({ id: roomId });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe("You can't pin a room");
      });

      test("PUT /files/rooms/:id/pin - Pin does not survive archive/unarchive", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin ArchiveCycle");

        await ownerApi.rooms.pinRoom({ id: roomId });

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

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const row = data.response!.folders!.find(
          (f) => (f as any).id === roomId,
        ) as any;
        // Archiving resets the pin state.
        expect(row.pinned).toBe(false);
      });

      test("PUT /files/rooms/:id/pin - Pinned room disappears from list after deletion", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin DeleteGone");

        await ownerApi.rooms.pinRoom({ id: roomId });
        await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const ids = data.response!.folders!.map((f) => (f as any).id);
        expect(ids).not.toContain(roomId);
      });
    });

    test.describe("Cross-check with unpin", () => {
      test("PUT /files/rooms/:id/unpin - Unpinning a never-pinned room returns 200", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Fresh");

        const { status, data } = await ownerApi.rooms.unpinRoom({ id: roomId });

        expect(status).toBe(200);
        expect(data.response!.pinned).toBe(false);
      });

      test("PUT /files/rooms/:id/pin - Pin then verify, unpin then verify", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin RoundTrip");

        await test.step("pin and verify pinned", async () => {
          const pin = await ownerApi.rooms.pinRoom({ id: roomId });
          expect(pin.status).toBe(200);
          const info = await ownerApi.rooms.getRoomInfo({ id: roomId });
          expect((info.data.response as any).pinned).toBe(true);
        });

        await test.step("unpin and verify not pinned", async () => {
          const unpin = await ownerApi.rooms.unpinRoom({ id: roomId });
          expect(unpin.status).toBe(200);
          const info = await ownerApi.rooms.getRoomInfo({ id: roomId });
          expect((info.data.response as any).pinned).toBe(false);
        });
      });
    });

    test.describe("Pagination / filtering", () => {
      test("PUT /files/rooms/:id/pin - Pinned room appears on the first page", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const created: number[] = [];
        for (let i = 0; i < 8; i++) {
          created.push(await createRoom(ownerApi, `Autotest Pin Page ${i}`));
        }
        // Pin the last-created room, then request only the first 3 rooms.
        const pinned = created[created.length - 1];
        await ownerApi.rooms.pinRoom({ id: pinned });

        const { data } = await ownerApi.rooms.getRoomsFolder({
          count: 3,
          startIndex: 0,
        });
        const ids = data.response!.folders!.map((f) => (f as any).id);
        expect(ids).toContain(pinned);
        expect((data.response!.folders![0] as any).pinned).toBe(true);
      });

      test("PUT /files/rooms/:id/pin - Pagination over pinned+unpinned has no duplicates or gaps", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const created: number[] = [];
        for (let i = 0; i < 6; i++) {
          created.push(
            await createRoom(ownerApi, `Autotest Pin Paginate ${i}`),
          );
        }
        await ownerApi.rooms.pinRoom({ id: created[1] });
        await ownerApi.rooms.pinRoom({ id: created[4] });

        const page1 = (
          await ownerApi.rooms.getRoomsFolder({ count: 3, startIndex: 0 })
        ).data.response!.folders!.map((f) => (f as any).id);
        const page2 = (
          await ownerApi.rooms.getRoomsFolder({ count: 3, startIndex: 3 })
        ).data.response!.folders!.map((f) => (f as any).id);

        const all = [...page1, ...page2];
        const unique = new Set(all);
        // No duplicates across pages.
        expect(unique.size).toBe(all.length);
        // All created rooms are present across the two pages.
        for (const id of created) {
          expect(all).toContain(id);
        }
      });

      test("PUT /files/rooms/:id/pin - Filtered list keeps the pinned matching room on top", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const marker = `Mark${apiSdk.faker.generateString(8)}`;
        const r1 = await createRoom(ownerApi, `${marker} One`);
        await createRoom(ownerApi, `${marker} Two`);
        await createRoom(ownerApi, `${marker} Three`);

        await ownerApi.rooms.pinRoom({ id: r1 });

        const { data } = await ownerApi.rooms.getRoomsFolder({
          filterValue: marker,
        });
        const folders = data.response!.folders!;
        expect(folders.length).toBeGreaterThanOrEqual(3);
        const r1Index = folders.findIndex((f) => (f as any).id === r1);
        const firstUnpinned = folders.findIndex((f) => !(f as any).pinned);

        expect((folders[r1Index] as any).pinned).toBe(true);
        expect(r1Index).toBeLessThan(firstUnpinned);
      });
    });

    test.describe("Concurrency", () => {
      test("PUT /files/rooms/:id/pin - Concurrent pin requests do not duplicate the room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Concurrent");

        const results = await Promise.all([
          ownerApi.rooms.pinRoom({ id: roomId }),
          ownerApi.rooms.pinRoom({ id: roomId }),
        ]);

        for (const r of results) {
          expect(r.status).toBe(200);
        }

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const occurrences = data.response!.folders!.filter(
          (f) => (f as any).id === roomId,
        );
        expect(occurrences.length).toBe(1);
        expect((occurrences[0] as any).pinned).toBe(true);
      });

      test("PUT /files/rooms/:id/pin - Concurrent pin and unpin do not error", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Pin Race");

        const [pin, unpin] = await Promise.all([
          ownerApi.rooms.pinRoom({ id: roomId }),
          ownerApi.rooms.unpinRoom({ id: roomId }),
        ]);

        // Neither request should crash the server; final state is whichever won.
        expect(pin.status).toBe(200);
        expect(unpin.status).toBe(200);

        // The race must not corrupt the room: it appears exactly once...
        const afterRace = await findRoomRow(ownerApi, roomId);
        expect(afterRace.count).toBe(1);

        // ...and the pin state stays deterministically settable afterwards.
        await ownerApi.rooms.pinRoom({ id: roomId });
        await expectPinnedOnTop(ownerApi, roomId);

        await ownerApi.rooms.unpinRoom({ id: roomId });
        const afterUnpin = await findRoomRow(ownerApi, roomId);
        expect(afterUnpin.row.pinned).toBe(false);
      });

      test("PUT /files/rooms/:id/pin - Many rooms can be pinned sequentially", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const created: number[] = [];
        for (let i = 0; i < 5; i++) {
          created.push(await createRoom(ownerApi, `Autotest Pin Many ${i}`));
        }
        for (const id of created) {
          const { status } = await ownerApi.rooms.pinRoom({ id });
          expect(status).toBe(200);
        }

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const folders = data.response!.folders!;
        const pinnedIds = folders
          .filter((f) => (f as any).pinned)
          .map((f) => (f as any).id);
        // Every room we pinned is actually pinned, and nothing else got pinned.
        expect(pinnedIds.sort()).toEqual([...created].sort());
        // The pinned rooms occupy the top contiguous block of the list.
        const firstUnpinned = folders.findIndex((f) => !(f as any).pinned);
        if (firstUnpinned !== -1) {
          expect(firstUnpinned).toBe(created.length);
        }
      });
    });

    // The rooms list allows at most 10 pinned rooms - pinning an 11th non-AI room
    // returns 403 "You can't pin a room". An AI room is expected to be EXEMPT from
    // this limit, so it should still pin even when 10 rooms are already pinned.
    // Verified: an AI room pins fine on its own (200), but the API currently counts
    // it against the same 10-room limit and rejects it with 403 - marked test.fail
    // until fixed (when it returns 200 the test will report an unexpected pass).
    test.describe("Pin limit", () => {
      test("PUT /files/rooms/:id/pin - Cannot pin more than 10 non-AI rooms", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        // Pin 10 non-AI rooms - all allowed.
        const pinned: number[] = [];
        for (let i = 0; i < 10; i++) {
          const id = await createRoom(ownerApi, `Autotest Pin Cap ${i}`);
          const { status } = await ownerApi.rooms.pinRoom({ id });
          expect(status).toBe(200);
          pinned.push(id);
        }

        // The 11th non-AI room exceeds the limit and must be rejected.
        const eleventh = await createRoom(ownerApi, "Autotest Pin Cap 11");
        const { status, data } = await ownerApi.rooms.pinRoom({ id: eleventh });

        // Side-effect first: the 11th room is NOT pinned and exactly 10 stay pinned.
        const { row: eleventhRow } = await findRoomRow(ownerApi, eleventh);
        expect(eleventhRow.pinned).toBe(false);
        const list = await ownerApi.rooms.getRoomsFolder({});
        const pinnedIds = list.data
          .response!.folders!.filter((f) => (f as any).pinned)
          .map((f) => (f as any).id);
        expect(pinnedIds.sort()).toEqual([...pinned].sort());

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe("You can't pin a room");
      });

      test("BUG 81852: PUT /files/rooms/:id/pin - AI room is exempt from the 10-room pin limit (should pin past 10), but API returns 403", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        // Reach the limit: pin 10 non-AI rooms.
        for (let i = 0; i < 10; i++) {
          const id = await createRoom(ownerApi, `Autotest Pin Limit ${i}`);
          const { status } = await ownerApi.rooms.pinRoom({ id });
          expect(status).toBe(200);
        }

        // An AI room is not counted in the 10-room limit, so it should still pin.
        const aiRoomId = await createRoom(
          ownerApi,
          "Autotest Pin Limit AI",
          RoomType.AiRoom,
        );
        const { status, data } = await ownerApi.rooms.pinRoom({
          id: aiRoomId,
        });

        expect(status).toBe(200);
        expect(data.response!.pinned).toBe(true);
        await expectPinnedOnTop(ownerApi, aiRoomId);
      });

      test("PUT /files/rooms/:id/pin - AI rooms have their own 10-room pin limit", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        // AI rooms are pinned in a bucket separate from regular rooms, but that
        // bucket is itself capped at 10 - the 11th AI room must be rejected.
        const aiPinned: number[] = [];
        for (let i = 0; i < 10; i++) {
          const id = await createRoom(
            ownerApi,
            `Autotest AI Pin Cap ${i}`,
            RoomType.AiRoom,
          );
          const { status } = await ownerApi.rooms.pinRoom({ id });
          expect(status).toBe(200);
          aiPinned.push(id);
        }

        const eleventh = await createRoom(
          ownerApi,
          "Autotest AI Pin Cap 11",
          RoomType.AiRoom,
        );
        const { status } = await ownerApi.rooms.pinRoom({ id: eleventh });

        // Side-effect first: the 11th AI room is NOT pinned.
        const { row } = await findRoomRow(ownerApi, eleventh);
        expect(row.pinned).toBe(false);

        expect(status).toBe(403);
      });
    });
  });

  // unpin is the inverse of pin and, like pin, is a PER-USER action gated by
  // security.Pin (see memory pin_room_behavior). The pin suite above already covers
  // the shared happy paths (unpin returns a room to the unpinned group, per-user
  // isolation, pin-after-unpin, concurrent pin/unpin). The cases below fill the
  // unpin-specific gaps: response contract, invalid ids, deleted/archived rooms,
  // room types, the pin-limit slot being freed, membership side-effects and
  // idempotency sequences.
  test.describe("PUT /files/rooms/:id/unpin", () => {
    async function createRoom(
      api: { rooms: RoomsApi },
      title: string,
      roomType: RoomType = RoomType.CustomRoom,
    ) {
      const { data } = await api.rooms.createRoom({
        createRoomRequestDto: { title, roomType },
      });
      return data.response!.id!;
    }

    // Form filling rooms list under searchArea=Forms rather than the default
    // Active area, so the area is a parameter here as well.
    async function findRoomRow(
      api: { rooms: RoomsApi },
      roomId: number,
      searchArea: SearchArea = SearchArea.Active,
    ) {
      const { data } = await api.rooms.getRoomsFolder({ searchArea });
      const folders = data.response!.folders!;
      const matches = folders.filter((f) => (f as any).id === roomId);
      const row = matches[0] as any;
      return {
        folders,
        row,
        count: matches.length,
        index: row ? folders.indexOf(row) : -1,
      };
    }

    test.describe("Contract / basic response", () => {
      test("PUT /files/rooms/:id/unpin - Owner unpins a pinned room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Contract");
        await ownerApi.rooms.pinRoom({ id: roomId });

        const { data, status } = await ownerApi.rooms.unpinRoom({ id: roomId });

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBe(roomId);
        expect(data.response!.pinned).toBe(false);

        // The effect is visible in the list too: still present, now unpinned.
        const { row, count } = await findRoomRow(ownerApi, roomId);
        expect(count).toBe(1);
        expect(row.pinned).toBe(false);
      });

      test("PUT /files/rooms/:id/unpin - Response has FolderIntegerWrapper shape", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Shape");
        await ownerApi.rooms.pinRoom({ id: roomId });

        const { data } = await ownerApi.rooms.unpinRoom({ id: roomId });

        expect(data.status).toBeDefined();
        expect(data.statusCode).toBe(200);
        expect(data.response).toBeDefined();
        expect(data.response!.id).toBe(roomId);
        expect(data.response!.title).toBe("Autotest Unpin Shape");
        expect(data.response!.roomType).toBe(RoomType.CustomRoom);
        expect(typeof data.response!.pinned).toBe("boolean");
      });

      test("PUT /files/rooms/:id/unpin - No request body is required", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin No Body");
        await ownerApi.rooms.pinRoom({ id: roomId });

        // Only the path id is passed - no body.
        const { status, data } = await ownerApi.rooms.unpinRoom({ id: roomId });

        expect(status).toBe(200);
        expect(data.response!.pinned).toBe(false);
      });
    });

    test.describe("Functional behavior", () => {
      test("PUT /files/rooms/:id/unpin - Unpinned room returns to its natural sort position", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const marker = `Unpin${apiSdk.faker.generateString(8)}`;
        await createRoom(ownerApi, `${marker} AAA`);
        await createRoom(ownerApi, `${marker} MMM`);
        const z = await createRoom(ownerApi, `${marker} ZZZ`);

        // The natural position is whatever the list order is before pinning:
        // asserting a specific (alphabetical) place would only re-test the
        // broken title sort of BUG 81809, not the pin round-trip.
        const order = async () => {
          const { data } = await ownerApi.rooms.getRoomsFolder({
            filterValue: marker,
            sortBy: "title",
            sortOrder: SortOrder.Ascending,
          });
          const folders = data.response!.folders!;
          return {
            ids: folders.map((f) => (f as any).id),
            zRow: folders.find((f) => (f as any).id === z) as any,
          };
        };

        const before = await order();
        expect(before.ids).toHaveLength(3);

        // Pinning floats Z to the top...
        await ownerApi.rooms.pinRoom({ id: z });
        const pinned = await order();
        expect(pinned.zRow.pinned).toBe(true);
        expect(pinned.ids[0]).toBe(z);

        // ...and unpinning drops it back exactly where it was.
        await ownerApi.rooms.unpinRoom({ id: z });
        const after = await order();
        expect(after.zRow.pinned).toBe(false);
        expect(after.ids).toEqual(before.ids);
      });

      test("PUT /files/rooms/:id/unpin - Unpinning a room does not remove it from the list", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Stays");

        await ownerApi.rooms.pinRoom({ id: roomId });
        await ownerApi.rooms.unpinRoom({ id: roomId });

        const { row, count } = await findRoomRow(ownerApi, roomId);
        // Still present (exactly once) and now flagged unpinned - not removed.
        expect(count).toBe(1);
        expect(row.pinned).toBe(false);
      });

      test("PUT /files/rooms/:id/unpin - Unpinning is idempotent", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Idempotent");

        await ownerApi.rooms.pinRoom({ id: roomId });
        const first = await ownerApi.rooms.unpinRoom({ id: roomId });
        const second = await ownerApi.rooms.unpinRoom({ id: roomId });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const occurrences = data.response!.folders!.filter(
          (f) => (f as any).id === roomId,
        );
        expect(occurrences.length).toBe(1);
        expect((occurrences[0] as any).pinned).toBe(false);
      });

      test("PUT /files/rooms/:id/unpin - pin/unpin/unpin/pin/unpin leaves the room unpinned", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Sequence");

        await ownerApi.rooms.pinRoom({ id: roomId });
        await ownerApi.rooms.unpinRoom({ id: roomId });
        const midUnpin = await ownerApi.rooms.unpinRoom({ id: roomId });
        await ownerApi.rooms.pinRoom({ id: roomId });
        const finalUnpin = await ownerApi.rooms.unpinRoom({ id: roomId });

        expect(midUnpin.status).toBe(200);
        expect(finalUnpin.status).toBe(200);

        // The toggling never corrupts state: the room is present once and unpinned.
        const { row, count } = await findRoomRow(ownerApi, roomId);
        expect(count).toBe(1);
        expect(row.pinned).toBe(false);
      });
    });

    test.describe("Room types", () => {
      for (const { name, roomType } of [
        { name: "CustomRoom", roomType: RoomType.CustomRoom },
        { name: "PublicRoom", roomType: RoomType.PublicRoom },
        { name: "FillingFormsRoom", roomType: RoomType.FillingFormsRoom },
        { name: "EditingRoom", roomType: RoomType.EditingRoom },
        { name: "VirtualDataRoom", roomType: RoomType.VirtualDataRoom },
      ] as const) {
        test(`PUT /files/rooms/:id/unpin - Can unpin a ${name}`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          const roomId = await createRoom(
            ownerApi,
            `Autotest Unpin ${name}`,
            roomType,
          );

          await ownerApi.rooms.pinRoom({ id: roomId });
          const { status, data } = await ownerApi.rooms.unpinRoom({
            id: roomId,
          });

          expect(status).toBe(200);
          expect(data.response!.pinned).toBe(false);

          // Form filling rooms are listed in the Forms area, not the Active one.
          const { row } = await findRoomRow(
            ownerApi,
            roomId,
            roomType === RoomType.FillingFormsRoom
              ? SearchArea.Forms
              : SearchArea.Active,
          );
          expect(row.pinned).toBe(false);
        });
      }
    });

    test.describe("Pin limit interaction", () => {
      test("PUT /files/rooms/:id/unpin - Unpinning frees a slot in the 10-room pin limit", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const pinned: number[] = [];
        for (let i = 0; i < 10; i++) {
          const id = await createRoom(ownerApi, `Autotest Unpin Slot ${i}`);
          const { status } = await ownerApi.rooms.pinRoom({ id });
          expect(status).toBe(200);
          pinned.push(id);
        }

        // An 11th room cannot be pinned while the limit is full.
        const extra = await createRoom(ownerApi, "Autotest Unpin Slot Extra");
        const blocked = await ownerApi.rooms.pinRoom({ id: extra });
        expect(blocked.status).toBe(403);

        // Unpin one -> a slot frees up -> the extra room now pins.
        await ownerApi.rooms.unpinRoom({ id: pinned[0] });
        const freed = await ownerApi.rooms.pinRoom({ id: extra });
        expect(freed.status).toBe(200);
        expect(freed.data.response!.pinned).toBe(true);

        // Exactly 10 remain pinned: the original set minus pinned[0], plus extra.
        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const pinnedNow = data
          .response!.folders!.filter((f) => (f as any).pinned)
          .map((f) => (f as any).id);
        expect(pinnedNow.length).toBe(10);
        expect(pinnedNow).toContain(extra);
        expect(pinnedNow).not.toContain(pinned[0]);
      });

      // Regression for BUG 80757 (fixed): after reaching the 10-room limit, unpinning
      // one and pinning a fresh room (back to 10) used to silently reset the whole
      // pinned set. All 10 must survive the swap.
      test("BUG 80757: PUT /files/rooms/:id/unpin - swapping a pinned room at the limit must not reset all pins", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const pinned: number[] = [];
        for (let i = 0; i < 10; i++) {
          const id = await createRoom(ownerApi, `Autotest Unpin Reset ${i}`);
          await ownerApi.rooms.pinRoom({ id });
          pinned.push(id);
        }

        await ownerApi.rooms.unpinRoom({ id: pinned[0] });
        const fresh = await createRoom(ownerApi, "Autotest Unpin Reset Fresh");
        await ownerApi.rooms.pinRoom({ id: fresh });

        const { data } = await ownerApi.rooms.getRoomsFolder({});
        const pinnedNow = data
          .response!.folders!.filter((f) => (f as any).pinned)
          .map((f) => (f as any).id);
        expect(pinnedNow.length).toBe(10);
        expect(pinnedNow).toContain(fresh);
      });
    });

    test.describe("No side effects", () => {
      test("PUT /files/rooms/:id/unpin - Unpin does not delete the room or change members/roles", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(
          ownerApi,
          "Autotest Unpin NoSideEffect",
        );
        const { data: memberData } = await apiSdk.addMember("owner", "User");
        const userId = memberData.response!.id!;
        await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.Editing }],
            notify: false,
          },
        });

        const membersBefore = (
          await ownerApi.rooms.getRoomSecurityInfo({ id: roomId })
        ).data.response!.map((m) => ({
          id: m.sharedToUser?.id,
          access: m.access,
        }));

        await ownerApi.rooms.pinRoom({ id: roomId });
        const { status } = await ownerApi.rooms.unpinRoom({ id: roomId });
        expect(status).toBe(200);

        // Room still exists...
        const info = await ownerApi.rooms.getRoomInfo({ id: roomId });
        expect(info.status).toBe(200);
        expect((info.data.response as any).id).toBe(roomId);

        // ...and its members/roles are untouched.
        const membersAfter = (
          await ownerApi.rooms.getRoomSecurityInfo({ id: roomId })
        ).data.response!.map((m) => ({
          id: m.sharedToUser?.id,
          access: m.access,
        }));
        expect(membersAfter).toEqual(membersBefore);
      });
    });

    test.describe("Invalid id validation", () => {
      // As with pin, a non-existent numeric id should be a 400 validation error but
      // the API returns 403 "The required folder was not found". Marked test.fail
      // until fixed; a 400 will report an unexpected pass. TODO: add bug number.
      for (const id of [0, -1, 999999999]) {
        test.fail(
          `BUG 82366: PUT /files/rooms/:id/unpin - id=${id} should return 400 (validation), but API returns 403`,
          async ({ apiSdk }) => {
            const ownerApi = apiSdk.forRole("owner");
            const { status } = await ownerApi.rooms.unpinRoom({ id });

            expect(status).toBe(400);
          },
        );
      }

      test('PUT /files/rooms/:id/unpin - non-numeric id "abc" returns 404', async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { status } = await ownerApi.rooms.unpinRoom({
          id: "abc" as unknown as number,
        });

        expect(status).toBe(404);
      });

      test("PUT /files/rooms/:id/unpin - id=null throws at SDK level", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await expect(
          ownerApi.rooms.unpinRoom({ id: null as unknown as number }),
        ).rejects.toThrow(/Required parameter id/);
      });

      test("PUT /files/rooms/:id/unpin - id=undefined throws at SDK level", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await expect(
          ownerApi.rooms.unpinRoom({ id: undefined as unknown as number }),
        ).rejects.toThrow(/Required parameter id/);
      });
    });

    test.describe("Deleted / archived rooms", () => {
      test("PUT /files/rooms/:id/unpin - Cannot unpin a deleted room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Deleted");
        await ownerApi.rooms.pinRoom({ id: roomId });

        await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        // Mirrors pin: the room is gone, so the action is rejected with 403.
        const { status } = await ownerApi.rooms.unpinRoom({ id: roomId });
        expect(status).toBe(403);
      });

      test("PUT /files/rooms/:id/unpin - Cannot unpin an archived room", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createRoom(ownerApi, "Autotest Unpin Archived");
        await ownerApi.rooms.pinRoom({ id: roomId });

        await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        // Mirrors pin (archived rooms reject pin/unpin with 403). Assert status
        // only - the message may differ from pin's "You can't pin a room".
        const { status } = await ownerApi.rooms.unpinRoom({ id: roomId });
        expect(status).toBe(403);
      });
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
      "BUG 81726: GET /files/roomtemplate/:id/public - Returns 404 when id refers to a regular room, not a template",
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

    // === PUT /files/roomtemplate/public - setPublicSettings ===

    const createPublicFlagTemplate = async (
      api: any,
      title: string,
      isPublic = false,
    ): Promise<number> => {
      const { data: roomData } = await api.rooms.createRoom({
        createRoomRequestDto: {
          title: `${title} Source`,
          roomType: RoomType.CustomRoom,
        },
      });
      await api.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title,
          public: isPublic,
        },
      });
      return waitForRoomTemplate(api.rooms);
    };

    test("PUT /files/roomtemplate/public - public:true applied twice stays true", async ({
      apiSdk,
    }) => {
      // Used to be BUG 81938: a second identical public:true call flipped the
      // flag back to false because the boolean in the body was ignored once the
      // template was already public. Fixed - verified on a live portal on
      // 2026-08-04.
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic IdemTrue",
      );

      const first = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });
      expect(first.status).toBe(200);
      const second = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });
      expect(second.status).toBe(200);

      const { data } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(data.response).toBe(true);
    });

    test("PUT /files/roomtemplate/public - public:false applied twice stays false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic IdemFalse",
        true,
      );

      const first = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: false },
      });
      expect(first.status).toBe(200);
      const second = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: false },
      });
      expect(second.status).toBe(200);

      const { data } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(data.response).toBe(false);
    });

    test("PUT /files/roomtemplate/public - Updating one template does not affect another", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateA = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic Isolation A",
      );
      const templateB = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic Isolation B",
      );

      const { status } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateA, public: true },
      });
      expect(status).toBe(200);

      const { data: flagA } = await ownerApi.rooms.getPublicSettings({
        id: templateA,
      });
      const { data: flagB } = await ownerApi.rooms.getPublicSettings({
        id: templateB,
      });
      expect(flagA.response).toBe(true);
      expect(flagB.response).toBe(false);
    });

    test("PUT /files/roomtemplate/public - Omitting the public field is a no-op (200, state unchanged)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic MissingPublic",
      );

      const { status } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId } as any,
      });
      expect(status).toBe(200);

      const { data } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(data.response).toBe(false);
    });

    test("PUT /files/roomtemplate/public - Non-existing template id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: 999999999, public: true },
      });
      expect((data as any).statusCode).toBe(404);
    });

    test.fail(
      "BUG 81949: PUT /files/roomtemplate/public - id:0 returns 404 instead of 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data } = await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: 0, public: true },
        });
        expect((data as any).statusCode).toBe(400);
      },
    );

    test.fail(
      "BUG 81949: PUT /files/roomtemplate/public - id:-1 returns 404 instead of 400",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data } = await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: -1, public: true },
        });
        expect((data as any).statusCode).toBe(400);
      },
    );

    test("PUT /files/roomtemplate/public - id:'abc' returns 400 (type validation)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: "abc" as unknown as number, public: true },
      });
      expect((data as any).statusCode).toBe(400);
    });

    test("PUT /files/roomtemplate/public - id:1.5 returns 400 (type validation)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: 1.5, public: true },
      });
      expect((data as any).statusCode).toBe(400);
    });

    test("PUT /files/roomtemplate/public - MAX_SAFE_INTEGER id returns 400 (Int32 overflow)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: Number.MAX_SAFE_INTEGER, public: true },
      });
      expect((data as any).statusCode).toBe(400);
    });

    test("PUT /files/roomtemplate/public - Missing id returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { public: true } as any,
      });
      expect((data as any).statusCode).toBe(400);
    });

    test("PUT /files/roomtemplate/public - public:null returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic NullPublic",
      );

      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: null } as any,
      });
      expect((data as any).statusCode).toBe(400);

      const { data: flag } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(flag.response).toBe(false);
    });

    test("PUT /files/roomtemplate/public - public as a string returns 400 (no coercion)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const templateId = await createPublicFlagTemplate(
        ownerApi,
        "Autotest SetPublic StringPublic",
      );

      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: "true" } as any,
      });
      expect((data as any).statusCode).toBe(400);

      const { data: flag } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(flag.response).toBe(false);
    });

    test("PUT /files/roomtemplate/public - Empty body returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: {} as any,
      });
      expect((data as any).statusCode).toBe(400);
    });

    test("PUT /files/roomtemplate/public - null body returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: null as any,
      });
      expect((data as any).statusCode).toBe(400);
    });

    test.fail(
      "BUG 81939: PUT /files/roomtemplate/public - Accepts a regular room id (200) instead of returning 404",
      async ({ apiSdk }) => {
        // Same defect class as the GET variant (BUG 81726): the endpoint does
        // not verify that the id belongs to a template and silently returns
        // 200 for a normal room id.
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest SetPublic RoomNotTemplate",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { data } = await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: roomId, public: true },
        });
        expect((data as any).statusCode).toBe(404);
      },
    );

    test("PUT /files/roomtemplate/public - Still works after the source room is deleted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest SetPublic AfterSrcDeleted Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest SetPublic AfterSrcDeleted Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.deleteRoom({
        id: sourceRoomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });
      expect(status).toBe(200);

      const { data } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(data.response).toBe(true);
    });

    test("PUT /files/roomtemplate/public - Still works after the source room is archived", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest SetPublic AfterSrcArchived Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest SetPublic AfterSrcArchived Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.archiveRoom({
        id: sourceRoomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });
      expect(status).toBe(200);

      const { data } = await ownerApi.rooms.getPublicSettings({
        id: templateId,
      });
      expect(data.response).toBe(true);
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

    // Title is validated like POST /files/rooms: required, max 400 chars. This
    // used to be BUG 81690 (200 plus an async operation that hung, so templateId
    // never became > 0); fixed - verified on a live portal on 2026-08-04.
    test("POST /files/roomtemplate - Missing title returns 400", async ({
      apiSdk,
    }) => {
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
    });

    test("POST /files/roomtemplate - Empty title returns 400", async ({
      apiSdk,
    }) => {
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
    });

    test("POST /files/roomtemplate - Very long title (1000 chars) is rejected with 400", async ({
      apiSdk,
    }) => {
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
    });

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

  test.describe("GET /files/roomtemplate/status - getRoomTemplateCreatingStatus", () => {
    test("GET /files/roomtemplate/status - Owner can get status while creation is in progress", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest InProgress Status Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest InProgress Status Template",
        },
      });

      const { data, status } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);

      await waitForRoomTemplate(ownerApi.rooms);
    });

    test("GET /files/roomtemplate/status - Response has the expected shape after template creation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Shape Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Shape Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.templateId).toBe(templateId);
      expect(typeof data.response!.progress).toBe("number");
    });

    test("GET /files/roomtemplate/status - Completed templateId can be used to create a room from template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Usable Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Usable Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      expect(data.response!.templateId).toBe(templateId);

      const { status: createStatus } =
        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId: data.response!.templateId,
            title: "Room From Usable Template",
          },
        });
      expect(createStatus).toBe(200);
    });

    test("GET /files/roomtemplate/status - Consecutive polls during active operation each return 200", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Active Polls Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Active Polls Template",
        },
      });

      const first = await ownerApi.rooms.getRoomTemplateCreatingStatus();
      const second = await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      await waitForRoomTemplate(ownerApi.rooms);
    });

    test("GET /files/roomtemplate/status - progress equals 100 after completion", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Progress Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Progress Template",
        },
      });
      await waitForRoomTemplate(ownerApi.rooms);

      const { data, status } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.progress).toBe(100);
    });

    test("GET /files/roomtemplate/status - Returns 200 for a fresh user with no prior operation", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } =
        await adminApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      expect(data.response).toBeUndefined();
    });

    test.fail(
      "BUG 81692: GET /files/roomtemplate/status - Owner and Admin creating templates in parallel see only their own templateId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );

        const { data: ownerSource } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Parallel Owner Source",
            roomType: RoomType.CustomRoom,
          },
        });
        const { data: adminSource } = await adminApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Parallel Admin Source",
            roomType: RoomType.CustomRoom,
          },
        });

        await Promise.all([
          ownerApi.rooms.createRoomTemplate({
            roomTemplateDto: {
              roomId: ownerSource.response!.id!,
              title: "Autotest Parallel Owner Template",
            },
          }),
          adminApi.rooms.createRoomTemplate({
            roomTemplateDto: {
              roomId: adminSource.response!.id!,
              title: "Autotest Parallel Admin Template",
            },
          }),
        ]);

        const ownerTemplateId = await waitForRoomTemplate(ownerApi.rooms);
        const adminTemplateId = await waitForRoomTemplate(adminApi.rooms);
        expect(ownerTemplateId).not.toBe(adminTemplateId);

        const { data: ownerStatus } =
          await ownerApi.rooms.getRoomTemplateCreatingStatus();
        const { data: adminStatus } =
          await adminApi.rooms.getRoomTemplateCreatingStatus();
        expect(ownerStatus.response!.templateId).toBe(ownerTemplateId);
        expect(adminStatus.response!.templateId).toBe(adminTemplateId);
      },
    );

    test("GET /files/roomtemplate/status - Status after failed template creation returns isCompleted=true and non-empty error", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: { roomId: 999999999, title: "Failed Template" },
      });

      await expect(async () => {
        const { data } = await ownerApi.rooms.getRoomTemplateCreatingStatus();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [1_000, 2_000], timeout: 30_000 });

      const { data } = await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeTruthy();
    });

    test.fail(
      "BUG 81691: GET /files/roomtemplate/status - Status after failed template creation does not return a valid templateId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: 999999999,
            title: "Failed Template No Id",
          },
        });

        await expect(async () => {
          const { data } = await ownerApi.rooms.getRoomTemplateCreatingStatus();
          expect(data.response!.isCompleted).toBe(true);
        }).toPass({ intervals: [1_000, 2_000], timeout: 30_000 });

        const { data } = await ownerApi.rooms.getRoomTemplateCreatingStatus();
        expect(data.response!.templateId).toBe(0);
      },
    );

    test("GET /files/roomtemplate/status - DocSpaceAdmin can get own template creation status", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Admin Own Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await adminApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Admin Own Template",
        },
      });
      const templateId = await waitForRoomTemplate(adminApi.rooms);

      const { data, status } =
        await adminApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.templateId).toBe(templateId);
    });

    test.fail(
      "BUG 81692: GET /files/roomtemplate/status - RoomAdmin does not see Owner's templateId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest RoomAdmin Iso Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest RoomAdmin Iso Template",
          },
        });
        const ownerTemplateId = await waitForRoomTemplate(ownerApi.rooms);

        const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "RoomAdmin",
        );
        const { data, status } =
          await roomAdminApi.rooms.getRoomTemplateCreatingStatus();
        expect(status).toBe(200);
        expect(data.response!.templateId).not.toBe(ownerTemplateId);
      },
    );

    test.fail(
      "BUG 81692: GET /files/roomtemplate/status - User does not see Owner's templateId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest User Iso Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest User Iso Template",
          },
        });
        const ownerTemplateId = await waitForRoomTemplate(ownerApi.rooms);

        const { api: userApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );
        const { data, status } =
          await userApi.rooms.getRoomTemplateCreatingStatus();
        expect(status).toBe(200);
        expect(data.response!.templateId).not.toBe(ownerTemplateId);
      },
    );

    test.fail(
      "BUG 81692: GET /files/roomtemplate/status - Guest does not see Owner's templateId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Guest Iso Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Guest Iso Template",
          },
        });
        const ownerTemplateId = await waitForRoomTemplate(ownerApi.rooms);

        const { api: guestApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "Guest",
        );
        const { data, status } =
          await guestApi.rooms.getRoomTemplateCreatingStatus();
        expect(status).toBe(200);
        expect(data.response!.templateId).not.toBe(ownerTemplateId);
      },
    );

    test("GET /files/roomtemplate/status - Anonymous request returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forAnonymous()
        .rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(401);
    });

    test("GET /files/roomtemplate/status - Terminated user cannot get template creation status", async ({
      apiSdk,
    }) => {
      const { data: createdUser, api: userApi } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = createdUser.response!.id!;

      await apiSdk.forRole("owner").userStatus.updateUserStatus({
        status: EmployeeStatus.Terminated,
        updateMembersRequestDto: { userIds: [userId] },
      });

      const { status } = await userApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(401);
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

  test.describe("GET /files/tags/:tagName/haslinks - hasTagLinks", () => {
    // tagName2 = path param ({tagName} in route), tagName = query param ([FromQuery] in DTO).
    // Both are normally passed with the same value (see the path/query mismatch test below).

    test("GET /files/tags/haslinks - Tag linked to multiple rooms returns true", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "MultiRoomLinkedTag" },
      });

      for (const title of [
        "Autotest HasLinks Room A",
        "Autotest HasLinks Room B",
      ]) {
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
        });
        await ownerApi.rooms.addRoomTags({
          id: roomData.response!.id!,
          batchTagsRequestDto: { names: ["MultiRoomLinkedTag"] },
        });
      }

      const { data, status } = await ownerApi.rooms.hasTagLinks({
        tagName2: "MultiRoomLinkedTag",
        tagName: "MultiRoomLinkedTag",
      });

      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    test("GET /files/tags/haslinks - Detaching the tag from its only room returns false (tag stays in catalog)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "DetachTag" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Detach Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["DetachTag"] },
      });

      const before = await ownerApi.rooms.hasTagLinks({
        tagName2: "DetachTag",
        tagName: "DetachTag",
      });
      expect(before.data.response).toBe(true);

      const { status: detachStatus } = await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["DetachTag"] },
      });
      expect(detachStatus).toBe(200);

      const after = await ownerApi.rooms.hasTagLinks({
        tagName2: "DetachTag",
        tagName: "DetachTag",
      });
      expect(after.status).toBe(200);
      expect(after.data.response).toBe(false);

      // Detaching from a room does NOT remove the tag from the catalog
      // (unlike deleting the room, which garbage-collects single-use tags).
      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list.response as unknown as string[]).toContain("DetachTag");
    });

    test("GET /files/tags/haslinks - Tag removed from one of two rooms still returns true", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "PartialDetachTag" },
      });

      const { data: room1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Partial Detach A",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: room2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Partial Detach B",
          roomType: RoomType.CustomRoom,
        },
      });
      const room1Id = room1.response!.id!;
      const room2Id = room2.response!.id!;
      await ownerApi.rooms.addRoomTags({
        id: room1Id,
        batchTagsRequestDto: { names: ["PartialDetachTag"] },
      });
      await ownerApi.rooms.addRoomTags({
        id: room2Id,
        batchTagsRequestDto: { names: ["PartialDetachTag"] },
      });

      await ownerApi.rooms.deleteRoomTags({
        id: room1Id,
        batchTagsRequestDto: { names: ["PartialDetachTag"] },
      });

      const { data, status } = await ownerApi.rooms.hasTagLinks({
        tagName2: "PartialDetachTag",
        tagName: "PartialDetachTag",
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    test("GET /files/tags/haslinks - Deleting the only room garbage-collects the tag and returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "GcTag" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GC Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["GcTag"] },
      });

      const before = await ownerApi.rooms.hasTagLinks({
        tagName2: "GcTag",
        tagName: "GcTag",
      });
      expect(before.data.response).toBe(true);

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      // The tag was attached only to the deleted room, so it is garbage-collected
      // from the catalog; the endpoint then reports the tag as non-existent (404).
      const after = await ownerApi.rooms.hasTagLinks({
        tagName2: "GcTag",
        tagName: "GcTag",
      });
      expect(after.status).toBe(404);

      const { data: list } = await ownerApi.rooms.getRoomTagsInfo();
      expect(list.response as unknown as string[]).not.toContain("GcTag");
    });

    test("GET /files/tags/haslinks - Non-existent / empty / spaces-only tag names return 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await test.step("non-existent tag name", async () => {
        const { status } = await ownerApi.rooms.hasTagLinks({
          tagName2: "NoSuchTagEver",
          tagName: "NoSuchTagEver",
        });
        expect(status).toBe(404);
      });

      await test.step("empty tag name", async () => {
        const { status } = await ownerApi.rooms.hasTagLinks({
          tagName2: "",
          tagName: "",
        });
        expect(status).toBe(404);
      });

      await test.step("spaces-only tag name", async () => {
        const { status } = await ownerApi.rooms.hasTagLinks({
          tagName2: "   ",
          tagName: "   ",
        });
        expect(status).toBe(404);
      });
    });

    test("GET /files/tags/haslinks - Lookup is case-insensitive", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "CaseSensitiveTag" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Case Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.addRoomTags({
        id: roomData.response!.id!,
        batchTagsRequestDto: { names: ["CaseSensitiveTag"] },
      });

      const { data, status } = await ownerApi.rooms.hasTagLinks({
        tagName2: "casesensitivetag",
        tagName: "casesensitivetag",
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    test("GET /files/tags/haslinks - Tag names with special characters are matched (URL-encoded)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const names = ["Tag/Slash", "ТестТег", "C++"];

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Special Chars Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.addRoomTags({
        id: roomData.response!.id!,
        batchTagsRequestDto: { names },
      });

      for (const name of names) {
        await test.step(`tag "${name}"`, async () => {
          const { data, status } = await ownerApi.rooms.hasTagLinks({
            tagName2: name,
            tagName: name,
          });
          expect(status).toBe(200);
          expect(data.response).toBe(true);
        });
      }
    });

    test("GET /files/tags/haslinks - On path/query mismatch the query param (tagName) determines the result", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "MismatchLinkedTag" },
      });
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "MismatchUnlinkedTag" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Mismatch Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.addRoomTags({
        id: roomData.response!.id!,
        batchTagsRequestDto: { names: ["MismatchLinkedTag"] },
      });

      await test.step("path=linked, query=unlinked -> false (follows query)", async () => {
        const { data, status } = await ownerApi.rooms.hasTagLinks({
          tagName2: "MismatchLinkedTag",
          tagName: "MismatchUnlinkedTag",
        });
        expect(status).toBe(200);
        expect(data.response).toBe(false);
      });

      await test.step("path=unlinked, query=linked -> true (follows query)", async () => {
        const { data, status } = await ownerApi.rooms.hasTagLinks({
          tagName2: "MismatchUnlinkedTag",
          tagName: "MismatchLinkedTag",
        });
        expect(status).toBe(200);
        expect(data.response).toBe(true);
      });
    });

    test("GET /files/tags/haslinks - Multiple tags on one room are detected independently", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "RoomTagOne" },
      });
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "RoomTagTwo" },
      });
      // RoomTagThree exists in the catalog but is not attached to any room
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "RoomTagThree" },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Multi-Tag Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.addRoomTags({
        id: roomData.response!.id!,
        batchTagsRequestDto: { names: ["RoomTagOne", "RoomTagTwo"] },
      });

      const one = await ownerApi.rooms.hasTagLinks({
        tagName2: "RoomTagOne",
        tagName: "RoomTagOne",
      });
      const two = await ownerApi.rooms.hasTagLinks({
        tagName2: "RoomTagTwo",
        tagName: "RoomTagTwo",
      });
      const three = await ownerApi.rooms.hasTagLinks({
        tagName2: "RoomTagThree",
        tagName: "RoomTagThree",
      });

      expect(one.data.response).toBe(true);
      expect(two.data.response).toBe(true);
      expect(three.data.response).toBe(false);
    });

    test("GET /files/tags/haslinks - Detects a tag linked to a PublicRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "PublicRoomTag" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Public HasLinks Room",
          roomType: RoomType.PublicRoom,
        },
      });
      await ownerApi.rooms.addRoomTags({
        id: roomData.response!.id!,
        batchTagsRequestDto: { names: ["PublicRoomTag"] },
      });

      const { data, status } = await ownerApi.rooms.hasTagLinks({
        tagName2: "PublicRoomTag",
        tagName: "PublicRoomTag",
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    test("GET /files/tags/haslinks - Repeated calls return a stable result", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "StableTag" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Stable Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.addRoomTags({
        id: roomData.response!.id!,
        batchTagsRequestDto: { names: ["StableTag"] },
      });

      const first = await ownerApi.rooms.hasTagLinks({
        tagName2: "StableTag",
        tagName: "StableTag",
      });
      const second = await ownerApi.rooms.hasTagLinks({
        tagName2: "StableTag",
        tagName: "StableTag",
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.data.response).toBe(true);
      expect(second.data.response).toBe(true);
    });
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

    test.fail(
      "BUG 81689: DELETE /files/tags - Very long tag name (10000 chars) returns 400",
      async ({ apiSdk }) => {
        test.fail(
          true,
          "BUG 81689: very long tag name (10000 chars) is silently accepted (200) instead of validation error (400) — no length guard",
        );
        const ownerApi = apiSdk.forRole("owner");
        const { status } = await ownerApi.rooms.deleteCustomTags({
          batchTagsRequestDto: { names: ["a".repeat(10000)] },
        });
        expect(status).toBe(400);
      },
    );

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

    test("PUT /files/rooms/:id/share - Owner invites user with ContentCreator access", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share ContentCreator",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const entry = info.response!.find((s) => s.sharedToUser?.id === userId);
      expect(entry).toBeDefined();
      expect(entry!.access).toBe(FileShare.ContentCreator);
    });

    test("PUT /files/rooms/:id/share - Mixed batch adds, updates and removes participants in one request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: keepData } = await apiSdk.addMember("owner", "User");
      const { data: removeData } = await apiSdk.addMember("owner", "User");
      const { data: addData } = await apiSdk.addMember("owner", "User");
      const keepId = keepData.response!.id!;
      const removeId = removeData.response!.id!;
      const addId = addData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Mixed Batch",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      // seed: two existing participants
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: keepId, access: FileShare.Read },
            { id: removeId, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      // single request: update keepId, remove removeId, add addId
      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: keepId, access: FileShare.Editing },
            { id: removeId, access: FileShare.None },
            { id: addId, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const byId = (uid: string) =>
        info.response!.find((s) => s.sharedToUser?.id === uid);

      expect(byId(keepId)).toBeDefined();
      expect(byId(keepId)!.access).toBe(FileShare.Editing);
      expect(byId(removeId)).toBeUndefined();
      expect(byId(addId)).toBeDefined();
      expect(byId(addId)!.access).toBe(FileShare.Read);
    });

    test("PUT /files/rooms/:id/share - Duplicate user in one request keeps a single entry with the last access", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Duplicate User",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: userId, access: FileShare.Read },
            { id: userId, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);

      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const entries = info.response!.filter(
        (s) => s.sharedToUser?.id === userId,
      );
      expect(entries.length).toBe(1);
      expect(entries[0].access).toBe(FileShare.Editing);
    });

    test("PUT /files/rooms/:id/share - Owner cannot remove themselves via access None", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: profile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = profile.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Owner Self Remove",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: ownerId, access: FileShare.None }],
          notify: false,
        },
      });

      // owner must still be present afterwards (self-removal is a no-op)
      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      expect(info.response!.some((s) => s.isOwner === true)).toBe(true);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });
  });

  test.describe("GET /files/rooms/:id/share", () => {
    // === 1. Basic response contract ===

    test("GET /files/rooms/:id/share - Owner can get security info for own room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Get Owner Self",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].isOwner).toBe(true);
    });

    test("GET /files/rooms/:id/share - Response item has expected shape", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Shape",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToUser?.id === userId)!;
      expect(entry).toBeDefined();
      expect(entry.sharedToUser?.id).toBe(userId);
      expect(entry.sharedToUser?.displayName).toBeDefined();
      expect(entry.access).toBe(FileShare.Read);
    });

    test("GET /files/rooms/:id/share - New room contains only owner", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share OwnerOnly",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].isOwner).toBe(true);
    });

    // === 2. After adding users ===

    test("GET /files/rooms/:id/share - Invited User appears with the assigned access", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Invited Access",
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

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToUser?.id === userId);
      expect(entry).toBeDefined();
      expect(entry!.access).toBe(FileShare.Editing);
    });

    test("GET /files/rooms/:id/share - Multiple invited users are returned", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: user1Data } = await apiSdk.addMember("owner", "User");
      const { data: user2Data } = await apiSdk.addMember("owner", "User");
      const { data: user3Data } = await apiSdk.addMember("owner", "User");
      const user1Id = user1Data.response!.id!;
      const user2Id = user2Data.response!.id!;
      const user3Id = user3Data.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Multiple Invited",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: user1Id, access: FileShare.Read },
            { id: user2Id, access: FileShare.Editing },
            { id: user3Id, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(4);
      const ids = data.response!.map((s) => s.sharedToUser?.id);
      expect(ids).toContain(user1Id);
      expect(ids).toContain(user2Id);
      expect(ids).toContain(user3Id);
    });

    test("GET /files/rooms/:id/share - RoomManager access is returned", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Manager Access",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToUser?.id === userId);
      expect(entry).toBeDefined();
      expect(entry!.access).toBe(FileShare.RoomManager);
    });

    test("GET /files/rooms/:id/share - Changing user access updates entry without duplicating it", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Change Access No Dup",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entries = data.response!.filter(
        (s) => s.sharedToUser?.id === userId,
      );
      expect(entries.length).toBe(1);
      expect(entries[0].access).toBe(FileShare.Editing);
    });

    // === 3. Revocation ===

    test("GET /files/rooms/:id/share - Removing one user does not affect the others", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: user1Data } = await apiSdk.addMember("owner", "User");
      const { data: user2Data } = await apiSdk.addMember("owner", "User");
      const user1Id = user1Data.response!.id!;
      const user2Id = user2Data.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Remove One Keep Other",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: user1Id, access: FileShare.Read },
            { id: user2Id, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: user1Id, access: FileShare.None }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const ids = data.response!.map((s) => s.sharedToUser?.id);
      expect(ids).not.toContain(user1Id);
      expect(ids).toContain(user2Id);
      const remaining = data.response!.find(
        (s) => s.sharedToUser?.id === user2Id,
      );
      expect(remaining!.access).toBe(FileShare.Editing);
    });

    test("GET /files/rooms/:id/share - Owner is not removed after revoking all invited users", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Owner Persists",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.None }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].isOwner).toBe(true);
    });

    // === 4. Access control on the endpoint ===

    test("GET /files/rooms/:id/share - DocSpaceAdmin can get security info", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Admin Access",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
    });

    test("GET /files/rooms/:id/share - RoomManager invited to room can get security info", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Manager Reads",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: managerApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const managerId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: managerId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data, status } = await managerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const ids = data.response!.map((s) => s.sharedToUser?.id);
      expect(ids).toContain(managerId);
    });

    test("GET /files/rooms/:id/share - Regular invited User can get security info", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Invited User Reads",
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

      const { status } = await userApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
    });

    test.fail(
      "BUG 81787: GET /files/rooms/:id/share - User not invited to room cannot get security info",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Share Outside User",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { api: userApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );

        const { data } = await userApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(data.statusCode).toBe(403);
      },
    );

    test.fail(
      "BUG 81788: GET /files/rooms/:id/share - Guest not invited to room cannot get security info",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Share Outside Guest",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { api: guestApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "Guest",
        );

        const { data } = await guestApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(data.statusCode).toBe(403);
      },
    );

    test("GET /files/rooms/:id/share - Anonymous request returns 401", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Anon",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await apiSdk
        .forAnonymous()
        .rooms.getRoomSecurityInfo({ id: roomId });

      expect(status).toBe(401);
    });

    // === 5. Room types ===

    for (const { label, type } of [
      { label: "CustomRoom", type: RoomType.CustomRoom },
      { label: "EditingRoom", type: RoomType.EditingRoom },
      { label: "PublicRoom", type: RoomType.PublicRoom },
      { label: "FillingFormsRoom", type: RoomType.FillingFormsRoom },
      { label: "VirtualDataRoom", type: RoomType.VirtualDataRoom },
    ] as const) {
      test(`GET /files/rooms/:id/share - Works for ${label}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Share Type ${label}`,
            roomType: type,
          },
        });
        const roomId = roomData.response!.id!;

        const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        const ownerEntry = data.response!.find((s) => s.isOwner === true);
        expect(ownerEntry).toBeDefined();
      });
    }

    // === 6. Groups ===

    test("GET /files/rooms/:id/share - Shared group appears in security info", async ({
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
          title: "Autotest Share Group Visible",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: groupId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToGroup?.id === groupId);
      expect(entry).toBeDefined();
    });

    test("GET /files/rooms/:id/share - Group access level is returned", async ({
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
          title: "Autotest Share Group Access Level",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: groupId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToGroup?.id === groupId);
      expect(entry).toBeDefined();
      expect(entry!.access).toBe(FileShare.Editing);
    });

    test("GET /files/rooms/:id/share - Removing group access removes the group", async ({
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
          title: "Autotest Share Group Removed",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: groupId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: groupId, access: FileShare.None }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const groupIds = data.response!.map((s) => s.sharedToGroup?.id);
      expect(groupIds).not.toContain(groupId);
    });

    // === 7. Link invites should not appear in security info ===

    test("GET /files/rooms/:id/share - Invitation links are not returned in security info", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share No Invitation Link",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: linkData } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Invitation Link For Share Check",
          denyDownload: false,
        },
      });
      const linkId = linkData.response!.sharedLink!.id!;

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].isOwner).toBe(true);
      const linkIds = data.response!.map((s) => s.sharedLink?.id);
      expect(linkIds).not.toContain(linkId);
    });

    test("GET /files/rooms/:id/share - PublicRoom auto-created External link is not returned in security info", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share No External Link",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].isOwner).toBe(true);
      expect(data.response![0].sharedLink).toBeUndefined();
    });

    // === 8. id validation ===

    test("GET /files/rooms/:id/share - Non-existing id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomSecurityInfo({
        id: 999999999,
      });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/share - Deleted room id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Deleted Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      const op = await waitForOperation(ownerApi.operations);
      expect(op.finished).toBe(true);

      const { data } = await ownerApi.rooms.getRoomSecurityInfo({ id: roomId });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/share - id:null is rejected by the SDK before the request is sent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.getRoomSecurityInfo({
          id: null as unknown as number,
        }),
      ).rejects.toThrow(/Required parameter id was null or undefined/);
    });

    test("GET /files/rooms/:id/share - id:-1 returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomSecurityInfo({ id: -1 });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/share - id:0 returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomSecurityInfo({ id: 0 });
      expect(data.statusCode).toBe(404);
    });

    // === 9. Stability / consistency ===

    test("GET /files/rooms/:id/share - Repeated GET returns the same security list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: user1Data } = await apiSdk.addMember("owner", "User");
      const { data: user2Data } = await apiSdk.addMember("owner", "User");
      const user1Id = user1Data.response!.id!;
      const user2Id = user2Data.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Repeated Stable",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: user1Id, access: FileShare.Read },
            { id: user2Id, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      const { data: first } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const { data: second } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      const summary = (entries: typeof first.response) =>
        entries!
          .map(
            (s) => `${s.sharedToUser?.id ?? s.sharedToGroup?.id}:${s.access}`,
          )
          .sort();
      expect(summary(first.response)).toEqual(summary(second.response));
    });

    test("GET /files/rooms/:id/share - Reflects the latest setRoomSecurity state", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Latest State",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToUser?.id === userId);
      expect(entry!.access).toBe(FileShare.Read);
    });

    test("GET /files/rooms/:id/share - Re-granting the same access does not duplicate the entry", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Same Access No Dup",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entries = data.response!.filter(
        (s) => s.sharedToUser?.id === userId,
      );
      expect(entries.length).toBe(1);
      expect(entries[0].access).toBe(FileShare.Read);
    });

    test("GET /files/rooms/:id/share - User entry found by sharedToUser.id regardless of order", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: user1Data } = await apiSdk.addMember("owner", "User");
      const { data: user2Data } = await apiSdk.addMember("owner", "User");
      const user1Id = user1Data.response!.id!;
      const user2Id = user2Data.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Order Independent",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: user1Id, access: FileShare.Editing },
            { id: user2Id, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const u1 = data.response!.find((s) => s.sharedToUser?.id === user1Id);
      const u2 = data.response!.find((s) => s.sharedToUser?.id === user2Id);
      expect(u1!.access).toBe(FileShare.Editing);
      expect(u2!.access).toBe(FileShare.Read);
    });

    // === 10. Regression ===

    test("GET /files/rooms/:id/share - Terminated user keeps their share entry", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Terminated User",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      await ownerApi.userStatus.updateUserStatus({
        status: EmployeeStatus.Terminated,
        updateMembersRequestDto: { userIds: [userId] },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      const entry = data.response!.find((s) => s.sharedToUser?.id === userId);
      expect(entry).toBeDefined();
      expect(entry!.access).toBe(FileShare.Read);
    });

    test("GET /files/rooms/:id/share - Total count equals owner + invited users + invited groups", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: user1Data } = await apiSdk.addMember("owner", "User");
      const { data: user2Data } = await apiSdk.addMember("owner", "User");
      const { data: groupMemberData } = await apiSdk.addMember("owner", "User");
      const user1Id = user1Data.response!.id!;
      const user2Id = user2Data.response!.id!;
      const groupMemberId = groupMemberData.response!.id!;

      const { data: groupData } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: groupMemberId,
          members: [groupMemberId],
        },
      });
      const groupId = groupData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Count Matches",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: user1Id, access: FileShare.Read },
            { id: user2Id, access: FileShare.Editing },
            { id: groupId, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: user1Id, access: FileShare.None }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(3);
      const ids = data.response!.map(
        (s) => s.sharedToUser?.id ?? s.sharedToGroup?.id,
      );
      expect(ids).not.toContain(user1Id);
      expect(ids).toContain(user2Id);
      expect(ids).toContain(groupId);
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

  test.describe("PUT /files/rooms/:id/share - input validation", () => {
    async function createShareRoom(
      ownerApi: ReturnType<ApiSDK["forRole"]>,
      title: string,
    ) {
      const { data } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
      });
      return data.response!.id!;
    }

    test("PUT /files/rooms/:id/share - invitation id 0 returns 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await createShareRoom(ownerApi, "Autotest Share Id0");

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: 0 as unknown as string, access: FileShare.Read }],
          notify: false,
        },
      });

      expect(status).toBe(400);
      expect(data.statusCode).toBe(400);

      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      expect(info.response!.length).toBe(1);
      expect(info.response![0].isOwner).toBe(true);
    });

    test("PUT /files/rooms/:id/share - invalid access value is rejected with 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;
      const roomId = await createShareRoom(
        ownerApi,
        "Autotest Share BadAccess",
      );

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: 999 as unknown as FileShare }],
          notify: false,
        },
      });

      // side-effect first: nothing was added
      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const ids = info.response!.map((s) => s.sharedToUser?.id);
      expect(ids).not.toContain(userId);

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
    });

    // The endpoint treats "nothing to apply" payloads as a successful no-op.
    // Each case must leave the room membership unchanged (owner only).
    const noOpCases: {
      label: string;
      body: () => unknown;
    }[] = [
      {
        label: "empty invitations array",
        body: () => ({ invitations: [], notify: false }),
      },
      {
        label: "invitations null",
        body: () => ({ invitations: null, notify: false }),
      },
      { label: "empty body", body: () => ({}) },
    ];

    for (const { label, body } of noOpCases) {
      test(`PUT /files/rooms/:id/share - ${label} is a 200 no-op`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await createShareRoom(
          ownerApi,
          `Autotest Share NoOp ${label}`,
        );

        const { data, status } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: body() as never,
        });

        const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
          id: roomId,
        });
        expect(info.response!.length).toBe(1);
        expect(info.response![0].isOwner).toBe(true);

        expect(status).toBe(200);
        expect(data.statusCode).toBe(200);
      });
    }

    test("PUT /files/rooms/:id/share - invitation without access is ignored (200 no-op)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;
      const roomId = await createShareRoom(ownerApi, "Autotest Share NoAccess");

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId } as unknown as never],
          notify: false,
        },
      });

      // side-effect first: the user without an access level is not added
      const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const ids = info.response!.map((s) => s.sharedToUser?.id);
      expect(ids).not.toContain(userId);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
    });

    for (const [label, badId] of [
      ["id 0", 0],
      ["id -1", -1],
      ["non-existing id", 999999999],
    ] as const) {
      test(`PUT /files/rooms/:id/share - room ${label} returns 404`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: memberData } = await apiSdk.addMember("owner", "User");
        const userId = memberData.response!.id!;

        const { data, status } = await ownerApi.rooms.setRoomSecurity({
          id: badId as unknown as number,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.Read }],
            notify: false,
          },
        });

        expect(status).toBe(404);
        expect(data.statusCode).toBe(404);
      });
    }

    test("PUT /files/rooms/:id/share - deleted room returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;
      const roomId = await createShareRoom(ownerApi, "Autotest Share Deleted");

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      expect(status).toBe(404);
      expect(data.statusCode).toBe(404);
    });

    test("PUT /files/rooms/:id/share - archived room returns 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;
      const roomId = await createShareRoom(ownerApi, "Autotest Share Archived");

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
    });
  });

  test.describe("PUT /files/rooms/:id/share - room type access levels", () => {
    // Each room type allows only a subset of FileShare levels for direct member
    // invitations. Captured from live API behaviour.
    const matrix = [
      {
        typeLabel: "Collaboration",
        type: RoomType.EditingRoom,
        accepted: [
          { label: "Read", access: FileShare.Read },
          { label: "Editing", access: FileShare.Editing },
          { label: "ContentCreator", access: FileShare.ContentCreator },
        ],
        rejected: [
          { label: "FillForms", access: FileShare.FillForms },
          { label: "Review", access: FileShare.Review },
          { label: "Comment", access: FileShare.Comment },
        ],
      },
      {
        typeLabel: "Public",
        type: RoomType.PublicRoom,
        accepted: [
          { label: "ContentCreator", access: FileShare.ContentCreator },
        ],
        rejected: [
          { label: "Read", access: FileShare.Read },
          { label: "Editing", access: FileShare.Editing },
        ],
      },
      {
        typeLabel: "VirtualData",
        type: RoomType.VirtualDataRoom,
        accepted: [
          { label: "Read", access: FileShare.Read },
          { label: "Editing", access: FileShare.Editing },
          { label: "FillForms", access: FileShare.FillForms },
          { label: "ContentCreator", access: FileShare.ContentCreator },
        ],
        rejected: [
          { label: "Review", access: FileShare.Review },
          { label: "Comment", access: FileShare.Comment },
        ],
      },
    ];

    for (const { typeLabel, type, accepted, rejected } of matrix) {
      for (const { label, access } of accepted) {
        test(`PUT /files/rooms/:id/share - ${typeLabel} accepts ${label}`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { data: memberData } = await apiSdk.addMember("owner", "User");
          const userId = memberData.response!.id!;

          const { data: roomData } = await ownerApi.rooms.createRoom({
            createRoomRequestDto: {
              title: `Autotest Share Type ${typeLabel} ${label}`,
              roomType: type,
            },
          });
          const roomId = roomData.response!.id!;

          const { data, status } = await ownerApi.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [{ id: userId, access }],
              notify: false,
            },
          });

          expect(status).toBe(200);
          expect(data.statusCode).toBe(200);

          const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
            id: roomId,
          });
          const entry = info.response!.find(
            (s) => s.sharedToUser?.id === userId,
          );
          expect(entry).toBeDefined();
          expect(entry!.access).toBe(access);
        });
      }

      for (const { label, access } of rejected) {
        test(`PUT /files/rooms/:id/share - ${typeLabel} rejects ${label}`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { data: memberData } = await apiSdk.addMember("owner", "User");
          const userId = memberData.response!.id!;

          const { data: roomData } = await ownerApi.rooms.createRoom({
            createRoomRequestDto: {
              title: `Autotest Share Type ${typeLabel} ${label}`,
              roomType: type,
            },
          });
          const roomId = roomData.response!.id!;

          const { data, status } = await ownerApi.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [{ id: userId, access }],
              notify: false,
            },
          });

          // side-effect first: the rejected user is not added
          const { data: info } = await ownerApi.rooms.getRoomSecurityInfo({
            id: roomId,
          });
          const ids = info.response!.map((s) => s.sharedToUser?.id);
          expect(ids).not.toContain(userId);

          expect(status).toBe(403);
          expect(data.statusCode).toBe(403);
        });
      }
    }

    // NOTE: VirtualDataRoom + RoomManager for a RoomAdmin is intentionally NOT
    // covered: the API is non-deterministic for this combination (observed both
    // 200/added and 403/not-added across identical back-to-back requests), so it
    // cannot be asserted as a stable contract.
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

    for (const { label, roomType } of privateUnsupportedRoomTypes) {
      test(`BUG 83319: GET /files/share - Anonymous visitor opens a ${label} room via its external link`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: `Autotest Anonymous External Link ${label}`,
            roomType,
          },
        });
        const roomId = roomData.response!.id!;

        const { data: linkData } =
          await ownerApi.rooms.getRoomsPrimaryExternalLink({ id: roomId });
        const requestToken = linkData.response!.sharedLink!.requestToken!;

        // No Authorization header at all - this is what a visitor with no
        // portal account gets when they follow the room's public share link.
        const { data, status } = await apiSdk
          .forAnonymous()
          .sharing.getExternalShareData({
            key: requestToken,
            folderId: String(roomId),
          });

        // The link does resolve to the right room even for a fully anonymous
        // caller - this half stays true regardless of the bug below.
        expect(status).toBe(200);
        expect(data.response?.isRoom).toBe(true);
        expect(data.response?.entityId).toBe(String(roomId));

        test.fail(
          true,
          `BUG 83319 (BUG 83166 closed, refiled separately): getExternalShareData ` +
            `reports shared=false for an anonymous visitor resolving a ${label} ` +
            "room's own primary external link, even though the link correctly " +
            "resolves the room (status 200, isRoom=true) and manual verification " +
            "confirms the link itself opens fine for an anonymous visitor - " +
            "shared should be true",
        );

        expect(data.response?.shared).toBe(true);
      });
    }

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

    test("GET /files/rooms/:id/links - Auto-created External link of PublicRoom has primary=true", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Primary Flag Room",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].sharedLink?.primary).toBe(true);
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.External);
    });

    test("GET /files/rooms/:id/links - CustomRoom returns empty list by default", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Empty Custom",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomData.response!.id!,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - External link denyDownload=true is reflected in response", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links denyDownload",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: createdLink } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.External,
          title: "Autotest denyDownload Link",
          denyDownload: true,
        },
      });
      const linkId = createdLink.response!.sharedLink!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      const link = data.response!.find((l) => l.sharedLink?.id === linkId);
      expect(status).toBe(200);
      expect(link).toBeDefined();
      expect(link!.sharedLink?.denyDownload).toBe(true);
    });

    test("GET /files/rooms/:id/links - Invitation link title is preserved", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Title Preserved",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: createdLink } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "My Invitation Title",
          denyDownload: false,
        },
      });
      const linkId = createdLink.response!.sharedLink!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.Invitation,
      });

      const link = data.response!.find((l) => l.sharedLink?.id === linkId);
      expect(status).toBe(200);
      expect(link).toBeDefined();
      expect(link!.sharedLink?.title).toBe("My Invitation Title");
    });

    test("GET /files/rooms/:id/links - Invitation link maxUseCount is preserved", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links maxUseCount",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: createdLink } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest maxUseCount Link",
          denyDownload: false,
          maxUseCount: 5,
        },
      });
      const linkId = createdLink.response!.sharedLink!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.Invitation,
      });

      const link = data.response!.find((l) => l.sharedLink?.id === linkId);
      expect(status).toBe(200);
      expect(link).toBeDefined();
      expect(link!.sharedLink?.maxUseCount).toBe(5);
    });

    test("GET /files/rooms/:id/links - External link has non-empty requestToken", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links requestToken",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(typeof data.response![0].sharedLink?.requestToken).toBe("string");
      expect(
        data.response![0].sharedLink!.requestToken!.length,
      ).toBeGreaterThan(0);
    });

    test("GET /files/rooms/:id/links - type=External returns only External links", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Filter External",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Filter Invitation",
          denyDownload: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.External);
    });

    test("GET /files/rooms/:id/links - type=Invitation returns only Invitation links", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Filter Invitation",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Filter Invitation Link",
          denyDownload: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.Invitation,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.Invitation);
    });

    test("GET /files/rooms/:id/links - Without type returns both External and Invitation links", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links No Filter",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest No Filter Invitation",
          denyDownload: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
      });

      const types = data.response!.map((l) => l.sharedLink?.linkType);
      expect(status).toBe(200);
      expect(data.response!.length).toBe(2);
      expect(types).toContain(LinkType.External);
      expect(types).toContain(LinkType.Invitation);
    });

    test("GET /files/rooms/:id/links - PublicRoom with no invitations: type=Invitation returns empty", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Public NoInvitations",
          roomType: RoomType.PublicRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomData.response!.id!,
        type: LinkType.Invitation,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - CustomRoom: type=External returns empty", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Custom NoExternal",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomData.response!.id!,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - setRoomLink with access=None removes the Invitation link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Remove Invitation",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: createdLink } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Remove Invitation",
          denyDownload: false,
        },
      });
      const linkId = createdLink.response!.sharedLink!.id!;

      const { data: beforeData } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.Invitation,
      });
      expect(beforeData.response!.map((l) => l.sharedLink?.id)).toContain(
        linkId,
      );

      await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          linkId,
          access: FileShare.None,
          linkType: LinkType.Invitation,
          title: "Autotest Remove Invitation",
          denyDownload: false,
        },
      });

      const { data: afterData, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.Invitation,
      });

      expect(afterData.response!.map((l) => l.sharedLink?.id)).not.toContain(
        linkId,
      );
      expect(status).toBe(200);
      expect(afterData.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - Multiple External links are all returned with unique ids", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Multiple Externals",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const expectedTitles: string[] = [];

      for (let i = 0; i < 4; i++) {
        const title = `Autotest Bulk External ${i}`;
        const { status: createStatus } = await ownerApi.rooms.setRoomLink({
          id: roomId,
          roomLinkRequest: {
            access: FileShare.Read,
            linkType: LinkType.External,
            title,
            denyDownload: false,
          },
        });
        expect(createStatus).toBe(200);
        expectedTitles.push(title);
      }

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      const returnedIds = data.response!.map((l) => l.sharedLink!.id!);
      const returnedTitles = data.response!.map((l) => l.sharedLink!.title!);
      expect(status).toBe(200);
      expect(data.response!.length).toBe(5);
      expect(new Set(returnedIds).size).toBe(5);
      for (const title of expectedTitles) {
        expect(returnedTitles).toContain(title);
      }
    });

    test("GET /files/rooms/:id/links - Repeated GET returns the same set of link ids", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Repeated GET",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Repeated Invitation",
          denyDownload: false,
        },
      });

      const { data: first } = await ownerApi.rooms.getRoomLinks({ id: roomId });
      const { data: second } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
      });

      const firstIds = first.response!.map((l) => l.sharedLink!.id!).sort();
      const secondIds = second.response!.map((l) => l.sharedLink!.id!).sort();
      expect(firstIds).toEqual(secondIds);
      expect(first.response!.length).toBe(2);
      expect(second.response!.length).toBe(2);
    });

    test("GET /files/rooms/:id/links - EditingRoom has no External links by default", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Editing NoExternal",
          roomType: RoomType.EditingRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomData.response!.id!,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - VirtualDataRoom has no External links by default", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links VDR NoExternal",
          roomType: RoomType.VirtualDataRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomData.response!.id!,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - FillingFormsRoom has one auto-created External link by default", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Form AutoExternal",
          roomType: RoomType.FillingFormsRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomLinks({
        id: roomData.response!.id!,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.External);
      expect(data.response![0].sharedLink?.primary).toBe(true);
    });

    test("GET /files/rooms/:id/links - Two rooms return only their own links", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomA } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Isolation A",
          roomType: RoomType.PublicRoom,
        },
      });
      const { data: roomB } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Isolation B",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomIdA = roomA.response!.id!;
      const roomIdB = roomB.response!.id!;

      const { data: invA } = await ownerApi.rooms.setRoomLink({
        id: roomIdA,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Isolation Invite A",
          denyDownload: false,
        },
      });
      const { data: invB } = await ownerApi.rooms.setRoomLink({
        id: roomIdB,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Isolation Invite B",
          denyDownload: false,
        },
      });
      const linkIdA = invA.response!.sharedLink!.id!;
      const linkIdB = invB.response!.sharedLink!.id!;

      const { data: linksA, status: statusA } =
        await ownerApi.rooms.getRoomLinks({
          id: roomIdA,
        });
      const { data: linksB, status: statusB } =
        await ownerApi.rooms.getRoomLinks({
          id: roomIdB,
        });

      const idsA = linksA.response!.map((l) => l.sharedLink!.id!);
      const idsB = linksB.response!.map((l) => l.sharedLink!.id!);

      expect(statusA).toBe(200);
      expect(statusB).toBe(200);
      expect(idsA).toContain(linkIdA);
      expect(idsA).not.toContain(linkIdB);
      expect(idsB).toContain(linkIdB);
      expect(idsB).not.toContain(linkIdA);
    });

    test("GET /files/rooms/:id/links - DocSpaceAdmin invited as RoomManager sees the External link of a PublicRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Admin Reads",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: adminApi, data: adminData } =
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            {
              id: adminData.response!.id!,
              access: FileShare.RoomManager,
            },
          ],
          notify: false,
        },
      });

      const { data, status } = await adminApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(1);
      expect(data.response![0].sharedLink?.linkType).toBe(LinkType.External);
    });

    test("GET /files/rooms/:id/links - RoomAdmin without access gets 200 and empty list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links RoomAdmin Empty",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data, status } = await roomAdminApi.rooms.getRoomLinks({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - User without access gets 200 and empty list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links User Empty",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data, status } = await userApi.rooms.getRoomLinks({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - Guest without access gets 200 and empty list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Guest Empty",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { data, status } = await guestApi.rooms.getRoomLinks({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    });

    test("GET /files/rooms/:id/links - Non-existing room id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data } = await ownerApi.rooms.getRoomLinks({ id: 99999999 });

      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/links - Deleted room returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Links Deleted Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data } = await ownerApi.rooms.getRoomLinks({ id: roomId });

      expect(data.statusCode).toBe(404);
    });

    // getRoomsPrimaryExternalLink — GET /files/rooms/:id/link.
    // Returns a single FileShareWrapper (the primary External link), not an array.
    test("GET /files/rooms/:id/link - Owner gets primary external link of a FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link FillingForms",
          roomType: RoomType.FillingFormsRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomData.response!.id!,
        },
      );

      expect(status).toBe(200);
      expect(data.response!.sharedLink?.id).toBeDefined();
      expect(data.response!.sharedLink?.shareLink).toBeDefined();
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.External);
      expect(data.response!.sharedLink?.primary).toBe(true);
    });

    test("GET /files/rooms/:id/link - Response is a single FileShareWrapper with expected shape", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Shape",
          roomType: RoomType.PublicRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomData.response!.id!,
        },
      );

      const link = data.response!.sharedLink!;
      expect(status).toBe(200);
      // Single object, not an array (differs from getRoomLinks).
      expect(Array.isArray(data.response)).toBe(false);
      expect(typeof link.id).toBe("string");
      expect(link.id!.length).toBeGreaterThan(0);
      expect(link.shareLink!.startsWith("http")).toBe(true);
      expect(typeof link.requestToken).toBe("string");
      expect(link.requestToken!.length).toBeGreaterThan(0);
      expect(link.linkType).toBe(LinkType.External);
      expect(link.primary).toBe(true);
      expect(typeof link.denyDownload).toBe("boolean");
      expect(typeof data.response!.access).toBe("number");
    });

    test("GET /files/rooms/:id/link - Primary link matches the External link from getRoomLinks", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Matches List",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: primary } =
        await ownerApi.rooms.getRoomsPrimaryExternalLink({
          id: roomId,
        });
      const { data: links } = await ownerApi.rooms.getRoomLinks({
        id: roomId,
        type: LinkType.External,
      });

      expect(links.response!.length).toBe(1);
      expect(primary.response!.sharedLink?.id).toBe(
        links.response![0].sharedLink?.id,
      );
      expect(primary.response!.sharedLink?.requestToken).toBe(
        links.response![0].sharedLink?.requestToken,
      );
    });

    test("GET /files/rooms/:id/link - Returns the External primary link, not an Invitation link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Not Invitation",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: invitation } = await ownerApi.rooms.setRoomLink({
        id: roomId,
        roomLinkRequest: {
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: "Autotest Primary Not Invitation",
          denyDownload: false,
        },
      });
      const invitationId = invitation.response!.sharedLink!.id!;

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomId,
        },
      );

      expect(status).toBe(200);
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.External);
      expect(data.response!.sharedLink?.id).not.toBe(invitationId);
    });

    test("GET /files/rooms/:id/link - Repeated calls return the same link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Stable",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: first } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
        id: roomId,
      });
      const { data: second } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomId,
        },
      );

      expect(second.response!.sharedLink?.id).toBe(
        first.response!.sharedLink?.id,
      );
      expect(second.response!.sharedLink?.requestToken).toBe(
        first.response!.sharedLink?.requestToken,
      );
    });

    // A CustomRoom has no external link in getRoomLinks (returns empty list), but the
    // primary-link endpoint still returns a primary External link for it.
    test("GET /files/rooms/:id/link - CustomRoom returns a primary External link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Custom",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomData.response!.id!,
        },
      );

      expect(status).toBe(200);
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.External);
      expect(data.response!.sharedLink?.primary).toBe(true);
    });

    test("GET /files/rooms/:id/link - EditingRoom returns 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Editing",
          roomType: RoomType.EditingRoom,
        },
      });

      const { data } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
        id: roomData.response!.id!,
      });

      expect(data.statusCode).toBe(403);
    });

    test("GET /files/rooms/:id/link - Archived PublicRoom still returns its primary link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Primary Link Archived",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
        {
          id: roomId,
        },
      );

      expect(status).toBe(200);
      expect(data.response!.sharedLink?.linkType).toBe(LinkType.External);
    });

    test("GET /files/rooms/:id/link - Non-existing room id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
        id: 99999999,
      });

      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/link - id 0 returns 404", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
        id: 0,
      });

      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/link - negative id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
        id: -1,
      });

      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/link - non-numeric id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data } = await ownerApi.rooms.getRoomsPrimaryExternalLink({
        id: "abc" as unknown as number,
      });

      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id/link - missing id throws at the SDK level", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await expect(
        ownerApi.rooms.getRoomsPrimaryExternalLink({
          id: undefined as unknown as number,
        }),
      ).rejects.toThrow();
    });
  });

  // setRoomLink — PUT /files/rooms/:id/links. Creates, updates (by linkId) or
  // deletes (access: None) an External or Invitation link of a room. External
  // links may be multiple per room; an Invitation link is a singleton (a second
  // create without linkId is rejected). Behaviour mirrors the folder-link family
  // (setFolderPrimaryExternalLink): password is echoed back, a past expirationDate
  // is silently ignored, and an unknown linkId is upserted (created with that id).
  test.describe("PUT /files/rooms/:id/links - setRoomLink", () => {
    type RoomClient = ReturnType<ApiSDK["forRole"]>;

    const mkRoom = async (
      api: RoomClient,
      title: string,
      roomType: RoomType = RoomType.CustomRoom,
    ): Promise<number> => {
      const { data } = await api.rooms.createRoom({
        createRoomRequestDto: { title, roomType },
      });
      return data.response!.id!;
    };

    const setLink = (
      api: RoomClient,
      roomId: number,
      roomLinkRequest: RoomLinkRequest,
    ) => api.rooms.setRoomLink({ id: roomId, roomLinkRequest });

    const listLinks = async (
      api: RoomClient,
      roomId: number,
      type?: LinkType,
    ) => {
      const { data } = await api.rooms.getRoomLinks({ id: roomId, type });
      return data.response ?? [];
    };

    // ===== Functional: External =====

    test("PUT /files/rooms/:id/links - Owner creates an External link without linkId", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Create External");

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Autotest New External",
        denyDownload: false,
      });

      expect(status).toBe(200);
      const linkId = data.response!.sharedLink!.id!;
      expect(linkId).toBeDefined();
      expect(data.response!.sharedLink!.linkType).toBe(LinkType.External);
      expect(data.response!.sharedLink!.shareLink).toBeDefined();

      const links = await listLinks(ownerApi, roomId, LinkType.External);
      expect(links.map((l) => l.sharedLink?.id)).toContain(linkId);
    });

    test("PUT /files/rooms/:id/links - Owner updates an External link by linkId", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Update External");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "External Before",
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "External After",
        denyDownload: true,
        internal: true,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBe(linkId);
      expect(data.response!.sharedLink!.title).toBe("External After");
      expect(data.response!.sharedLink!.denyDownload).toBe(true);
      expect(data.response!.sharedLink!.internal).toBe(true);

      const links = await listLinks(ownerApi, roomId, LinkType.External);
      const link = links.find((l) => l.sharedLink?.id === linkId);
      expect(link!.sharedLink!.title).toBe("External After");
      expect(link!.sharedLink!.denyDownload).toBe(true);
      expect(link!.sharedLink!.internal).toBe(true);
    });

    test("PUT /files/rooms/:id/links - Owner deletes an External link via access None", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Delete External");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "External To Delete",
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;

      const { status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.None,
        linkType: LinkType.External,
        title: "External To Delete",
        denyDownload: false,
      });

      const links = await listLinks(ownerApi, roomId, LinkType.External);
      expect(links.map((l) => l.sharedLink?.id)).not.toContain(linkId);
      expect(status).toBe(200);
    });

    // ===== Functional: Invitation =====

    test("PUT /files/rooms/:id/links - Second Invitation link without linkId is rejected (singleton)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Invitation Single",
      );

      const { data: first } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "First Invitation",
        denyDownload: false,
      });
      const firstId = first.response!.sharedLink!.id!;

      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "Second Invitation",
        denyDownload: false,
      });

      const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
      expect(links.map((l) => l.sharedLink?.id)).toContain(firstId);
      expect(data.statusCode).toBe(403);
    });

    test("PUT /files/rooms/:id/links - Owner updates an Invitation link by linkId", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Update Invitation",
      );

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "Invitation Before",
        denyDownload: false,
        maxUseCount: 3,
      });
      const linkId = created.response!.sharedLink!.id!;

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "Invitation After",
        denyDownload: true,
        maxUseCount: 10,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBe(linkId);
      expect(data.response!.sharedLink!.title).toBe("Invitation After");
      expect(data.response!.sharedLink!.maxUseCount).toBe(10);

      const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
      const link = links.find((l) => l.sharedLink?.id === linkId);
      expect(link!.sharedLink!.title).toBe("Invitation After");
      expect(link!.sharedLink!.maxUseCount).toBe(10);
    });

    test("PUT /files/rooms/:id/links - Invitation link can be re-created after deletion", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Recreate Invitation",
      );

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "Invitation V1",
        denyDownload: false,
      });
      const firstId = created.response!.sharedLink!.id!;

      await setLink(ownerApi, roomId, {
        linkId: firstId,
        access: FileShare.None,
        linkType: LinkType.Invitation,
        title: "Invitation V1",
        denyDownload: false,
      });

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "Invitation V2",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBeDefined();

      const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
      expect(links.length).toBe(1);
    });

    // ===== Field behaviours =====

    for (const access of [
      FileShare.Read,
      FileShare.Review,
      FileShare.Comment,
      FileShare.Editing,
    ]) {
      test(`PUT /files/rooms/:id/links - Invitation link accepts access ${access}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(
          ownerApi,
          `Autotest setLink Access ${access}`,
        );

        const { data, status } = await setLink(ownerApi, roomId, {
          access,
          linkType: LinkType.Invitation,
          title: `Invitation Access ${access}`,
          denyDownload: false,
        });

        expect(status).toBe(200);
        const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
        const link = links.find(
          (l) => l.sharedLink?.id === data.response!.sharedLink!.id,
        );
        expect(link!.access).toBe(access);
      });
    }

    test("PUT /files/rooms/:id/links - Password is reflected on create and update", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Password");

      const { data: created, status: createStatus } = await setLink(
        ownerApi,
        roomId,
        {
          access: FileShare.Read,
          linkType: LinkType.External,
          title: "Password Link",
          password: "Secret123!",
          denyDownload: false,
        },
      );
      expect(createStatus).toBe(200);
      expect(created.response!.sharedLink!.password).toBeTruthy();
      const linkId = created.response!.sharedLink!.id!;

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Password Link",
        password: "Updated456!",
        denyDownload: false,
      });
      expect(status).toBe(200);
      expect(data.response!.sharedLink!.password).toBeTruthy();
    });

    test("PUT /files/rooms/:id/links - Future expirationDate is reflected, past is silently ignored", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Expiration");

      const { data: created, status: createStatus } = await setLink(
        ownerApi,
        roomId,
        {
          access: FileShare.Read,
          linkType: LinkType.External,
          title: "Expiry Link",
          denyDownload: false,
          expirationDate:
            "2030-01-01T00:00:00.000Z" as unknown as RoomLinkRequest["expirationDate"],
        },
      );
      expect(createStatus).toBe(200);
      expect(created.response!.sharedLink!.isExpired).toBe(false);
      expect(
        (created.response!.sharedLink! as { expirationDate?: unknown })
          .expirationDate,
      ).toBeDefined();
      const linkId = created.response!.sharedLink!.id!;

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Expiry Link",
        denyDownload: false,
        expirationDate:
          "2020-01-01T00:00:00.000Z" as unknown as RoomLinkRequest["expirationDate"],
      });
      expect(status).toBe(200);
      expect(
        (data.response!.sharedLink! as { expirationDate?: unknown })
          .expirationDate,
      ).toBeUndefined();
    });

    test("PUT /files/rooms/:id/links - denyDownload toggles from true to false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink DenyDownload");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "DenyDownload Link",
        denyDownload: true,
      });
      const linkId = created.response!.sharedLink!.id!;
      expect(created.response!.sharedLink!.denyDownload).toBe(true);

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "DenyDownload Link",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.denyDownload).toBe(false);
    });

    test("PUT /files/rooms/:id/links - internal toggles from true to false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Internal");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Internal Link",
        internal: true,
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;
      expect(created.response!.sharedLink!.internal).toBe(true);

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Internal Link",
        internal: false,
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.internal).toBe(false);
    });

    test("PUT /files/rooms/:id/links - maxUseCount is saved and currentUseCount stays 0 on update", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink maxUseCount");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "MaxUse Link",
        maxUseCount: 5,
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;
      expect(created.response!.sharedLink!.maxUseCount).toBe(5);
      expect(created.response!.sharedLink!.currentUseCount).toBe(0);

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "MaxUse Link",
        maxUseCount: 8,
        currentUseCount: 99,
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.maxUseCount).toBe(8);
      // The server must not trust a client-supplied currentUseCount.
      expect(data.response!.sharedLink!.currentUseCount).toBe(0);
    });

    // ===== Negative / validation =====

    for (const badId of [0, -1, 999999999]) {
      test(`PUT /files/rooms/:id/links - Invalid room id ${badId} returns 404`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");

        const { data } = await setLink(ownerApi, badId, {
          access: FileShare.Read,
          linkType: LinkType.External,
          title: "Bad Room Id",
          denyDownload: false,
        });

        expect(data.statusCode).toBe(404);
      });
    }

    test("PUT /files/rooms/:id/links - Deleted room returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Deleted Room");

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "On Deleted Room",
        denyDownload: false,
      });

      expect(data.statusCode).toBe(404);
    });

    test("PUT /files/rooms/:id/links - Archived room returns 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Archived Room",
        RoomType.PublicRoom,
      );

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "On Archived Room",
        denyDownload: false,
      });

      expect(data.statusCode).toBe(403);
    });

    test("PUT /files/rooms/:id/links - Unknown linkId is upserted (created with that id)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Unknown LinkId");

      const fakeLinkId = "00000000-0000-0000-0000-000000000001";

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId: fakeLinkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Upserted Link",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBe(fakeLinkId);
    });

    test("PUT /files/rooms/:id/links - linkId from another room creates a separate link, leaving the original intact", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomIdA = await mkRoom(ownerApi, "Autotest setLink Cross Room A");
      const roomIdB = await mkRoom(ownerApi, "Autotest setLink Cross Room B");

      const { data: linkA } = await setLink(ownerApi, roomIdA, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Cross Room Link A",
        denyDownload: false,
      });
      const linkIdA = linkA.response!.sharedLink!.id!;

      await setLink(ownerApi, roomIdB, {
        linkId: linkIdA,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Cross Room Link On B",
        denyDownload: false,
      });

      const linksA = await listLinks(ownerApi, roomIdA, LinkType.External);
      expect(linksA.map((l) => l.sharedLink?.id)).toContain(linkIdA);
    });

    test("PUT /files/rooms/:id/links - Deleting an already-deleted link is idempotent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Double Delete");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Double Delete Link",
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;

      await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.None,
        linkType: LinkType.External,
        title: "Double Delete Link",
        denyDownload: false,
      });

      const { status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.None,
        linkType: LinkType.External,
        title: "Double Delete Link",
        denyDownload: false,
      });

      expect(status).toBe(200);
      const links = await listLinks(ownerApi, roomId, LinkType.External);
      expect(links.map((l) => l.sharedLink?.id)).not.toContain(linkId);
    });

    // ===== Negative: request-body validation =====
    // DocSpace tends to be permissive with link bodies (defaults / normalizes
    // rather than 400). Assertions below reflect the observed contract.

    test("PUT /files/rooms/:id/links - Missing linkType defaults to an Invitation link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink No LinkType");

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        title: "No LinkType",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.linkType).toBe(LinkType.Invitation);
    });

    test("PUT /files/rooms/:id/links - Missing access creates no link (treated as None)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink No Access");

      const { status } = await setLink(ownerApi, roomId, {
        linkType: LinkType.Invitation,
        title: "No Access",
        denyDownload: false,
      });

      const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
      expect(links.length).toBe(0);
      expect(status).toBe(200);
    });

    test("PUT /files/rooms/:id/links - Missing title is accepted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink No Title");

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBeDefined();
    });

    // An out-of-range enum in the body should be a 400 Bad Request, but the API
    // currently returns 403. Marked test.fail until the validation is fixed.
    test.fail(
      "BUG 82370: PUT /files/rooms/:id/links - Invalid linkType should be rejected with 400 (API returns 403)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(ownerApi, "Autotest setLink Bad LinkType");

        const { data } = await setLink(ownerApi, roomId, {
          access: FileShare.Read,
          linkType: 5 as unknown as LinkType,
          title: "Bad LinkType",
          denyDownload: false,
        });

        expect(data.statusCode).toBe(400);
      },
    );

    test.fail(
      "BUG 82371: PUT /files/rooms/:id/links - Invalid access should be rejected with 400 (API returns 403)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(ownerApi, "Autotest setLink Bad Access");

        const { data } = await setLink(ownerApi, roomId, {
          access: 99 as unknown as FileShare,
          linkType: LinkType.Invitation,
          title: "Bad Access",
          denyDownload: false,
        });

        expect(data.statusCode).toBe(400);
      },
    );

    test("PUT /files/rooms/:id/links - Empty title is accepted (auto-named)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Empty Title");

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBeDefined();
    });

    test("PUT /files/rooms/:id/links - Whitespace-only title is accepted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Whitespace Title",
      );

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "   ",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.id).toBeDefined();
    });

    test("PUT /files/rooms/:id/links - Title over the length limit is rejected with 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Long Title");

      const longTitle = "L".repeat(300);
      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: longTitle,
        denyDownload: false,
      });

      expect(data.statusCode).toBe(400);
    });

    test("PUT /files/rooms/:id/links - Malformed expirationDate is silently ignored", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Bad Date");

      const { data, status } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Bad Date",
        denyDownload: false,
        expirationDate:
          "not-a-date" as unknown as RoomLinkRequest["expirationDate"],
      });

      // A malformed date is dropped (like a past date), the link is still created.
      expect(status).toBe(200);
      expect(
        (data.response!.sharedLink! as { expirationDate?: unknown })
          .expirationDate,
      ).toBeUndefined();
    });

    test("PUT /files/rooms/:id/links - maxUseCount 0 is rejected with 400 (must be >= 1)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink MaxUse Zero");

      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "MaxUse Zero",
        maxUseCount: 0,
        denyDownload: false,
      });

      expect(data.statusCode).toBe(400);
    });

    test("PUT /files/rooms/:id/links - Negative maxUseCount is rejected with 400", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink MaxUse Negative");

      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "MaxUse Negative",
        maxUseCount: -1,
        denyDownload: false,
      });

      expect(data.statusCode).toBe(400);
    });

    test("PUT /files/rooms/:id/links - Changing linkType on update is ignored (link keeps its original type)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink LinkType Switch");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Switch Me",
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;

      const { data, status } = await setLink(ownerApi, roomId, {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "Switch Me",
        denyDownload: false,
      });

      expect(status).toBe(200);
      expect(data.response!.sharedLink!.linkType).toBe(LinkType.External);
    });

    // ===== Side effects / integrity =====

    test("PUT /files/rooms/:id/links - Link operations do not change room members", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Members Intact");

      const { data: before } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const beforeCount = before.response!.length;

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Members Intact Link",
        denyDownload: false,
      });
      await setLink(ownerApi, roomId, {
        linkId: created.response!.sharedLink!.id!,
        access: FileShare.None,
        linkType: LinkType.External,
        title: "Members Intact Link",
        denyDownload: false,
      });

      const { data: after } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      expect(after.response!.length).toBe(beforeCount);
      expect(after.response!.some((s) => s.isOwner)).toBe(true);
    });

    test("PUT /files/rooms/:id/links - Link creation does not change room title or type", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Metadata Intact",
        RoomType.CustomRoom,
      );

      await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Metadata Link",
        denyDownload: false,
      });

      const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(data.response!.title).toBe("Autotest setLink Metadata Intact");
      expect(data.response!.roomType).toBe(RoomType.CustomRoom);
    });

    test("PUT /files/rooms/:id/links - A repeated identical update keeps a single link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Idempotent Update",
      );

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Idempotent Link",
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;

      const body: RoomLinkRequest = {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Idempotent Link Updated",
        denyDownload: true,
      };
      const { data: first } = await setLink(ownerApi, roomId, body);
      const { data: second } = await setLink(ownerApi, roomId, body);

      expect(first.response!.sharedLink!.id).toBe(linkId);
      expect(second.response!.sharedLink!.id).toBe(linkId);

      const links = await listLinks(ownerApi, roomId, LinkType.External);
      expect(links.filter((l) => l.sharedLink?.id === linkId).length).toBe(1);
    });

    test("PUT /files/rooms/:id/links - Parallel External creation yields unique links", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Parallel External",
        RoomType.CustomRoom,
      );

      const results = await Promise.all(
        [0, 1, 2].map((i) =>
          setLink(ownerApi, roomId, {
            access: FileShare.Read,
            linkType: LinkType.External,
            title: `Parallel External ${i}`,
            denyDownload: false,
          }),
        ),
      );

      for (const { status } of results) {
        expect(status).toBe(200);
      }
      const links = await listLinks(ownerApi, roomId, LinkType.External);
      const ids = links.map((l) => l.sharedLink!.id!);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(3);
    });

    test("PUT /files/rooms/:id/links - Parallel Invitation creation leaves exactly one Invitation link", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink Parallel Invitation",
      );

      await Promise.all(
        [0, 1, 2].map((i) =>
          setLink(ownerApi, roomId, {
            access: FileShare.Read,
            linkType: LinkType.Invitation,
            title: `Parallel Invitation ${i}`,
            denyDownload: false,
          }),
        ),
      );

      const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
      expect(links.length).toBe(1);
    });

    test("PUT /files/rooms/:id/links - Concurrent update and delete of the same link leaves a consistent state", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(ownerApi, "Autotest setLink Concurrent");

      const { data: created } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Concurrent Link",
        denyDownload: false,
      });
      const linkId = created.response!.sharedLink!.id!;

      await Promise.all([
        setLink(ownerApi, roomId, {
          linkId,
          access: FileShare.Read,
          linkType: LinkType.External,
          title: "Concurrent Updated",
          denyDownload: true,
        }),
        setLink(ownerApi, roomId, {
          linkId,
          access: FileShare.None,
          linkType: LinkType.External,
          title: "Concurrent Link",
          denyDownload: false,
        }),
      ]);

      const links = await listLinks(ownerApi, roomId, LinkType.External);
      const matching = links.filter((l) => l.sharedLink?.id === linkId);
      // Either the update won (one link) or the delete won (zero links), never a
      // duplicated or corrupted entry.
      expect(matching.length).toBeLessThanOrEqual(1);
    });

    // ===== Room type coverage =====

    // Most room types support the full Invitation-link lifecycle. A
    // FillingFormsRoom is the exception: it exposes only its auto-created
    // External link and rejects Invitation-link creation with 403.
    for (const { label, roomType } of [
      { label: "CustomRoom", roomType: RoomType.CustomRoom },
      { label: "PublicRoom", roomType: RoomType.PublicRoom },
      { label: "EditingRoom", roomType: RoomType.EditingRoom },
      { label: "VirtualDataRoom", roomType: RoomType.VirtualDataRoom },
    ]) {
      test(`PUT /files/rooms/:id/links - ${label} supports Invitation create/update/delete`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(
          ownerApi,
          `Autotest setLink Type ${label}`,
          roomType,
        );

        const { data: created, status: createStatus } = await setLink(
          ownerApi,
          roomId,
          {
            access: FileShare.Read,
            linkType: LinkType.Invitation,
            title: `${label} Invitation`,
            denyDownload: false,
          },
        );
        expect(createStatus).toBe(200);
        const linkId = created.response!.sharedLink!.id!;

        const { status: updateStatus } = await setLink(ownerApi, roomId, {
          linkId,
          access: FileShare.Read,
          linkType: LinkType.Invitation,
          title: `${label} Invitation Updated`,
          denyDownload: false,
        });
        expect(updateStatus).toBe(200);

        const { status: deleteStatus } = await setLink(ownerApi, roomId, {
          linkId,
          access: FileShare.None,
          linkType: LinkType.Invitation,
          title: `${label} Invitation Updated`,
          denyDownload: false,
        });
        expect(deleteStatus).toBe(200);

        const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
        expect(links.map((l) => l.sharedLink?.id)).not.toContain(linkId);
      });
    }

    // Only CustomRoom and PublicRoom let an owner manage External links through
    // setRoomLink. FillingFormsRoom exposes only its single auto-created External
    // link, while EditingRoom and VirtualDataRoom have no External-link feature at
    // all — all three reject External-link creation with 403 (covered below).
    for (const { label, roomType } of [
      { label: "CustomRoom", roomType: RoomType.CustomRoom },
      { label: "PublicRoom", roomType: RoomType.PublicRoom },
    ]) {
      test(`PUT /files/rooms/:id/links - ${label} supports External create/update/delete`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(
          ownerApi,
          `Autotest setLink External Type ${label}`,
          roomType,
        );

        const { data: created, status: createStatus } = await setLink(
          ownerApi,
          roomId,
          {
            access: FileShare.Read,
            linkType: LinkType.External,
            title: `${label} External`,
            denyDownload: false,
          },
        );
        expect(createStatus).toBe(200);
        const linkId = created.response!.sharedLink!.id!;

        const { status: updateStatus } = await setLink(ownerApi, roomId, {
          linkId,
          access: FileShare.Read,
          linkType: LinkType.External,
          title: `${label} External Updated`,
          denyDownload: true,
        });
        expect(updateStatus).toBe(200);

        const { status: deleteStatus } = await setLink(ownerApi, roomId, {
          linkId,
          access: FileShare.None,
          linkType: LinkType.External,
          title: `${label} External Updated`,
          denyDownload: false,
        });
        expect(deleteStatus).toBe(200);

        const links = await listLinks(ownerApi, roomId, LinkType.External);
        expect(links.map((l) => l.sharedLink?.id)).not.toContain(linkId);
      });
    }

    // FillingFormsRoom, EditingRoom and VirtualDataRoom do not allow creating an
    // External link through setRoomLink — the request is rejected with 403.
    for (const { label, roomType } of [
      { label: "FillingFormsRoom", roomType: RoomType.FillingFormsRoom },
      { label: "EditingRoom", roomType: RoomType.EditingRoom },
      { label: "VirtualDataRoom", roomType: RoomType.VirtualDataRoom },
    ]) {
      test(`PUT /files/rooms/:id/links - ${label} rejects External link creation with 403`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await mkRoom(
          ownerApi,
          `Autotest setLink External Reject ${label}`,
          roomType,
        );

        const { data } = await setLink(ownerApi, roomId, {
          access: FileShare.Read,
          linkType: LinkType.External,
          title: `${label} External`,
          denyDownload: false,
        });

        expect(data.statusCode).toBe(403);
      });
    }

    // A FillingFormsRoom rejects Invitation-link creation with 403; only its
    // auto-created External link exists for this room type.
    test("PUT /files/rooms/:id/links - FillingFormsRoom rejects Invitation link creation with 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await mkRoom(
        ownerApi,
        "Autotest setLink FillingForms NoInvitation",
        RoomType.FillingFormsRoom,
      );

      const { data } = await setLink(ownerApi, roomId, {
        access: FileShare.Read,
        linkType: LinkType.Invitation,
        title: "FillingForms Invitation",
        denyDownload: false,
      });

      expect(data.statusCode).toBe(403);
      const links = await listLinks(ownerApi, roomId, LinkType.Invitation);
      expect(links.length).toBe(0);
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

    test("BUG 81666: POST /files/rooms/fromtemplate - Nested folder hierarchy is preserved", async ({
      apiSdk,
    }) => {
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

      const { data: rootContent } = await ownerApi.folders.getFolderByFolderId({
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
    });

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

    // === Status endpoint: response shape and polling stability ===

    test("GET /files/rooms/fromtemplate/status - Response wrapper has statusCode and typed fields after completion", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Status Shape Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Status Shape Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Status Shape Room" },
      });
      await waitForRoomFromTemplate(ownerApi.rooms);

      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof data.response!.isCompleted).toBe("boolean");
      expect(data.response!.isCompleted).toBe(true);
      expect(typeof data.response!.roomId).toBe("number");
      expect(data.response!.roomId).toBeGreaterThan(0);
      expect(data.response!.error ?? null).toBeFalsy();
    });

    test("GET /files/rooms/fromtemplate/status - Repeated polling after completion returns the same roomId", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Repeat Status Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Repeat Status Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Repeat Status Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      for (let i = 0; i < 3; i++) {
        const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
        expect(status).toBe(200);
        expect(data.response!.isCompleted).toBe(true);
        expect(data.response!.roomId).toBe(roomId);
      }
    });

    test("GET /files/rooms/fromtemplate/status - Available immediately after starting operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Immediate Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Immediate Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Immediate Room" },
      });

      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      // isCompleted may be true or false right after start — both are valid.
      expect(typeof data.response!.isCompleted).toBe("boolean");

      await waitForRoomFromTemplate(ownerApi.rooms);
    });

    // === Status endpoint: operation lifecycle ===

    test("GET /files/rooms/fromtemplate/status - isCompleted resolves to true for template with content", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Lifecycle Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const sourceRoomId = roomData.response!.id!;
      for (let i = 0; i < 3; i++) {
        await ownerApi.folders.createFolder({
          folderId: sourceRoomId,
          createFolder: { title: `Lifecycle Folder ${i}` },
        });
      }

      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: sourceRoomId,
          title: "Autotest Lifecycle Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Lifecycle Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(roomId).toBeGreaterThan(0);

      const { data } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(data.response!.isCompleted).toBe(true);
    });

    test("GET /files/rooms/fromtemplate/status - Second operation overrides previous roomId", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Override Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Override Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Override Room First" },
      });
      const firstRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Override Room Second",
        },
      });
      const secondRoomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(secondRoomId).not.toBe(firstRoomId);

      const { data } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.roomId).toBe(secondRoomId);
    });

    test("BUG 81667: GET /files/rooms/fromtemplate/status - Failed createRoomFromTemplate does not produce a fake completed operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId: 999999999,
          title: "Phantom Room",
        },
      });

      const { data: list } = await ownerApi.rooms.getRoomsFolder({});
      const titles = (list.response!.folders ?? []).map(
        (f) => (f as any).title as string,
      );
      expect(titles).not.toContain("Phantom Room");

      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(data.response?.roomId ?? 0).toBeLessThanOrEqual(0);
      expect(status).toBe(200);
    });

    // === Status endpoint: user isolation ===

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Admin does not see Owner's roomId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Iso Admin From Owner Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Iso Admin From Owner Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "Owner Iso Room" },
        });
        const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );
        const { data, status } = await adminApi.rooms.getRoomCreatingStatus();
        expect(data.response?.roomId ?? 0).not.toBe(ownerRoomId);
        expect(status).toBe(200);
      },
    );

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Owner does not see Admin's roomId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Iso Owner From Admin Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Iso Owner From Admin Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);
        await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: templateId, public: true },
        });

        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );
        await adminApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "Admin Only Room" },
        });
        const adminRoomId = await waitForRoomFromTemplate(adminApi.rooms);

        const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
        expect(data.response?.roomId ?? 0).not.toBe(adminRoomId);
        expect(status).toBe(200);
      },
    );

    test.fail(
      "BUG 81662: GET /files/rooms/fromtemplate/status - User's operation is isolated from Owner",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest User Iso Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest User Iso Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);
        await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: templateId, public: true },
        });

        const { api: userApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );
        const { status: createStatus } =
          await userApi.rooms.createRoomFromTemplate({
            createRoomFromTemplateDto: { templateId, title: "User Iso Room" },
          });
        expect(createStatus).toBe(200);

        const userRoomId = await waitForRoomFromTemplate(userApi.rooms);
        expect(userRoomId).toBeGreaterThan(0);

        const { data: ownerStatus } =
          await ownerApi.rooms.getRoomCreatingStatus();
        expect(ownerStatus.response?.roomId ?? 0).not.toBe(userRoomId);
      },
    );

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Two users creating in parallel see only their own roomId",
      async ({ apiSdk }) => {
        // Owner + one DocSpaceAdmin instead of two admins: creating two
        // DocSpaceAdmins back-to-back on a fresh portal triggers a 401 on the
        // second authentication (admin-license limit or eventual consistency
        // on the freshly-created user), which masks the actual status check.
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Parallel Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Parallel Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);
        await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: templateId, public: true },
        });

        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );

        await Promise.all([
          ownerApi.rooms.createRoomFromTemplate({
            createRoomFromTemplateDto: {
              templateId,
              title: "Parallel Room Owner",
            },
          }),
          adminApi.rooms.createRoomFromTemplate({
            createRoomFromTemplateDto: {
              templateId,
              title: "Parallel Room Admin",
            },
          }),
        ]);

        const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);
        const adminRoomId = await waitForRoomFromTemplate(adminApi.rooms);
        expect(ownerRoomId).not.toBe(adminRoomId);

        const { data: ownerStatus } =
          await ownerApi.rooms.getRoomCreatingStatus();
        const { data: adminStatus } =
          await adminApi.rooms.getRoomCreatingStatus();
        expect(ownerStatus.response!.roomId).toBe(ownerRoomId);
        expect(adminStatus.response!.roomId).toBe(adminRoomId);
      },
    );

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Status does not leak after another user completed an operation",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Leak Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Leak Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "Owner Leak Room" },
        });
        const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );
        const { data, status } = await adminApi.rooms.getRoomCreatingStatus();
        expect(data.response?.roomId ?? 0).not.toBe(ownerRoomId);
        expect(status).toBe(200);
      },
    );

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Regular User without an operation does not see Owner's roomId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest User No-Op Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest User No-Op Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId,
            title: "Owner Room For User No-Op",
          },
        });
        const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { api: userApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );
        const { data, status } = await userApi.rooms.getRoomCreatingStatus();
        expect(data.response?.roomId ?? 0).not.toBe(ownerRoomId);
        expect(status).toBe(200);
      },
    );

    // === Status endpoint: anonymous and guest ===

    test("GET /files/rooms/fromtemplate/status - Unauthenticated request returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forAnonymous()
        .rooms.getRoomCreatingStatus();
      expect(status).toBe(401);
    });

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Guest does not see Owner's roomId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Guest Status Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Guest Status Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId,
            title: "Owner Room For Guest",
          },
        });
        const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { api: guestApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "Guest",
        );
        const { data, status } = await guestApi.rooms.getRoomCreatingStatus();
        expect(data.response?.roomId ?? 0).not.toBe(ownerRoomId);
        expect(status).toBe(200);
      },
    );

    // === Status endpoint: empty state ===

    test("GET /files/rooms/fromtemplate/status - Returns 200 for a fresh user with no prior operation", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const { data, status } = await adminApi.rooms.getRoomCreatingStatus();
      expect(status).toBe(200);
      expect(data.response?.roomId ?? 0).toBeLessThanOrEqual(0);
    });

    test("GET /files/rooms/fromtemplate/status - Stable response across repeated calls with no new operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Stable Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Stable Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Stable Room" },
      });
      await waitForRoomFromTemplate(ownerApi.rooms);

      const first = await ownerApi.rooms.getRoomCreatingStatus();
      const second = await ownerApi.rooms.getRoomCreatingStatus();
      const third = await ownerApi.rooms.getRoomCreatingStatus();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(200);
      expect(first.data.response!.roomId).toBe(second.data.response!.roomId);
      expect(second.data.response!.roomId).toBe(third.data.response!.roomId);
    });

    test("GET /files/rooms/fromtemplate/status - Survives deletion of the created room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Survive Delete Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Survive Delete Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Room To Be Deleted After Status",
        },
      });
      const createdRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

      await ownerApi.rooms.deleteRoom({
        id: createdRoomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(status).toBe(200);
      expect(data.response).toBeDefined();
    });

    // === Status endpoint: validation and request shape ===

    test("GET /files/rooms/fromtemplate/status - Unknown query parameters do not break the response", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Query Params Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Query Params Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Query Params Room" },
      });
      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const url = `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/rooms/fromtemplate/status?templateId=42&unknown=x`;
      const response = await apiSdk.request.get(url, {
        headers: {
          Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
        },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        response?: { roomId?: number };
      };
      expect(body.response?.roomId).toBe(roomId);
    });

    test("GET /files/rooms/fromtemplate/status - Non-GET HTTP methods are rejected", async ({
      apiSdk,
    }) => {
      const url = `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/rooms/fromtemplate/status`;
      const headers = {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      };

      await test.step("POST returns 405", async () => {
        const response = await apiSdk.request.post(url, { headers });
        expect(response.status()).toBe(405);
      });

      await test.step("PUT returns 405", async () => {
        const response = await apiSdk.request.put(url, { headers });
        expect(response.status()).toBe(405);
      });

      await test.step("DELETE returns 405", async () => {
        const response = await apiSdk.request.delete(url, { headers });
        expect(response.status()).toBe(405);
      });
    });

    test("GET /files/rooms/fromtemplate/status - Owner's response does not contain another user's roomId", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Sensitive Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Sensitive Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      await ownerApi.rooms.setPublicSettings({
        setPublicDto: { id: templateId, public: true },
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      await adminApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Admin Sensitive Room",
        },
      });
      const adminRoomId = await waitForRoomFromTemplate(adminApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: {
          templateId,
          title: "Owner Sensitive Room",
        },
      });
      const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

      const { data } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(data.response!.roomId).toBe(ownerRoomId);
      expect(data.response!.roomId).not.toBe(adminRoomId);
      expect(JSON.stringify(data.response)).not.toContain(String(adminRoomId));
    });

    // === Status endpoint: regression candidates ===

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Regression: Owner-completed operation does not leak to Admin",
      async ({ apiSdk }) => {
        // Mirror of the known bug in getRoomTemplateCreatingStatus where the
        // status leaked across users.
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Regression Leak Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Regression Leak Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: {
            templateId,
            title: "Owner Regression Room",
          },
        });
        const ownerRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );
        const { data } = await adminApi.rooms.getRoomCreatingStatus();
        expect(data.response?.roomId ?? 0).not.toBe(ownerRoomId);
      },
    );

    test.fail(
      "BUG 81763: GET /files/rooms/fromtemplate/status - Regression: each role receives only its own latest roomId",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Each Own Source",
            roomType: RoomType.CustomRoom,
          },
        });
        await ownerApi.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: roomData.response!.id!,
            title: "Autotest Each Own Template",
          },
        });
        const templateId = await waitForRoomTemplate(ownerApi.rooms);
        await ownerApi.rooms.setPublicSettings({
          setPublicDto: { id: templateId, public: true },
        });

        const { api: adminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "DocSpaceAdmin",
        );

        await ownerApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "Owner Latest Room" },
        });
        const ownerLatest = await waitForRoomFromTemplate(ownerApi.rooms);

        await adminApi.rooms.createRoomFromTemplate({
          createRoomFromTemplateDto: { templateId, title: "Admin Latest Room" },
        });
        const adminLatest = await waitForRoomFromTemplate(adminApi.rooms);
        expect(ownerLatest).not.toBe(adminLatest);

        const { data: ownerStatus } =
          await ownerApi.rooms.getRoomCreatingStatus();
        const { data: adminStatus } =
          await adminApi.rooms.getRoomCreatingStatus();
        expect(ownerStatus.response!.roomId).toBe(ownerLatest);
        expect(adminStatus.response!.roomId).toBe(adminLatest);
      },
    );

    test("GET /files/rooms/fromtemplate/status - Regression: in-flight createRoomTemplate does not appear as room-creating status", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Cross Template Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Cross Template Title",
        },
      });

      // Call room-creating status BEFORE waiting for the template to finish.
      const { data, status } = await ownerApi.rooms.getRoomCreatingStatus();
      expect(status).toBe(200);

      const templateId = await waitForRoomTemplate(ownerApi.rooms);
      // The template-creation operation must not be exposed via the
      // room-creating status endpoint as if its templateId were a roomId.
      expect(data.response?.roomId ?? -1).not.toBe(templateId);
    });

    test("GET /files/roomtemplate/status - Regression: in-flight createRoomFromTemplate does not appear as template-creating status", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Cross From Source",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: roomData.response!.id!,
          title: "Autotest Cross From Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      await ownerApi.rooms.createRoomFromTemplate({
        createRoomFromTemplateDto: { templateId, title: "Cross Room From" },
      });

      const { data, status } =
        await ownerApi.rooms.getRoomTemplateCreatingStatus();
      expect(status).toBe(200);
      // The template-status endpoint should keep referring to the
      // previously-created template, not flip to the in-flight room.
      if (data.response?.templateId) {
        expect(data.response.templateId).toBe(templateId);
      }

      const roomId = await waitForRoomFromTemplate(ownerApi.rooms);
      expect(roomId).not.toBe(templateId);
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

    test("GET /files/rooms/indexexport - Response has the expected shape during an active export", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Shape",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      const { data, status } = await ownerApi.rooms.getRoomIndexExport();

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof data.response!.id).toBe("string");
      expect(typeof data.response!.isCompleted).toBe("boolean");
      expect(typeof data.response!.percentage).toBe("number");
      const err = data.response!.error;
      expect(err === null || typeof err === "string").toBe(true);
    });

    test("GET /files/rooms/indexexport - Percentage is in the 0..100 range during export", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Percentage Range",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      const { data, status } = await ownerApi.rooms.getRoomIndexExport();

      expect(status).toBe(200);
      expect(data.response!.percentage).toBeGreaterThanOrEqual(0);
      expect(data.response!.percentage).toBeLessThanOrEqual(100);
    });

    test("GET /files/rooms/indexexport - Completed export reports percentage 100 and result file appears in My documents", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomTitle = "Autotest Index Export Result File";
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: roomTitle,
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.folders.getMyFolder({});
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      await expect(async () => {
        const { data } = await ownerApi.rooms.getRoomIndexExport();
        expect(data.response!.isCompleted).toBe(true);
        expect(data.response!.error).toBeFalsy();
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 30_000 });

      const { data } = await ownerApi.rooms.getRoomIndexExport();
      expect(data.response!.percentage).toBe(100);

      const { data: myDocs } = await ownerApi.folders.getMyFolder({});
      const titles = (myDocs.response!.files ?? []).map((f) => f.title ?? "");
      expect(titles.some((t) => t.includes(roomTitle))).toBe(true);
    });

    test("GET /files/rooms/indexexport - Operation id is stable across consecutive polls", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Stable Id",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      const first = await ownerApi.rooms.getRoomIndexExport();
      const second = await ownerApi.rooms.getRoomIndexExport();
      const third = await ownerApi.rooms.getRoomIndexExport();

      expect(first.data.response!.id).toBeDefined();
      expect(second.data.response!.id).toBe(first.data.response!.id);
      expect(third.data.response!.id).toBe(first.data.response!.id);
    });

    test("GET /files/rooms/indexexport - Repeated GET after completion still returns completed status", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Repeated Get",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      await expect(async () => {
        const { data } = await ownerApi.rooms.getRoomIndexExport();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 30_000 });

      const first = await ownerApi.rooms.getRoomIndexExport();
      const second = await ownerApi.rooms.getRoomIndexExport();

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.data.response!.isCompleted).toBe(true);
      expect(second.data.response!.isCompleted).toBe(true);
    });

    test("GET /files/rooms/indexexport - Clean user without started export returns 200 and no active operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.rooms.getRoomIndexExport();

      expect(status).toBe(200);
      const resp = data.response;
      const hasActiveRunning = Boolean(resp?.id) && resp?.isCompleted === false;
      expect(hasActiveRunning).toBe(false);
    });

    test("GET /files/rooms/indexexport - GET after terminateRoomIndexExport returns no active running operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Terminate Then Get",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });
      await ownerApi.rooms.terminateRoomIndexExport();

      const { data, status } = await ownerApi.rooms.getRoomIndexExport();

      expect(status).toBe(200);
      const resp = data.response;
      const hasActiveRunning =
        Boolean(resp?.id) && resp?.isCompleted === false && !resp?.error;
      expect(hasActiveRunning).toBe(false);
    });

    test("GET /files/rooms/indexexport - DocSpaceAdmin does not see Owner's index export operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Owner Only",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      const ownerView = await ownerApi.rooms.getRoomIndexExport();
      const adminView = await adminApi.rooms.getRoomIndexExport();

      expect(ownerView.status).toBe(200);
      expect(adminView.status).toBe(200);
      expect(ownerView.data.response!.id).toBeDefined();
      expect(adminView.data.response?.id ?? null).not.toBe(
        ownerView.data.response!.id,
      );
    });

    test("GET /files/rooms/indexexport - Owner and DocSpaceAdmin running exports in parallel see only their own operation", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { data: ownerRoom, status: ownerCreateStatus } =
        await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Index Export Owner Parallel",
            roomType: RoomType.VirtualDataRoom,
            indexing: true,
          },
        });
      expect(ownerCreateStatus).toBe(200);
      expect(ownerRoom.response?.id).toBeDefined();

      const { data: adminRoom, status: adminCreateStatus } =
        await adminApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Index Export Admin Parallel",
            roomType: RoomType.VirtualDataRoom,
            indexing: true,
          },
        });
      expect(adminCreateStatus).toBe(200);
      expect(adminRoom.response?.id).toBeDefined();

      await ownerApi.rooms.startRoomIndexExport({
        id: ownerRoom.response!.id!,
      });
      await adminApi.rooms.startRoomIndexExport({
        id: adminRoom.response!.id!,
      });

      const ownerView = await ownerApi.rooms.getRoomIndexExport();
      const adminView = await adminApi.rooms.getRoomIndexExport();

      expect(ownerView.status).toBe(200);
      expect(adminView.status).toBe(200);
      expect(ownerView.data.response!.id).toBeDefined();
      expect(adminView.data.response!.id).toBeDefined();
      expect(ownerView.data.response!.id).not.toBe(adminView.data.response!.id);
    });

    test("GET /files/rooms/indexexport - GET returns 200 after the source room was archived during export", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Archived Source",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.rooms.startRoomIndexExport({ id: roomId });

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.getRoomIndexExport();
      expect(status).toBe(200);
    });

    // === startRoomIndexExport (POST) as the target endpoint ===

    test("POST /files/rooms/:id/indexexport - Starts export for an indexed VDR room with a nested structure", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Nested",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      // root-level folder, a nested folder inside it, and a couple of files
      const { data: rootFolder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Root Folder" },
      });
      await ownerApi.folders.createFolder({
        folderId: rootFolder.response!.id!,
        createFolder: { title: "Nested Folder" },
      });
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Root File" },
      });
      await ownerApi.files.createFile({
        folderId: rootFolder.response!.id!,
        createFileJsonElement: { title: "Nested File" },
      });

      const { data, status } = await ownerApi.rooms.startRoomIndexExport({
        id: roomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeDefined();
      expect(data.response!.error).toBeFalsy();

      await ownerApi.rooms.terminateRoomIndexExport();
    });

    test("POST /files/rooms/:id/indexexport - Second start for the same room joins the running task (same id, 200)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Double Start",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const first = await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      const second = await ownerApi.rooms.startRoomIndexExport({ id: roomId });

      // A second start while one is running is not a conflict: the API returns 200
      // and hands back the already-running task rather than creating a new one.
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.data.response!.id).toBe(first.data.response!.id);
      expect(second.data.response!.error).toBeFalsy();

      await ownerApi.rooms.terminateRoomIndexExport();
    });

    test("POST /files/rooms/:id/indexexport - Parallel starts for the same room stay consistent (no 5xx)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Parallel Same Room",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const results = await Promise.all([
        ownerApi.rooms.startRoomIndexExport({ id: roomId }),
        ownerApi.rooms.startRoomIndexExport({ id: roomId }),
        ownerApi.rooms.startRoomIndexExport({ id: roomId }),
      ]);

      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.data.response!.error).toBeFalsy();
      }
      // All concurrent starts must converge on a single running task.
      const ids = results.map((r) => r.data.response!.id);
      expect(new Set(ids).size).toBe(1);

      await ownerApi.rooms.terminateRoomIndexExport();
    });

    test("POST /files/rooms/:id/indexexport - A new export can be started after the previous one completed", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Restart",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.folders.getMyFolder({});

      await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      await expect(async () => {
        const { data } = await ownerApi.rooms.getRoomIndexExport();
        expect(data.response!.isCompleted).toBe(true);
        expect(data.response!.error).toBeFalsy();
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 30_000 });

      // The completed task must not block a fresh export.
      const { data, status } = await ownerApi.rooms.startRoomIndexExport({
        id: roomId,
      });
      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
      expect(data.response!.error).toBeFalsy();

      await ownerApi.rooms.terminateRoomIndexExport();
    });

    test("POST /files/rooms/:id/indexexport - Non-VDR (Custom) room is rejected with 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Custom Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { status } = await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      // Index export is a VDR-only feature; non-VDR rooms are forbidden.
      expect(status).toBe(403);
    });

    test("POST /files/rooms/:id/indexexport - VDR room with indexing disabled is rejected with 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export No Indexing",
          roomType: RoomType.VirtualDataRoom,
          indexing: false,
        },
      });

      const { status } = await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      // Even for a VDR room, the export requires indexing to be enabled.
      expect(status).toBe(403);
    });

    // A well-formed but non-existent room id is correctly reported as 404
    // "The required folder was not found".
    test("POST /files/rooms/:id/indexexport - id=999999999 returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.startRoomIndexExport({
        id: 999999999,
      });
      expect(status).toBe(404);
    });

    // Out-of-range / malformed numeric ids should be a validation error (400),
    // but the API does not pre-validate and returns 404 "folder not found"
    // instead. Marked test.fail until fixed; when the API starts returning 400
    // the test reports an unexpected pass, signaling test.fail can be removed.
    for (const id of [0, -1]) {
      test.fail(
        `BUG 82368: POST /files/rooms/:id/indexexport - id=${id} should return 400 (validation), but API returns 404`,
        async ({ apiSdk }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { status } = await ownerApi.rooms.startRoomIndexExport({ id });
          expect(status).toBe(400);
        },
      );
    }

    test('POST /files/rooms/:id/indexexport - non-numeric id "abc" returns 404', async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.startRoomIndexExport({
        id: "abc" as unknown as number,
      });
      expect(status).toBe(404);
    });

    test("POST /files/rooms/:id/indexexport - id=null throws at SDK level", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.startRoomIndexExport({ id: null as unknown as number }),
      ).rejects.toThrow(/Required parameter id/);
    });

    test("POST /files/rooms/:id/indexexport - id=undefined throws at SDK level", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.startRoomIndexExport({
          id: undefined as unknown as number,
        }),
      ).rejects.toThrow(/Required parameter id/);
    });

    test("POST /files/rooms/:id/indexexport - Deleted room returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Deleted",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.startRoomIndexExport({
        id: roomId,
      });
      expect(status).toBe(404);
    });

    // Starting an index export on an archived room should be forbidden (403,
    // consistent with reorder and other write operations on archived rooms),
    // but the API currently accepts it and returns 200. Marked test.fail until
    // fixed; when the API starts rejecting it the test reports an unexpected
    // pass, signaling test.fail can be removed.
    test.fail(
      "BUG 82369: POST /files/rooms/:id/indexexport - archived room should be forbidden (403), but API returns 200",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Index Export Archived Start",
            roomType: RoomType.VirtualDataRoom,
            indexing: true,
          },
        });
        const roomId = roomData.response!.id!;

        await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { status } = await ownerApi.rooms.startRoomIndexExport({
          id: roomId,
        });

        // Clean up the export the buggy 200 actually started before asserting.
        await ownerApi.rooms.terminateRoomIndexExport().catch(() => {});

        expect(status).toBe(403);
      },
    );

    // === terminateRoomIndexExport (DELETE) as the target endpoint ===
    // The endpoint takes no id and no body: it cancels the *current user's*
    // running export task (see the per-user scoping proven by the GET tests
    // above). These tests pin down its happy path, no-op cases and scope.

    test("DELETE /files/rooms/indexexport - Owner cancels an active export (200) and no active task remains", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Terminate Active",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      // Nested content so the export is not guaranteed to finish instantly.
      const { data: folder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder" },
      });
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "File A" },
      });
      await ownerApi.files.createFile({
        folderId: folder.response!.id!,
        createFileJsonElement: { title: "File B" },
      });

      const start = await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      expect(start.status).toBe(200);
      expect(start.data.response!.id).toBeDefined();

      const { status } = await ownerApi.rooms.terminateRoomIndexExport();
      expect(status).toBe(200);

      const after = await ownerApi.rooms.getRoomIndexExport();
      expect(after.status).toBe(200);
      const resp = after.data.response;
      const hasActiveRunning =
        Boolean(resp?.id) && resp?.isCompleted === false && !resp?.error;
      expect(hasActiveRunning).toBe(false);
    });

    test("DELETE /files/rooms/indexexport - Terminate with no active task is a no-op (200)", async ({
      apiSdk,
    }) => {
      // A fresh portal owner has never started an export, so there is nothing
      // to cancel. Documenting the contract: the API treats this as a no-op.
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.terminateRoomIndexExport();
      expect(status).toBe(200);
    });

    test("DELETE /files/rooms/indexexport - Second terminate after the first is a no-op (200)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Double Terminate",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      await ownerApi.rooms.startRoomIndexExport({
        id: roomData.response!.id!,
      });

      const first = await ownerApi.rooms.terminateRoomIndexExport();
      expect(first.status).toBe(200);

      // Terminate is idempotent: cancelling an already-cancelled task is a no-op.
      const second = await ownerApi.rooms.terminateRoomIndexExport();
      expect(second.status).toBe(200);
    });

    test("DELETE /files/rooms/indexexport - Terminate immediately after start is handled without a 5xx (200)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Race Terminate",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      // Cancel the task while it is still Queued/Started, without polling first.
      await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      const { status } = await ownerApi.rooms.terminateRoomIndexExport();
      expect(status).toBe(200);
    });

    test("DELETE /files/rooms/indexexport - Terminate after the export completed is a no-op (200)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Terminate After Done",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.folders.getMyFolder({});

      await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      await expect(async () => {
        const { data } = await ownerApi.rooms.getRoomIndexExport();
        expect(data.response!.isCompleted).toBe(true);
        expect(data.response!.error).toBeFalsy();
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 30_000 });

      // Cancelling a finished task must not error.
      const { status } = await ownerApi.rooms.terminateRoomIndexExport();
      expect(status).toBe(200);
    });

    test("DELETE /files/rooms/indexexport - A new export can be started after terminate", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Restart After Terminate",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      await ownerApi.rooms.terminateRoomIndexExport();

      // Terminate must not leave the task in a state that blocks a fresh export.
      const restart = await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      expect(restart.status).toBe(200);
      expect(restart.data.response!.id).toBeDefined();
      expect(restart.data.response!.error).toBeFalsy();

      await ownerApi.rooms.terminateRoomIndexExport();
    });

    test("DELETE /files/rooms/indexexport - Terminate is per-user: it does not cancel another user's export", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Index Export Terminate Scope",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      // Content so the owner's export is still running when the admin terminates.
      const { data: folder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder" },
      });
      await ownerApi.files.createFile({
        folderId: folder.response!.id!,
        createFileJsonElement: { title: "File" },
      });

      await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      const ownerBefore = await ownerApi.rooms.getRoomIndexExport();
      expect(ownerBefore.data.response!.id).toBeDefined();

      // The admin has no task of their own; their terminate must not touch the
      // owner's running task (the GET endpoint already proves per-user scoping).
      const adminTerminate = await adminApi.rooms.terminateRoomIndexExport();
      expect(adminTerminate.status).toBe(200);

      const ownerAfter = await ownerApi.rooms.getRoomIndexExport();
      expect(ownerAfter.status).toBe(200);
      expect(ownerAfter.data.response!.id).toBe(ownerBefore.data.response!.id);

      await ownerApi.rooms.terminateRoomIndexExport();
    });

    test("DELETE /files/rooms/indexexport - Unexpected request body is ignored (200)", async ({
      apiSdk,
    }) => {
      // The endpoint declares no body; sending one must not change the outcome.
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.terminateRoomIndexExport({
        data: { unexpected: "payload", id: 123 },
      });
      expect(status).toBe(200);
    });

    test("DELETE /files/rooms/indexexport - Unexpected query parameters are ignored (200)", async ({
      apiSdk,
    }) => {
      // The endpoint takes no id; a stray ?id=... query must be ignored.
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.terminateRoomIndexExport({
        params: { id: 123 },
      });
      expect(status).toBe(200);
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

    test("PUT /files/rooms/:id/reorder - Already-sequential folder order stays unchanged", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Sequential",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder A" },
      });
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder B" },
      });
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Folder C" },
      });

      const { data: before } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const ordersBefore = before.response!.folders!.map((f) => [
        f.title,
        Number(f.order),
      ]);
      // Freshly created folders already have a gap-free 1..N order
      expect(ordersBefore.map(([, o]) => o)).toEqual([1, 2, 3]);

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const ordersAfter = after.response!.folders!.map((f) => [
        f.title,
        Number(f.order),
      ]);
      // Reorder is a no-op when order is already sequential
      expect(ordersAfter).toEqual(ordersBefore);
    });

    test("PUT /files/rooms/:id/reorder - Files with sparse order are compacted to 1..N preserving order", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Files",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileA } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "File A" },
      });
      const { data: fileB } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "File B" },
      });
      const { data: fileC } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "File C" },
      });
      const idA = fileA.response!.id!;
      const idB = fileB.response!.id!;
      const idC = fileC.response!.id!;
      // File entries in folder content are typed without `id`, so match by title
      const titleA = fileA.response!.title!;
      const titleB = fileB.response!.title!;
      const titleC = fileC.response!.title!;

      // Manually set non-sequential indexes with gaps
      await ownerApi.files.setFileOrder({
        fileId: idA,
        orderRequestDto: { order: 10 },
      });
      await ownerApi.files.setFileOrder({
        fileId: idC,
        orderRequestDto: { order: 30 },
      });
      await ownerApi.files.setFileOrder({
        fileId: idB,
        orderRequestDto: { order: 50 },
      });

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const byTitle = new Map(
        after.response!.files!.map((f) => [f.title, Number(f.order)]),
      );
      // Gaps removed, relative order (A < C < B) preserved
      expect(byTitle.get(titleA)).toBe(1);
      expect(byTitle.get(titleC)).toBe(2);
      expect(byTitle.get(titleB)).toBe(3);
    });

    test("PUT /files/rooms/:id/reorder - Mixed folders and files are compacted without gaps", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Mixed",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Mixed Folder" },
      });
      const { data: file } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Mixed File" },
      });
      const folderId = folder.response!.id!;
      const fileId = file.response!.id!;

      await ownerApi.folders.setFolderOrder({
        folderId,
        orderRequestDto: { order: 20 },
      });
      await ownerApi.files.setFileOrder({
        fileId,
        orderRequestDto: { order: 90 },
      });

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      // The combined folder+file index is compacted to a contiguous 1..N range
      const allOrders = [
        ...after.response!.folders!.map((f) => Number(f.order)),
        ...after.response!.files!.map((f) => Number(f.order)),
      ].sort((a, b) => a - b);
      expect(allOrders).toEqual([1, 2]);
    });

    test("PUT /files/rooms/:id/reorder - Nested folder content is not affected by root reorder", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Nested",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      // A folder at the room root with a nested file inside it
      const { data: parentFolder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Parent Folder" },
      });
      const parentFolderId = parentFolder.response!.id!;
      const { data: nestedFile } = await ownerApi.files.createFile({
        folderId: parentFolderId,
        createFileJsonElement: { title: "Nested File" },
      });
      const nestedTitle = nestedFile.response!.title!;

      // A second root folder, with a sparse order forcing a root reindex
      const { data: rootFolder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Root Folder" },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: rootFolder.response!.id!,
        orderRequestDto: { order: 77 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: parentFolderId,
        orderRequestDto: { order: 5 },
      });

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      // Root level reindexed to 1..N
      const { data: rootAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        rootAfter.response!.folders!.map((f) => Number(f.order)).sort(),
      ).toEqual([1, 2]);

      // Nested file still lives inside the parent folder, untouched
      const { data: nestedAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: parentFolderId,
      });
      const nestedTitles = nestedAfter.response!.files!.map((f) => f.title);
      expect(nestedTitles).toContain(nestedTitle);
    });

    test("PUT /files/rooms/:id/reorder - Single item gets order 1", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Single",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folder } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Lonely Folder" },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folder.response!.id!,
        orderRequestDto: { order: 50 },
      });

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(Number(after.response!.folders![0].order)).toBe(1);
    });

    test("PUT /files/rooms/:id/reorder - Large order gaps are compacted to 1..N", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Large Gaps",
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

      await ownerApi.folders.setFolderOrder({
        folderId: folderA.response!.id!,
        orderRequestDto: { order: 100 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderB.response!.id!,
        orderRequestDto: { order: 5000 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderC.response!.id!,
        orderRequestDto: { order: 999999 },
      });

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        after.response!.folders!.map((f) => [f.title, Number(f.order)]),
      ).toEqual([
        ["Folder A", 1],
        ["Folder B", 2],
        ["Folder C", 3],
      ]);
    });

    test("PUT /files/rooms/:id/reorder - Duplicate order values are compacted to a dense unique range", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Duplicates",
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

      // Force the same order value on every folder
      await ownerApi.folders.setFolderOrder({
        folderId: folderA.response!.id!,
        orderRequestDto: { order: 5 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderB.response!.id!,
        orderRequestDto: { order: 5 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderC.response!.id!,
        orderRequestDto: { order: 5 },
      });

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      // Tie-break order is not contractually defined, so only assert the
      // resulting indexes are dense and unique (1..N), not a specific sort.
      const orders = after
        .response!.folders!.map((f) => Number(f.order))
        .sort((a, b) => a - b);
      expect(orders).toEqual([1, 2, 3]);
    });

    test("PUT /files/rooms/:id/reorder - Repeated reorder is idempotent", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Idempotent",
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
      await ownerApi.folders.setFolderOrder({
        folderId: folderA.response!.id!,
        orderRequestDto: { order: 40 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderB.response!.id!,
        orderRequestDto: { order: 10 },
      });

      const first = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(first.status).toBe(200);
      const { data: afterFirst } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const ordersFirst = afterFirst.response!.folders!.map((f) => [
        f.title,
        Number(f.order),
      ]);

      const second = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(second.status).toBe(200);
      const { data: afterSecond } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const ordersSecond = afterSecond.response!.folders!.map((f) => [
        f.title,
        Number(f.order),
      ]);

      expect(ordersSecond).toEqual(ordersFirst);
    });

    test("PUT /files/rooms/:id/reorder - Reorder does not delete, duplicate, rename or move items", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Integrity",
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
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Doc" },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderA.response!.id!,
        orderRequestDto: { order: 30 },
      });
      await ownerApi.folders.setFolderOrder({
        folderId: folderB.response!.id!,
        orderRequestDto: { order: 10 },
      });

      const { data: before } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      // Folder/file entries in folder content are typed without `id`; identify by title
      const foldersBefore = before
        .response!.folders!.map((f) => f.title)
        .sort();
      const filesBefore = before.response!.files!.map((f) => f.title).sort();

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);

      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const foldersAfter = after.response!.folders!.map((f) => f.title).sort();
      const filesAfter = after.response!.files!.map((f) => f.title).sort();

      // Same ids, same titles, same counts — nothing added, removed or renamed
      expect(foldersAfter).toEqual(foldersBefore);
      expect(filesAfter).toEqual(filesBefore);
    });

    // An invalid/out-of-range numeric id should be a validation error (400), but the
    // API does not pre-validate: the storage layer throws InvalidOperationException
    // "The required folder was not found" from ReOrderAsync, which is mapped to 403.
    // Same defect class as the sibling pinRoom endpoint (BUG 81850). Marked test.fail
    // until fixed; when the API starts returning 400 the test reports an unexpected
    // pass, signaling test.fail can be removed.
    for (const id of [0, -1, 999999999]) {
      test.fail(
        `BUG 81862: PUT /files/rooms/:id/reorder - id=${id} should return 400 (validation), but API returns 403`,
        async ({ apiSdk }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { status } = await ownerApi.rooms.reorderRoom({ id });
          expect(status).toBe(400);
        },
      );
    }

    // A well-formed id for a room that was deleted should be 404 (not found), but the
    // same missing-folder path returns 403. Marked test.fail until fixed.
    test.fail(
      "BUG 81863: PUT /files/rooms/:id/reorder - deleted room should return 404, but API returns 403",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Reorder Deleted",
            roomType: RoomType.VirtualDataRoom,
            indexing: true,
          },
        });
        const roomId = roomData.response!.id!;

        await ownerApi.rooms.deleteRoom({
          id: roomId,
          deleteRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
        expect(status).toBe(404);
      },
    );

    test("PUT /files/rooms/:id/reorder - Archived room is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Archived",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(403);
    });

    test("PUT /files/rooms/:id/reorder - Non-indexed room is reordered without error", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder Non-indexed",
          roomType: RoomType.CustomRoom,
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

      const { data, status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);
      expect(data.response!.id).toBe(roomId);

      // Content must remain intact after reordering a non-indexed room
      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const titles = after.response!.folders!.map((f) => f.title);
      expect(titles).toContain(folderA.response!.title!);
      expect(titles).toContain(folderB.response!.title!);
    });

    test("PUT /files/rooms/:id/reorder - VDR room with indexing disabled is reordered without error", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      // Same room type as the indexed tests, but indexing is explicitly off — this
      // exercises a different controller path than a CustomRoom that never supports it.
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Reorder VDR No Indexing",
          roomType: RoomType.VirtualDataRoom,
          indexing: false,
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

      const { data, status } = await ownerApi.rooms.reorderRoom({ id: roomId });
      expect(status).toBe(200);
      expect(data.response!.id).toBe(roomId);

      // Content must remain intact after reordering a non-indexed VDR room
      const { data: after } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const titles = after.response!.folders!.map((f) => f.title);
      expect(titles).toContain(folderA.response!.title!);
      expect(titles).toContain(folderB.response!.title!);
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

    // Invite N users into a fresh CustomRoom and return [roomId, userIds].
    async function createRoomWithInvitedUsers(
      api: ApiSDK,
      ownerApi: ReturnType<ApiSDK["forRole"]>,
      count: number,
      access: FileShare = FileShare.Editing,
    ) {
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const userIds: string[] = [];
      for (let i = 0; i < count; i++) {
        const { data: memberData } = await api.addMember("owner", "User");
        userIds.push(memberData.response!.id!);
      }
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: userIds.map((id) => ({ id, access })),
          notify: false,
        },
      });
      return { roomId, userIds };
    }

    // Snapshot the room's invite/member records as a stable, comparable list. Each entry
    // in getRoomSecurityInfo is one invitation/membership record, so the array length is
    // the number of pending+accepted invites and {id, access} captures who has what.
    async function readRoomMembers(
      ownerApi: ReturnType<ApiSDK["forRole"]>,
      roomId: number,
    ) {
      const { data } = await ownerApi.rooms.getRoomSecurityInfo({ id: roomId });
      return ((data as any).response as any[])
        .map((s) => ({ id: s.sharedTo?.id, access: s.access }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    test("POST /files/rooms/:id/resend - Owner resends to all invited users with resendAll", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId } = await createRoomWithInvitedUsers(apiSdk, ownerApi, 3);

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { resendAll: true },
      });

      expect(status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - resendAll:true together with usersIds is accepted", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId, userIds } = await createRoomWithInvitedUsers(
        apiSdk,
        ownerApi,
        2,
      );

      // resendAll drives a bulk resend; usersIds is ignored, not validated against.
      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { resendAll: true, usersIds: [userIds[0]] },
      });

      expect(status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - Batch with one member and one existing non-member succeeds", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId, userIds } = await createRoomWithInvitedUsers(
        apiSdk,
        ownerApi,
        1,
      );

      // A real, existing user who is NOT a member of the room is silently skipped.
      const { data: outsiderData } = await apiSdk.addMember("owner", "User");
      const outsiderId = outsiderData.response!.id!;

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { usersIds: [userIds[0], outsiderId] },
      });

      expect(status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - Resend is idempotent (two consecutive calls both succeed)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId, userIds } = await createRoomWithInvitedUsers(
        apiSdk,
        ownerApi,
        1,
      );

      const first = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { usersIds: [userIds[0]] },
      });
      const second = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { usersIds: [userIds[0]] },
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - Resend to an already-active member is a no-op (200)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Active Member",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      // An authenticated member already has an active account (not a pending invite).
      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
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
        userInvitation: { usersIds: [userId] },
      });

      expect(status).toBe(200);
    });

    test("POST /files/rooms/:id/resend - Resend to several pending users via usersIds", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId, userIds } = await createRoomWithInvitedUsers(
        apiSdk,
        ownerApi,
        3,
      );

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { usersIds: userIds },
      });

      expect(status).toBe(200);
    });

    test.describe("Body variants are no-ops that leave invites untouched", () => {
      const variants: { label: string; body: UserInvitation }[] = [
        { label: "empty body {}", body: {} },
        { label: "usersIds: []", body: { usersIds: [] } },
        { label: "usersIds: null", body: { usersIds: null } },
        {
          label: "resendAll:false without usersIds",
          body: { resendAll: false },
        },
      ];

      for (const { label, body } of variants) {
        test(`POST /files/rooms/:id/resend - ${label} is a 200 no-op`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { roomId } = await createRoomWithInvitedUsers(
            apiSdk,
            ownerApi,
            2,
          );

          const before = await readRoomMembers(ownerApi, roomId);

          const { status } = await ownerApi.rooms.resendEmailInvitations({
            id: roomId,
            userInvitation: body,
          });
          expect(status).toBe(200);

          // A no-op must not touch the invite records: same members, same access
          // levels, same count (no new/duplicated/dropped pending invites).
          const after = await readRoomMembers(ownerApi, roomId);
          expect(after).toEqual(before);
        });
      }
    });

    test.describe("Invalid user id in usersIds returns 400", () => {
      // A malformed or non-existent user id is rejected with 400. (Contrast with a
      // real, existing user who is simply not a room member: that is silently skipped
      // and returns 200 - see the "non-member" batch tests above.)
      for (const badId of ["0", "-1", "abc", "999999999"]) {
        test(`POST /files/rooms/:id/resend - usersIds: ["${badId}"] returns 400`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { roomId } = await createRoomWithInvitedUsers(
            apiSdk,
            ownerApi,
            1,
          );

          const { status } = await ownerApi.rooms.resendEmailInvitations({
            id: roomId,
            userInvitation: { usersIds: [badId] },
          });

          expect(status).toBe(400);
        });
      }
    });

    test.describe("Invalid / inaccessible room ids", () => {
      // An incorrect (malformed) numeric room id is a validation error and should return
      // 400, but the endpoint reports 403 "You don't have enough permission to perform the
      // operation" (same defect class as pin - see BUG 81850). Marked test.fail expecting
      // 400; when the API is fixed these report an unexpected pass and test.fail can drop.
      for (const id of [0, -1]) {
        test.fail(
          `BUG 81879: POST /files/rooms/:id/resend - incorrect room id=${id} should return 400 (validation), but API returns 403`,
          async ({ apiSdk }) => {
            const ownerApi = apiSdk.forRole("owner");
            const { status } = await ownerApi.rooms.resendEmailInvitations({
              id,
              userInvitation: { resendAll: true },
            });

            expect(status).toBe(400);
          },
        );
      }

      // A well-formed room id that does not exist should return 404, but the endpoint
      // returns 403. Marked test.fail expecting 404.
      test.fail(
        "BUG 81880: POST /files/rooms/:id/resend - non-existent room id should return 404, but API returns 403",
        async ({ apiSdk }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { status } = await ownerApi.rooms.resendEmailInvitations({
            id: 999999999,
            userInvitation: { resendAll: true },
          });

          expect(status).toBe(404);
        },
      );

      // A deleted room no longer exists and should return 404, but the endpoint returns
      // 403 (same masking as the non-existent case). Marked test.fail.
      test.fail(
        "BUG 81880: POST /files/rooms/:id/resend - deleted room should return 404, but API returns 403",
        async ({ apiSdk }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { roomId } = await createRoomWithInvitedUsers(
            apiSdk,
            ownerApi,
            1,
          );

          await ownerApi.rooms.deleteRoom({
            id: roomId,
            deleteRoomRequest: { deleteAfter: false },
          });
          await waitForOperation(ownerApi.operations);

          const { status } = await ownerApi.rooms.resendEmailInvitations({
            id: roomId,
            userInvitation: { resendAll: true },
          });

          expect(status).toBe(404);
        },
      );

      // Archived rooms reject mutations: 403 is the intended response here (unlike the
      // bad-id/deleted cases above), so this is asserted as correct behavior.
      test("POST /files/rooms/:id/resend - Archived room returns 403", async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { roomId } = await createRoomWithInvitedUsers(
          apiSdk,
          ownerApi,
          1,
        );

        await ownerApi.rooms.archiveRoom({
          id: roomId,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);

        const { status, data } = await ownerApi.rooms.resendEmailInvitations({
          id: roomId,
          userInvitation: { resendAll: true },
        });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe(
          "You don't have enough permission to perform the operation",
        );
      });
    });

    test("POST /files/rooms/:id/resend - Resend does not change room membership", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId, userIds } = await createRoomWithInvitedUsers(
        apiSdk,
        ownerApi,
        2,
      );

      const before = await readRoomMembers(ownerApi, roomId);

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { resendAll: true },
      });
      expect(status).toBe(200);

      const after = await readRoomMembers(ownerApi, roomId);

      // Same set of members, same access, and no duplicate invite records.
      for (const userId of userIds) {
        expect(after.filter((m) => m.id === userId)).toHaveLength(1);
      }
      expect(after).toEqual(before);
    });

    test("POST /files/rooms/:id/resend - resendAll does not affect an already-accepted member", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Resend Accepted Mix",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      // accepted (active) member + pending (just-created) member.
      // The pending member is created first: authenticating a member shares its session
      // cookie on the request context, which would make a later direct addMember run as
      // that low-privilege user and fail with 403.
      const { data: pendingData } = await apiSdk.addMember("owner", "User");
      const pendingId = pendingData.response!.id!;
      const { data: acceptedData } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const acceptedId = acceptedData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: acceptedId, access: FileShare.Editing },
            { id: pendingId, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      const { status } = await ownerApi.rooms.resendEmailInvitations({
        id: roomId,
        userInvitation: { resendAll: true },
      });
      expect(status).toBe(200);

      const { data: afterData } = await ownerApi.rooms.getRoomSecurityInfo({
        id: roomId,
      });
      const accepted = ((afterData as any).response as any[]).filter(
        (s) => s.sharedTo?.id === acceptedId,
      );
      // The accepted member is still present exactly once with unchanged access.
      expect(accepted).toHaveLength(1);
      expect(accepted[0].access).toBe(FileShare.Editing);
    });

    test.describe("Resend works across room types", () => {
      const roomTypes: { label: string; type: RoomType }[] = [
        { label: "PublicRoom", type: RoomType.PublicRoom },
        { label: "FillingFormsRoom", type: RoomType.FillingFormsRoom },
        { label: "EditingRoom (Collaboration)", type: RoomType.EditingRoom },
        { label: "VirtualDataRoom", type: RoomType.VirtualDataRoom },
      ];

      for (const { label, type } of roomTypes) {
        test(`POST /files/rooms/:id/resend - ${label} returns 200`, async ({
          apiSdk,
        }) => {
          const ownerApi = apiSdk.forRole("owner");
          const { data: roomData } = await ownerApi.rooms.createRoom({
            createRoomRequestDto: {
              title: `Autotest Resend ${label}`,
              roomType: type,
            },
          });
          const roomId = roomData.response!.id!;

          const { data: memberData } = await apiSdk.addMember("owner", "User");
          await ownerApi.rooms.setRoomSecurity({
            id: roomId,
            roomInvitationRequest: {
              invitations: [
                { id: memberData.response!.id!, access: FileShare.Read },
              ],
              notify: false,
            },
          });

          const { status } = await ownerApi.rooms.resendEmailInvitations({
            id: roomId,
            userInvitation: { resendAll: true },
          });

          expect(status).toBe(200);
        });
      }
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

  // ── Global rename: one tag shared by several rooms ──

  test("PUT /files/tags - Renaming a tag updates it in every room it is attached to", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Global Old" },
    });

    const { data: room1 } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Global Room 1",
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: room2 } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Global Room 2",
        roomType: RoomType.CustomRoom,
      },
    });
    const room1Id = room1.response!.id!;
    const room2Id = room2.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: room1Id,
      batchTagsRequestDto: { names: ["Autotest Global Old"] },
    });
    await ownerApi.rooms.addRoomTags({
      id: room2Id,
      batchTagsRequestDto: { names: ["Autotest Global Old"] },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Global Old",
        newName: "Autotest Global New",
      },
    });
    expect(status).toBe(200);

    const { data: info1 } = await ownerApi.rooms.getRoomInfo({ id: room1Id });
    const { data: info2 } = await ownerApi.rooms.getRoomInfo({ id: room2Id });
    const tags1 = (info1 as any).response?.tags as string[];
    const tags2 = (info2 as any).response?.tags as string[];

    expect(tags1).toContain("Autotest Global New");
    expect(tags1).not.toContain("Autotest Global Old");
    expect(tags2).toContain("Autotest Global New");
    expect(tags2).not.toContain("Autotest Global Old");

    // Not two separate tags: catalog holds only the new name, once
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).toContain("Autotest Global New");
    expect(tags).not.toContain("Autotest Global Old");
    expect(tags.filter((t) => t === "Autotest Global New").length).toBe(1);
  });

  // ── Body / field validation ──

  test("PUT /files/tags - Empty oldName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "",
        newName: "Autotest Empty Old Name New",
      },
    });

    expect(status).toBe(400);
  });

  test("PUT /files/tags - Missing oldName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        newName: "Autotest Missing Old Name",
      } as any,
    });

    expect(status).toBe(400);
  });

  test("PUT /files/tags - Missing newName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Missing New Name" },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Missing New Name",
      } as any,
    });

    expect(status).toBe(400);

    // Side effect: old tag is untouched
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    expect(catalog.response as unknown as string[]).toContain(
      "Autotest Missing New Name",
    );
  });

  test("PUT /files/tags - Empty request body returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.updateRoomTag({});

    expect(status).toBe(400);
  });

  test("PUT /files/tags - null oldName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: null,
        newName: "Autotest Null Old Name New",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBeDefined();
  });

  test("PUT /files/tags - null newName returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Null New Name" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Null New Name",
        newName: null,
      },
    });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBeDefined();

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    expect(catalog.response as unknown as string[]).toContain(
      "Autotest Null New Name",
    );
  });

  test("PUT /files/tags - Both oldName and newName null returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: null,
        newName: null,
      },
    });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBeDefined();
  });

  // ── Whitespace handling ──

  // BUG 82372: an empty newName is rejected with 400, but a whitespace-only
  // newName is accepted with 200 — validation should treat it the same as empty.
  test.fail(
    "BUG 82372: PUT /files/tags - Whitespace-only newName should return 400 but is accepted (200)",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "Autotest Whitespace New" },
      });

      const { status } = await ownerApi.rooms.updateRoomTag({
        updateTagRequestDto: {
          oldName: "Autotest Whitespace New",
          newName: "   ",
        },
      });

      expect(status).toBe(400);
    },
  );

  // The API does NOT trim newName — surrounding spaces are stored verbatim.
  test("PUT /files/tags - newName with surrounding spaces is stored verbatim (not trimmed)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Trim Source" },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Trim Source",
        newName: "  Autotest Trimmed Tag  ",
      },
    });
    expect(status).toBe(200);

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).toContain("  Autotest Trimmed Tag  ");
    expect(tags).not.toContain("Autotest Trimmed Tag");
  });

  // oldName is matched exactly — it is not trimmed, so a padded oldName does
  // not match the stored tag and the rename fails with 404.
  test("PUT /files/tags - oldName with surrounding spaces does not match and returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Old Trim Match" },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "  Autotest Old Trim Match  ",
        newName: "Autotest Old Trim Match Renamed",
      },
    });
    expect(status).toBe(404);

    // Original tag is untouched
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).toContain("Autotest Old Trim Match");
    expect(tags).not.toContain("Autotest Old Trim Match Renamed");
  });

  // ── Case sensitivity ──

  // Tags are case-insensitive: renaming a tag to a case-variant of ITSELF
  // collides with the existing tag and is rejected as a duplicate.
  test("PUT /files/tags - Renaming a tag to a different letter case returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Case Old" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Case Old",
        newName: "autotest case old",
      },
    });
    expect(status).toBe(400);
    expect((data as any).error?.message).toContain("already exists");

    // Original casing is preserved
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    expect(catalog.response as unknown as string[]).toContain(
      "Autotest Case Old",
    );
  });

  test("PUT /files/tags - Renaming to a case-variant of an existing tag returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest CaseConflict Tag" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest CaseConflict Source" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest CaseConflict Source",
        newName: "autotest caseconflict tag",
      },
    });

    // Tags are case-insensitive — this collides with the existing tag
    expect(status).toBe(400);
    expect((data as any).error?.message).toContain("already exists");
  });

  // ── Special characters / Unicode ──

  test("PUT /files/tags - newName with Cyrillic characters is stored verbatim", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Cyrillic Source" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Cyrillic Source",
        newName: "Автотест Тег Кириллица",
      },
    });
    expect(status).toBe(200);
    expect(data.response as unknown as string).toBe("Автотест Тег Кириллица");

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    expect(catalog.response as unknown as string[]).toContain(
      "Автотест Тег Кириллица",
    );
  });

  // BUG 82374: emoji in newName crashes the API with 500. Cyrillic and other
  // Unicode are accepted (see the Cyrillic test), so emoji should be too.
  test.fail(
    "BUG 82374: PUT /files/tags - newName with emoji should return 200 but returns 500",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "Autotest Emoji Source" },
      });

      const { status } = await ownerApi.rooms.updateRoomTag({
        updateTagRequestDto: {
          oldName: "Autotest Emoji Source",
          newName: "Autotest Emoji 🚀🔥",
        },
      });

      expect(status).toBe(200);
    },
  );

  test("PUT /files/tags - newName with dashes, underscores and dots", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Punct Source" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Punct Source",
        newName: "Autotest-Punct_Tag.v2",
      },
    });

    expect(status).toBe(200);
    expect(data.response as unknown as string).toBe("Autotest-Punct_Tag.v2");
  });

  test("PUT /files/tags - newName with quotes", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Quotes Source" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Quotes Source",
        newName: 'Autotest "Quoted" Tag',
      },
    });

    expect(status).toBe(200);
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    expect(catalog.response as unknown as string[]).toContain(
      data.response as unknown as string,
    );
  });

  test("PUT /files/tags - newName with HTML/script-like string does not break the API", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest XSS Source" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest XSS Source",
        newName: "<script>alert(1)</script>",
      },
    });

    // API must not 500; capture whatever the sanitized/stored value is
    expect(status).toBe(200);
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    expect(catalog.response as unknown as string[]).toContain(
      data.response as unknown as string,
    );
    expect(catalog.response as unknown as string[]).not.toContain(
      "Autotest XSS Source",
    );
  });

  // ── Length limits ──

  test("PUT /files/tags - Very long newName", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Long Source" },
    });

    const longName = "A".repeat(1000);
    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Long Source",
        newName: longName,
      },
    });

    // Must not be a server error regardless of whether the limit is enforced
    expect(status).not.toBe(500);
  });

  // ── Chained / repeated renames ──

  test("PUT /files/tags - Chained rename A -> B -> C leaves only C", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Chain A" },
    });

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chain Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["Autotest Chain A"] },
    });

    const first = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Chain A",
        newName: "Autotest Chain B",
      },
    });
    expect(first.status).toBe(200);

    const second = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Chain B",
        newName: "Autotest Chain C",
      },
    });
    expect(second.status).toBe(200);

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).toContain("Autotest Chain C");
    expect(tags).not.toContain("Autotest Chain A");
    expect(tags).not.toContain("Autotest Chain B");

    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect((info as any).response?.tags as string[]).toContain(
      "Autotest Chain C",
    );
  });

  test("PUT /files/tags - Repeating the same rename returns 404 the second time", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Idempotent Old" },
    });

    const first = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Idempotent Old",
        newName: "Autotest Idempotent New",
      },
    });
    expect(first.status).toBe(200);

    const second = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Idempotent Old",
        newName: "Autotest Idempotent New",
      },
    });
    expect(second.status).toBe(404);

    // No duplicate was created
    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags.filter((t) => t === "Autotest Idempotent New").length).toBe(1);
  });

  // ── No side effects on failed rename ──

  test("PUT /files/tags - Failed rename (conflict) leaves both tags intact", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest SideEffect Source" },
    });
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest SideEffect Target" },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest SideEffect Source",
        newName: "Autotest SideEffect Target",
      },
    });
    expect(status).toBe(400);

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).toContain("Autotest SideEffect Source");
    expect(tags).toContain("Autotest SideEffect Target");
  });

  test("PUT /files/tags - Failed rename of a non-existent tag does not create it", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Ghost Old 424242",
        newName: "Autotest Ghost New 424242",
      },
    });
    expect(status).toBe(404);

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).not.toContain("Autotest Ghost New 424242");
    expect(tags).not.toContain("Autotest Ghost Old 424242");
  });

  // ── Selective rename among several tags on a room ──

  test("PUT /files/tags - Renaming one tag on a multi-tag room leaves the others unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MultiTag Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: {
        names: ["Autotest Multi A", "Autotest Multi B", "Autotest Multi C"],
      },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Multi B",
        newName: "Autotest Multi B Renamed",
      },
    });
    expect(status).toBe(200);

    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    const tags = (info as any).response?.tags as string[];
    expect(tags).toContain("Autotest Multi A");
    expect(tags).toContain("Autotest Multi B Renamed");
    expect(tags).toContain("Autotest Multi C");
    expect(tags).not.toContain("Autotest Multi B");
  });

  // ── Tag not attached to any room ──

  test("PUT /files/tags - Renaming a tag that is not attached to any room succeeds", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Unused Old" },
    });

    const { status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Unused Old",
        newName: "Autotest Unused New",
      },
    });
    expect(status).toBe(200);

    const { data: catalog } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = catalog.response as unknown as string[];
    expect(tags).toContain("Autotest Unused New");
    expect(tags).not.toContain("Autotest Unused Old");
  });
});

test.describe("GET /files/tags - getRoomTagsInfo", () => {
  // ── Contract / response shape ──

  test("GET /files/tags - returns 200 and response is an array of strings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "ShapeTag" },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) {
      expect(typeof t).toBe("string");
    }
  });

  test("GET /files/tags - clean portal returns an empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toEqual([]);
  });

  test("GET /files/tags - tag created via createRoomTag appears in the list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "ContractCreatedTag";

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain(name);
  });

  // ── Auto-create via addRoomTags ──

  test("GET /files/tags - addRoomTags with several new tags adds all of them to the catalog", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const names = ["MultiTagA", "MultiTagB", "MultiTagC"];

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Multi Tag Room",
        roomType: RoomType.CustomRoom,
      },
    });

    await ownerApi.rooms.addRoomTags({
      id: roomData.response!.id!,
      batchTagsRequestDto: { names },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();
    const all = data.response as unknown as string[];

    expect(status).toBe(200);
    for (const n of names) {
      expect(all).toContain(n);
    }
  });

  test("GET /files/tags - same tag attached to several rooms appears only once in the list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "SharedAcrossRooms";

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name },
    });

    const { data: room1 } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Tag Room A",
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: room2 } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Tag Room B",
        roomType: RoomType.CustomRoom,
      },
    });

    await ownerApi.rooms.addRoomTags({
      id: room1.response!.id!,
      batchTagsRequestDto: { names: [name] },
    });
    await ownerApi.rooms.addRoomTags({
      id: room2.response!.id!,
      batchTagsRequestDto: { names: [name] },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();
    const all = data.response as unknown as string[];

    expect(status).toBe(200);
    const occurrences = all.filter((t) => t === name).length;
    expect(occurrences).toBe(1);
  });

  // ── Case-insensitive filtering ──

  test("GET /files/tags - filterValue is case-insensitive", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "CaseSearchTag";
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "casesearchtag",
    });

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain(name);
  });

  // ── Filtering ──

  test("GET /files/tags - filterValue returns only matching tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const n of ["AlphaTag", "BetaTag", "GammaTag"]) {
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: n },
      });
    }

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "Alpha",
    });
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(tags).toContain("AlphaTag");
    expect(tags).not.toContain("BetaTag");
    expect(tags).not.toContain("GammaTag");
  });

  test("GET /files/tags - filterValue matches a substring inside the tag name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "ReleaseSmokeTag" },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "Smoke",
    });

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain("ReleaseSmokeTag");
  });

  test("GET /files/tags - filterValue with no matches returns an empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "RealTag" },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: `nomatch-${apiSdk.faker.generateString(20)}`,
    });

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toEqual([]);
  });

  test("GET /files/tags - filterValue with unicode characters returns matching tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "ТестовыйТег";
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "Тест",
    });

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain(name);
  });

  test("GET /files/tags - filterValue with special characters does not error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "RegularTag" },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "test %_$ #@!",
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/tags - empty filterValue returns the same result as no filter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const n of ["EmptyFilterA", "EmptyFilterB"]) {
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: n },
      });
    }

    const { data: unfiltered } = await ownerApi.rooms.getRoomTagsInfo();
    const { data: filtered, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "",
    });

    expect(status).toBe(200);
    expect(filtered.response as unknown as string[]).toEqual(
      unfiltered.response as unknown as string[],
    );
  });

  test("GET /files/tags - whitespace-only filterValue returns the same result as no filter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const n of ["SpaceFilterA", "SpaceFilterB"]) {
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: n },
      });
    }

    const { data: unfiltered } = await ownerApi.rooms.getRoomTagsInfo();
    const { data: filtered, status } = await ownerApi.rooms.getRoomTagsInfo({
      filterValue: "   ",
    });

    expect(status).toBe(200);
    expect(filtered.response as unknown as string[]).toEqual(
      unfiltered.response as unknown as string[],
    );
  });

  // ── Pagination ──

  test("GET /files/tags - count limits the number of returned tags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const n of ["PageA", "PageB", "PageC", "PageD"]) {
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: n },
      });
    }

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({ count: 2 });
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(tags.length).toBe(2);
  });

  test("GET /files/tags - startIndex skips the first items in the list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const n of ["SkipA", "SkipB", "SkipC"]) {
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: n },
      });
    }

    const { data: full } = await ownerApi.rooms.getRoomTagsInfo();
    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      startIndex: 1,
    });

    const fullList = full.response as unknown as string[];
    const skipped = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(skipped.length).toBe(fullList.length - 1);
    expect(skipped).toEqual(fullList.slice(1));
  });

  test("GET /files/tags - count and startIndex return the expected slice", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    for (const n of ["CSA", "CSB", "CSC", "CSD", "CSE"]) {
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: n },
      });
    }

    const { data: full } = await ownerApi.rooms.getRoomTagsInfo();
    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      count: 2,
      startIndex: 2,
    });

    const fullList = full.response as unknown as string[];
    const page = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(page.length).toBe(2);
    expect(page).toEqual(fullList.slice(2, 4));
  });

  test("GET /files/tags - startIndex beyond total returns an empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "OnlyTag" },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo({
      startIndex: 999999,
    });

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toEqual([]);
  });

  test("GET /files/tags - count = 0 returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "ZeroCountTag" },
    });

    const { status } = await ownerApi.rooms.getRoomTagsInfo({ count: 0 });

    expect(status).toBe(400);
  });

  // ── Garbage collection extras ──

  test("GET /files/tags - tag remains while another room still uses it, disappears after the last room is deleted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "TwoStepGC";

    const { data: room1Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Two-Step GC Room 1",
        roomType: RoomType.CustomRoom,
      },
    });
    const { data: room2Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Two-Step GC Room 2",
        roomType: RoomType.CustomRoom,
      },
    });
    const room1Id = room1Data.response!.id!;
    const room2Id = room2Data.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: room1Id,
      batchTagsRequestDto: { names: [name] },
    });
    await ownerApi.rooms.addRoomTags({
      id: room2Id,
      batchTagsRequestDto: { names: [name] },
    });

    await ownerApi.rooms.deleteRoom({
      id: room1Id,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op1 = await waitForOperation(ownerApi.operations);
    expect(op1.finished).toBe(true);

    const { data: afterFirst } = await ownerApi.rooms.getRoomTagsInfo();
    expect(afterFirst.response as unknown as string[]).toContain(name);

    await ownerApi.rooms.deleteRoom({
      id: room2Id,
      deleteRoomRequest: { deleteAfter: false },
    });
    const op2 = await waitForOperation(ownerApi.operations);
    expect(op2.finished).toBe(true);

    const { data: afterSecond } = await ownerApi.rooms.getRoomTagsInfo();
    expect(afterSecond.response as unknown as string[]).not.toContain(name);
  });

  test("GET /files/tags - tag remains in catalog after being detached from the only room via deleteRoomTags", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "DetachKeepCatalog";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Detach Keep Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });

    const { data: beforeDetach } = await ownerApi.rooms.getRoomTagsInfo();
    expect(beforeDetach.response as unknown as string[]).toContain(name);

    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: [name] },
    });

    const { data: afterDetach, status } =
      await ownerApi.rooms.getRoomTagsInfo();
    expect(status).toBe(200);
    expect(afterDetach.response as unknown as string[]).toContain(name);
  });

  // ── Input validation ──

  test("GET /files/tags - negative count returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "NegCountTag" },
    });

    const { status } = await ownerApi.rooms.getRoomTagsInfo({ count: -1 });

    expect(status).toBe(400);
  });

  test.fail(
    "BUG 81792: GET /files/tags - negative startIndex returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: "NegStartTag" },
      });

      const { status } = await ownerApi.rooms.getRoomTagsInfo({
        startIndex: -1,
      });

      expect(status).toBe(400);
    },
  );

  test("GET /files/tags - non-numeric count returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.getRoomTagsInfo({
      count: "abc" as unknown as number,
    });

    expect(status).toBe(400);
  });

  test("GET /files/tags - non-numeric startIndex returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rooms.getRoomTagsInfo({
      startIndex: "abc" as unknown as number,
    });

    expect(status).toBe(400);
  });

  test("GET /files/tags - very large count returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "BigCountTag" },
    });

    const { status } = await ownerApi.rooms.getRoomTagsInfo({
      count: 100000,
    });

    expect(status).toBe(400);
  });

  // ── Isolation / scope ──

  test("GET /files/tags - tag added to a room is visible at portal scope without specifying the room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const name = "PortalWideTag";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Portal Scope Room",
        roomType: RoomType.CustomRoom,
      },
    });

    await ownerApi.rooms.addRoomTags({
      id: roomData.response!.id!,
      batchTagsRequestDto: { names: [name] },
    });

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();

    expect(status).toBe(200);
    expect(data.response as unknown as string[]).toContain(name);
  });

  test("GET /files/tags - response contains only custom tag names, not room titles or cover ids", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomTitle = "Autotest Unique Room Title For Tag Scope";
    const tagName = "ScopeOnlyCustomTag";

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: tagName },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: roomTitle,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: covers } = await ownerApi.rooms.getRoomCovers();
    const coverId = covers.response![0].id!;

    const { data, status } = await ownerApi.rooms.getRoomTagsInfo();
    const tags = data.response as unknown as string[];

    expect(status).toBe(200);
    expect(tags).toContain(tagName);
    expect(tags).not.toContain(roomTitle);
    expect(tags).not.toContain(String(roomId));
    expect(tags).not.toContain(coverId);
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

  // A non-existent room id resolves to "record not found" -> 404.
  test("PUT /files/rooms/:id/tags - Non-existent room id returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "GhostRoomTag" },
    });

    const { data } = await ownerApi.rooms.addRoomTags({
      id: 999999999,
      batchTagsRequestDto: { names: ["GhostRoomTag"] },
    });

    expect(data.statusCode).toBe(404);
  });

  // A deleted room resolves to "record not found" -> 404.
  test("PUT /files/rooms/:id/tags - Adding tag to deleted room returns 404", async ({
    apiSdk,
  }) => {
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

    expect(data.statusCode).toBe(404);
  });

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
      logoRequest: { tmpFile, x: 0, y: 0, width: 1, height: 1 },
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
    expect(afterInfo.statusCode).toBe(404);

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
      logoRequest: { tmpFile, x: 0, y: 0, width: 1, height: 1 },
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

  // A non-existent room id resolves to "record not found" -> 404.
  // Mirrors addRoomTags.
  test("DELETE /files/rooms/:id/tags - Non-existent room id returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.rooms.deleteRoomTags({
      id: 999999999,
      batchTagsRequestDto: { names: ["GhostTag"] },
    });
    expect(data.statusCode).toBe(404);
  });

  // Mirrors addRoomTags — a deleted room resolves to "record not found" -> 404.
  test("DELETE /files/rooms/:id/tags - Detaching tag from deleted room returns 404", async ({
    apiSdk,
  }) => {
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

    expect(data.statusCode).toBe(404);
  });

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

test.describe("GET /files/rooms/:id - getRoomInfo", () => {
  test.describe("positive / contract", () => {
    for (const { label, roomType } of [
      { label: "CustomRoom", roomType: RoomType.CustomRoom },
      { label: "EditingRoom", roomType: RoomType.EditingRoom },
      { label: "PublicRoom", roomType: RoomType.PublicRoom },
      { label: "FillingFormsRoom", roomType: RoomType.FillingFormsRoom },
      { label: "VirtualDataRoom", roomType: RoomType.VirtualDataRoom },
    ] as const) {
      test(`GET /files/rooms/:id - Owner reads ${label} info`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const title = `Autotest GetInfo ${label}`;
        const { data: created } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: { title, roomType },
        });
        const roomId = created.response!.id!;

        const { data, status } = await ownerApi.rooms.getRoomInfo({
          id: roomId,
        });

        expect(status).toBe(200);
        expect(data.response!.id).toBe(roomId);
        expect(data.response!.title).toBe(title);
        expect(data.response!.roomType).toBe(roomType);
      });
    }

    test("GET /files/rooms/:id - Room without custom quota has isCustomQuota=false", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Default Quota",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.isCustomQuota).not.toBe(true);
    });
  });

  test.describe("verify-after-create fields", () => {
    test("GET /files/rooms/:id - VDR created without lifetime has unset lifetime", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest VDR No Lifetime",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.lifetime?.value ?? 0).toBe(0);
    });

    test("GET /files/rooms/:id - Cover set at create time is reflected in getRoomInfo", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: covers } = await ownerApi.rooms.getRoomCovers();
      const coverId = covers.response![0].id!;

      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Cover On Create",
          roomType: RoomType.CustomRoom,
          cover: coverId,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.logo?.cover?.id).toBe(coverId);
    });

    test("GET /files/rooms/:id - Color set at create time is reflected in getRoomInfo", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Color On Create",
          roomType: RoomType.CustomRoom,
          color: "FF5733",
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.logo?.color).toBe("FF5733");
    });

    test("GET /files/rooms/:id - Tags added after create appear in getRoomInfo", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tagA = "AutotestGetInfoTagA";
      const tagB = "AutotestGetInfoTagB";
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagA },
      });
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagB },
      });

      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Tags On GetInfo",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: [tagA, tagB] },
      });

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      const tags = (data.response!.tags ?? []) as string[];
      expect(tags).toContain(tagA);
      expect(tags).toContain(tagB);
    });
  });

  test.describe("state consistency after actions", () => {
    test("GET /files/rooms/:id - Sharing a room with a user does not break Owner's getRoomInfo", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Reflection",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.id).toBe(roomId);
      expect(data.response!.access).toBeDefined();
    });

    test("GET /files/rooms/:id - Archived room is marked archive (rootFolderType=Archive)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Reflection",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      // FolderType.Archive === 20
      expect(data.response!.rootFolderType).toBe(20);
    });

    test("GET /files/rooms/:id - Unarchived room returns to active state (rootFolderType=VirtualRooms)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Unarchive Reflection",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

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
      // FolderType.VirtualRooms === 14
      expect(data.response!.rootFolderType).toBe(14);
    });

    test("GET /files/rooms/:id - Repeated calls return the same state (idempotent)", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Idempotent Read",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data: a } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      const { data: b } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      const { data: c } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(b.response!.id).toBe(a.response!.id);
      expect(c.response!.id).toBe(a.response!.id);
      expect(b.response!.title).toBe(a.response!.title);
      expect(c.response!.title).toBe(a.response!.title);
      expect(b.response!.roomType).toBe(a.response!.roomType);
      expect(c.response!.roomType).toBe(a.response!.roomType);
    });
  });

  test.describe("room-type specific fields", () => {
    test("GET /files/rooms/:id - CustomRoom does not expose VDR-only flags", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetInfo Custom",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.CustomRoom);
      expect(data.response!.indexing).not.toBe(true);
      expect(data.response!.denyDownload).not.toBe(true);
      expect(data.response!.lifetime?.value ?? 0).toBe(0);
      expect(data.response!.watermark?.text ?? "").toBe("");
    });

    test("GET /files/rooms/:id - VDR exposes VDR-specific flags after create", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetInfo VDR",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
          denyDownload: true,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.VirtualDataRoom);
      expect(data.response!.indexing).toBe(true);
      expect(data.response!.denyDownload).toBe(true);
    });

    test("GET /files/rooms/:id - PublicRoom has roomType=PublicRoom and no VDR flags", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetInfo Public",
          roomType: RoomType.PublicRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.PublicRoom);
      expect(data.response!.indexing).not.toBe(true);
      expect(data.response!.denyDownload).not.toBe(true);
    });

    test("GET /files/rooms/:id - FillingFormsRoom has roomType=FillingFormsRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetInfo FormFilling",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(data.response!.indexing).not.toBe(true);
      expect(data.response!.denyDownload).not.toBe(true);
    });

    test("GET /files/rooms/:id - EditingRoom has roomType=EditingRoom", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetInfo Editing",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.EditingRoom);
      expect(data.response!.indexing).not.toBe(true);
      expect(data.response!.denyDownload).not.toBe(true);
    });
  });

  test.describe("id validation", () => {
    test("GET /files/rooms/:id - Non-existing valid-format id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomInfo({ id: 999999999 });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id - Non-numeric id ('abc') returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomInfo({
        id: "abc" as unknown as number,
      });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id - Zero id returns 404", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomInfo({ id: 0 });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id - Negative id returns 404", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.rooms.getRoomInfo({ id: -1 });
      expect(data.statusCode).toBe(404);
    });

    test("GET /files/rooms/:id - Null id is rejected by the SDK before the request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.getRoomInfo({ id: null as unknown as number }),
      ).rejects.toThrow(/Required parameter id was null or undefined/);
    });

    test("GET /files/rooms/:id - Missing id is rejected by the SDK before the request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await expect(
        ownerApi.rooms.getRoomInfo({} as { id: number }),
      ).rejects.toThrow(/Required parameter id was null or undefined/);
    });
  });

  test.describe("regression / no-op", () => {
    test("GET /files/rooms/:id - Failed tag deletion (non-existing tag) does not change tags", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tagName = "AutotestStableTag";
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tagName },
      });

      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Tag Stability",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.addRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: [tagName] },
      });

      await ownerApi.rooms.deleteRoomTags({
        id: roomId,
        batchTagsRequestDto: { names: ["AutotestNoSuchTag"] },
      });

      const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      const tags = (data.response!.tags ?? []) as string[];
      expect(tags).toContain(tagName);
    });

    test("GET /files/rooms/:id - Failed update (empty title) leaves original title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const original = "Autotest Title Stability";
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: original,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "" },
      });

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.title).toBe(original);
    });

    test("GET /files/rooms/:id - After async archive completes, response reflects archived state", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Final State",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

      expect(status).toBe(200);
      expect(data.response!.rootFolderType).toBe(20);
    });
  });
});

test.describe("GET /files/rooms - getRoomsFolder", () => {
  test.describe("basic response / shape", () => {
    test("GET /files/rooms - Response includes 'current' folder metadata", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      expect(data.response!.current).toBeDefined();
      expect((data.response!.current as any).id).toBeDefined();
      expect((data.response!.current as any).title).toBeDefined();
      expect(data.response!.pathParts).toBeDefined();
    });

    test("GET /files/rooms - Returned room has expected fields: id, title, roomType, created, updated", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Shape Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "Autotest Shape Room",
      });

      expect(status).toBe(200);
      const folder = (data.response!.folders ?? []).find(
        (f) => (f as any).id === roomId,
      ) as any;
      expect(folder).toBeDefined();
      expect(folder.id).toBe(roomId);
      expect(folder.title).toBe("Autotest Shape Room");
      expect(folder.roomType).toBe(RoomType.CustomRoom);
      expect(folder.created).toBeDefined();
      expect(folder.updated).toBeDefined();
    });
  });

  test.describe("type filter", () => {
    test("GET /files/rooms - type=PublicRoom returns only Public rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.PublicRoom],
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(1);
      for (const f of data.response!.folders as any[]) {
        expect(f.roomType).toBe(RoomType.PublicRoom);
      }
    });

    test("GET /files/rooms - type with multiple values returns rooms of any matching type", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.CustomRoom, RoomType.PublicRoom],
      });

      expect(status).toBe(200);
      const returnedTypes = (data.response!.folders as any[]).map(
        (f) => f.roomType,
      );
      expect(returnedTypes.length).toBe(2);
      expect(returnedTypes).toContain(RoomType.CustomRoom);
      expect(returnedTypes).toContain(RoomType.PublicRoom);
      for (const t of returnedTypes) {
        expect([RoomType.CustomRoom, RoomType.PublicRoom]).toContain(t);
      }
    });

    test("GET /files/rooms - type filter excludes rooms of other types", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.VirtualDataRoom],
      });

      expect(status).toBe(200);
      const types = (data.response!.folders as any[]).map((f) => f.roomType);
      expect(types).not.toContain(RoomType.CustomRoom);
      expect(types).not.toContain(RoomType.PublicRoom);
      expect(types).not.toContain(RoomType.EditingRoom);
      expect(types).not.toContain(RoomType.FillingFormsRoom);
    });
  });

  test.describe("searchArea Active / Archive", () => {
    test("GET /files/rooms - Active is the default searchArea when not provided", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: createdActive } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Default Active",
          roomType: RoomType.CustomRoom,
        },
      });
      const activeId = createdActive.response!.id!;

      const { data: createdToArchive } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest To Archive",
          roomType: RoomType.CustomRoom,
        },
      });
      const archivedId = createdToArchive.response!.id!;
      await ownerApi.rooms.archiveRoom({
        id: archivedId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(activeId);
      expect(ids).not.toContain(archivedId);
    });

    test("GET /files/rooms - Archive list does not return active rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Stays Active",
          roomType: RoomType.CustomRoom,
        },
      });
      const activeId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Archive,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).not.toContain(activeId);
    });
  });

  test.describe("filterValue / search", () => {
    test("GET /files/rooms - filterValue finds room by exact title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const exactTitle = "Autotest Exact Match Title";
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: exactTitle,
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: exactTitle,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(roomId);
      expect((data.response!.folders as any[])[0].title).toBe(exactTitle);
    });

    test("GET /files/rooms - filterValue is case-insensitive", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CaseSensitive Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "autotest casesensitive",
      });

      expect(status).toBe(200);
      const titles = (data.response!.folders as any[]).map((f) => f.title);
      expect(titles).toContain("Autotest CaseSensitive Room");
    });

    test("GET /files/rooms - filterValue with no matches returns empty folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Any Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "NonExistentNeedle_zzz_xyz_123",
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(0);
      expect(data.response!.total).toBe(0);
    });

    test("GET /files/rooms - filterValue combined with type filter returns intersection", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const shared = "Autotest Intersect";
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `${shared} Custom`,
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `${shared} Public`,
          roomType: RoomType.PublicRoom,
        },
      });
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Unrelated",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: shared,
        type: [RoomType.CustomRoom],
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(1);
      const folder = (data.response!.folders as any[])[0];
      expect(folder.title).toBe(`${shared} Custom`);
      expect(folder.roomType).toBe(RoomType.CustomRoom);
    });
  });

  test.describe("tags / withoutTags", () => {
    test.fail(
      "BUG 81808: GET /files/rooms - tags filter returns only rooms with selected tag (API returns 500)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const tag = "AutotestFilterTag";
        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: tag },
        });

        const { data: tagged } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Room With Tag",
            roomType: RoomType.CustomRoom,
            tags: [tag],
          },
        });
        const taggedId = tagged.response!.id!;

        const { data: untagged } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Room No Tag",
            roomType: RoomType.CustomRoom,
          },
        });
        const untaggedId = untagged.response!.id!;

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          tags: [tag] as any,
        });

        expect(status).toBe(200);
        const ids = (data.response!.folders as any[]).map((f) => f.id);
        expect(ids).toContain(taggedId);
        expect(ids).not.toContain(untaggedId);
      },
    );

    test.fail(
      "BUG 81808: GET /files/rooms - tags filter with multiple tags returns rooms matching any of them (API returns 500)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const tagA = "AutotestTagA";
        const tagB = "AutotestTagB";
        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: tagA },
        });
        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: tagB },
        });

        const { data: withA } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest A",
            roomType: RoomType.CustomRoom,
            tags: [tagA],
          },
        });
        const { data: withB } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest B",
            roomType: RoomType.CustomRoom,
            tags: [tagB],
          },
        });
        const { data: withNeither } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest None",
            roomType: RoomType.CustomRoom,
          },
        });

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          tags: [tagA, tagB] as any,
        });

        expect(status).toBe(200);
        const ids = (data.response!.folders as any[]).map((f) => f.id);
        expect(ids).toContain(withA.response!.id);
        expect(ids).toContain(withB.response!.id);
        expect(ids).not.toContain(withNeither.response!.id);
      },
    );

    test("GET /files/rooms - withoutTags excludes rooms with any tag", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const tag = "AutotestExcludedTag";
      await ownerApi.rooms.createRoomTag({
        createTagRequestDto: { name: tag },
      });

      const { data: tagged } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Tagged",
          roomType: RoomType.CustomRoom,
          tags: [tag],
        },
      });
      const { data: untagged } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Untagged",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        withoutTags: true,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(untagged.response!.id);
      expect(ids).not.toContain(tagged.response!.id);
    });

    test("GET /files/rooms - Room without tags is returned when withoutTags=true", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Untagged Only",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        withoutTags: true,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(created.response!.id);
    });
  });

  test.describe("subject filters", () => {
    test("GET /files/rooms - subjectOwnerId returns rooms owned by subject", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: adminApi, data: adminMember } =
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminId = adminMember.response!.id!;

      const { data: ownerRoom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: adminRoom } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Admin Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        subjectOwnerId: adminId,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(adminRoom.response!.id);
      expect(ids).not.toContain(ownerRoom.response!.id);
    });

    test("GET /files/rooms - subjectId returns rooms where subject is participant", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const userId = memberData.response!.id!;

      const { data: sharedRoom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Shared Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const sharedRoomId = sharedRoom.response!.id!;
      await ownerApi.rooms.setRoomSecurity({
        id: sharedRoomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data: nonSharedRoom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Non Shared Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        subjectId: userId,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(sharedRoomId);
      expect(ids).not.toContain(nonSharedRoom.response!.id);
    });

    test("GET /files/rooms - excludeSubject excludes rooms related to subject", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: adminApi, data: adminMember } =
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminId = adminMember.response!.id!;

      const { data: ownerRoom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Owner Excl",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: adminRoom } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Admin Excl",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        subjectOwnerId: adminId,
        excludeSubject: true,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(ownerRoom.response!.id);
      expect(ids).not.toContain(adminRoom.response!.id);
    });

    test("GET /files/rooms - Non-existing subjectId returns empty folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Existing Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        subjectOwnerId: "11111111-1111-1111-1111-111111111111",
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(0);
      expect(data.response!.total).toBe(0);
    });
  });

  // createAllRoomTypes makes five rooms, but the default (Active) view only
  // lists activeAreaRoomCount of them - the form filling room paginates under
  // searchArea=Forms instead.
  test.describe("pagination", () => {
    test("GET /files/rooms - count limits the number of returned folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        count: 2,
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(2);
      expect(data.response!.total).toBe(activeAreaRoomCount);
    });

    test("GET /files/rooms - startIndex skips first N folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data: first } = await ownerApi.rooms.getRoomsFolder({});
      const allIds = (first.response!.folders as any[]).map((f) => f.id);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        startIndex: 2,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids.length).toBe(activeAreaRoomCount - 2);
      expect(ids).toEqual(allIds.slice(2));
    });

    test("GET /files/rooms - count + startIndex returns the expected slice", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data: first } = await ownerApi.rooms.getRoomsFolder({});
      const allIds = (first.response!.folders as any[]).map((f) => f.id);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        startIndex: 1,
        count: 2,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toEqual(allIds.slice(1, 3));
    });

    test("GET /files/rooms - startIndex beyond total returns empty folders", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        startIndex: 999,
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(0);
      expect(data.response!.total).toBe(activeAreaRoomCount);
    });

    test("GET /files/rooms - Pagination metadata matches request", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        startIndex: 1,
        count: 2,
      });

      expect(status).toBe(200);
      expect(data.response!.startIndex).toBe(1);
      expect(data.response!.count).toBe(2);
      expect(data.response!.total).toBe(activeAreaRoomCount);
    });
  });

  test.describe("sorting", () => {
    test.fail(
      "BUG 81809: GET /files/rooms - sortBy=title sortOrder=Ascending returns rooms sorted by title ASC",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        for (const title of ["Autotest C", "Autotest A", "Autotest B"]) {
          await ownerApi.rooms.createRoom({
            createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
          });
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          sortBy: "title",
          sortOrder: SortOrder.Ascending,
        });

        expect(status).toBe(200);
        const titles = (data.response!.folders as any[]).map(
          (f) => f.title as string,
        );
        expect(titles).toEqual(["Autotest A", "Autotest B", "Autotest C"]);
      },
    );

    test.fail(
      "BUG 81809: GET /files/rooms - sortBy=title sortOrder=Descending returns rooms sorted by title DESC (got B,A,C instead of C,B,A)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        for (const title of ["Autotest C", "Autotest A", "Autotest B"]) {
          await ownerApi.rooms.createRoom({
            createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
          });
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          sortBy: "title",
          sortOrder: SortOrder.Descending,
        });

        expect(status).toBe(200);
        const titles = (data.response!.folders as any[]).map(
          (f) => f.title as string,
        );
        expect(titles).toEqual(["Autotest C", "Autotest B", "Autotest A"]);
      },
    );

    test("GET /files/rooms - sortBy=created sortOrder=Ascending returns oldest rooms first", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const titles = ["Autotest First", "Autotest Second", "Autotest Third"];
      const createdIds: number[] = [];
      for (const title of titles) {
        const { data } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
        });
        createdIds.push(data.response!.id!);
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        sortBy: "DateAndTimeCreation",
        sortOrder: SortOrder.Ascending,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toEqual(createdIds);
    });

    test("GET /files/rooms - sortBy=created sortOrder=Descending returns newest rooms first", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const titles = ["Autotest First", "Autotest Second", "Autotest Third"];
      const createdIds: number[] = [];
      for (const title of titles) {
        const { data } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
        });
        createdIds.push(data.response!.id!);
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        sortBy: "DateAndTimeCreation",
        sortOrder: SortOrder.Descending,
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toEqual([...createdIds].reverse());
    });
  });

  test.describe("permissions / visibility", () => {
    test("GET /files/rooms - DocSpaceAdmin can get Rooms folder", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Admin Own Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await adminApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      const titles = (data.response!.folders as any[]).map((f) => f.title);
      expect(titles).toContain("Autotest Admin Own Room");
    });

    test("GET /files/rooms - RoomAdmin sees rooms where they are invited", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: ownerRoom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Owner Visible",
          roomType: RoomType.CustomRoom,
        },
      });
      const visibleId = ownerRoom.response!.id!;

      const { data: hiddenRoom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Owner Hidden",
          roomType: RoomType.CustomRoom,
        },
      });
      const hiddenId = hiddenRoom.response!.id!;

      const { api: roomAdminApi, data: roomAdminMember } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminId = roomAdminMember.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: visibleId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data, status } = await roomAdminApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(visibleId);
      expect(ids).not.toContain(hiddenId);
    });

    test("GET /files/rooms - User sees only rooms they are invited to", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: visible } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest User Visible",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: hidden } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest User Hidden",
          roomType: RoomType.CustomRoom,
        },
      });

      const { api: userApi, data: userMember } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userMember.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: visible.response!.id!,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await userApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(visible.response!.id);
      expect(ids).not.toContain(hidden.response!.id);
    });

    test("GET /files/rooms - Guest sees only rooms they are invited to", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: visible } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Guest Visible",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: hidden } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Guest Hidden",
          roomType: RoomType.CustomRoom,
        },
      });

      const { api: guestApi, data: guestMember } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestMember.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: visible.response!.id!,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await guestApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(visible.response!.id);
      expect(ids).not.toContain(hidden.response!.id);
    });

    test("GET /files/rooms - Anonymous request returns 401", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.forAnonymous().rooms.getRoomsFolder({});
      expect(status).toBe(401);
    });

    test("GET /files/rooms - Disabled (terminated) user cannot get Rooms folder", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = memberData.response!.id!;

      await ownerApi.userStatus.updateUserStatus({
        status: EmployeeStatus.Terminated,
        updateMembersRequestDto: { userIds: [userId], resendAll: false },
      });

      const { status } = await userApi.rooms.getRoomsFolder({});
      expect(status).toBe(401);
    });
  });

  test.describe("combined filters", () => {
    test("GET /files/rooms - type + filterValue returns only matching type and title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Combo Custom",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Combo Public",
          roomType: RoomType.PublicRoom,
        },
      });
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Other",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.PublicRoom],
        filterValue: "Combo",
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBe(1);
      const folder = (data.response!.folders as any[])[0];
      expect(folder.title).toBe("Autotest Combo Public");
      expect(folder.roomType).toBe(RoomType.PublicRoom);
    });

    test("GET /files/rooms - searchArea=Archive + filterValue finds archived room by title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: room } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archived Searchable",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = room.response!.id!;
      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Archive,
        filterValue: "Archived Searchable",
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(roomId);
    });

    test("GET /files/rooms - searchArea=Archive + type returns only archived rooms of selected type", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: vdr } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive VDR",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const { data: custom } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Archive Custom",
          roomType: RoomType.CustomRoom,
        },
      });

      for (const id of [vdr.response!.id!, custom.response!.id!]) {
        await ownerApi.rooms.archiveRoom({
          id,
          archiveRoomRequest: { deleteAfter: false },
        });
        await waitForOperation(ownerApi.operations);
      }

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Archive,
        type: [RoomType.VirtualDataRoom],
      });

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(vdr.response!.id);
      expect(ids).not.toContain(custom.response!.id);
    });

    test.fail(
      "BUG 81808: GET /files/rooms - tags + filterValue returns only tagged rooms matching title (API returns 500 on tags filter)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const tag = "AutotestComboTag";
        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: tag },
        });

        const { data: match } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest TagCombo Match",
            roomType: RoomType.CustomRoom,
            tags: [tag],
          },
        });
        const { data: titleOnly } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest TagCombo Other",
            roomType: RoomType.CustomRoom,
          },
        });
        const { data: tagOnly } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Unrelated",
            roomType: RoomType.CustomRoom,
            tags: [tag],
          },
        });

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          tags: [tag] as any,
          filterValue: "TagCombo",
        });

        expect(status).toBe(200);
        const ids = (data.response!.folders as any[]).map((f) => f.id);
        expect(ids).toContain(match.response!.id);
        expect(ids).not.toContain(titleOnly.response!.id);
        expect(ids).not.toContain(tagOnly.response!.id);
      },
    );

    test.fail(
      "BUG 81809: GET /files/rooms - sortBy + startIndex + count returns stable result across repeated calls",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const titles = [
          "Autotest E",
          "Autotest A",
          "Autotest C",
          "Autotest B",
          "Autotest D",
        ];
        for (const title of titles) {
          await ownerApi.rooms.createRoom({
            createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
          });
        }

        const getSlice = async () => {
          const { data, status } = await ownerApi.rooms.getRoomsFolder({
            sortBy: "title",
            sortOrder: SortOrder.Ascending,
            startIndex: 1,
            count: 2,
          });
          expect(status).toBe(200);
          return (data.response!.folders as any[]).map(
            (f) => f.title as string,
          );
        };

        const results = await Promise.all(
          Array.from({ length: 5 }, () => getSlice()),
        );

        for (const titles of results) {
          expect(titles).toEqual(["Autotest B", "Autotest C"]);
        }
      },
    );
  });

  test.describe("negative / validation", () => {
    test("GET /files/rooms - Invalid room type is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        type: [999] as any,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Invalid searchArea is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: 999 as any,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Negative count is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        count: -1,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Negative startIndex is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        startIndex: -1,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Non-numeric count is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        count: "abc" as any,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Non-numeric startIndex is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        startIndex: "abc" as any,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Invalid sortOrder is rejected", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.getRoomsFolder({
        sortOrder: "sideways" as any,
      });
      expect(status).toBe(400);
    });

    test("GET /files/rooms - Invalid sortBy is ignored and returns 200 with default order", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest SortBy Default",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        sortBy: "thisFieldDoesNotExist",
      });

      expect(status).toBe(200);
      expect(data.response!.folders!.length).toBeGreaterThan(0);
    });
  });

  test.describe("consistency / state changes", () => {
    test("GET /files/rooms - Deleted room is not returned in Active list", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest To Delete",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);
      await ownerApi.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      const ids = (data.response!.folders as any[]).map((f) => f.id);
      expect(ids).not.toContain(roomId);
    });

    test("GET /files/rooms - Room title update is reflected in filterValue search", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Original Title",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = created.response!.id!;

      await ownerApi.rooms.updateRoom({
        id: roomId,
        updateRoomRequest: { title: "Autotest Renamed Title" },
      });

      const { data: oldSearch } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "Original Title",
      });
      expect(
        (oldSearch.response!.folders as any[]).map((f) => f.id),
      ).not.toContain(roomId);

      const { data: newSearch, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "Renamed Title",
      });
      expect(status).toBe(200);
      const ids = (newSearch.response!.folders as any[]).map((f) => f.id);
      expect(ids).toContain(roomId);
    });

    test.fail(
      "BUG 81808: GET /files/rooms - Room tag update is reflected in tags filter (API returns 500 on tags filter)",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const tag = "AutotestLateTag";
        await ownerApi.rooms.createRoomTag({
          createTagRequestDto: { name: tag },
        });

        const { data: created } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Untagged Then Tagged",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = created.response!.id!;

        const { data: before } = await ownerApi.rooms.getRoomsFolder({
          tags: [tag] as any,
        });
        expect(
          (before.response!.folders as any[]).map((f) => f.id),
        ).not.toContain(roomId);

        await ownerApi.rooms.addRoomTags({
          id: roomId,
          batchTagsRequestDto: { names: [tag] },
        });

        const { data: after, status } = await ownerApi.rooms.getRoomsFolder({
          tags: [tag] as any,
        });
        expect(status).toBe(200);
        expect((after.response!.folders as any[]).map((f) => f.id)).toContain(
          roomId,
        );
      },
    );

    test("GET /files/rooms - Repeated calls with same params return stable results", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createAllRoomTypes(apiSdk, "owner");

      const params = {
        sortBy: "title",
        sortOrder: SortOrder.Ascending,
      };
      const { data: first } = await ownerApi.rooms.getRoomsFolder(params);
      const { data: second } = await ownerApi.rooms.getRoomsFolder(params);

      const firstIds = (first.response!.folders as any[]).map((f) => f.id);
      const secondIds = (second.response!.folders as any[]).map((f) => f.id);
      expect(secondIds).toEqual(firstIds);
      expect(second.response!.total).toBe(first.response!.total);
    });
  });
});
