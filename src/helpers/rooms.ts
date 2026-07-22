import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

export const roomAccesses = [
  { label: "Viewer", access: FileShare.Read },
  { label: "Commenter", access: FileShare.Comment },
  { label: "Reviewer", access: FileShare.Review },
  { label: "Editor", access: FileShare.Editing },
  { label: "ContentCreator", access: FileShare.ContentCreator },
  { label: "RoomManager", access: FileShare.RoomManager },
] as const;

/**
 * Room types that support the `private: true` (encrypted) flag.
 * Public and FillingForms rooms are link-based and reject private creation.
 */
export const privateSupportedRoomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

export const privateUnsupportedRoomTypes = [
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "FormFilling", roomType: RoomType.FillingFormsRoom },
] as const;

/**
 * Ensures the given role has an encryption key pair, which is a prerequisite
 * for creating private rooms. Idempotent: it only sets keys if none exist.
 */
export async function ensureEncryptionKeys(apiSdk: ApiSDK, role: Role) {
  const { data } = await apiSdk.forRole(role).privacyroom.getUserKeys();
  if ((data.count ?? 0) > 0) return;
  await apiSdk.forRole(role).privacyroom.setKeys({
    encryptionKeyRequestDto: {
      publicKey: "pk-" + apiSdk.faker.generateString(16),
      privateKeyEnc: "prv-" + apiSdk.faker.generateString(16),
    },
  });
}

/**
 * Creates a private (encrypted) room, setting up the caller's encryption keys
 * first. Returns the raw createRoom response so callers can assert status/data.
 */
export async function createPrivateRoom(
  apiSdk: ApiSDK,
  role: Role,
  dto: { title: string; roomType: RoomType },
) {
  await ensureEncryptionKeys(apiSdk, role);
  return apiSdk.forRole(role).rooms.createRoom({
    createRoomRequestDto: { ...dto, private: true },
  });
}

export async function createAllRoomTypes(apiSdk: ApiSDK, role: Role) {
  const configs = [
    { title: "Autotest Custom", roomType: RoomType.CustomRoom },
    { title: "Autotest Collaboration", roomType: RoomType.EditingRoom },
    { title: "Autotest FormFilling", roomType: RoomType.FillingFormsRoom },
    { title: "Autotest Public", roomType: RoomType.PublicRoom },
    { title: "Autotest VDR", roomType: RoomType.VirtualDataRoom },
  ];

  const rooms: { id: number; title: string; roomType: number }[] = [];
  for (const cfg of configs) {
    const { data } = await apiSdk.forRole(role).rooms.createRoom({
      createRoomRequestDto: cfg,
    });
    rooms.push({
      id: data.response!.id!,
      title: data.response!.title!,
      roomType: data.response!.roomType! as number,
    });
  }
  return rooms;
}
