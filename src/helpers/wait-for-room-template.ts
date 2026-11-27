import { expect } from "@playwright/test";
import { RoomsApi } from "@onlyoffice/docspace-api-sdk";

export async function waitForRoomTemplate(rooms: RoomsApi): Promise<number> {
  let templateId = -1;

  await expect(async () => {
    const { data, status } = await rooms.getRoomTemplateCreatingStatus();
    expect(status, "getRoomTemplateCreatingStatus: HTTP status").toBe(200);
    expect(data.response, "no creating status in the answer").toBeTruthy();
    expect(data.response!.isCompleted).toBe(true);
    templateId = data.response!.templateId;
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  return templateId;
}
