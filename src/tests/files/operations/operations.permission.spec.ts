import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  CheckDestFolderResult,
  Configuration,
  FileConflictResolveType,
  FileOperationType,
  FileShare,
  OperationsApi,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

test.describe("PUT /api/2.0/files/fileops/copy - Permissions", () => {
  test("BUG 65580: PUT /api/2.0/files/fileops/copy - User cannot copy a room", async ({
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

test.describe("PUT /api/2.0/files/fileops/move - Permissions", () => {
  test("BUG 65580: PUT /api/2.0/files/fileops/move - User cannot move a room", async ({
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

test.describe("PUT /api/2.0/files/file/{fileId}/checkconversion - startFileConversion - Permissions", () => {
  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Owner can start conversion of own file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion Perm Owner.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - DocSpace Admin can start conversion of own file returns 200", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: myDocsData } = await adminApi.folders.getMyFolder();
    const adminMyDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: adminMyDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion Perm DocSpaceAdmin File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await adminApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Room Admin with Room Manager access can start conversion returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartConversion Perm RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest StartConversion Perm RoomAdmin File.docx",
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

    const { status } = await roomAdminApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - User with ContentCreator access can start conversion of own file in room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartConversion Perm ContentCreator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data: fileData } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest StartConversion Perm ContentCreator File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - User without room access cannot start conversion returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartConversion Perm No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest StartConversion Perm No Access File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Unauthenticated user cannot start conversion returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion Perm Anon File.docx",
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

    const { status } = await anonOperations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
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

test.describe("GET /api/2.0/files/fileops/checkdestfolder - checkMoveOrCopyDestFolder - Permissions", () => {
  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Unauthenticated user" +
      " gets 401",
    async ({ apiSdk }) => {
      // Catches: unauthenticated access to dest-folder check API not blocked
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Perm Anon.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm Anon Room",
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

      const { status } = await anonOperations.checkMoveOrCopyDestFolder({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

      expect(status).toBe(401);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner can check move of" +
      " own file returns 200 with AllAllowed",
    async ({ apiSdk }) => {
      // Catches: owner incorrectly denied access to check move of own files
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Perm Owner.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - DocSpaceAdmin can check" +
      " move of own file returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: DocSpaceAdmin incorrectly denied access to check dest folder
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: adminMyDocsData } = await adminApi.folders.getMyFolder();
      const adminMyDocsFolderId = adminMyDocsData.response!.current!.id!;

      const { data: fileData } = await adminApi.files.createFile({
        folderId: adminMyDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Perm Admin.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm Admin Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await adminApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - RoomAdmin with RoomManager" +
      " access to destination room returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: RoomAdmin with RoomManager role denied access to check dest folder
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm RA SrcRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcRoomId = srcRoomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcRoomId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Perm RA File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { api: roomAdminApi, data: roomAdminData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminId = roomAdminData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: srcRoomId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm RA DestRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data, status } =
        await roomAdminApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - User with ContentCreator" +
      " access to destination room returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: user with content creator access incorrectly denied check of dest folder
      const ownerApi = apiSdk.forRole("owner");

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const userMyDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await userApi.files.createFile({
        folderId: userMyDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Perm User File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm User DestRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data, status } =
        await userApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  // BUG 82104: checkMoveOrCopyDestFolder returns AllAllowed for user without dest access instead of 403
  test.fail(
    "BUG 82104: GET /api/2.0/files/fileops/checkdestfolder - User without" +
      " access to destination room returns 403",
    async ({ apiSdk }) => {
      // Catches: user without dest access gets AllAllowed instead of 403;
      // checkMoveOrCopyBatchItems correctly returns 403 in the same scenario,
      // but checkMoveOrCopyDestFolder does not check user access to the destination room
      const ownerApi = apiSdk.forRole("owner");

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const userMyDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await userApi.files.createFile({
        folderId: userMyDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Perm NoAccess File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm NoAccess Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await userApi.operations.checkMoveOrCopyDestFolder({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: true,
        },
      });

      expect(status).toBe(403);
    },
  );

  // BUG 82104: checkMoveOrCopyDestFolder returns 200 AllAllowed for guest without dest access instead of 403
  test.fail(
    "BUG 82104: GET /api/2.0/files/fileops/checkdestfolder - Guest without" +
      " access to destination room gets 403",
    async ({ apiSdk }) => {
      // Catches: guest without dest access gets AllAllowed instead of 403;
      // same root cause as User without access - checkMoveOrCopyDestFolder does not check
      // user access to the destination room
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
          title: "Autotest CheckDestFolder Perm Guest File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Perm Guest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await guestApi.operations.checkMoveOrCopyDestFolder({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

      expect(status).toBe(403);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/copy - copyBatchItems - Permissions", () => {
  test("PUT /api/2.0/files/fileops/copy - Unauthenticated request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CopyBatch Perm Anon File.docx",
      },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CopyBatch Perm Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });

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

    const { status } = await anonOperations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId: roomData.response!.id!,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(401);
  });

  test(
    "PUT /api/2.0/files/fileops/copy - Owner can copy file to room" +
      " returns 200 and Copy operation finishes",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm Owner File.docx",
        },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: roomData.response!.id!,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - DocSpaceAdmin can copy file to room" +
      " returns 200 and Copy operation finishes",
    async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: adminFolderData } = await adminApi.folders.getMyFolder();
      const adminMyDocsFolderId = adminFolderData.response!.current!.id!;

      const { data: fileData } = await adminApi.files.createFile({
        folderId: adminMyDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm Admin File.docx",
        },
      });

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm Admin Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await adminApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: roomData.response!.id!,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(adminApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - RoomAdmin can copy file to own room" +
      " returns 200 and Copy operation finishes",
    async ({ apiSdk }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data: myDocsData } = await roomAdminApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await roomAdminApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm RoomAdmin File.docx",
        },
      });

      const { data: roomData } = await roomAdminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm RoomAdmin Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data, status } = await roomAdminApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: roomData.response!.id!,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(roomAdminApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - User (ContentCreator in dest room)" +
      " can copy file to that room returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm User Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await userApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm User File.docx",
        },
      });

      const { data, status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(userApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  // NOTE: may return 500 under full test run due to delayed operations worker init in freshly created portal
  test(
    "PUT /api/2.0/files/fileops/copy - User without access to destination room" +
      " returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm UserNoAccess Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await userApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm UserNoAccess File.docx",
        },
      });

      const { status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Guest without access to destination room" +
      " returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm GuestNoAccess Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm Guest File.docx",
        },
      });

      const { status } = await guestApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - RoomAdmin (ContentCreator) copies file" +
      " to level 3 subfolder returns 200 and operation finishes",
    async ({ apiSdk }) => {
      // Catches: ContentCreator denied write access to deeply nested subfolder
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm RoomAdmin L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folder2 } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest Perm RoomAdmin L3 L2" },
      });
      const { data: folder3 } = await ownerApi.folders.createFolder({
        folderId: folder2.response!.id!,
        createFolder: { title: "Autotest Perm RoomAdmin L3 L3" },
      });
      const folder3Id = folder3.response!.id!;

      const { api: roomAdminApi, data: roomAdminData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminId = roomAdminData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: myDocsData } = await roomAdminApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData2 } = await roomAdminApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm RoomAdmin L3 File.docx",
        },
      });

      const { data, status } = await roomAdminApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData2.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(roomAdminApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - User (ContentCreator in room) copies file" +
      " to level 3 subfolder returns 200 and operation finishes",
    async ({ apiSdk }) => {
      // Catches: User with ContentCreator denied write access to deeply nested subfolder
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm User L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folder2 } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest Perm User L3 L2" },
      });
      const { data: folder3 } = await ownerApi.folders.createFolder({
        folderId: folder2.response!.id!,
        createFolder: { title: "Autotest Perm User L3 L3" },
      });
      const folder3Id = folder3.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData2 } = await userApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm User L3 File.docx",
        },
      });

      const { data, status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData2.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(userApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - User with Read access to destination room" +
      " cannot copy file to room returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm Read Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const { data: fileData } = await userApi.files.createFile({
        folderId: myDocsData.response!.current!.id!,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm Read File.docx",
        },
      });

      const { status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - User with Editing access to destination room" +
      " cannot copy file to room returns 403",
    async ({ apiSdk }) => {
      // Editing role allows editing existing files but not adding new content
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm Editing Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [
            { id: userData.response!.id!, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const { data: fileData } = await userApi.files.createFile({
        folderId: myDocsData.response!.current!.id!,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm Editing File.docx",
        },
      });

      const { status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Guest with ContentCreator access to room" +
      " can copy file to room returns 200",
    async ({ apiSdk }) => {
      // Guest has no personal MyDocs; source file is in a room the guest can read
      const ownerApi = apiSdk.forRole("owner");

      const { api: guestApi, data: guestData } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm Guest CC SrcRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcRoomId = srcRoomData.response!.id!;

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm Guest CC DestRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: srcRoomId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcRoomId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm Guest CC File.docx",
        },
      });

      const { data, status } = await guestApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(guestApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - User (ContentCreator) copies file from" +
      " source room to destination room returns 200",
    async ({ apiSdk }) => {
      // User has ContentCreator access in both rooms
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm CC SrcRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcRoomId = srcRoomData.response!.id!;

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Perm CC DestRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: srcRoomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcRoomId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Perm CC SrcFile.docx",
        },
      });

      const { data, status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(userApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "BUG 81906: PUT /api/2.0/files/fileops/copy - User (ContentCreator) copies" +
      " a folder from room to My Documents returns 403",
    async ({ apiSdk }) => {
      // Folder-level permission check ignores ContentCreator role — copying
      // returns 403 even though copying a file from the same folder succeeds.
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title:
            "Autotest CopyFolder Perm Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: {
          title:
            "Autotest CopyFolder Perm Folder " + apiSdk.faker.generateString(6),
        },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: "Autotest CopyFolder Perm File.docx" },
      });

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data, status } = await userApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [folderId],
          destFolderId: myDocsFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(userApi.operations);
      expect(operation.finished).toBe(true);
    },
  );
});

