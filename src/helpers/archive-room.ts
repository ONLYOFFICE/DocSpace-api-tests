import { ApiSDK } from "../services/api-sdk";
import { waitForOperation } from "./wait-for-operation";

/** Archives a room as the owner and waits for the operation to finish. */
export async function archiveRoomAndWait(apiSdk: ApiSDK, roomId: number) {
  const ownerApi = apiSdk.forRole("owner");
  await ownerApi.rooms.archiveRoom({
    id: roomId,
    archiveRoomRequest: { deleteAfter: false },
  });
  await waitForOperation(ownerApi.operations);
}
