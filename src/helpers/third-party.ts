import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";
import config from "@/config";

/**
 * Connects the shared Nextcloud test account (config.NEXTCLOUD_*) as a new
 * third-party storage connection. WebDav-family providers (Nextcloud, WebDav,
 * kDrive, SharePoint) authenticate with login/password; Nextcloud is reported
 * back by the API under providerKey "WebDav".
 *
 * Asserts the connect succeeded and returns the ids needed to build a room
 * or to disconnect the account later.
 */
export async function connectNextcloud(
  apiSdk: ApiSDK,
  role: Role,
  customerTitle: string,
): Promise<{ providerId: number; folderId: string }> {
  const { data, status } = await apiSdk
    .forRole(role)
    .thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle,
        providerKey: "Nextcloud",
      },
    });
  const folderId = (data as any).response?.id;
  const providerId = (data as any).response?.providerId;
  if (status !== 200 || !folderId || !providerId) {
    throw new Error(
      `connectNextcloud(${customerTitle}) failed: ${status} ${JSON.stringify(data)}`,
    );
  }
  return { providerId, folderId };
}

/**
 * Connects a fresh Nextcloud account and immediately turns it into a room.
 * A single third-party connection can only ever back one room ("This
 * provider is already connected to the room" otherwise), so every room
 * needs its own connection - this helper keeps that pairing in one call.
 */
export async function createNextcloudRoom(
  apiSdk: ApiSDK,
  role: Role,
  title: string,
  roomType: RoomType = RoomType.CustomRoom,
): Promise<{ providerId: number; folderId: string; roomId: string }> {
  const { providerId, folderId } = await connectNextcloud(
    apiSdk,
    role,
    `${title} (storage)`,
  );
  const { data, status } = await apiSdk
    .forRole(role)
    .rooms.createRoomThirdParty({
      id: folderId,
      createThirdPartyRoom: { title, roomType },
    });
  const roomId = (data as any).response?.id;
  if (status !== 200 || !roomId) {
    throw new Error(
      `createNextcloudRoom(${title}) failed: ${status} ${JSON.stringify(data)}`,
    );
  }
  return { providerId, folderId, roomId };
}
