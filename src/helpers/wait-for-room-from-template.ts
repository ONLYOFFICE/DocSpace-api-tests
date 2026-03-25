import { expect } from "@playwright/test";
import { RoomsApi } from "@onlyoffice/docspace-api-sdk";

export async function waitForRoomFromTemplate(
  rooms: RoomsApi,
): Promise<number> {
  let roomId = -1;

  await expect(async () => {
    const { data } = await rooms.getRoomCreatingStatus();
    expect(data.response!.isCompleted).toBe(true);
    roomId = data.response!.roomId;
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  return roomId;
}
