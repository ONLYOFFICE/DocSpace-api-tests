import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileConflictResolveType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import {
  Api,
  ZERO_GUID,
  createOwnerPrivateRoom,
  createRoomFile,
  getOwnerId,
  okBody,
  okList,
  uploadPrivateRoomFile,
} from "@/src/helpers/private-rooms";

/**
 * PUT /files/fileops/copy and /files/fileops/move where a private room is the
 * source or the destination.
 *
 * Observed on 4.1.0 and not described by the SDK's JSDoc for the batch
 * operations: every copy or move that touches a private room — between two
 * private rooms, between a private and an ordinary room or My documents, and
 * COPY within one private room — is refused with 403 "Access denied" before any
 * job is queued, for files and folders alike, and for the room owner too. The one
 * exception is a MOVE inside a single private room, which succeeds and keeps the
 * file's id and keys. The
 * portal cannot re-encrypt content, so a client moves private content by
 * downloading, decrypting and uploading it again; these tests pin that the
 * server-side shortcut stays closed and that a refusal changes nothing:
 * the source is intact, the destination is unchanged and the file keys that were
 * issued stay as they were.
 *
 * If a later release allows these operations, the 403 assertions fail on
 * purpose: the end state (keys, content) then has to be checked properly.
 */

type Place = "privateA" | "privateB" | "plain" | "myDocs" | "subOfA";

/** The places that are a private room or sit inside one. */
const PRIVATE_PLACES: Place[] = ["privateA", "privateB", "subOfA"];
type Item = "file" | "folder";

const scenarios: {
  label: string;
  item: Item;
  from: Place;
  to: Place;
}[] = [
  {
    label: "a file between two private rooms",
    item: "file",
    from: "privateA",
    to: "privateB",
  },
  {
    label: "a file from a private room to an ordinary room",
    item: "file",
    from: "privateA",
    to: "plain",
  },
  {
    label: "a file from a private room to My documents",
    item: "file",
    from: "privateA",
    to: "myDocs",
  },
  {
    label: "a file from an ordinary room into a private room",
    item: "file",
    from: "plain",
    to: "privateA",
  },
  {
    label: "a file from My documents into a private room",
    item: "file",
    from: "myDocs",
    to: "privateA",
  },
  {
    label: "a file within one private room",
    item: "file",
    from: "privateA",
    to: "subOfA",
  },
  {
    label: "a folder between two private rooms",
    item: "folder",
    from: "privateA",
    to: "privateB",
  },
  {
    label: "a folder from a private room to My documents",
    item: "folder",
    from: "privateA",
    to: "myDocs",
  },
];

const listIds = async (api: Api, folderId: number) => {
  const folder = okBody(
    await api.folders.getFolderByFolderId({ folderId }),
    `getFolderByFolderId(${folderId})`,
  );
  expect(Array.isArray(folder.files), "files is not a list").toBe(true);
  expect(Array.isArray(folder.folders), "folders is not a list").toBe(true);
  return {
    files: (folder.files as { id: number }[]).map((f) => f.id).sort(),
    folders: (folder.folders as { id: number }[]).map((f) => f.id).sort(),
  };
};

