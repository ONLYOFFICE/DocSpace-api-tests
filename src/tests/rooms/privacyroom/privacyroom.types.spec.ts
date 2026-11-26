import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { ensureEncryptionKeys } from "@/src/helpers/rooms";
import { expectNoServerError } from "@/src/helpers/private-room-lifecycle";

/**
 * Types that cannot be created even as an ordinary room by the test account, so no positive
 * control exists for them. The test is then reported as SKIPPED with the reason (an environment
 * limitation, not a product defect); any other type without a control fails the test.
 */
const NO_CONTROL_TYPES = [
  "KnowledgeRoom",
  // An ordinary AiProjectRoom answers 403 on a test portal without the AI gateway (3/3 runs, 2026-11-26).
  "AiProjectRoom",
];

/**
 * Which room types may be private (PR-ROOM-008/015, SPEC-013).
 *
 * Confirmed by the developers: only a Custom room can be private, and creating a
 * private room of any other type is forbidden. A private virtual data room can
 * still be created on the current stand - a known defect, fixed in the product
 * but not yet delivered to the stand; its test is a `test.fail` until the stand
 * is updated, then the marker has to be removed (and the test kept as a plain
 * test) once the fix is confirmed there.
 *
 * Every type of the current SDK is tried. The positive control is an ordinary
 * room of the same type created by the same account: a type that cannot be
 * created even as an ordinary room gets NO CONTROL and proves nothing about
 * privacy. The contract does not define the status of a refusal, so none is
 * asserted: what is asserted is the state - a Custom room is created with its
 * private flag, any other type leaves no room behind.
 */

const isOk = (status: number) => status >= 200 && status < 300;

const attempt = async (apiSdk: ApiSDK, name: string, roomType: RoomType) => {
  const owner = apiSdk.forRole("owner");
  const ownerId = (await owner.profiles.getSelfProfile()).data.response!.id!;
  await ensureEncryptionKeys(apiSdk, "owner");
  const roomIds = async (area?: SearchArea) =>
    (
      ((await owner.rooms.getRoomsFolder({ searchArea: area, count: 100 })).data
        .response?.folders ?? []) as {
        id?: number;
      }[]
    )
      .map((f) => f.id)
      .sort();

  // The control: an ordinary room of this type.
  const ordinary = await owner.rooms.createRoom({
    createRoomRequestDto: { title: `Types ordinary ${name}`, roomType },
  });
  const ordinaryId = (ordinary.data?.response as { id?: number } | undefined)
    ?.id;
  if (!isOk(ordinary.status) || !ordinaryId) {
    test.skip(
      NO_CONTROL_TYPES.includes(name),
      `NO CONTROL: an ordinary ${name} room answers ${ordinary.status}; nothing is proved about privacy`,
    );
    expect(
      ordinary.status,
      `setup: an ordinary ${name} room must be created (control)`,
    ).toBe(200);
  }
  expect(
    (await owner.rooms.getRoomInfo({ id: ordinaryId! })).data.response
      ?.roomType,
  ).toBe(roomType);

  const before = {
    any: await roomIds(SearchArea.Any),
    priv: await roomIds(SearchArea.PrivateRooms),
  };
  const res = await owner.rooms.createRoom({
    createRoomRequestDto: {
      title: `Types private ${name}`,
      roomType,
      private: true,
    },
  });
  const id = (res.data?.response as { id?: number } | undefined)?.id;
  const created = isOk(res.status) && !!id;

  if (roomType === RoomType.CustomRoom) {
    expect(created, "a private Custom room is created").toBe(true);
    const info = (await owner.rooms.getRoomInfo({ id: id! })).data.response!;
    expect(info.private).toBe(true);
    expect(info.roomType).toBe(RoomType.CustomRoom);
    expect(info.createdBy?.id).toBe(ownerId);
    expect(await roomIds(SearchArea.PrivateRooms)).toContain(id);
    return;
  }
  // Any other type: no private room is left behind, in any list.
  const privateOnes = (await roomIds(SearchArea.PrivateRooms)).filter(
    (x) => !before.priv.includes(x),
  );
  expect(
    privateOnes,
    `a private ${name} room appeared in the private rooms list`,
  ).toEqual([]);
  expect(created, `a private ${name} room was created`).toBe(false);
  expect(
    (await roomIds(SearchArea.Any)).filter((x) => !before.any.includes(x)),
    `a room appeared in the list`,
  ).toEqual([]);
  // The state first, then the answer: a crash is not a correct refusal.
  expectNoServerError(res.status, `creating a private ${name} room`);
};

/**
 * The types that currently get a private room although only Custom may be private.
 * - VirtualDataRoom: the known defect, fixed by the developers, not yet on the stand.
 * - EditingRoom, AiRoom: created (200) - the same contract violation.
 * - FillingFormsRoom, PublicRoom: the request answers 403 but a private room of that
 *   type is left behind (a failed request with a side effect).
 * Each is a test.fail until the stand is updated; remove the marker (and keep the test)
 * when the fix is confirmed there.
 */
const KNOWN: Record<string, string> = {
  VirtualDataRoom: "is created (the fix is awaiting delivery to the stand)",
  EditingRoom: "is created",
  AiRoom: "is created",
  FillingFormsRoom: "answers 403 but leaves a private room behind",
  PublicRoom: "answers 403 but leaves a private room behind",
};

test.describe("POST /files/rooms - only a Custom room may be private", () => {
  for (const [name, roomType] of Object.entries(RoomType) as [
    string,
    RoomType,
  ][]) {
    if (KNOWN[name]) {
      test.fail(
        `BUG XXXXX: POST /files/rooms - A private ${name} room ${KNOWN[name]}`,
        async ({ apiSdk }) => {
          await attempt(apiSdk, name, roomType);
        },
      );
      continue;
    }
    test(`POST /files/rooms - A private ${name} room is ${roomType === RoomType.CustomRoom ? "created with its private flag" : "refused and leaves no room behind"}`, async ({
      apiSdk,
    }) => {
      await attempt(apiSdk, name, roomType);
    });
  }
});
