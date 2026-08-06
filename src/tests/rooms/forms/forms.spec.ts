import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FolderType,
  RoomType,
  SearchArea,
  SortOrder,
} from "@onlyoffice/docspace-api-sdk";
import {
  createRoomOfType,
  fileTitles,
  folderIds,
  folderRoomTypes,
  folderTitles,
  roomsAreaRoomTypes,
} from "@/src/helpers/rooms";
import { createOoForm } from "@/src/helpers/files";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import type { ApiSDK } from "@/src/services/api-sdk";

/**
 * Form filling rooms were moved out of the Rooms section into their own root
 * section, Forms.
 *
 * Established against a live portal:
 *   - GET /files/rooms?searchArea=8  (SearchArea.Forms) lists ONLY form filling
 *     rooms and reports current.rootFolderType = 36 (FolderType.Forms) with its
 *     own current.id, distinct from the Rooms root (14).
 *   - GET /files/rooms with no searchArea (= Active) and searchArea=0 never
 *     return a form filling room.
 *   - GET /files/@forms is a dedicated alias for the same collection.
 *   - searchArea=2 (Any) still spans both sections.
 *
 * Note the rooms themselves keep rootFolderType 14 and a parentId pointing at
 * the Rooms root even when listed under Forms - Forms is a filtered view over
 * the same storage, not a physical relocation. That is asserted below so a
 * future change to it is caught rather than silently absorbed.
 */
