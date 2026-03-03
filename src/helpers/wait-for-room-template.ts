import { expect } from "@playwright/test";
import { RoomsApi } from "@onlyoffice/docspace-api-sdk";

export async function waitForRoomTemplate(rooms: RoomsApi): Promise<number> {
  let templateId = -1;

  await expect(async () => {
    const { data } = await rooms.getRoomTemplateCreatingStatus();
    expect(data.response!.isCompleted).toBe(true);
    templateId = data.response!.templateId;
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  return templateId;
}
