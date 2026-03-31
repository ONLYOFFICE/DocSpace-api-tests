import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";

export const roomAccesses = [
  { label: "Viewer", access: FileShare.Read },
  { label: "Commenter", access: FileShare.Comment },
  { label: "Reviewer", access: FileShare.Review },
  { label: "Editor", access: FileShare.Editing },
  { label: "ContentCreator", access: FileShare.ContentCreator },
] as const;

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