test.describe("POST /api/2.0/files/{folderId}/session - createUploadSessionInFolder - Permissions", () => {
  test(
    "POST /api/2.0/files/{folderId}/session - Unauthenticated request" +
      " returns 401",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm Anon Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

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

      const { status } = await anonOperations.createUploadSessionInFolder({
        folderId,
        sessionRequest: {
          fileName: "Autotest UploadSession Perm Anon.docx",
          fileSize: 256,
          createNewIfExist: true,
        },
      });

      expect(status).toBe(401);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - Owner can create upload" +
      " session in room returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession Perm Owner.docx",
            fileSize: 512,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - User (ContentCreator) can" +
      " create upload session in room returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm CC Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: folderId,
        roomInvitationRequest: {
          invitations: [
            {
              id: userData.response!.id!,
              access: FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });

      const { data, status } =
        await userApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession Perm CC.docx",
            fileSize: 512,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - User (Editing) cannot create" +
      " upload session in room returns 403",
    async ({ apiSdk }) => {
      // Editing role allows editing existing files but not uploading new ones
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm Editing Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: folderId,
        roomInvitationRequest: {
          invitations: [
            { id: userData.response!.id!, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      const { status } = await userApi.operations.createUploadSessionInFolder({
        folderId,
        sessionRequest: {
          fileName: "Autotest UploadSession Perm Editing.docx",
          fileSize: 512,
          createNewIfExist: true,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - User (Read) cannot create" +
      " upload session in room returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm Read Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: folderId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      const { status } = await userApi.operations.createUploadSessionInFolder({
        folderId,
        sessionRequest: {
          fileName: "Autotest UploadSession Perm Read.docx",
          fileSize: 512,
          createNewIfExist: true,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - Guest (ContentCreator) can" +
      " create upload session in room returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm Guest CC Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { api: guestApi, data: guestData } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");

      await ownerApi.rooms.setRoomSecurity({
        id: folderId,
        roomInvitationRequest: {
          invitations: [
            {
              id: guestData.response!.id!,
              access: FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });

      const { data, status } =
        await guestApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession Perm Guest CC.docx",
            fileSize: 512,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - RoomAdmin not invited to room" +
      " cannot create upload session returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm RoomAdmin Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { status } =
        await roomAdminApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession Perm RoomAdmin.docx",
            fileSize: 256,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(403);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - DocSpaceAdmin not invited to" +
      " room cannot create upload session returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Perm Admin Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { status } = await adminApi.operations.createUploadSessionInFolder({
        folderId,
        sessionRequest: {
          fileName: "Autotest UploadSession Perm Admin.docx",
          fileSize: 512,
          createNewIfExist: true,
        },
      });

      expect(status).toBe(403);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/delete - deleteBatchItems - Permissions", () => {
  test("PUT /api/2.0/files/fileops/delete - Unauthenticated request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsData.response!.current!.id!,
      createFileJsonElement: {
        title: "Autotest Delete Perm Anon File.docx",
      },
    });

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

    const { status } = await anonOperations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: [fileData.response!.id!],
        immediately: true,
      },
    });

    expect(status).toBe(401);
  });

  test(
    "PUT /api/2.0/files/fileops/delete - Owner deletes file from room" +
      " returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Perm Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Delete Perm Owner File.docx",
        },
      });

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileData.response!.id!],
          immediately: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      // File must be gone from the room
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        (roomContent.response?.files ?? []).some(
          (f) => f.title === "Autotest Delete Perm Owner File.docx",
        ),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - RoomAdmin with RoomManager access" +
      " deletes file returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Perm RoomAdmin Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Delete Perm RoomAdmin File.docx",
        },
      });

      const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            {
              id: roomAdminData.response!.id!,
              access: FileShare.RoomManager,
            },
          ],
          notify: false,
        },
      });

      const roomAdminApi = apiSdk.forRole("roomAdmin");
      const { data, status } = await roomAdminApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileData.response!.id!],
          immediately: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(roomAdminApi.operations);

      // File must be gone from the room
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        (roomContent.response?.files ?? []).some(
          (f) => f.title === "Autotest Delete Perm RoomAdmin File.docx",
        ),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - User with Editing access cannot" +
      " delete file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Perm Editing Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Delete Perm Editing File.docx",
        },
      });

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: userData.response!.id!, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      const { status } = await userApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileData.response!.id!],
          immediately: true,
        },
      });

      expect(status).toBe(403);

      // File must still be in the room -- 403 must not cause deletion
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        (roomContent.response?.files ?? []).some(
          (f) => f.title === "Autotest Delete Perm Editing File.docx",
        ),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - User with Read access cannot" +
      " delete file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Perm Read Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Delete Perm Read File.docx",
        },
      });

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      const { status } = await userApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileData.response!.id!],
          immediately: true,
        },
      });

      expect(status).toBe(403);

      // File must still be in the room -- 403 must not cause deletion
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        (roomContent.response?.files ?? []).some(
          (f) => f.title === "Autotest Delete Perm Read File.docx",
        ),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - User not invited to room cannot" +
      " delete file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Delete Perm NonMember Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Delete Perm NonMember File.docx",
        },
      });

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileData.response!.id!],
          immediately: true,
        },
      });

      expect(status).toBe(403);

      // File must still be in the room -- 403 must not cause deletion
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        (roomContent.response?.files ?? []).some(
          (f) => f.title === "Autotest Delete Perm NonMember File.docx",
        ),
      ).toBe(true);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/deleteversion - Permissions", () => {
  test("PUT /api/2.0/files/fileops/deleteversion - Anonymous user cannot delete file versions returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Anon File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

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

    const { status } = await anonOperations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Owner deletes version of own file returns 200 and version is gone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Owner File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(200);

    await waitForOperation(ownerApi.operations);

    const { data: versionsData } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).toContain(2);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - User deletes version of own file returns 200 and version is gone", async ({
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
      createFileJsonElement: { title: "Autotest DelVer User File.docx" },
    });
    const fileId = fileData.response!.id!;

    await userApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { status } = await userApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(200);

    await waitForOperation(userApi.operations);

    const { data: versionsData } = await userApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).toContain(2);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - User cannot delete versions of another users file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest DelVer Other User File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - RoomAdmin can delete file versions in their room returns 200 and version is gone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest DelVer RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest DelVer RoomAdmin File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await roomAdminApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(200);

    await waitForOperation(roomAdminApi.operations);

    const { data: versionsData } = await roomAdminApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).toContain(2);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - DocSpaceAdmin cannot delete versions of file in another users My Documents returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest DelVer DSAdmin File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { api: docSpaceAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await docSpaceAdminApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Guest with Read access cannot delete file versions returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest DelVer Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest DelVer Guest File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(403);
  });
});

