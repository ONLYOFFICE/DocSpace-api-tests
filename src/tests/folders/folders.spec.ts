import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FoldersApi, RoomType, SortOrder } from "@onlyoffice/docspace-api-sdk";

function getFolderSortedByCustomOrder(folders: FoldersApi, folderId: number) {
  // TODO(sdk): getFolderByFolderId has 17 positional params — sortBy/sortOrder are near the end.
  // Fix: set useSingleRequestParameter=true in the openapi-generator config to generate an options object instead.
  return folders.getFolderByFolderId(
    folderId,
    undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined,
    undefined, undefined,
    "10",                  // sortBy: CustomOrder
    SortOrder.Ascending,
  );
}

test.describe("POST /files/folder/:folderId - Create folder", () => {
  test("POST /files/folder/:folderId - Owner creates a folder in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For Folder Creation",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.createFolder(roomId, { title: "Autotest Folder" });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Folder");
    expect(data.response!.parentId).toBe(roomId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  test("POST /files/folder/:folderId - Owner creates a folder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.createFolder(myDocsFolderId, { title: "Autotest Folder In My Docs" });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Folder In My Docs");
    expect(data.response!.parentId).toBe(myDocsFolderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });
});

test.describe("PUT /files/folder/:folderId/order - Set folder order", () => {
  test("PUT /files/folder/:folderId/order - Sets order for a folder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(myDocsFolderId, { title: "Autotest Folder For Order" });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.setFolderOrder(folderId, { order: 1 });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });
});

test.describe("GET /files/folder/:folderId/subfolders - Get folders list", () => {
  test("GET /files/folder/:folderId/subfolders - Folders are returned in set order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For Order",
      roomType: RoomType.CustomRoom,
      indexing: true,
    });
    const roomId = roomData.response!.id!;

    const { data: folderAData } = await ownerApi.folders.createFolder(roomId, { title: "Autotest Folder A" });
    const folderA = folderAData.response!;

    const { data: folderBData } = await ownerApi.folders.createFolder(roomId, { title: "Autotest Folder B" });
    const folderB = folderBData.response!;

    await ownerApi.folders.setFolderOrder(folderA.id!, { order: 2 });
    await ownerApi.folders.setFolderOrder(folderB.id!, { order: 1 });

    const { data } = await getFolderSortedByCustomOrder(
      ownerApi.folders,
      roomId,
    );

    const titles = data.response!.folders!
      .map((f) => f.title)
      .filter((t) => t === "Autotest Folder A" || t === "Autotest Folder B");

    expect(titles?.indexOf("Autotest Folder B")).toBeLessThan(
      titles!.indexOf("Autotest Folder A"),
    );
  });
});
