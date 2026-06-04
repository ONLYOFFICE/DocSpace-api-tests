import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  Configuration,
  FileConflictResolveType,
  FileOperationType,
  FileShare,
  OperationsApi,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

test.describe("PUT /files/fileops/copy - Permissions", () => {
  test("BUG 65580: PUT /files/fileops/copy - User cannot copy a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myFolderData } = await userApi.folders.getMyFolder({});
    const destFolderId = (myFolderData as any).response?.current?.id;

    const { data, status } = await userApi.operations.copyBatchItems({
      batchRequestDto: {
        folderIds: [roomId],
        destFolderId,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });
});

test.describe("PUT /files/fileops/move - Permissions", () => {
  test("BUG 65580: PUT /files/fileops/move - User cannot move a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myFolderData } = await userApi.folders.getMyFolder({});
    const destFolderId = (myFolderData as any).response?.current?.id;

    const { data, status } = await userApi.operations.moveBatchItems({
      batchRequestDto: {
        folderIds: [roomId],
        destFolderId,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });
});

test.describe("POST /api/2.0/files/favorites - access control", () => {
  test("POST /api/2.0/files/favorites - Owner can add file to favorites returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Owner AddFav File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest Owner AddFav File.docx");
  });

  test("POST /api/2.0/files/favorites - User can add own file to favorites returns 200", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data: myDocsData } = await userApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await userApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest User Own AddFav File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await userApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest User Own AddFav File.docx");
  });

  test("POST /api/2.0/files/favorites - User with Read access can add room file to favorites returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav User Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest AddFav User Read File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await userApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await userApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav User Read File.docx");
  });

  test("POST /api/2.0/files/favorites - Guest with Read access can add room file to favorites returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest AddFav Guest File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await guestApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Guest File.docx");
  });

  test("POST /api/2.0/files/favorites - Anonymous user cannot add file to favorites returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Anon File.docx" },
    });
    const fileId = fileData.response!.id!;

    const anonConfig = new Configuration({
      basePath: `${apiSdk.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: { Origin: `http://${apiSdk.tokenStore.newTenantDomain}` },
      },
    });
    const anonOperations = new OperationsApi(
      anonConfig,
      undefined,
      apiSdk.createAxiosInstance() as any,
    );

    const { status } = await anonOperations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/fileops/bulkdownload - Permissions", () => {
  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads file from room returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkDownload Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Owner File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Room Admin downloads file from own room returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkDownload RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkDownload RoomAdmin File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await roomAdminApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(roomAdminApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - User with Editor access downloads file from room returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkDownload Editor Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Editor File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { status } = await userApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(userApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - User with Read access downloads file from room returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkDownload Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Read File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await userApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(userApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Guest with Read access downloads file from room returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkDownload Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Guest File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(guestApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  // BUG 81822: PUT /api/2.0/files/fileops/bulkdownload returns 404 instead of 403 when user has no room access
  test.fail(
    "BUG 81822: PUT /api/2.0/files/fileops/bulkdownload - User without room membership cannot download file from room returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BulkDownload No Access Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest BulkDownload No Access File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.operations.bulkDownload({
        downloadRequestDto: { fileIds: [fileId] },
      });

      expect(status).toBe(403);
    },
  );

  // BUG 81823: PUT /api/2.0/files/fileops/bulkdownload returns 404 instead of 401 for unauthenticated user
  test.fail(
    "BUG 81823: PUT /api/2.0/files/fileops/bulkdownload - Unauthenticated user cannot bulk download returns 401",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest BulkDownload Anon File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const anonConfig = new Configuration({
        basePath: `${apiSdk.tokenStore.portalBaseUrl}`,
        baseOptions: {
          headers: { Origin: `http://${apiSdk.tokenStore.newTenantDomain}` },
        },
      });
      const anonOperations = new OperationsApi(
        anonConfig,
        undefined,
        apiSdk.createAxiosInstance() as any,
      );

      const { status } = await anonOperations.bulkDownload({
        downloadRequestDto: { fileIds: [fileId] },
      });

      expect(status).toBe(401);
    },
  );
});