test.describe("Rooms / Forms section separation", () => {
  test.describe("GET /files/rooms - the Rooms section excludes form filling rooms", () => {
    test("GET /files/rooms - Rooms section returns the supported room types and no form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const expected: number[] = [];
      for (const { label, roomType } of roomsAreaRoomTypes) {
        expected.push(
          await createRoomOfType(apiSdk, "owner", `Area ${label}`, roomType),
        );
      }
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Area FormFilling",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Active,
      });

      expect(status).toBe(200);
      const ids = folderIds(data);
      expect(ids.sort()).toEqual([...expected].sort());
      expect(ids).not.toContain(ffrId);
      expect(folderRoomTypes(data)).not.toContain(RoomType.FillingFormsRoom);
      expect(data.response!.total).toBe(roomsAreaRoomTypes.length);
      expect(data.response!.current!.rootFolderType).toBe(
        FolderType.VirtualRooms,
      );
    });

    test("GET /files/rooms - No searchArea at all still excludes the form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "Implicit Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Implicit Form",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({});

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([customId]);
      expect(folderIds(data)).not.toContain(ffrId);
      expect(data.response!.total).toBe(1);
    });

    test("GET /files/rooms - Pagination over the Rooms section never pages in a form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const expected: number[] = [];
      for (const { label, roomType } of roomsAreaRoomTypes) {
        expected.push(
          await createRoomOfType(apiSdk, "owner", `Page ${label}`, roomType),
        );
      }
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Page FormFilling",
        RoomType.FillingFormsRoom,
      );

      const seen: number[] = [];
      for (let startIndex = 0; startIndex < expected.length; startIndex++) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          count: 1,
          startIndex,
        });
        expect(status).toBe(200);
        // total stays the size of the filtered section, not of the page
        expect(data.response!.total).toBe(expected.length);
        expect(data.response!.startIndex).toBe(startIndex);
        seen.push(...folderIds(data));
      }

      expect(seen.sort()).toEqual([...expected].sort());
      expect(seen).not.toContain(ffrId);

      // walking one page past the end yields nothing rather than the FFR
      const { data: past } = await ownerApi.rooms.getRoomsFolder({
        count: 1,
        startIndex: expected.length,
      });
      expect(folderIds(past)).toEqual([]);
    });

    test("GET /files/rooms - Sorting the Rooms section never surfaces a form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "AAA Sort Custom",
        RoomType.CustomRoom,
      );
      // titles chosen so the FFR would sort first ascending and first descending
      const ffrLow = await createRoomOfType(
        apiSdk,
        "owner",
        "AAA Sort Form",
        RoomType.FillingFormsRoom,
      );
      const ffrHigh = await createRoomOfType(
        apiSdk,
        "owner",
        "ZZZ Sort Form",
        RoomType.FillingFormsRoom,
      );

      for (const sortOrder of [SortOrder.Ascending, SortOrder.Descending]) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          sortBy: "AZ",
          sortOrder,
        });
        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([customId]);
        expect(folderIds(data)).not.toContain(ffrLow);
        expect(folderIds(data)).not.toContain(ffrHigh);
      }
    });

    test("GET /files/rooms - filterValue matching both sections returns only the Rooms-section room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "Shared Prefix Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Shared Prefix Form",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "Shared Prefix",
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([customId]);
      expect(folderIds(data)).not.toContain(ffrId);
      expect(data.response!.total).toBe(1);
    });

    test("GET /files/rooms - filterValue matching only a form filling room returns an empty Rooms section", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      // positive control: a Rooms-section room exists, so an empty result cannot
      // be an artifact of an empty portal or a failing read
      await createRoomOfType(
        apiSdk,
        "owner",
        "Control Custom",
        RoomType.CustomRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        "Only Form Match",
        RoomType.FillingFormsRoom,
      );

      const { data: control } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "Control Custom",
      });
      expect(folderTitles(control)).toEqual(["Control Custom"]);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        filterValue: "Only Form Match",
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([]);
      expect(data.response!.total).toBe(0);
      expect(data.response!.count).toBe(0);
    });
  });

  test.describe("GET /files/rooms?searchArea=Forms - the Forms section", () => {
    test("GET /files/rooms - Forms section lists the form filling room and reports the Forms root", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "Sect Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Sect Form",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([ffrId]);
      expect(folderIds(data)).not.toContain(customId);
      expect(folderRoomTypes(data)).toEqual([RoomType.FillingFormsRoom]);
      expect(data.response!.total).toBe(1);

      const current = data.response!.current!;
      expect(current.rootFolderType).toBe(FolderType.Forms);
      expect(current.title).toBe("Forms");

      // the Forms root is a different folder from the Rooms root
      const { data: roomsArea } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Active,
      });
      expect(current.id).not.toBe(roomsArea.response!.current!.id);
      expect(roomsArea.response!.current!.rootFolderType).toBe(
        FolderType.VirtualRooms,
      );
    });

    test("GET /files/rooms - Forms section returns several form filling rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ids: number[] = [];
      for (const n of ["One", "Two", "Three"]) {
        ids.push(
          await createRoomOfType(
            apiSdk,
            "owner",
            `Multi Form ${n}`,
            RoomType.FillingFormsRoom,
          ),
        );
      }

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });

      expect(status).toBe(200);
      expect(folderIds(data).sort()).toEqual([...ids].sort());
      expect(data.response!.total).toBe(ids.length);
      expect(new Set(folderRoomTypes(data))).toEqual(
        new Set([RoomType.FillingFormsRoom]),
      );
    });

    test("GET /files/rooms - Forms section finds a room by full and partial title", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Searchable Form Room",
        RoomType.FillingFormsRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        "Unrelated Form",
        RoomType.FillingFormsRoom,
      );

      for (const filterValue of [
        "Searchable Form Room",
        "Searchable",
        "searchable form",
      ]) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
          filterValue,
        });
        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([ffrId]);
      }
    });

    test("GET /files/rooms - Forms section does not return a same-named room of another type", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const title = "Identical Title Room";
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        title,
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        title,
        RoomType.FillingFormsRoom,
      );

      const { data: forms, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        filterValue: title,
      });
      expect(status).toBe(200);
      expect(folderIds(forms)).toEqual([ffrId]);

      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Active,
        filterValue: title,
      });
      expect(folderIds(rooms)).toEqual([customId]);
    });

    test("GET /files/rooms - Forms section search for a Rooms-section title returns empty", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createRoomOfType(
        apiSdk,
        "owner",
        "Rooms Only Title",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Forms Control Room",
        RoomType.FillingFormsRoom,
      );

      // positive control on the same area
      const { data: control } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        filterValue: "Forms Control Room",
      });
      expect(folderIds(control)).toEqual([ffrId]);

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        filterValue: "Rooms Only Title",
      });
      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([]);
      expect(data.response!.total).toBe(0);
    });

    test("GET /files/rooms - Forms section pagination keeps total at the section size", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ids: number[] = [];
      for (const n of ["A", "B", "C"]) {
        ids.push(
          await createRoomOfType(
            apiSdk,
            "owner",
            `Paged Form ${n}`,
            RoomType.FillingFormsRoom,
          ),
        );
      }
      await createRoomOfType(
        apiSdk,
        "owner",
        "Paged Custom",
        RoomType.CustomRoom,
      );

      const seen: number[] = [];
      for (let startIndex = 0; startIndex < ids.length; startIndex++) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
          count: 1,
          startIndex,
        });
        expect(status).toBe(200);
        expect(data.response!.total).toBe(ids.length);
        expect(data.response!.count).toBe(1);
        expect(data.response!.startIndex).toBe(startIndex);
        expect(folderRoomTypes(data)).toEqual([RoomType.FillingFormsRoom]);
        seen.push(...folderIds(data));
      }

      expect(seen.sort()).toEqual([...ids].sort());
    });

    test("GET /files/rooms - Forms section sorting orders only form filling rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const a = await createRoomOfType(
        apiSdk,
        "owner",
        "AAA Ordered Form",
        RoomType.FillingFormsRoom,
      );
      const z = await createRoomOfType(
        apiSdk,
        "owner",
        "ZZZ Ordered Form",
        RoomType.FillingFormsRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        "MMM Ordered Custom",
        RoomType.CustomRoom,
      );

      const { data: asc } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
      });
      expect(folderIds(asc)).toEqual([a, z]);

      const { data: desc } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        sortBy: "AZ",
        sortOrder: SortOrder.Descending,
      });
      expect(folderIds(desc)).toEqual([z, a]);
    });

    test("GET /files/rooms - searchArea=Any spans both sections and each room appears once", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "Any Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Any Form",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Any,
      });

      expect(status).toBe(200);
      const ids = folderIds(data);
      expect(ids.sort()).toEqual([customId, ffrId].sort());
      expect(data.response!.total).toBe(2);
      // the same entity is not duplicated across the merged view
      expect(new Set(ids).size).toBe(ids.length);
      // and the id is stable across every selection that contains it
      const { data: formsOnly } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(formsOnly)).toEqual([ffrId]);
    });
  });

  test.describe("GET /files/rooms - explicit room type filter", () => {
    test("GET /files/rooms - type=FillingFormsRoom in the Forms section returns only form filling rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Typed Form",
        RoomType.FillingFormsRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        "Typed Custom",
        RoomType.CustomRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        type: [RoomType.FillingFormsRoom],
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([ffrId]);
      expect(data.response!.total).toBe(1);
    });

    test("GET /files/rooms - type=FillingFormsRoom in the Rooms section returns nothing instead of leaking the room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Contradiction Form",
        RoomType.FillingFormsRoom,
      );

      // the Forms section is the positive control: the room does exist
      const { data: control } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        type: [RoomType.FillingFormsRoom],
      });
      expect(folderIds(control)).toEqual([ffrId]);

      for (const searchArea of [SearchArea.Active, undefined]) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea,
          type: [RoomType.FillingFormsRoom],
        });
        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([]);
        expect(data.response!.total).toBe(0);
        // the contradiction resolves to the requested area, not to Forms
        expect(data.response!.current!.rootFolderType).toBe(
          FolderType.VirtualRooms,
        );
      }
    });

    test("GET /files/rooms - Rooms-section types in the Forms section return nothing", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      for (const { label, roomType } of roomsAreaRoomTypes) {
        await createRoomOfType(apiSdk, "owner", `Cross ${label}`, roomType);
      }
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Cross Form",
        RoomType.FillingFormsRoom,
      );

      for (const { roomType } of roomsAreaRoomTypes) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
          type: [roomType],
        });
        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([]);
        expect(data.response!.total).toBe(0);
      }

      // the section itself is not broken by the preceding queries
      const { data: after } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(after)).toEqual([ffrId]);
    });

    test("GET /files/rooms - Rooms-section types are unaffected by the Forms split", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const byType = new Map<RoomType, number>();
      for (const { label, roomType } of roomsAreaRoomTypes) {
        byType.set(
          roomType,
          await createRoomOfType(apiSdk, "owner", `Kept ${label}`, roomType),
        );
      }
      await createRoomOfType(
        apiSdk,
        "owner",
        "Kept Form",
        RoomType.FillingFormsRoom,
      );

      for (const [roomType, id] of byType) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          type: [roomType],
        });
        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([id]);
        expect(folderRoomTypes(data)).toEqual([roomType]);
      }
    });

    test("GET /files/rooms - Multiple types including FillingFormsRoom stay inside the requested area", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "Mixed Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Mixed Form",
        RoomType.FillingFormsRoom,
      );

      const { data: rooms, status } = await ownerApi.rooms.getRoomsFolder({
        type: [RoomType.CustomRoom, RoomType.FillingFormsRoom],
      });
      expect(status).toBe(200);
      expect(folderIds(rooms)).toEqual([customId]);

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
        type: [RoomType.CustomRoom, RoomType.FillingFormsRoom],
      });
      expect(folderIds(forms)).toEqual([ffrId]);

      const { data: any_ } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Any,
        type: [RoomType.CustomRoom, RoomType.FillingFormsRoom],
      });
      expect(folderIds(any_).sort()).toEqual([customId, ffrId].sort());
    });

    // Rejected outright rather than treated as "no type filter", which would
    // silently widen the selection.
    const rejectedTypes: { label: string; value: unknown }[] = [
      { label: "unknown value 999", value: [999] },
      { label: "non-numeric string", value: ["abc"] },
      { label: "empty string", value: [""] },
      { label: "zero", value: [0] },
      { label: "negative", value: [-1] },
      { label: "fractional", value: [1.5] },
      { label: "Int32 overflow", value: [Number.MAX_SAFE_INTEGER] },
      { label: "boolean", value: [true] },
    ];

    for (const { label, value } of rejectedTypes) {
      test(`GET /files/rooms - Forms section rejects type ${label} with 400`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
          type: value as never,
        });
        expect(status).toBe(400);
      });
    }

    test("GET /files/rooms - Forms section treats a null type as no type filter", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Null Type Form",
        RoomType.FillingFormsRoom,
      );

      for (const value of [null, [null]]) {
        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
          type: value as never,
        });
        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([ffrId]);
      }
    });
  });

  test.describe("GET /files/rooms - searchArea validation", () => {
    const rejected: { label: string; value: unknown }[] = [
      { label: "out-of-range 99", value: 99 },
      { label: "non-numeric string", value: "abc" },
      { label: "boolean", value: true },
      { label: "negative", value: -1 },
      { label: "fractional", value: 1.5 },
      { label: "Int32 overflow", value: Number.MAX_SAFE_INTEGER },
      { label: "over-long string", value: "F".repeat(300) },
    ];

    for (const { label, value } of rejected) {
      test(`GET /files/rooms - searchArea ${label} returns 400, not 500`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await createRoomOfType(
          apiSdk,
          "owner",
          "Validation Form",
          RoomType.FillingFormsRoom,
        );

        const { status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: value as never,
        });
        expect(status).toBe(400);
      });
    }

    // Empty / absent values bind to the enum default, which is Active - the
    // section that excludes form filling rooms. The fallback is therefore safe:
    // it cannot leak a form room into the Rooms view.
    const fallsBackToActive: { label: string; value: unknown }[] = [
      { label: "empty string", value: "" },
      { label: "whitespace string", value: "   " },
      { label: "null", value: null },
      { label: "object", value: { area: 8 } },
    ];

    for (const { label, value } of fallsBackToActive) {
      test(`GET /files/rooms - searchArea ${label} falls back to Active without leaking a form room`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const customId = await createRoomOfType(
          apiSdk,
          "owner",
          "Fallback Custom",
          RoomType.CustomRoom,
        );
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Fallback Form",
          RoomType.FillingFormsRoom,
        );

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: value as never,
        });

        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([customId]);
        expect(folderIds(data)).not.toContain(ffrId);
        expect(data.response!.current!.rootFolderType).toBe(
          FolderType.VirtualRooms,
        );
      });
    }

    // The enum binds by name as well as by number, case-insensitively.
    const nameAliases = ["Forms", "forms", "FORMS"];
    for (const alias of nameAliases) {
      test(`GET /files/rooms - searchArea="${alias}" resolves to the Forms section`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await createRoomOfType(
          apiSdk,
          "owner",
          "Alias Custom",
          RoomType.CustomRoom,
        );
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Alias Form",
          RoomType.FillingFormsRoom,
        );

        const { data, status } = await ownerApi.rooms.getRoomsFolder({
          searchArea: alias as never,
        });

        expect(status).toBe(200);
        expect(folderIds(data)).toEqual([ffrId]);
        expect(data.response!.current!.rootFolderType).toBe(FolderType.Forms);
      });
    }

    test("GET /files/rooms - searchArea as a single-element array resolves to that area", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createRoomOfType(
        apiSdk,
        "owner",
        "Array Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Array Form",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea: [SearchArea.Forms] as never,
      });

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([ffrId]);
      expect(data.response!.current!.rootFolderType).toBe(FolderType.Forms);
    });
  });

  test.describe("GET /files/@forms - the dedicated Forms endpoint", () => {
    test("GET /files/@forms - Returns the form filling rooms and the Forms root", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "At Custom",
        RoomType.CustomRoom,
      );
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "At Form",
        RoomType.FillingFormsRoom,
      );

      const { data, status } = await ownerApi.folders.getFormsFolder({});

      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([ffrId]);
      expect(folderIds(data)).not.toContain(customId);
      expect(folderRoomTypes(data)).toEqual([RoomType.FillingFormsRoom]);
      expect(data.response!.current!.rootFolderType).toBe(FolderType.Forms);
      expect(data.response!.current!.title).toBe("Forms");
      expect(data.response!.total).toBe(1);
    });

    test("GET /files/@forms - Matches GET /files/rooms?searchArea=Forms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      for (const n of ["One", "Two"]) {
        await createRoomOfType(
          apiSdk,
          "owner",
          `Parity Form ${n}`,
          RoomType.FillingFormsRoom,
        );
      }
      await createRoomOfType(
        apiSdk,
        "owner",
        "Parity Custom",
        RoomType.CustomRoom,
      );

      const { data: viaFolders } = await ownerApi.folders.getFormsFolder({});
      const { data: viaRooms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });

      expect(folderIds(viaFolders).sort()).toEqual(folderIds(viaRooms).sort());
      expect(viaFolders.response!.total).toBe(viaRooms.response!.total);
      expect(viaFolders.response!.current!.id).toBe(
        viaRooms.response!.current!.id,
      );
      expect(viaFolders.response!.current!.rootFolderType).toBe(
        viaRooms.response!.current!.rootFolderType,
      );
    });

    test("GET /files/@forms - filterValue searches within the Forms section only", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "At Searchable Form",
        RoomType.FillingFormsRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        "At Searchable Custom",
        RoomType.CustomRoom,
      );

      const { data: hit, status } = await ownerApi.folders.getFormsFolder({
        filterValue: "At Searchable",
      });
      expect(status).toBe(200);
      expect(folderIds(hit)).toEqual([ffrId]);

      const { data: miss } = await ownerApi.folders.getFormsFolder({
        filterValue: "At Searchable Custom",
      });
      expect(folderIds(miss)).toEqual([]);
      expect(miss.response!.total).toBe(0);
    });

    test("GET /files/@forms - Pagination and sorting stay within the section", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const a = await createRoomOfType(
        apiSdk,
        "owner",
        "AAA At Form",
        RoomType.FillingFormsRoom,
      );
      const z = await createRoomOfType(
        apiSdk,
        "owner",
        "ZZZ At Form",
        RoomType.FillingFormsRoom,
      );
      await createRoomOfType(
        apiSdk,
        "owner",
        "MMM At Custom",
        RoomType.CustomRoom,
      );

      const { data: asc } = await ownerApi.folders.getFormsFolder({
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
      });
      expect(folderIds(asc)).toEqual([a, z]);

      const { data: page } = await ownerApi.folders.getFormsFolder({
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
        count: 1,
        startIndex: 1,
      });
      expect(folderIds(page)).toEqual([z]);
      expect(page.response!.total).toBe(2);
      expect(page.response!.startIndex).toBe(1);
    });

    test("GET /files/@forms - Returns an empty section when no form filling room exists", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      // control: the portal is not empty, only the Forms section is
      const customId = await createRoomOfType(
        apiSdk,
        "owner",
        "Empty Case Custom",
        RoomType.CustomRoom,
      );
      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).toEqual([customId]);

      const { data, status } = await ownerApi.folders.getFormsFolder({});
      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([]);
      expect(data.response!.total).toBe(0);
      expect(data.response!.current!.rootFolderType).toBe(FolderType.Forms);
    });

    const badParams: { label: string; params: Record<string, unknown> }[] = [
      { label: "filterType 999", params: { filterType: 999 } },
      { label: "non-numeric filterType", params: { filterType: "abc" } },
      { label: "negative count", params: { count: -1 } },
      { label: "negative startIndex", params: { startIndex: -1 } },
      { label: "non-numeric count", params: { count: "abc" } },
      { label: "invalid sortOrder", params: { sortOrder: "sideways" } },
    ];

    for (const { label, params } of badParams) {
      test(`GET /files/@forms - ${label} returns 400, not 500`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { status } = await ownerApi.folders.getFormsFolder(
          params as never,
        );
        expect(status).toBe(400);
      });
    }
  });

  test.describe("GET /files/@root - the Forms root folder", () => {
    test("GET /files/@root - Forms is listed as its own root next to Rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.folders.getRootFolders({});

      expect(status).toBe(200);
      const roots = (data.response ?? []).map((r) => r.current!);
      const types = roots.map((c) => c.rootFolderType);

      expect(types).toContain(FolderType.Forms);
      expect(types).toContain(FolderType.VirtualRooms);
      expect(types).toContain(FolderType.Archive);

      const forms = roots.find((c) => c.rootFolderType === FolderType.Forms)!;
      const rooms = roots.find(
        (c) => c.rootFolderType === FolderType.VirtualRooms,
      )!;
      expect(forms.id).not.toBe(rooms.id);
      expect(forms.title).toBe("Forms");

      // exactly one Forms root, so the section is not duplicated
      expect(types.filter((t) => t === FolderType.Forms).length).toBe(1);
    });

    test("GET /files/@root - The Forms root id is the one the Forms listings report", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await createRoomOfType(
        apiSdk,
        "owner",
        "Root Link Form",
        RoomType.FillingFormsRoom,
      );

      const { data: roots } = await ownerApi.folders.getRootFolders({});
      const formsRoot = (roots.response ?? [])
        .map((r) => r.current!)
        .find((c) => c.rootFolderType === FolderType.Forms)!;

      const { data: viaRooms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      const { data: viaFolders } = await ownerApi.folders.getFormsFolder({});

      expect(viaRooms.response!.current!.id).toBe(formsRoot.id);
      expect(viaFolders.response!.current!.id).toBe(formsRoot.id);
    });
  });
});

