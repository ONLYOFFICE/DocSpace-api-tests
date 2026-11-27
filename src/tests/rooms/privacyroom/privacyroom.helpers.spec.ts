import { test, expect } from "@playwright/test";
import { SearchArea } from "@onlyoffice/docspace-api-sdk";
import { Api, okBody, okList } from "@/src/helpers/private-rooms";
import {
  ALL,
  assertUniqueIds,
  expectRefused,
  keysOf,
  listRoomIds,
  rawMembers,
  reach,
} from "@/src/helpers/private-room-lifecycle";
import {
  putFile,
  putFileOrRefusal,
  tryPut,
} from "@/src/helpers/private-room-arena";
import { roomState } from "@/src/helpers/private-room-roomkit";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { Scene } from "@/src/helpers/private-room-isolation";

/**
 * Self-checks of the shared helpers on ARTIFICIAL answers (no portal involved).
 * The package 7B helpers claim to refuse an HTTP 500, a transport error, a failed
 * list read, a failed key read, a duplicated member, an unfinished positive control,
 * a foreign operation and a failed operation. Each claim is proved here by feeding
 * the helper exactly that situation and requiring it to FAIL (or to report it).
 */

const ans = (status: number, response?: unknown) => ({
  status,
  data: response === undefined ? {} : { response },
});

const fails = async (what: string, fn: () => unknown) => {
  let message: string | undefined;
  try {
    await fn();
  } catch (e) {
    message = String(e);
  }
  expect(
    message,
    `${what}: the helper accepted the artificial failure`,
  ).toBeDefined();
  return message!;
};

const fake = (parts: Record<string, Record<string, unknown>>) =>
  parts as unknown as Api;

