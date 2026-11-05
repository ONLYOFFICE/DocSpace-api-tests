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
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status).toBe(200);
  return {
    files: ((data.response!.files ?? []) as { id: number }[])
      .map((f) => f.id)
      .sort(),
    folders: ((data.response!.folders ?? []) as { id: number }[])
      .map((f) => f.id)
      .sort(),
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
        const { data: plainRoom } = await owner.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest plain " + apiSdk.faker.generateString(6),
            roomType: RoomType.CustomRoom,
          },
        });
        const myDocs = (await owner.folders.getMyFolder()).data.response!
          .current!.id!;
        const sub = (
          await owner.folders.createFolder({
            folderId: roomA,
            createFolderRequest: { title: "Autotest sub" },
          })
        ).data.response!.id!;
        const places: Record<Place, number> = {
          privateA: roomA,
          privateB: roomB,
          plain: plainRoom.response!.id!,
          myDocs,
          subOfA: sub,
        };

        // The item to move, with a file key issued for it when it is private.
        let fileId = 0;
        let folderId = 0;
        if (item === "file") {
          fileId = await createRoomFile(
            owner,
            places[from],
            "Autotest item " + apiSdk.faker.generateString(5) + ".docx",
          );
        } else {
          folderId = (
            await owner.folders.createFolder({
              folderId: places[from],
              createFolderRequest: { title: "Autotest dir" },
            })
          ).data.response!.id!;
          fileId = await createRoomFile(owner, folderId, "inside.docx");
        }
        const keyed = from === "privateA" || from === "privateB";
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
          expect(set.status).toBe(200);
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
          const { data } = await owner.files.getEncryptionInfo({ fileId });
          expect(data.response!.fileKeys!.map((k) => k.privateKeyEnc)).toEqual([
            "fk-issued",
          ]);
        }
        // No job was queued behind the refusal.
        const ops = await owner.operations.getOperationStatuses();
        expect(ops.data.response ?? []).toEqual([]);
      });
    }
  }
});

test.describe("PUT /files/fileops/move - within one private room", () => {
  test("PUT /files/fileops/move - Moving a file into a folder of the same private room succeeds and keeps its file key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const sub = (
      await owner.folders.createFolder({
        folderId: roomId,
        createFolderRequest: { title: "Autotest sub" },
      })
    ).data.response!.id!;
    const fileId = await createRoomFile(owner, roomId, "Autotest moved.docx");
    const set = await owner.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: ownerId, publicKeyId: ZERO_GUID, privateKeyEnc: "fk-issued" },
      ],
    });
    expect(set.status).toBe(200);

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
    const { data } = await owner.files.getEncryptionInfo({ fileId });
    expect(data.response!.fileKeys!.map((k) => k.privateKeyEnc)).toEqual([
      "fk-issued",
    ]);
  });
});