test.describe("POST /files/rooms - form filling room creation after the Forms split", () => {
  test("POST /files/rooms - Owner still creates a form filling room and it lands in Forms only", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Created Form Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
    expect(data.response!.title).toBe("Created Form Room");
    const roomId = data.response!.id!;

    await test.step("readable by id with the same type", async () => {
      const { data: info, status: infoStatus } =
        await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(infoStatus).toBe(200);
      expect(info.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(info.response!.title).toBe("Created Form Room");
    });

    await test.step("listed in Forms and absent from Rooms", async () => {
      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toEqual([roomId]);

      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).not.toContain(roomId);
      expect(rooms.response!.total).toBe(0);
    });

    await test.step("owner and access rights are set", async () => {
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(info.response!.createdBy!.id).toBeDefined();
      expect(info.response!.security!.EditRoom).toBe(true);
      expect(info.response!.security!.Delete).toBe(true);
    });
  });

  test("POST /files/rooms - Optional creation parameters survive the section move", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Configured Form Room",
        roomType: RoomType.FillingFormsRoom,
        indexing: true,
        denyDownload: true,
        tags: ["FormsAreaTag"],
        color: "F2675A",
      },
    });

    expect(status).toBe(200);
    const roomId = data.response!.id!;

    // createRoom omits optional fields from its response - read them back
    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(info.response!.roomType).toBe(RoomType.FillingFormsRoom);
    expect(info.response!.indexing).toBe(true);
    expect(info.response!.denyDownload).toBe(true);
    expect(info.response!.tags).toContain("FormsAreaTag");

    const { data: forms } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });
    expect(folderIds(forms)).toEqual([roomId]);
  });

  test("POST /files/rooms - FillingFormsRoom auto-creates its primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoomOfType(
      apiSdk,
      "owner",
      "Linked Form Room",
      RoomType.FillingFormsRoom,
    );

    const { data, status } = await ownerApi.rooms.getRoomLinks({ id: roomId });
    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
  });

  test("POST /files/rooms - Repeated identical requests create distinct rooms, both in Forms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const dto = {
      title: "Duplicate Form Room",
      roomType: RoomType.FillingFormsRoom,
    };

    const { data: first, status: firstStatus } =
      await ownerApi.rooms.createRoom({ createRoomRequestDto: dto });
    const { data: second, status: secondStatus } =
      await ownerApi.rooms.createRoom({ createRoomRequestDto: dto });

    expect(firstStatus).toBe(200);
    expect(secondStatus).toBe(200);
    const firstId = first.response!.id!;
    const secondId = second.response!.id!;
    expect(secondId).not.toBe(firstId);

    // no idempotency is claimed by the API: both rooms exist, in Forms only
    const { data: forms } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });
    expect(folderIds(forms).sort()).toEqual([firstId, secondId].sort());
    expect(forms.response!.total).toBe(2);

    const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
    expect(rooms.response!.total).toBe(0);
  });

  test.describe("validation", () => {
    const rejected: { label: string; dto: Record<string, unknown> }[] = [
      { label: "missing title", dto: { roomType: RoomType.FillingFormsRoom } },
      {
        label: "empty title",
        dto: { title: "", roomType: RoomType.FillingFormsRoom },
      },
      {
        label: "whitespace-only title",
        dto: { title: "   ", roomType: RoomType.FillingFormsRoom },
      },
      {
        label: "null title",
        dto: { title: null, roomType: RoomType.FillingFormsRoom },
      },
      {
        label: "numeric title",
        dto: { title: 42, roomType: RoomType.FillingFormsRoom },
      },
      {
        label: "object title",
        dto: { title: { a: 1 }, roomType: RoomType.FillingFormsRoom },
      },
      {
        label: "1000-char title",
        dto: { title: "F".repeat(1000), roomType: RoomType.FillingFormsRoom },
      },
      { label: "missing roomType", dto: { title: "No Type Room" } },
      { label: "null roomType", dto: { title: "Null Type", roomType: null } },
      {
        label: "unknown roomType 7",
        dto: { title: "Unknown Type", roomType: 7 },
      },
      {
        label: "negative roomType",
        dto: { title: "Negative Type", roomType: -1 },
      },
      {
        label: "Int32-overflow roomType",
        dto: { title: "Huge Type", roomType: Number.MAX_SAFE_INTEGER },
      },
      {
        label: "object roomType",
        dto: { title: "Object Type", roomType: { t: 1 } },
      },
    ];

    for (const { label, dto } of rejected) {
      test(`POST /files/rooms - ${label} is rejected with 400 and creates nothing in Forms`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const { status } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: dto as never,
        });
        expect(status).toBe(400);

        const { data: forms } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
        });
        expect(folderIds(forms)).toEqual([]);
      });
    }

    test("POST /files/rooms - A numeric-string roomType is coerced and creates a real form filling room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "String Type Form",
          roomType: String(RoomType.FillingFormsRoom) as never,
        },
      });

      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
      const roomId = data.response!.id!;

      // the coerced value produces a room in the Forms section, not a stray
      // entity in the Rooms section
      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toEqual([roomId]);
      const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).not.toContain(roomId);
    });

    test("POST /files/rooms - FillingFormsRoom rejects the private flag with 403", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Private Form Room",
          roomType: RoomType.FillingFormsRoom,
          private: true,
        },
      });

      expect(status).toBe(403);

      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toEqual([]);
    });
  });
});

