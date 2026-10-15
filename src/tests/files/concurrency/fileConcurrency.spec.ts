import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileEntryType,
  FileShare,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { startFormFilling } from "@/src/helpers/files";

// Race tests. Every test uses its own portal, so the data is independent, and the
// requests are released together with Promise.all. The invariants asserted are
// the ones an SDK description states; where the contract names no winner, only
// the end state is checked (a valid value, no corruption), never who won.

async function room(
  apiSdk: ApiSDK,
  roomType: RoomType = RoomType.CustomRoom,
  indexing = false,
) {
  const { data } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest Concurrency Room",
      roomType,
      ...(indexing ? { indexing: true } : {}),
    },
  });
  return data.response!.id!;
}

const html = async (
  apiSdk: ApiSDK,
  folderId: number,
  title: string,
  content = "<p/>",
) =>
  (
    (
      await apiSdk.forRole("owner").files.createHtmlFile({
        folderId,
        createTextOrHtmlFile: { title, content },
      })
    ).data.response as { id: number }
  ).id;

async function filesCount(apiSdk: ApiSDK, folderId: number) {
  const { data } = await apiSdk
    .forRole("owner")
    .folders.getFolderByFolderId({ folderId });
  return data.response?.current?.filesCount ?? 0;
}

test.describe("Concurrent file mutations", () => {
  async function parallelCreations(apiSdk: ApiSDK) {
    const roomId = await room(apiSdk);
    const ownerApi = apiSdk.forRole("owner");
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        ownerApi.files.createHtmlFile({
          folderId: roomId,
          createTextOrHtmlFile: { title: "Race", content: `<p>${i}</p>` },
        }),
      ),
    );
    return { roomId, results };
  }

  // Invariant that holds: no creation is lost or merged.
  test("createHtmlFile - Parallel creations with one title each get their own file", async ({
    apiSdk,
  }) => {
    const { roomId, results } = await parallelCreations(apiSdk);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const ids = results.map((r) => (r.data.response as { id: number }).id);
    expect(new Set(ids).size).toBe(5);
    expect(await filesCount(apiSdk, roomId)).toBe(5);
  });

  // Documented (createHtmlFile): with createNewIfExist=false "another file is
  // created and its title made unique, as in Notes (1).html". Sequential calls do
  // that; parallel ones end with duplicate titles (5 of 5 repeats: 2-4 distinct
  // titles for 5 files).
  test.fail(
    "BUG XXXXX: createHtmlFile - Parallel creations with one title get unique titles",
    async ({ apiSdk }) => {
      const { results } = await parallelCreations(apiSdk);

      const ids = results.map((r) => (r.data.response as { id: number }).id);
      expect(new Set(ids).size).toBe(5);
      const titles = results.map(
        (r) => (r.data.response as { title: string }).title,
      );
      expect(new Set(titles).size).toBe(5);
    },
  );

  // Documented (copyFileAs): "not idempotent - each call adds another copy".
  test("copyFileAs - Parallel copies each add a file", async ({ apiSdk }) => {
    const roomId = await room(apiSdk);
    const sourceId = await html(apiSdk, roomId, "Source");
    const ownerApi = apiSdk.forRole("owner");

    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        ownerApi.files.copyFileAs({
          fileId: sourceId,
          copyAsJsonElement: { destTitle: "Copy.html", destFolderId: roomId },
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const ids = results.map((r) => (r.data.response as { id: number }).id);
    expect(new Set(ids).size).toBe(3);
    expect(await filesCount(apiSdk, roomId)).toBe(4);
  });

  // No contract names a winner: the end state has to be one of the two titles.
  test("updateFile - Parallel renames of one file end with one of the requested titles", async ({
    apiSdk,
  }) => {
    const roomId = await room(apiSdk);
    const fileId = await html(apiSdk, roomId, "Original");
    const ownerApi = apiSdk.forRole("owner");
    const titles = ["First", "Second", "Third"];

    const results = await Promise.all(
      titles.map((title) =>
        ownerApi.files.updateFile({ fileId, updateFile: { title } }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const { data } = await ownerApi.files.getFileInfo({ fileId });
    expect(titles.map((t) => `${t}.html`)).toContain(data.response?.title);
    expect(await filesCount(apiSdk, roomId)).toBe(1);
  });

  // Documented (lockFile): locking an already locked file "changes nothing".
  test("lockFile - Parallel lock requests all succeed and leave the file locked once", async ({
    apiSdk,
  }) => {
    const roomId = await room(apiSdk);
    const fileId = await html(apiSdk, roomId, "Lock race");
    const ownerApi = apiSdk.forRole("owner");

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        ownerApi.files.lockFile({
          fileId,
          lockFileParameters: { lockFile: true },
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const { data } = await ownerApi.files.getFileInfo({ fileId });
    expect(data.response?.locked).toBe(true);
  });

  // Documented (deleteFile): each call queues a deletion; the file ends up gone.
  test("deleteFile - Parallel deletions of one file leave it gone and the others intact", async ({
    apiSdk,
  }) => {
    const roomId = await room(apiSdk);
    const target = await html(apiSdk, roomId, "Delete race");
    const bystander = await html(apiSdk, roomId, "Bystander");
    const ownerApi = apiSdk.forRole("owner");

    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        ownerApi.files.deleteFile({
          fileId: target,
          _delete: { immediately: true },
        }),
      ),
    );
    await waitForOperation(ownerApi.operations);

    expect(results.some((r) => r.status === 200)).toBe(true);
    expect((await ownerApi.files.getFileInfo({ fileId: target })).status).toBe(
      404,
    );
    expect(
      (await ownerApi.files.getFileInfo({ fileId: bystander })).status,
    ).toBe(200);
    expect(await filesCount(apiSdk, roomId)).toBe(1);
  });

  // Documented (setFileOrder): "numbering of a folder stays without gaps".
  test("setFileOrder - Parallel moves leave the numbering a gapless permutation", async ({
    apiSdk,
  }) => {
    const roomId = await room(apiSdk, RoomType.VirtualDataRoom, true);
    const ids: number[] = [];
    for (const title of ["A", "B", "C", "D"])
      ids.push(await html(apiSdk, roomId, title));
    const ownerApi = apiSdk.forRole("owner");

    await Promise.all([
      ownerApi.files.setFileOrder({
        fileId: ids[3],
        orderRequestDto: { order: 1 },
      }),
      ownerApi.files.setFileOrder({
        fileId: ids[0],
        orderRequestDto: { order: 4 },
      }),
      ownerApi.files.setFileOrder({
        fileId: ids[1],
        orderRequestDto: { order: 3 },
      }),
    ]);

    const orders: number[] = [];
    for (const fileId of ids) {
      const { data } = await ownerApi.files.getFileInfo({ fileId });
      orders.push(Number((data.response as { order?: string }).order));
    }
    expect([...orders].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  async function favoriteRace(apiSdk: ApiSDK, values: boolean[]) {
    const roomId = await room(apiSdk);
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Favorite Race.docx" },
    });
    const fileId = created.response!.id!;
    const results = await Promise.all(
      values.map((favorite) =>
        ownerApi.files.toggleFileFavorite({ fileId, favorite }),
      ),
    );
    return { ownerApi, fileId, results };
  }

  // Documented (toggleFileFavorite): the mark is a single boolean per user, so
  // whatever the interleaving, the flag and the favorites listing must agree.
  test("toggleFileFavorite - Parallel toggles end in a consistent state", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await favoriteRace(apiSdk, [
      true,
      false,
      true,
      false,
      true,
      false,
    ]);

    const { data: info } = await ownerApi.files.getFileInfo({ fileId });
    const flag = Boolean(
      (info.response as { isFavorite?: boolean }).isFavorite,
    );
    await expect
      .poll(
        async () => {
          const { data } = await ownerApi.folders.getFavoritesFolder({});
          return (data.response?.files ?? []).some(
            (f) => (f as { id: number }).id === fileId,
          );
        },
        { timeout: 60_000 },
      )
      .toBe(flag);
  });

  // Diagnostic (2026-10-15): the 500 is an EF Core DbUpdateConcurrencyException
  // ("expected to affect 1 row(s), but actually affected 0") on the request that
  // loses the race. The file is not damaged: the flag settles on a valid value and
  // the next call works. Statuses of the race itself are deliberately not asserted.
  test("toggleFileFavorite - After a mixed race a follow-up call still works and takes effect", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await favoriteRace(apiSdk, [
      true,
      false,
      true,
      false,
      true,
      false,
    ]);

    const follow = await ownerApi.files.toggleFileFavorite({
      fileId,
      favorite: true,
    });

    expect(follow.status).toBe(200);
    const { data: info } = await ownerApi.files.getFileInfo({ fileId });
    expect((info.response as { isFavorite?: boolean }).isFavorite).toBe(true);
    expect(info.response?.title).toBe("Autotest Favorite Race.docx");
  });

  // Not pinned: mixed parallel true/false requests sometimes make one request
  // answer 500 (6 of 6 repeats in one run, 1 of 5 in the next). An intermittent
  // defect cannot be held by test.fail without producing unexpected passes, so it
  // is reported instead.

  // Identical parallel requests are plain repeats and all succeed.
  test("toggleFileFavorite - Parallel identical requests all answer 200 and the file is a favorite", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId, results } = await favoriteRace(
      apiSdk,
      Array(6).fill(true),
    );

    expect(results.map((r) => r.status)).toEqual([
      200, 200, 200, 200, 200, 200,
    ]);
    const { data: info } = await ownerApi.files.getFileInfo({ fileId });
    expect((info.response as { isFavorite?: boolean }).isFavorite).toBe(true);
  });

  // Documented (startEditFile): editingAlone=true "is refused with 403 when anybody
  // is already editing it", i.e. the claim is exclusive.
  test("startEditFile - Two parallel exclusive claims never both succeed", async ({
    apiSdk,
  }) => {
    const roomId = await room(apiSdk);
    const fileId = await html(apiSdk, roomId, "Claim race");
    const ownerApi = apiSdk.forRole("owner");
    const { api: memberApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.Editing },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);

    const results = await Promise.all([
      ownerApi.files.startEditFile({
        fileId,
        startEdit: { editingAlone: true },
      }),
      memberApi.files.startEditFile({
        fileId,
        startEdit: { editingAlone: true },
      }),
    ]);

    const successes = results.filter((r) => r.status === 200).length;
    expect(successes).toBe(1);
    expect(results.filter((r) => r.status === 403)).toHaveLength(1);
  });

  // Documented (generateXlsx): "Calling it again while a run is still going
  // answers with that run instead of starting a second one."
  test("generateXlsx - Parallel calls share one run and produce one report", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Xlsx Race Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const formId = await startFormFilling(
      apiSdk,
      "owner",
      roomData.response!.id!,
    );

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        ownerApi.files.generateXlsx({ fileId: formId }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const taskIds = new Set(results.map((r) => r.data.response?.task?.id));
    expect(taskIds.size).toBe(1);
    const resultsFolderId = results[0].data.response!.form!.resultsFolderId!;
    await expect
      .poll(
        async () => {
          const { data } = await ownerApi.files.getXlsx({ fileId: formId });
          return data.response?.isCompleted;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const { data: folder } = await ownerApi.folders.getFolderByFolderId({
      folderId: resultsFolderId,
    });
    const reports = (folder.response?.files ?? []).filter((f) =>
      f.title?.endsWith(".xlsx"),
    );
    expect(reports).toHaveLength(1);
  });

  // Documented (setFilesOrder): items are applied in the order sent, not as one
  // transaction. Two bulk calls racing must still leave a gapless permutation.
  test("setFilesOrder - Parallel bulk calls leave the numbering a gapless permutation", async ({
    apiSdk,
  }) => {
    const roomId = await room(apiSdk, RoomType.VirtualDataRoom, true);
    const ids: number[] = [];
    for (const title of ["A", "B", "C"])
      ids.push(await html(apiSdk, roomId, title));
    const ownerApi = apiSdk.forRole("owner");
    const item = (entryId: number, order: number) => ({
      entryId,
      entryType: FileEntryType.File,
      order,
    });

    await Promise.all([
      ownerApi.files.setFilesOrder({
        ordersRequestDto: { items: [item(ids[0], 3), item(ids[1], 2)] },
      }),
      ownerApi.files.setFilesOrder({
        ordersRequestDto: { items: [item(ids[2], 1), item(ids[1], 3)] },
      }),
    ]);

    const orders: number[] = [];
    for (const fileId of ids) {
      const { data } = await ownerApi.files.getFileInfo({ fileId });
      orders.push(Number((data.response as { order?: string }).order));
    }
    expect([...orders].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