test.describe("DELETE /api/2.0/files/favorites - access control", () => {
  test("DELETE /api/2.0/files/favorites - Anonymous user cannot remove favorites returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Anon File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

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

    const { status } = await anonOperations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/files/favorites - Owner removes file from favorites returns 200 and file absent from getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Owner File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest DelFav Owner File.docx");
  });

  test("DELETE /api/2.0/files/favorites - User removes own file from favorites returns 200 and file absent from getFavoritesFolder", async ({
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
      createFileJsonElement: { title: "Autotest DelFav User File.docx" },
    });
    const fileId = fileData.response!.id!;

    await userApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { status } = await userApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await userApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest DelFav User File.docx");
  });

  test("DELETE /api/2.0/files/favorites - Guest removes file from favorites returns 200 and file absent from getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest DelFav Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest DelFav Guest File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    await guestApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { status } = await guestApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await guestApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest DelFav Guest File.docx");
  });
});

test.describe("PUT /api/2.0/files/fileops/duplicate - Permissions", () => {
  test("PUT /api/2.0/files/fileops/duplicate - Anonymous user cannot duplicate returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Dup Anon File.docx" },
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

    const { status } = await anonOperations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Owner duplicates own file returns 200 and duplicate appears in folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileBase = "Autotest Dup Owner File";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const matchingFiles = (folderContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - User with ContentCreator access can duplicate file in room returns 200 and duplicate appears", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Dup User ContentCreator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileBase = "Autotest Dup User ContentCreator File";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { status } = await userApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(userApi.operations);
    expect(operation.finished).toBe(true);

    const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    const matchingFiles = (roomContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - User cannot duplicate file without access returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Dup No Access File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/duplicate - RoomAdmin can duplicate file in own room returns 200 and duplicate appears", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Dup RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileBase = "Autotest Dup RoomAdmin File";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await roomAdminApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);

    const operation = await waitForOperation(roomAdminApi.operations);
    expect(operation.finished).toBe(true);

    const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    const matchingFiles = (roomContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Guest with Read access cannot duplicate returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Dup Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Dup Guest File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(403);
  });

  test(
    "PUT /api/2.0/files/fileops/duplicate - User with Editing access cannot duplicate" +
      " returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Dup Editing Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Dup Editing File.docx" },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { status } = await userApi.operations.duplicateBatchItems({
        duplicateRequestDto: { fileIds: [fileId as any] },
      });

      expect(status).toBe(403);
    },
  );

  test("PUT /api/2.0/files/fileops/duplicate - DocSpaceAdmin can duplicate own file returns 200", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: myDocsData } = await adminApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileBase = "Autotest Dup DSAdmin File";
    const { data: fileData } = await adminApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

    const operation = await waitForOperation(adminApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: myDocsContent } = await adminApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const matchingFiles = (myDocsContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("PUT /api/2.0/files/fileops/emptytrash - Permissions", () => {
  test(
    "PUT /api/2.0/files/fileops/emptytrash - Anonymous user cannot empty" +
      " trash returns 401",
    async ({ apiSdk }) => {
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

      const { status } = await anonOperations.emptyTrash();

      expect(status).toBe(401);
    },
  );

  test("PUT /api/2.0/files/fileops/emptytrash - Owner can empty own trash returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileName = "Autotest EmptyTrash Owner File.docx";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: fileName },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.operations.emptyTrash();

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Delete);

    await waitForOperation(ownerApi.operations);

    const { data: trashData } = await ownerApi.folders.getTrashFolder();
    expect(
      (trashData.response?.files ?? []).some((f) => f.title === fileName),
    ).toBe(false);
  });

  test(
    "PUT /api/2.0/files/fileops/emptytrash - Regular user can empty own" +
      " trash returns 200",
    async ({ apiSdk }) => {
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest EmptyTrash User File.docx";
      const { data: fileData } = await userApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      await userApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(userApi.operations);

      const { data, status } = await userApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(userApi.operations);

      const { data: trashData } = await userApi.folders.getTrashFolder();
      expect(
        (trashData.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/emptytrash - DocSpaceAdmin can empty own" +
      " trash returns 200",
    async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const { data: myDocsData } = await adminApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest EmptyTrash Admin File.docx";
      const { data: fileData } = await adminApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      await adminApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(adminApi.operations);

      const { data, status } = await adminApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(adminApi.operations);

      const { data: trashData } = await adminApi.folders.getTrashFolder();
      expect(
        (trashData.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );

  test("PUT /api/2.0/files/fileops/emptytrash - RoomAdmin can empty own trash returns 200", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: myDocsData } = await roomAdminApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileName = "Autotest EmptyTrash RoomAdmin File.docx";
    const { data: fileData } = await roomAdminApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: fileName },
    });
    const fileId = fileData.response!.id!;

    await roomAdminApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
    });
    await waitForOperation(roomAdminApi.operations);

    const { data, status } = await roomAdminApi.operations.emptyTrash();

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Delete);

    await waitForOperation(roomAdminApi.operations);

    const { data: trashData } = await roomAdminApi.folders.getTrashFolder();
    expect(
      (trashData.response?.files ?? []).some((f) => f.title === fileName),
    ).toBe(false);
  });

  test(
    "PUT /api/2.0/files/fileops/emptytrash - Guest cannot delete another" +
      " user files from trash returns 200 and owner file remains in trash",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest EmptyTrash Guest Owner File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data: trashBefore } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashBefore.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);

      await guestApi.operations.emptyTrash();

      const { data: trashAfter } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/emptytrash - Guest can empty own trash" +
      " returns 200 and own file no longer in trash",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: guestApi, data: guestData } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest EmptyTrash Guest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const fileName = "Autotest EmptyTrash Guest File.docx";
      const { data: fileData } = await guestApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      await guestApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(guestApi.operations);

      const { data: trashBefore } = await guestApi.folders.getTrashFolder();
      expect(
        (trashBefore.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);

      const { data, status } = await guestApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(guestApi.operations);

      const { data: trashAfter } = await guestApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );
});