test.describe("GET /files/rooms/:id - direct access after the Forms split", () => {
  test("GET /files/rooms/:id - A form filling room keeps its type and is reachable by id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Direct Form",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Direct Custom",
      RoomType.CustomRoom,
    );

    const { data: ffr, status } = await ownerApi.rooms.getRoomInfo({
      id: ffrId,
    });
    expect(status).toBe(200);
    expect(ffr.response!.roomType).toBe(RoomType.FillingFormsRoom);
    expect(ffr.response!.title).toBe("Direct Form");

    const { data: custom, status: customStatus } =
      await ownerApi.rooms.getRoomInfo({ id: customId });
    expect(customStatus).toBe(200);
    expect(custom.response!.roomType).toBe(RoomType.CustomRoom);
  });

  test("GET /files/rooms/:id - The Forms section is a view: the room still reports the Rooms root as its parent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Parent Form",
      RoomType.FillingFormsRoom,
    );

    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: ffrId });
    const { data: roomsArea } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Active,
    });
    const { data: formsArea } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });

    // Moving the section did not re-parent the entity: rootFolderType stays
    // VirtualRooms and parentId stays the Rooms root, while the listing that
    // returns it reports the Forms root.
    expect(info.response!.rootFolderType).toBe(FolderType.VirtualRooms);
    expect(info.response!.parentId).toBe(roomsArea.response!.current!.id);
    expect(formsArea.response!.current!.rootFolderType).toBe(FolderType.Forms);
  });

  test("GET /files/rooms/:id - Access by id does not depend on the section used to find the room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Stable Access Form",
      RoomType.FillingFormsRoom,
    );

    for (const searchArea of [
      SearchArea.Active,
      SearchArea.Forms,
      SearchArea.Any,
      undefined,
    ]) {
      await ownerApi.rooms.getRoomsFolder({ searchArea });
      const { data, status } = await ownerApi.rooms.getRoomInfo({ id: ffrId });
      expect(status).toBe(200);
      expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
      expect(data.response!.id).toBe(ffrId);
    }
  });

  test("GET /files/rooms/:id - A deleted form filling room returns 404, not 200 with a null body", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Gone Form",
      RoomType.FillingFormsRoom,
    );

    await ownerApi.rooms.deleteRoom({
      id: ffrId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: ffrId });
    expect(status).toBe(404);
    expect(data.response).toBeUndefined();
  });
});