test.describe("PUT /files/fileops/{copy,move} - private rooms", () => {
  for (const op of ["copy", "move"] as const) {
    for (const { label, item, from, to } of scenarios) {
      // Moving inside one private room is the one allowed case, tested below.
      if (op === "move" && to === "subOfA") continue;
      test(`PUT /files/fileops/${op} - ${op === "copy" ? "Copying" : "Moving"} ${label} is refused with 403 and changes nothing`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const ownerId = await getOwnerId(owner);
        const roomA = await createOwnerPrivateRoom(apiSdk);
        const roomB = await createOwnerPrivateRoom(apiSdk);
        const plainRoom = okBody(
          await owner.rooms.createRoom({
            createRoomRequestDto: {
              title: "Autotest plain " + apiSdk.faker.generateString(6),
              roomType: RoomType.CustomRoom,
            },
          }),
          "createRoom",
        );
        const myDocs = okBody(
          await owner.folders.createFolder({
            folderId: okBody(await owner.folders.getMyFolder(), "getMyFolder")
              .current!.id!,
            createFolderRequest: { title: "Autotest my docs" },
          }),
          "createFolder in My documents",
        ).id!;
        const sub = okBody(
          await owner.folders.createFolder({
            folderId: roomA,
            createFolderRequest: { title: "Autotest sub" },
          }),
          "createFolder sub",
        ).id!;
        const places: Record<Place, number> = {
          privateA: roomA,
          privateB: roomB,
          plain: plainRoom.id!,
          myDocs,
          subOfA: sub,
        };

        // The item to move, with a file key issued for it when it is private.
        const keyed = from === "privateA" || from === "privateB";
        // A private room takes content only as an encrypted upload.
        const addFile = (parent: number, title: string) =>
          PRIVATE_PLACES.includes(from)
            ? uploadPrivateRoomFile(owner, parent)
            : createRoomFile(owner, parent, title);
        let fileId = 0;
        let folderId = 0;
        if (item === "file") {
          fileId = await addFile(
            places[from],
            "Autotest item " + apiSdk.faker.generateString(5) + ".docx",
          );
        } else {
          folderId = okBody(
            await owner.folders.createFolder({
              folderId: places[from],
              createFolderRequest: { title: "Autotest dir" },
            }),
            "createFolder dir",
          ).id!;
          fileId = await addFile(folderId, "inside.docx");
        }
        if (keyed) {
          const set = await owner.files.setEncryptionInfo({
            fileId,
            accessRequestKeyDto: [
              {
                userId: ownerId,
                publicKeyId: ZERO_GUID,
                privateKeyEnc: "fk-issued",
              },
            ],
          });
          expect(set.status, JSON.stringify(set.data)).toBe(200);
          expect(set.data.response?.skippedUserIds).toEqual([]);
        }

        const sourceBefore = await listIds(owner, places[from]);
        const destBefore = await listIds(owner, places[to]);
        // The premise: the item is where the test says it is.
        expect(sourceBefore[item === "file" ? "files" : "folders"]).toContain(
          item === "file" ? fileId : folderId,
        );

        const batchRequestDto = {
          fileIds: item === "file" ? [fileId] : [],
          folderIds: item === "folder" ? [folderId] : [],
          destFolderId: places[to],
          deleteAfter: op === "move",
          conflictResolveType: FileConflictResolveType.Duplicate,
        };
        const { status } =
          op === "copy"
            ? await owner.operations.copyBatchItems({ batchRequestDto })
            : await owner.operations.moveBatchItems({ batchRequestDto });

        expect(status).toBe(403);
        expect(await listIds(owner, places[from])).toEqual(sourceBefore);
        expect(await listIds(owner, places[to])).toEqual(destBefore);
        if (keyed) {
          const info = okBody(
            await owner.files.getEncryptionInfo({ fileId }),
            "getEncryptionInfo",
          );
          expect(info.fileKeys!.map((k) => k.privateKeyEnc)).toEqual([
            "fk-issued",
          ]);
        }
        // No job was queued behind the refusal.
        expect(
          okList(
            await owner.operations.getOperationStatuses(),
            "getOperationStatuses",
          ),
        ).toEqual([]);
      });
    }
  }
});

test.describe("PUT /files/fileops/{copy,move} - control", () => {
  // Positive control for the 403 matrix above: the same batch calls work between
  // two ordinary rooms for the same caller, so the refusals are about privacy.
  for (const op of ["copy", "move"] as const) {
    test(`PUT /files/fileops/${op} - ${op === "copy" ? "Copying" : "Moving"} a file between two ordinary rooms works`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const mk = async (title: string) =>
        okBody(
          await owner.rooms.createRoom({
            createRoomRequestDto: {
              title: `${title} ${apiSdk.faker.generateString(6)}`,
              roomType: RoomType.CustomRoom,
            },
          }),
          "createRoom",
        ).id!;
      const src = await mk("Autotest control src");
      const dst = await mk("Autotest control dst");
      const fileId = await createRoomFile(owner, src, "Autotest control.docx");

      const batchRequestDto = {
        fileIds: [fileId],
        destFolderId: dst,
        deleteAfter: op === "move",
        conflictResolveType: FileConflictResolveType.Duplicate,
      };
      const { status } =
        op === "copy"
          ? await owner.operations.copyBatchItems({ batchRequestDto })
          : await owner.operations.moveBatchItems({ batchRequestDto });
      expect(status).toBe(200);

      await expect
        .poll(async () => (await listIds(owner, dst)).files.length, {
          timeout: 30_000,
        })
        .toBe(1);
      const left = (await listIds(owner, src)).files;
      if (op === "move") expect(left).toEqual([]);
      else expect(left).toEqual([fileId]);
    });
  }
});

test.describe("PUT /files/fileops/move - within one private room", () => {
  test("PUT /files/fileops/move - Moving a file into a folder of the same private room succeeds and keeps its file key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const sub = okBody(
      await owner.folders.createFolder({
        folderId: roomId,
        createFolderRequest: { title: "Autotest sub" },
      }),
      "createFolder sub",
    ).id!;
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    const set = await owner.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "fk-issued" },
      ],
    });
    expect(set.status, JSON.stringify(set.data)).toBe(200);
    expect(set.data.response?.skippedUserIds).toEqual([]);

    const { status } = await owner.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: sub,
        deleteAfter: true,
        conflictResolveType: FileConflictResolveType.Duplicate,
      },
    });
    expect(status).toBe(200);
    // The job is asynchronous and its record may be gone before it is polled,
    // so the end state itself is what is awaited.
    await expect
      .poll(async () => (await listIds(owner, sub)).files, { timeout: 30_000 })
      .toEqual([fileId]);

    // Read back: the same file id now lives in the sub-folder, no longer in the
    // room root, and the key issued for it is untouched.
    expect((await listIds(owner, sub)).files).toEqual([fileId]);
    expect((await listIds(owner, roomId)).files).toEqual([]);
    const info = okBody(
      await owner.files.getEncryptionInfo({ fileId }),
      "getEncryptionInfo",
    );
    expect(info.fileKeys!.map((k) => k.privateKeyEnc)).toEqual(["fk-issued"]);
  });
});