test.describe("GET /api/2.0/files/fileops - Permissions", () => {
  test("GET /api/2.0/files/fileops - Anonymous user cannot see owner's operations", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest GetOps Anon.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });

    const anonConfig = new Configuration({
      basePath: apiSdk.tokenStore.portalBaseUrl,
      baseOptions: {
        headers: {
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
        },
      },
    });
    const anonOperations = new OperationsApi(
      anonConfig,
      undefined,
      apiSdk.createAxiosInstance() as any,
    );

    const { data, status } = await anonOperations.getOperationStatuses();

    expect(status).toBe(200);
    expect(data.response!.length).toBe(0);
  });

  test("GET /api/2.0/files/fileops - Owner returns 200", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .operations.getOperationStatuses();

    expect(status).toBe(200);
  });

  test("GET /api/2.0/files/fileops - Regular user returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .operations.getOperationStatuses();

    expect(status).toBe(200);
  });

  test("GET /api/2.0/files/fileops - DocSpaceAdmin returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .operations.getOperationStatuses();

    expect(status).toBe(200);
  });

  test("GET /api/2.0/files/fileops - Guest returns 200", async ({ apiSdk }) => {
    await apiSdk.addMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .operations.getOperationStatuses();

    expect(status).toBe(200);
  });

  test("GET /api/2.0/files/fileops - User does not see operations of another user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addMember("owner", "User");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest GetOps Isolation.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await apiSdk
      .forRole("user")
      .operations.getOperationStatuses();

    expect(status).toBe(200);
    expect(data.response!.length).toBe(0);
  });

  test("GET /api/2.0/files/fileops - RoomAdmin returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .operations.getOperationStatuses();

    expect(status).toBe(200);
  });

  test(
    "GET /api/2.0/files/fileops - DocSpaceAdmin does not see operations" +
      " of another user",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addMember("owner", "DocSpaceAdmin");

      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest GetOps DocSpaceAdmin Isolation.docx",
        },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .operations.getOperationStatuses();

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    },
  );
});

