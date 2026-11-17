import { RoomType } from "@onlyoffice/docspace-api-sdk";
import type { ApiSDK } from "../services/api-sdk";

/**
 * The skills of an AI chat are the Markdown files of a room's skills folder,
 * and `GET api/2.0/files/rooms/{id}/ai` is the listing of it.
 *
 * It serves Instructions rooms and nothing else: any other room answers 404
 * `The required folder was not found`, whether or not someone put a folder
 * named `.ai` in it by hand. That hand-made folder used to be the mechanism
 * and is not any more - BUG 84329 was raised while it still was, and its
 * stated workaround no longer applies.
 *
 * Not in the generated SDK, so it is called raw and no type error would catch
 * the route moving again; this helper is the one place that would have to
 * change.
 */
export async function getRoomAiFolder(apiSdk: ApiSDK, roomId: number) {
  const { tokenStore, request } = apiSdk;
  const res = await request.fetch(
    `${tokenStore.portalBaseUrl}/api/2.0/files/rooms/${roomId}/ai?filterType=1&count=100`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.getToken("owner")}`,
        Origin: `http://${tokenStore.newTenantDomain}`,
      },
    },
  );
  return { status: res.status(), data: JSON.parse(await res.text()) };
}

/**
 * A room whose skills the AI chat can read, and the folder to upload them to.
 *
 * The folder id is taken from the listing rather than assumed: today it is the
 * room's own root, and a test that hard-coded the room id would keep passing
 * for the wrong reason if the skills ever moved into a folder below it.
 */
export async function setupSkillsRoom(
  apiSdk: ApiSDK,
  title: string,
): Promise<{ roomId: number; skillsFolderId: number }> {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData, status: roomStatus } =
    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `${title} ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.InstructionsRoom,
      },
    });
  if (roomStatus !== 200 || !roomData.response?.id) {
    throw new Error(
      `createRoom failed: ${roomStatus} ${JSON.stringify(roomData)}`,
    );
  }
  const roomId = roomData.response.id;

  const { status, data } = await getRoomAiFolder(apiSdk, roomId);
  const skillsFolderId = data?.response?.current?.id as number | undefined;
  if (status !== 200 || typeof skillsFolderId !== "number") {
    throw new Error(
      `the skills folder of room ${roomId} is unreadable: ${status} ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  return { roomId, skillsFolderId };
}