test.describe("GET /api/2.0/files/file/{fileId}/checkconversion - Permissions", () => {
  test("GET /api/2.0/files/file/{fileId}/checkconversion - Owner can check conversion status of own file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckConversion Owner File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.operations.checkConversionStatus({
      fileId,
    });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - Room Admin with Room Manager access can check conversion status returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckConversion RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest CheckConversion RoomAdmin File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await roomAdminApi.operations.checkConversionStatus({
      fileId,
    });

    expect(status).toBe(200);
  });

  // BUG 81825: GET /api/2.0/files/file/{fileId}/checkconversion returns 403 instead of 200 for room member with Editor access
  test.fail(
    "BUG 81825: GET /api/2.0/files/file/{fileId}/checkconversion - User with Editor access can check conversion status returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckConversion Editor Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest CheckConversion Editor File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { status } = await userApi.operations.checkConversionStatus({
        fileId,
      });

      expect(status).toBe(200);
    },
  );

  test("GET /api/2.0/files/file/{fileId}/checkconversion - User without room access cannot check conversion status returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckConversion No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest CheckConversion No Access File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.operations.checkConversionStatus({
      fileId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - Unauthenticated user cannot check conversion status returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckConversion Anon File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const anonConfig = new Configuration({
      basePath: `${apiSdk.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: { Origin: `http://${apiSdk.tokenStore.newTenantDomain}` },
      },
    });
    const anonOperations = new OperationsApi(
      anonConfig,
      undefined,
      apiSdk.createAxiosInstance() as any,
    );

    const { status } = await anonOperations.checkConversionStatus({
      fileId,
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/files/fileops/move - checkMoveOrCopyBatchItems - Permissions", () => {
  test("GET /api/2.0/files/fileops/move - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    // Catches: unauthenticated access to move-check API not blocked, exposing file metadata
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Perm Anon.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const anonConfig = new Configuration({
      basePath: `${apiSdk.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: { Origin: `http://${apiSdk.tokenStore.newTenantDomain}` },
      },
    });
    const anonOperations = new OperationsApi(
      anonConfig,
      undefined,
      apiSdk.createAxiosInstance() as any,
    );

    const { status } = await anonOperations.checkMoveOrCopyBatchItems({
      inDto: {
        fileIds: [fileId],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/fileops/move - Owner can check move of own file returns 200", async ({
    apiSdk,
  }) => {
    // Catches: owner incorrectly denied access to check move of own files
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Perm Owner.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/fileops/move - DocSpaceAdmin can check move returns 200", async ({
    apiSdk,
  }) => {
    // Catches: DocSpaceAdmin incorrectly denied access to check move operation
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // DocSpaceAdmin checks move of a file from their own MyDocs
    const { data: adminMyDocsData } = await adminApi.folders.getMyFolder();
    const adminMyDocsFolderId = adminMyDocsData.response!.current!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: adminMyDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Perm Admin.docx" },
    });
    const fileId = fileData.response!.id!;

    // DocSpaceAdmin creates the destination room themselves
    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await adminApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/fileops/move - RoomAdmin with RoomManager access can check move of room file returns 200", async ({
    apiSdk,
  }) => {
    // Catches: RoomAdmin with RoomManager role denied access to check move of files in their room
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest CheckMove Perm RoomAdmin File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data: destRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm RoomAdmin DestRoom",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = destRoomData.response!.id!;

    // RoomAdmin must have access to the destination room as well
    await ownerApi.rooms.setRoomSecurity({
      id: destFolderId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } =
      await roomAdminApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/fileops/move - User with ContentCreator access can check move of own file to room returns 200", async ({
    apiSdk,
  }) => {
    // Catches: ContentCreator incorrectly denied move check for own files despite having write access to destination
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: userMyDocsData } = await userApi.folders.getMyFolder();
    const userMyDocsFolderId = userMyDocsData.response!.current!.id!;

    const { data: fileData } = await userApi.files.createFile({
      folderId: userMyDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckMove Perm ContentCreator File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm ContentCreator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await userApi.operations.checkMoveOrCopyBatchItems(
      {
        inDto: {
          fileIds: [fileId],
          destFolderId: roomId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      },
    );

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/fileops/move - User without room access gets 403 when checking move to that room", async ({
    apiSdk,
  }) => {
    // Catches: move check allows user to probe destination folder structure without access,
    // leaking folder metadata or bypassing access control
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: userMyDocsData } = await userApi.folders.getMyFolder();
    const userMyDocsFolderId = userMyDocsData.response!.current!.id!;

    const { data: fileData } = await userApi.files.createFile({
      folderId: userMyDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckMove Perm NoAccess.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm NoAccess Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { status } = await userApi.operations.checkMoveOrCopyBatchItems({
      inDto: {
        fileIds: [fileId],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/fileops/move - Guest without room access gets 403 when checking move to that room", async ({
    apiSdk,
  }) => {
    // Catches: Guest role bypasses destination access check, allowing guests to probe
    // private room structure they are not invited to
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckMove Perm Guest NoAccess.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Perm Guest NoAccess Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { status } = await guestApi.operations.checkMoveOrCopyBatchItems({
      inDto: {
        fileIds: [fileId],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(403);
  });
});