/**
 * Deleting a room is not a move to Trash. Verified live: after deleteRoom the
 * room is absent from Forms, Rooms, Any, Archive AND /files/@trash, and
 * getRoomInfo answers 404. Archive - not Trash - is the recoverable state for
 * rooms, and it is a single shared area rather than one per section.
 */
test.describe("Deleting and archiving a form filling room", () => {
  test("DELETE /files/rooms/:id - A deleted form filling room disappears from every section including Trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Deleted Form Room",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Deleted Custom Room",
      RoomType.CustomRoom,
    );

    for (const id of [ffrId, customId]) {
      const { status } = await ownerApi.rooms.deleteRoom({
        id,
        deleteRoomRequest: { deleteAfter: false },
      });
      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);
    }

    for (const searchArea of [
      SearchArea.Forms,
      SearchArea.Active,
      SearchArea.Any,
      SearchArea.Archive,
    ]) {
      const { data, status } = await ownerApi.rooms.getRoomsFolder({
        searchArea,
      });
      expect(status).toBe(200);
      expect(folderIds(data)).not.toContain(ffrId);
      expect(folderIds(data)).not.toContain(customId);
    }

    const { data: trash, status: trashStatus } =
      await ownerApi.folders.getTrashFolder({});
    expect(trashStatus).toBe(200);
    expect(folderIds(trash)).not.toContain(ffrId);
    expect(folderIds(trash)).not.toContain(customId);
    expect(trash.response!.total).toBe(0);

    expect((await ownerApi.rooms.getRoomInfo({ id: ffrId })).status).toBe(404);
  });

  test("PUT /files/rooms/:id/archive - An archived form filling room leaves Forms for the shared Archive", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Archived Form Room",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Archived Custom Room",
      RoomType.CustomRoom,
    );

    for (const id of [ffrId, customId]) {
      const { status } = await ownerApi.rooms.archiveRoom({
        id,
        archiveRoomRequest: { deleteAfter: false },
      });
      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);
    }

    const { data: archive, status } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Archive,
    });
    expect(status).toBe(200);
    // one Archive holds both sections' rooms - archiving is not split by Forms
    expect(folderIds(archive).sort()).toEqual([ffrId, customId].sort());
    expect(archive.response!.current!.rootFolderType).toBe(FolderType.Archive);

    const { data: forms } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });
    expect(folderIds(forms)).toEqual([]);

    const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
    expect(folderIds(rooms)).toEqual([]);
  });

  test("PUT /files/rooms/:id/unarchive - Restoring a form filling room returns it to Forms and not to Rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Restored Form Room",
      RoomType.FillingFormsRoom,
    );

    await ownerApi.rooms.archiveRoom({
      id: ffrId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.rooms.unarchiveRoom({
      id: ffrId,
      archiveRoomRequest: { deleteAfter: false },
    });
    expect(status).toBe(200);
    await waitForOperation(ownerApi.operations);

    const { data: forms } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });
    expect(folderIds(forms)).toEqual([ffrId]);
    expect(folderRoomTypes(forms)).toEqual([RoomType.FillingFormsRoom]);

    const { data: rooms } = await ownerApi.rooms.getRoomsFolder({});
    expect(folderIds(rooms)).not.toContain(ffrId);

    const { data: archive } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Archive,
    });
    expect(folderIds(archive)).toEqual([]);
  });

  test("DELETE /files/rooms/:id - A form filling room holding a form is deleted with it", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Populated Form Room",
      RoomType.FillingFormsRoom,
    );
    const formFileId = await createOoForm(ownerApi, ffrId);
    expect(formFileId).toBeGreaterThan(0);

    await ownerApi.rooms.deleteRoom({
      id: ffrId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: forms } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });
    expect(folderIds(forms)).toEqual([]);
    expect((await ownerApi.rooms.getRoomInfo({ id: ffrId })).status).toBe(404);
    expect(
      (await ownerApi.files.getFileInfo({ fileId: formFileId })).status,
    ).toBe(404);
  });
});