test.describe("helper self-checks (artificial answers, no portal)", () => {
  test("okBody / okList - an HTTP 500, a 403 or an empty body is never an empty result", async () => {
    await fails("500 with a body", () => okBody(ans(500, { a: 1 }), "x"));
    await fails("403", () => okBody(ans(403), "x"));
    await fails("200 without a body", () => okBody(ans(200), "x"));
    await fails("200 with null", () => okBody(ans(200, null), "x"));
    await fails("403 list", () => okList(ans(403) as never, "x"));
    await fails("200 list that is an object", () =>
      okList(ans(200, {}) as never, "x"),
    );
    expect(okBody(ans(200, { a: 1 }), "x")).toEqual({ a: 1 });
    expect(okList(ans(200, []) as never, "x")).toEqual([]);
  });

  test("rawMembers / keysOf - a failed read is not 'no members' or 'no keys'", async () => {
    const forbidden = fake({
      rooms: { getRoomSecurityInfo: async () => ans(403) },
      files: { getEncryptionInfo: async () => ans(403) },
    });
    await fails("members 403", () => rawMembers(forbidden, 1));
    await fails("keys 403", () => keysOf(forbidden, 1));
    const crashed = fake({
      rooms: { getRoomSecurityInfo: async () => ans(500) },
      files: { getEncryptionInfo: async () => ans(500) },
    });
    await fails("members 500", () => rawMembers(crashed, 1));
    await fails("keys 500", () => keysOf(crashed, 1));
    const ok = fake({
      rooms: {
        getRoomSecurityInfo: async () =>
          ans(200, [{ sharedTo: { id: "u1" }, access: 2 }]),
      },
      files: { getEncryptionInfo: async () => ans(200, { fileKeys: [] }) },
    });
    expect(await rawMembers(ok, 1)).toEqual([{ id: "u1", access: 2 }]);
    expect(await keysOf(ok, 1)).toBe("[]");
  });

  test("assertUniqueIds - a subject listed twice is found on the raw list", async () => {
    await fails("duplicate", () => assertUniqueIds(["a", "b", "a"]));
    expect(assertUniqueIds(["a", "b"])).toEqual(["a", "b"]);
    const twice = fake({
      rooms: {
        getRoomSecurityInfo: async () =>
          ans(200, [
            { sharedTo: { id: "o" }, access: 1 },
            { sharedTo: { id: "o" }, access: 2 },
          ]),
      },
    });
    const raw = await rawMembers(twice, 1);
    await fails("raw duplicate", () => assertUniqueIds(raw.map((m) => m.id)));
  });

  test("expectRefused - only a 4xx is a refusal", async () => {
    for (const bad of [200, 204, 500, 502])
      await fails(`status ${bad}`, () => expectRefused(bad, "x"));
    expectRefused(403, "x");
    expectRefused(404, "x");
  });

  test("reach - statuses are reported as they are, a 500 never equals a refusal, a failed list read throws", async () => {
    const scene = {
      roomId: 1,
      innerId: 2,
      rootFile: { id: 3 },
    } as unknown as Scene;
    const apiWith = (status: number, listStatus = 200, listed: number[] = []) =>
      fake({
        rooms: {
          getRoomInfo: async () => ans(status),
          getRoomsFolder: async () =>
            ans(listStatus, {
              folders: listed.map((id) => ({ id })),
              total: listed.length,
            }),
        },
        folders: { getFolderByFolderId: async () => ans(status) },
        files: {
          getFileInfo: async () => ans(status),
          getEncryptionInfo: async () => ans(status),
          getPresignedUri: async () => ans(status),
        },
        sharing: { getEncryptionAccess: async () => ans(status) },
      });
    expect(await reach(apiWith(200, 200, [1]), scene)).toEqual(ALL(true));
    expect(await reach(apiWith(403), scene)).toEqual(ALL(false));
    // A server error is not a refusal: it must not equal the "forbidden" shape.
    expect(await reach(apiWith(500), scene)).not.toEqual(ALL(false));
    // An empty list may only be believed when the list request itself succeeded.
    await fails("list 500", () => reach(apiWith(403, 500), scene));
    // A transport error is not an answer.
    const broken = fake({
      rooms: {
        getRoomInfo: async () => {
          throw new Error("ECONNRESET");
        },
      },
    });
    await fails("transport error", () => reach(broken, scene));
  });

  test("listRoomIds - walks every page and fails when a later page fails", async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: i }));
    let calls = 0;
    const paged = fake({
      rooms: {
        getRoomsFolder: async (p: { startIndex?: number }) => {
          calls++;
          const from = p.startIndex ?? 0;
          return ans(200, {
            folders: page(250).slice(from, from + 100),
            total: 250,
          });
        },
      },
    });
    expect((await listRoomIds(paged, SearchArea.Any)).length).toBe(250);
    expect(calls).toBe(3);
    const secondFails = fake({
      rooms: {
        getRoomsFolder: async (p: { startIndex?: number }) =>
          (p.startIndex ?? 0) === 0
            ? ans(200, { folders: page(100), total: 250 })
            : ans(500),
      },
    });
    await fails("page 2 fails", () => listRoomIds(secondFails, SearchArea.Any));
  });

  test("tryPut / putFile / putFileOrRefusal - a refusal, a server error and a transport error are three different things", async () => {
    const sessionApi = (open: number, send: number | Error) =>
      fake({
        operations: {
          createUploadSessionInFolder: async () =>
            ans(open, open === 200 ? { id: "s1" } : undefined),
          uploadSession: async () => {
            if (send instanceof Error) throw send;
            return ans(send, send === 201 ? { id: 77 } : undefined);
          },
        },
      });
    expect(await tryPut(sessionApi(200, 201), "priv", 1)).toEqual({
      stored: true,
      id: 77,
    });
    expect(await tryPut(sessionApi(403, 201), "priv", 1)).toEqual({
      stored: false,
      status: 403,
      step: "open",
    });
    expect(await tryPut(sessionApi(200, 403), "priv", 1)).toMatchObject({
      stored: false,
      status: 403,
      step: "send",
    });
    await fails("500 at open", () => tryPut(sessionApi(500, 201), "priv", 1));
    await fails("500 at send", () => tryPut(sessionApi(200, 500), "priv", 1));
    await fails("transport error", () =>
      tryPut(sessionApi(200, new Error("ECONNRESET")), "priv", 1),
    );
    // putFile is for setup: a refusal is a failure.
    await fails("refusal in setup", () =>
      putFile(sessionApi(403, 201), "priv", 1),
    );
    expect(await putFile(sessionApi(200, 201), "priv", 1)).toBe(77);
    // putFileOrRefusal accepts only a 4xx refusal.
    expect(
      await putFileOrRefusal(sessionApi(403, 201), "priv", 1),
    ).toBeUndefined();
    await fails("500 is not a refusal", () =>
      putFileOrRefusal(sessionApi(500, 201), "priv", 1),
    );
  });

  test("roomState - a snapshot of error answers is refused, not 'unchanged'", async () => {
    const denied = fake({
      rooms: {
        getRoomInfo: async () => ans(403),
        getRoomSecurityInfo: async () => ans(403),
        getRoomLinks: async () => ans(403),
      },
      folders: { getFolderByFolderId: async () => ans(403) },
      files: { getEncryptionInfo: async () => ans(403) },
    });
    await fails("roomState before", () => roomState(denied, 1));
  });

  test("waitForOperation - a foreign finished operation and a failed operation are not 'done'", async () => {
    test.setTimeout(120_000);
    const opsApi = (list: object[], status = 200) =>
      ({ getOperationStatuses: async () => ans(status, list) }) as never;
    // A status endpoint that answers 500 is not 'no operations'.
    await fails("status 500", () =>
      waitForOperation(opsApi([], 500), { started: [{ id: "mine" }] }),
    );
    // The started operation is still running; another request's finished one must not stand in.
    await fails("foreign operation", () =>
      waitForOperation(
        opsApi([
          { id: "mine", finished: false },
          { id: "other", finished: true },
        ]),
        { started: [{ id: "mine" }] },
      ),
    );
    // The right operation, finished with an error.
    await fails("error of the operation", () =>
      waitForOperation(
        opsApi([{ id: "mine", finished: true, error: "boom" }]),
        {
          started: [{ id: "mine" }],
          failOnError: true,
        },
      ),
    );
    // Control: the right one, finished, no error.
    const done = await waitForOperation(
      opsApi([
        { id: "other", finished: false },
        { id: "mine", finished: true, error: null },
      ]),
      { started: [{ id: "mine" }], failOnError: true },
    );
    expect(done.id).toBe("mine");
    // A starting call that answers with ONE operation (archive, delete a room) works the same,
    // and an empty error string is "no error" (the portal answers "" for a clean finish).
    const single = await waitForOperation(
      opsApi([
        { id: "other", finished: true, error: "old failure" },
        { id: "mine", finished: true, error: "" },
      ]),
      { started: { id: "mine" }, failOnError: true },
    );
    expect(single.id).toBe("mine");
    await fails("single operation with an error", () =>
      waitForOperation(
        opsApi([{ id: "mine", finished: true, error: "boom" }]),
        {
          started: { id: "mine" },
          failOnError: true,
        },
      ),
    );
  });
});