test.describe("GET /api/2.0/files/fileops/:operationType - Permissions", () => {
  // Catches: endpoint exposed to anonymous users who could see active operations
  test(
    "GET /api/2.0/files/fileops/:operationType - Anonymous user" +
      " cannot see owner's operations",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest GetOpsByType Anon.docx",
        },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
      });

      const anonConfig = new Configuration({
        basePath: apiSdk.tokenStore.portalBaseUrl,
        baseOptions: {
          headers: {
            Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
          },
        },
      });
      const anonOperations = new OperationsApi(
        anonConfig,
        undefined,
        apiSdk.createAxiosInstance() as any,
      );

      const { data, status } = await anonOperations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: owner unexpectedly blocked from accessing own operation statuses by type
  test("GET /api/2.0/files/fileops/:operationType - Owner returns 200", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .operations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
      });

    expect(status).toBe(200);
  });

  // Catches: regular user incorrectly denied access to own operation statuses by type
  test("GET /api/2.0/files/fileops/:operationType - Regular user returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .operations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
      });

    expect(status).toBe(200);
  });

  // Catches: DocSpaceAdmin incorrectly denied access to own operation statuses by type
  test("GET /api/2.0/files/fileops/:operationType - DocSpaceAdmin returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .operations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
      });

    expect(status).toBe(200);
  });

  // Catches: guest incorrectly denied access to own operation statuses by type
  test("GET /api/2.0/files/fileops/:operationType - Guest returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .operations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
      });

    expect(status).toBe(200);
  });

  // Catches: RoomAdmin incorrectly denied access to own operation statuses by type
  test("GET /api/2.0/files/fileops/:operationType - RoomAdmin returns 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .operations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
      });

    expect(status).toBe(200);
  });

  // Catches: type filter breaking user isolation - user sees another user's operations
  test(
    "GET /api/2.0/files/fileops/:operationType - User does not see" +
      " operations of another user",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addMember("owner", "User");

      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest GetOpsByType User Isolation.docx",
        },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await apiSdk
        .forRole("user")
        .operations.getOperationStatusesByType({
          operationType: FileOperationType.Delete,
        });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: DocSpaceAdmin elevated privileges leaking into operation visibility by type
  test(
    "GET /api/2.0/files/fileops/:operationType - DocSpaceAdmin does" +
      " not see operations of another user",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addMember("owner", "DocSpaceAdmin");

      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest GetOpsByType DocSpaceAdmin Isolation.docx",
        },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .operations.getOperationStatusesByType({
          operationType: FileOperationType.Delete,
        });

      expect(status).toBe(200);
      expect(data.response!.length).toBe(0);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/markasread - markAsRead Permissions", () => {
  // Catches: anonymous user bypassing auth on a write endpoint
  test("PUT /api/2.0/files/fileops/markasread - Anonymous returns 401", async ({
    apiSdk,
  }) => {
    const anonConfig = new Configuration({
      basePath: apiSdk.tokenStore.portalBaseUrl,
      baseOptions: {
        headers: {
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
        },
      },
    });
    const anonOperations = new OperationsApi(
      anonConfig,
      undefined,
      apiSdk.createAxiosInstance() as any,
    );

    const { status } = await anonOperations.markAsRead();

    expect(status).toBe(401);
  });

  // Catches: owner incorrectly denied access to mark as read
  test("PUT /api/2.0/files/fileops/markasread - Owner returns 200", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").operations.markAsRead();

    expect(status).toBe(200);
  });

  // Catches: regular user incorrectly denied access to mark as read
  test("PUT /api/2.0/files/fileops/markasread - User returns 200", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.operations.markAsRead();

    expect(status).toBe(200);
  });

  // Catches: DocSpaceAdmin incorrectly denied access to mark as read
  test("PUT /api/2.0/files/fileops/markasread - DocSpaceAdmin returns 200", async ({
    apiSdk,
  }) => {
    const { api: docSpaceAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await docSpaceAdminApi.operations.markAsRead();

    expect(status).toBe(200);
  });

  // Catches: guest incorrectly denied access to mark as read
  test("PUT /api/2.0/files/fileops/markasread - Guest returns 200", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.operations.markAsRead();

    expect(status).toBe(200);
  });

  // Catches: RoomAdmin incorrectly denied access to mark as read
  test("PUT /api/2.0/files/fileops/markasread - RoomAdmin returns 200", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.operations.markAsRead();

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/markasread - User without room access returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MarkAsRead No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest MarkAsRead No Access File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/files/fileops/move - moveBatchItems - Permissions", () => {
  test("PUT /api/2.0/files/fileops/move - Unauthenticated request returns 401", async ({
    apiSdk,
  }) => {
    // Catches: unauthenticated access to move API not blocked
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest MoveBatch Perm Anon.docx",
      },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MoveBatch Perm Anon Room",
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

    const { status } = await anonOperations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(401);
  });

  test(
    "PUT /api/2.0/files/fileops/move - Owner can move file from MyDocs to room" +
      " returns 200",
    async ({ apiSdk }) => {
      // Catches: owner incorrectly denied access to move own files
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm Owner.docx",
        },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - DocSpaceAdmin can move file from MyDocs to room" +
      " returns 200",
    async ({ apiSdk }) => {
      // Catches: DocSpaceAdmin incorrectly denied move permission
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: adminMyDocsData } = await adminApi.folders.getMyFolder();
      const adminMyDocsFolderId = adminMyDocsData.response!.current!.id!;

      const { data: fileData } = await adminApi.files.createFile({
        folderId: adminMyDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm Admin.docx",
        },
      });

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm Admin Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await adminApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(adminApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - RoomAdmin can move file from own MyDocs" +
      " to a room returns 200",
    async ({ apiSdk }) => {
      // Catches: RoomAdmin incorrectly denied move of own MyDocs files
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm RoomAdminMyDocs Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: roomAdminApi, data: roomAdminData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminId = roomAdminData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data: myDocsData } = await roomAdminApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await roomAdminApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm RoomAdminMyDocs File.docx",
        },
      });

      const { data, status } = await roomAdminApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(roomAdminApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - User without access to destination room" +
      " cannot move file returns 403",
    async ({ apiSdk }) => {
      // Catches: user with no room access incorrectly allowed to move files there
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm NoAccess Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm NoAccess File.docx",
        },
      });

      const { status } = await userApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test("PUT /api/2.0/files/fileops/move - Guest cannot move file to room returns 403", async ({
    apiSdk,
  }) => {
    // Catches: guest incorrectly allowed to move files
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MoveBatch Perm Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest MoveBatch Perm Guest File.docx",
      },
    });

    const { status } = await guestApi.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });

    expect(status).toBe(403);
  });

  test(
    "PUT /api/2.0/files/fileops/move - User with Editing role in destination room" +
      " cannot move file to that room returns 403",
    async ({ apiSdk }) => {
      // Catches: Editing role incorrectly treated as having create/upload permission
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm Editing Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm Editing File.docx",
        },
      });

      const { status } = await userApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - User with Review role in destination room" +
      " cannot move file to that room returns 403",
    async ({ apiSdk }) => {
      // Catches: Review role incorrectly treated as having create/upload permission
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm Review Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Review }],
          notify: false,
        },
      });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm Review File.docx",
        },
      });

      const { status } = await userApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - ContentCreator cannot move file" +
      " from room to MyDocs returns 403",
    async ({ apiSdk }) => {
      // Catches: ContentCreator incorrectly allowed to remove files from room
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm CC FromRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: srcFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm CC FromRoom File.docx",
        },
      });

      const { data: userMyDocsData } = await userApi.folders.getMyFolder();
      const userMyDocsFolderId = userMyDocsData.response!.current!.id!;

      const { status } = await userApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: userMyDocsFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - RoomAdmin can move file between two rooms" +
      " where they are RoomManager returns 200",
    async ({ apiSdk }) => {
      // Catches: RoomAdmin denied move between rooms they manage
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm RoomAdmin Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = srcRoomData.response!.id!;

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm RoomAdmin Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { api: roomAdminApi, data: roomAdminData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminId = roomAdminData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: srcFolderId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
          notify: false,
        },
      });
      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data: rmMyDocsData } = await roomAdminApi.folders.getMyFolder();
      const rmMyDocsFolderId = rmMyDocsData.response!.current!.id!;

      const { data: fileData } = await roomAdminApi.files.createFile({
        folderId: rmMyDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm RoomAdmin File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      await roomAdminApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: srcFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(roomAdminApi.operations);

      const { data, status } = await roomAdminApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(roomAdminApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - User (ContentCreator in dest room)" +
      " can move file from MyDocs to that room returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Perm CC Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: destFolderId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: myDocsData } = await userApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await userApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch Perm CC File.docx",
        },
      });

      const { data, status } = await userApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(userApi.operations);
      expect(operation.finished).toBe(true);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/terminate/{id} - terminateTasks - Permissions", () => {
  test("PUT /api/2.0/files/fileops/terminate/{id} - Owner can terminate own operation returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Perm Owner.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });
    const operationId = opData.response![0].id!;

    const { status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - DocSpace Admin can terminate own operation returns 200", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: myDocsData } = await adminApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Perm Admin.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await adminApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });
    const operationId = opData.response![0].id!;

    const { status } = await adminApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Regular user can terminate own operation returns 200", async ({
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
      createFileJsonElement: {
        title: "Autotest TerminateTasks Perm User.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await userApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });
    const operationId = opData.response![0].id!;

    const { status } = await userApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - User cannot terminate another user's operation returns 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Perm CrossUser.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });
    const operationId = opData.response![0].id!;

    const { data, status } = await userApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Guest user returns 200 with empty response for non-existent operation", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.operations.terminateTasks({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Unauthenticated user returns 200 with empty response", async ({
    apiSdk,
  }) => {
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

    const { data, status } = await anonOperations.terminateTasks({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });
});

test.describe("PUT /api/2.0/files/file/{fileId}/comment - updateFileComment - Permissions", () => {
  test("PUT /api/2.0/files/file/{fileId}/comment - Owner updates comment on own file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm Owner.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Owner comment" },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - DocSpace Admin updates comment on own file returns 200", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: myDocsData } = await adminApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm Admin.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await adminApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Admin comment" },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Regular user updates comment on own file returns 200", async ({
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
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm User.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "User comment" },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - User with Editing access cannot update comment on another user's room file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest UpdateComment Perm Editor Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm Editor File.docx",
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

    const { status } = await userApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Editor comment" },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - User with Read access cannot update comment on room file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest UpdateComment Perm Reader Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm Reader File.docx",
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

    const { status } = await userApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Reader comment" },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Guest with Read access cannot update comment on room file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest UpdateComment Perm Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm Guest File.docx",
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

    const { status } = await guestApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Guest comment" },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - User cannot update comment on another user's file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm NoAccess.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Unauthorized" },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Unauthenticated user returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Perm Anon.docx",
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

    const { status } = await anonOperations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Anon" },
    });

    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/files/{folderId}/session/{sessionId} - abortUploadSession - Permissions", () => {
  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - Unauthenticated" +
      " user returns 401",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AbortSession Perm Anon Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession Perm Anon.docx",
            fileSize: 256,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

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

      const { status } = await anonOperations.abortUploadSession({
        folderId,
        sessionId,
      });

      expect(status).toBe(401);
    },
  );

  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - Owner can abort" +
      " own session returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AbortSession Perm Owner Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession Perm Owner.docx",
            fileSize: 256,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const { status } = await ownerApi.operations.abortUploadSession({
        folderId,
        sessionId,
      });

      expect(status).toBe(200);
    },
  );

  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - User" +
      " (ContentCreator) can abort own session returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AbortSession Perm CC Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: folderId,
        roomInvitationRequest: {
          invitations: [
            {
              id: userData.response!.id!,
              access: FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });

      const { data: sessionData } =
        await userApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession Perm CC.docx",
            fileSize: 256,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const { status } = await userApi.operations.abortUploadSession({
        folderId,
        sessionId,
      });

      expect(status).toBe(200);
    },
  );

  // BUG 82276: DELETE /api/2.0/files/{folderId}/session/{sessionId} - Any authenticated user can abort another user's session regardless of room access
  test.fail(
    "BUG 82276: DELETE /api/2.0/files/{folderId}/session/{sessionId} - User" +
      " (ContentCreator) cannot abort another user's session returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AbortSession Perm CrossUser Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      await ownerApi.rooms.setRoomSecurity({
        id: folderId,
        roomInvitationRequest: {
          invitations: [
            {
              id: userData.response!.id!,
              access: FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession Perm CrossUser Owner.docx",
            fileSize: 256,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const { status } = await userApi.operations.abortUploadSession({
        folderId,
        sessionId,
      });

      expect(status).toBe(403);
    },
  );

  // BUG 82276: DELETE /api/2.0/files/{folderId}/session/{sessionId} - User without room access can abort another user's session (returns 200 and actually terminates the session)
  test.fail(
    "BUG 82276: DELETE /api/2.0/files/{folderId}/session/{sessionId} - User" +
      " without room access cannot abort session returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AbortSession Perm NoAccess Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession Perm NoAccess Owner.docx",
            fileSize: 256,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "User");
      const userApi = apiSdk.forRole("user");

      const { status } = await userApi.operations.abortUploadSession({
        folderId,
        sessionId,
      });

      expect(status).toBe(403);
    },
  );
});