/**
 * Recent is a file-level section reached through GET /files/recent. It accepts a
 * searchArea parameter, but live probing shows the parameter has no effect: the
 * same set of files comes back for Forms, Active, Any and for no value at all,
 * so a file inside a form filling room shows up in the Rooms-section Recent and
 * a file from a Rooms-section room shows up in the Forms Recent.
 */
test.describe("GET /files/recent - the Forms section", () => {
  async function seedRecent(apiSdk: ApiSDK) {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Recent Form Room",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Recent Custom Room",
      RoomType.CustomRoom,
    );

    // a form filling room only accepts ONLYOFFICE PDF forms
    const formFileId = await createOoForm(ownerApi, ffrId);
    const { data: docx } = await ownerApi.files.createFile({
      folderId: customId,
      createFileJsonElement: { title: "recent-in-custom.docx" },
    });
    const docxId = docx.response!.id!;

    expect(
      (await ownerApi.files.addFileToRecent({ fileId: formFileId })).status,
    ).toBe(200);
    expect(
      (await ownerApi.files.addFileToRecent({ fileId: docxId })).status,
    ).toBe(200);

    const { data: formInfo } = await ownerApi.files.getFileInfo({
      fileId: formFileId,
    });
    return {
      ffrId,
      customId,
      formFileId,
      docxId,
      formFileTitle: formInfo.response!.title!,
    };
  }

  test.fail(
    "BUG XXXXX: GET /files/recent - searchArea=Forms must not return a file from a Rooms-section room",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { formFileId, docxId } = await seedRecent(apiSdk);

      const { data, status } = await ownerApi.folders.getRecentFolder({
        searchArea: SearchArea.Forms,
      });

      expect(status).toBe(200);
      const ids = ((data.response!.files ?? []) as { id: number }[]).map(
        (f) => f.id,
      );
      // the form is expected here
      expect(ids).toContain(formFileId);
      // the file from the Custom room is not - searchArea is currently ignored
      expect(ids).not.toContain(docxId);
    },
  );

  test.fail(
    "BUG XXXXX: GET /files/recent - searchArea=Active must not return a file from a form filling room",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { formFileId, docxId } = await seedRecent(apiSdk);

      const { data, status } = await ownerApi.folders.getRecentFolder({
        searchArea: SearchArea.Active,
      });

      expect(status).toBe(200);
      const ids = ((data.response!.files ?? []) as { id: number }[]).map(
        (f) => f.id,
      );
      expect(ids).toContain(docxId);
      expect(ids).not.toContain(formFileId);
    },
  );

  test.fail(
    "BUG XXXXX: GET /files/recent - searchArea=Forms search must not match a Rooms-section file",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { docxId } = await seedRecent(apiSdk);

      const { data, status } = await ownerApi.folders.getRecentFolder({
        searchArea: SearchArea.Forms,
        filterValue: "recent-in-custom",
      });

      expect(status).toBe(200);
      const ids = ((data.response!.files ?? []) as { id: number }[]).map(
        (f) => f.id,
      );
      expect(ids).not.toContain(docxId);
      expect(data.response!.total).toBe(0);
    },
  );

  test.fail(
    "BUG XXXXX: GET /files/recent - total must count the whole selection, not the current page",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await seedRecent(apiSdk);

      const { data: all } = await ownerApi.folders.getRecentFolder({});
      expect(all.response!.total).toBe(2);

      const { data: page, status } = await ownerApi.folders.getRecentFolder({
        count: 1,
      });
      expect(status).toBe(200);
      expect(page.response!.count).toBe(1);
      // total currently collapses to the page size
      expect(page.response!.total).toBe(2);
    },
  );

  test("GET /files/recent - Deleting a form filling room drops its file from Recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { ffrId, formFileId, docxId } = await seedRecent(apiSdk);

    const { data: before } = await ownerApi.folders.getRecentFolder({});
    const beforeIds = ((before.response!.files ?? []) as { id: number }[]).map(
      (f) => f.id,
    );
    expect(beforeIds).toContain(formFileId);
    expect(beforeIds).toContain(docxId);

    await ownerApi.rooms.deleteRoom({
      id: ffrId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: after, status } = await ownerApi.folders.getRecentFolder({});
    expect(status).toBe(200);
    const afterIds = ((after.response!.files ?? []) as { id: number }[]).map(
      (f) => f.id,
    );
    expect(afterIds).not.toContain(formFileId);
    // the surviving room's file is untouched
    expect(afterIds).toContain(docxId);
  });

  test("GET /files/recent - Recent lists files only, never the form filling room itself", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { ffrId, formFileTitle } = await seedRecent(apiSdk);

    for (const searchArea of [SearchArea.Forms, SearchArea.Active, undefined]) {
      const { data, status } = await ownerApi.folders.getRecentFolder({
        searchArea,
      });
      expect(status).toBe(200);
      expect(folderIds(data)).toEqual([]);
      expect(folderIds(data)).not.toContain(ffrId);
      expect(data.response!.current!.rootFolderType).toBe(FolderType.Recent);
    }

    const { data: forms } = await ownerApi.folders.getRecentFolder({
      searchArea: SearchArea.Forms,
    });
    expect(fileTitles(forms)).toContain(formFileTitle);
  });

  test("GET /files/recent - An out-of-range searchArea returns 400, not 500", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { status } = await ownerApi.folders.getRecentFolder({
      searchArea: 999 as never,
    });
    expect(status).toBe(400);
  });
});

