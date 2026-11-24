import { expect } from "@playwright/test";
import { FolderType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";

/**
 * Archives a room as the owner and waits until it really is in the Archive.
 *
 * The helper fails (instead of returning quietly) when
 * - the archive request itself is refused,
 * - the operation reports an error,
 * - the room is still not in the Archive when the wait runs out.
 *
 * The end state is what is awaited: the operation record of a quick job can be
 * gone before it is polled, so an empty status list is not read as a failure,
 * but an operation that is listed has to be finished and error-free.
 */
export async function archiveRoomAndWait(apiSdk: ApiSDK, roomId: number) {
  const ownerApi = apiSdk.forRole("owner");
  const { status } = await ownerApi.rooms.archiveRoom({
    id: roomId,
    archiveRoomRequest: { deleteAfter: false },
  });
  expect(status, `archiveRoom(${roomId}) was refused`).toBe(200);

  await expect(async () => {
    const { data: operations } =
      await ownerApi.operations.getOperationStatuses();
    for (const operation of operations.response ?? []) {
      expect(
        operation.error ?? null,
        `archive operation of room ${roomId} failed`,
      ).toBeNull();
      expect(
        operation.finished,
        `archive operation of room ${roomId} is still running`,
      ).toBe(true);
    }

    const { data: room, status: infoStatus } = await ownerApi.rooms.getRoomInfo(
      { id: roomId },
    );
    expect(infoStatus, `getRoomInfo(${roomId}) after archiving`).toBe(200);
    expect(
      room.response?.rootFolderType,
      `room ${roomId} is not in the Archive yet`,
    ).toBe(FolderType.Archive);
  }).toPass({
    intervals: [500, 1_000, 2_000, 5_000],
    timeout: 30_000,
  });
}