/**
 * Favorites is a single per-user collection at GET /files/@favorites. It has no
 * searchArea parameter, so there is no server-side Forms/Rooms split: a
 * favorited form filling room and a favorited Custom room come back from the
 * same list. Any per-section presentation is a client concern. What the API does
 * guarantee - and what is asserted here - is the write path, per-user isolation
 * and that access control is respected on read.
 */
test.describe("Favorites and form filling rooms", () => {
  test("POST /files/favorites - A form filling room can be favorited and read back", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Form Room",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Custom Room",
      RoomType.CustomRoom,
    );

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
    });
    expect(status).toBe(200);
    expect(data.response).toBe(true);

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [customId as never], fileIds: [] },
    });

    const { data: favorites, status: favStatus } =
      await ownerApi.folders.getFavoritesFolder({});
    expect(favStatus).toBe(200);
    expect(favorites.response!.current!.rootFolderType).toBe(
      FolderType.Favorites,
    );
    // one undivided list: both sections' rooms are present
    expect(folderIds(favorites).sort()).toEqual([ffrId, customId].sort());
    expect(favorites.response!.total).toBe(2);
    expect(folderRoomTypes(favorites)).toContain(RoomType.FillingFormsRoom);
  });

  test("POST /files/favorites - Favoriting the same form filling room twice creates no duplicate", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Dupe Form",
      RoomType.FillingFormsRoom,
    );

    for (const attempt of [1, 2]) {
      const { status } = await ownerApi.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
      });
      expect(status, `attempt ${attempt}`).toBe(200);
    }

    const { data } = await ownerApi.folders.getFavoritesFolder({});
    expect(folderIds(data)).toEqual([ffrId]);
    expect(data.response!.total).toBe(1);
  });

  test("DELETE /files/favorites - Removing a form filling room from Favorites leaves the room itself intact", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Removed Form",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Kept Custom",
      RoomType.CustomRoom,
    );

    for (const id of [ffrId, customId]) {
      await ownerApi.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [id as never], fileIds: [] },
      });
    }

    const { status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
    });
    expect(status).toBe(200);

    const { data: favorites } = await ownerApi.folders.getFavoritesFolder({});
    expect(folderIds(favorites)).toEqual([customId]);

    // unfavoriting is not a delete: the room is still in the Forms section
    const { data: forms } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.Forms,
    });
    expect(folderIds(forms)).toEqual([ffrId]);
    expect((await ownerApi.rooms.getRoomInfo({ id: ffrId })).status).toBe(200);
  });

  /** Two favorited form rooms plus one that is deliberately not favorited. */
  async function seedFavorites(apiSdk: ApiSDK) {
    const ownerApi = apiSdk.forRole("owner");
    const aForm = await createRoomOfType(
      apiSdk,
      "owner",
      "AAA Fav Form",
      RoomType.FillingFormsRoom,
    );
    const zForm = await createRoomOfType(
      apiSdk,
      "owner",
      "ZZZ Fav Form",
      RoomType.FillingFormsRoom,
    );
    const unfavored = await createRoomOfType(
      apiSdk,
      "owner",
      "MMM Fav Form Excluded",
      RoomType.FillingFormsRoom,
    );

    for (const id of [aForm, zForm]) {
      await ownerApi.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [id as never], fileIds: [] },
      });
    }
    return { aForm, zForm, unfavored };
  }

  test("GET /files/@favorites - Search and sorting stay inside the caller's Favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { aForm, zForm, unfavored } = await seedFavorites(apiSdk);

    const { data: asc, status } = await ownerApi.folders.getFavoritesFolder({
      sortBy: "AZ",
      sortOrder: SortOrder.Ascending,
    });
    expect(status).toBe(200);
    expect(folderIds(asc)).toEqual([aForm, zForm]);
    expect(folderIds(asc)).not.toContain(unfavored);

    const { data: desc } = await ownerApi.folders.getFavoritesFolder({
      sortBy: "AZ",
      sortOrder: SortOrder.Descending,
    });
    expect(folderIds(desc)).toEqual([zForm, aForm]);

    const { data: search } = await ownerApi.folders.getFavoritesFolder({
      filterValue: "AAA Fav",
    });
    expect(folderIds(search)).toEqual([aForm]);
    expect(search.response!.total).toBe(1);
  });

  test.fail(
    "BUG XXXXX: GET /files/@favorites - count together with startIndex returns an empty page",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { aForm, zForm } = await seedFavorites(apiSdk);

      // premise: both rooms are favorited and orderable
      const { data: asc } = await ownerApi.folders.getFavoritesFolder({
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
      });
      expect(folderIds(asc)).toEqual([aForm, zForm]);

      const { data: page, status } = await ownerApi.folders.getFavoritesFolder({
        sortBy: "AZ",
        sortOrder: SortOrder.Ascending,
        count: 1,
        startIndex: 1,
      });

      expect(status).toBe(200);
      // the second page comes back empty with count 0
      expect(folderIds(page)).toEqual([zForm]);
    },
  );

  test.fail(
    "BUG XXXXX: GET /files/@favorites - total must count the whole selection, not the current page",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await seedFavorites(apiSdk);

      const { data: all } = await ownerApi.folders.getFavoritesFolder({});
      expect(all.response!.total).toBe(2);

      const { data: page, status } = await ownerApi.folders.getFavoritesFolder({
        count: 1,
      });
      expect(status).toBe(200);
      expect(page.response!.count).toBe(1);
      // total currently collapses to the page size
      expect(page.response!.total).toBe(2);
    },
  );

  test("GET /files/@favorites - Archiving a favorited form filling room keeps it in Favorites under the Archive root", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Archived Form",
      RoomType.FillingFormsRoom,
    );
    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
    });

    await ownerApi.rooms.archiveRoom({
      id: ffrId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});
    expect(status).toBe(200);
    expect(folderIds(data)).toEqual([ffrId]);
    // the entry now reports the Archive root, so the state change is visible
    const rootTypes = (
      (data.response!.folders ?? []) as { rootFolderType: number }[]
    ).map((f) => f.rootFolderType);
    expect(rootTypes).toEqual([FolderType.Archive]);
  });

  test("GET /files/@favorites - Deleting a favorited form filling room removes it from Favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const ffrId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Deleted Form",
      RoomType.FillingFormsRoom,
    );
    const customId = await createRoomOfType(
      apiSdk,
      "owner",
      "Fav Survivor Custom",
      RoomType.CustomRoom,
    );
    for (const id of [ffrId, customId]) {
      await ownerApi.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [id as never], fileIds: [] },
      });
    }

    await ownerApi.rooms.deleteRoom({
      id: ffrId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});
    expect(status).toBe(200);
    expect(folderIds(data)).toEqual([customId]);
    expect(folderIds(data)).not.toContain(ffrId);
  });
});
