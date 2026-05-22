import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { createTestImageBuffer } from "@/src/utils/test-image";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";
import { waitForRoomFromTemplate } from "@/src/helpers/wait-for-room-from-template";

test.describe("POST /api/2.0/files/logos - Upload room logo image", () => {
  test("POST /api/2.0/files/logos - Owner uploads a valid PNG image", async ({
    apiSdk,
  }) => {
    const result = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    expect(result.status).toBe(200);
    expect(result.data.response.success).toBe(true);
  });

  test("POST /api/2.0/files/logos - Response contains tmpFile path as string", async ({
    apiSdk,
  }) => {
    const result = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    expect(result.data.response.data).toBeDefined();
    expect(typeof result.data.response.data).toBe("string");
    expect(result.data.response.data.length).toBeGreaterThan(0);
  });
});

test.describe("POST /files/rooms/:id/logo - Create room logo", () => {
  test("POST /files/rooms/:id/logo - Owner creates room logo from uploaded image", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Create Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    expect(uploadResult.data.response.success).toBe(true);
    const tmpFile = uploadResult.data.response.data as string;

    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Logo has original, large, medium, small URLs", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Sizes Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    expect(data.response!.logo?.original).toBeTruthy();
    expect(data.response!.logo?.large).toBeTruthy();
    expect(data.response!.logo?.medium).toBeTruthy();
    expect(data.response!.logo?.small).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Logo can be created with crop parameters (x, y, width, height)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Crop Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: {
        tmpFile: uploadResult.data.response.data as string,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Non-existent room returns 404", async ({
    apiSdk,
  }) => {
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { status } = await apiSdk.forRole("owner").rooms.createRoomLogo({
      id: 999999999,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(404);
  });

  test("POST /files/rooms/:id/logo - Cannot create logo for archived room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    let roomId: number;

    await test.step("create room", async () => {
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Archived Room",
          roomType: RoomType.CustomRoom,
        },
      });
      roomId = roomData.response!.id!;
    });

    await test.step("archive room", async () => {
      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);
    });

    await test.step("try to create logo — expect 403", async () => {
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );
      const { status } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: uploadResult.data.response.data as string },
      });
      expect(status).toBe(403);
    });
  });

  test("POST /files/rooms/:id/logo - Invalid tmpFile returns error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Invalid TmpFile Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: "/non/existent/path/fake.png" },
    });

    expect(status).toBe(403);
  });

  test("POST /files/rooms/:id/logo - Owner can create logo for a room saved as template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Template Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: { roomId, title: "Autotest Logo Template" },
    });
    const templateId = await waitForRoomTemplate(ownerApi.rooms);

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: templateId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Logo is visible in getRoomInfo with same URLs", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo GetInfo Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data: createData } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: infoData, status } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });

    const pathOf = (url: string | null | undefined) => url?.split("?")[0];

    expect(status).toBe(200);
    expect(infoData.response!.logo?.original).toContain("/storage/room_logos/");
    expect(pathOf(infoData.response!.logo?.original)).toBe(
      pathOf(createData.response!.logo?.original),
    );
    expect(pathOf(infoData.response!.logo?.large)).toBe(
      pathOf(createData.response!.logo?.large),
    );
    expect(pathOf(infoData.response!.logo?.medium)).toBe(
      pathOf(createData.response!.logo?.medium),
    );
    expect(pathOf(infoData.response!.logo?.small)).toBe(
      pathOf(createData.response!.logo?.small),
    );
  });

  test("POST /files/rooms/:id/logo - Can replace existing logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Replace Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const firstUpload = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data: firstLogoData } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: firstUpload.data.response.data as string },
    });
    const firstOriginal = firstLogoData.response!.logo!.original!;

    const secondUpload = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data: secondLogoData, status } =
      await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: secondUpload.data.response.data as string },
      });

    expect(status).toBe(200);
    expect(secondLogoData.response!.logo?.original).toBeTruthy();
    expect(secondLogoData.response!.logo?.original).not.toBe(firstOriginal);
  });
});

test.describe("POST /files/rooms/:id/logo - tmpFile validation", () => {
  test.fail(
    "BUG 81677: POST /files/rooms/:id/logo - Missing tmpFile (empty logoRequest) returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Missing TmpFile Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {},
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81677: POST /files/rooms/:id/logo - Empty string tmpFile returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Empty TmpFile Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: "" },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81677: POST /files/rooms/:id/logo - Null tmpFile returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Null TmpFile Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: null },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test("POST /files/rooms/:id/logo - Numeric tmpFile returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Numeric TmpFile Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: 123 as unknown as string },
    });

    expect(data.statusCode).toBe(400);
  });

  test("POST /files/rooms/:id/logo - Object tmpFile returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Object TmpFile Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: { path: "fake.png" } as unknown as string },
    });

    expect(data.statusCode).toBe(400);
  });

  test("POST /files/rooms/:id/logo - Array tmpFile returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Array TmpFile Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: ["fake.png"] as unknown as string },
    });

    expect(data.statusCode).toBe(400);
  });
});

test.describe("POST /files/rooms/:id/logo - Room ID validation", () => {
  test("POST /files/rooms/:id/logo - Deleted room returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Deleted Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    expect(status).toBe(404);
  });

  test("POST /files/rooms/:id/logo - Non-numeric id format returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );

    const { status } = await ownerApi.rooms.createRoomLogo({
      id: "abc" as unknown as number,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    expect(status).toBe(404);
  });
});

test.describe("POST /files/rooms/:id/logo - Crop parameters validation", () => {
  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - Negative x coordinate returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Negative X Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: -1,
          y: 0,
          width: 1,
          height: 1,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - Negative y coordinate returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Negative Y Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: 0,
          y: -1,
          width: 1,
          height: 1,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - Zero width returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Zero Width Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: 0,
          y: 0,
          width: 0,
          height: 1,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - Zero height returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Zero Height Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: 0,
          y: 0,
          width: 1,
          height: 0,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test("POST /files/rooms/:id/logo - Negative width returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Negative Width Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );

    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: {
        tmpFile: uploadResult.data.response.data as string,
        x: 0,
        y: 0,
        width: -10,
        height: 1,
      },
    });

    expect(data.statusCode).toBe(400);
  });

  test("POST /files/rooms/:id/logo - Negative height returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Negative Height Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );

    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: {
        tmpFile: uploadResult.data.response.data as string,
        x: 0,
        y: 0,
        width: 1,
        height: -10,
      },
    });

    expect(data.statusCode).toBe(400);
  });

  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - String x coordinate returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo String X Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: "10" as unknown as number,
          y: 0,
          width: 1,
          height: 1,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - String width returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo String Width Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: 0,
          y: 0,
          width: "100" as unknown as number,
          height: 1,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test.fail(
    "BUG 81678: POST /files/rooms/:id/logo - Crop area outside image bounds returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Crop Out Of Bounds Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );

      const { data } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: {
          tmpFile: uploadResult.data.response.data as string,
          x: 100,
          y: 100,
          width: 1000,
          height: 1000,
        },
      });

      expect(data.statusCode).toBe(400);
    },
  );

  test("POST /files/rooms/:id/logo - Only x and y without width/height returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Partial Crop XY Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );

    const { status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: {
        tmpFile: uploadResult.data.response.data as string,
        x: 0,
        y: 0,
      },
    });

    expect(status).toBe(200);
  });

  test("POST /files/rooms/:id/logo - Only width and height without x/y returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Partial Crop WH Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );

    const { status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: {
        tmpFile: uploadResult.data.response.data as string,
        width: 1,
        height: 1,
      },
    });

    expect(status).toBe(200);
  });
});

test.describe("POST /files/rooms/:id/logo - File lifecycle and consistency", () => {
  test("POST /files/rooms/:id/logo - Same tmpFile cannot be reused for another room after creation", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomAData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Reuse Room A",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomAId = roomAData.response!.id!;
    const { data: roomBData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Reuse Room B",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomBId = roomBData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const tmpFile = uploadResult.data.response.data as string;

    const firstResult = await ownerApi.rooms.createRoomLogo({
      id: roomAId,
      logoRequest: { tmpFile },
    });
    expect(firstResult.status).toBe(200);

    const { status } = await ownerApi.rooms.createRoomLogo({
      id: roomBId,
      logoRequest: { tmpFile },
    });

    expect(status).toBe(404);
  });

  test.fail(
    "BUG 81679: POST /files/rooms/:id/logo - Non-image content as tmpFile returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Non Image Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        Buffer.from("this is not a valid image", "utf-8"),
      );

      const { status } = await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: uploadResult.data.response.data as string },
      });

      expect(status).toBe(403);
    },
  );

  test("POST /files/rooms/:id/logo - Logo creation does not modify other room metadata", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Metadata Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: before } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: after } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(after.response!.title).toBe(before.response!.title);
    expect(after.response!.roomType).toBe(before.response!.roomType);
    expect(after.response!.access).toBe(before.response!.access);
    expect(after.response!.tags ?? []).toEqual(before.response!.tags ?? []);
  });

  test("POST /files/rooms/:id/logo - Logo survives archive/unarchive cycle", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Archive Cycle Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data: created } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    const originalPath = created.response!.logo!.original!.split("?")[0];

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    await ownerApi.rooms.unarchiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: after, status } = await ownerApi.rooms.getRoomInfo({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(after.response!.logo?.original).toContain("/storage/room_logos/");
    expect(after.response!.logo?.original?.split("?")[0]).toBe(originalPath);
  });

  test("POST /files/rooms/:id/logo - Logo URLs are stable across repeated getRoomInfo calls", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Stable URLs Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data: first } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    const { data: second } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    const { data: third } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(first.response!.logo?.original).toBeTruthy();
    expect(second.response!.logo?.original).toBe(
      first.response!.logo?.original,
    );
    expect(third.response!.logo?.original).toBe(first.response!.logo?.original);
    expect(second.response!.logo?.large).toBe(first.response!.logo?.large);
    expect(second.response!.logo?.medium).toBe(first.response!.logo?.medium);
    expect(second.response!.logo?.small).toBe(first.response!.logo?.small);
  });
});

test.describe("DELETE /files/rooms/:id/logo - Delete room logo", () => {
  test("DELETE /files/rooms/:id/logo - Owner deletes existing room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Delete Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Response has correct structure after deletion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Delete Structure Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data } = await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBeDefined();
    expect(data.response!.logo).toBeDefined();
  });

  test("DELETE /files/rooms/:id/logo - Deleting logo when room has no logo is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo No Logo Delete Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });

    expect(status).toBe(200);
  });

  test("BUG 80983: DELETE /files/rooms/:id/logo - Non-existent room returns 500 instead of 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rooms.deleteRoomLogo({ id: 999999999 });
    expect(status).toBe(404);
  });

  test("DELETE /files/rooms/:id/logo - Cannot delete logo from archived room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    let roomId: number;

    await test.step("create room", async () => {
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Logo Del Archived Room",
          roomType: RoomType.CustomRoom,
        },
      });
      roomId = roomData.response!.id!;
    });

    await test.step("set logo", async () => {
      const uploadResult = await apiSdk.uploadRoomLogo(
        "owner",
        createTestImageBuffer(),
      );
      await ownerApi.rooms.createRoomLogo({
        id: roomId,
        logoRequest: { tmpFile: uploadResult.data.response.data as string },
      });
    });

    await test.step("archive room", async () => {
      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);
    });

    await test.step("try to delete logo — expect 403", async () => {
      const { status } = await ownerApi.rooms.deleteRoomLogo({ id: roomId });
      expect(status).toBe(403);
    });
  });

  test("DELETE /files/rooms/:id/logo - Owner can delete logo from a room saved as template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Template Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId,
        title: "Autotest Logo Del Template",
        copyLogo: true,
      },
    });

    const templateId = await waitForRoomTemplate(ownerApi.rooms);

    const { data, status } = await ownerApi.rooms.deleteRoomLogo({
      id: templateId,
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - getRoomInfo after deletion shows empty logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Verify Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Repeated delete on the same room returns 200 each time", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Repeated Delete Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const first = await ownerApi.rooms.deleteRoomLogo({ id: roomId });
    expect(first.status).toBe(200);

    const second = await ownerApi.rooms.deleteRoomLogo({ id: roomId });
    expect(second.status).toBe(200);
    expect(second.data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Delete after the logo was replaced removes the latest logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Replaced Then Deleted Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const firstUpload = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: firstUpload.data.response.data as string },
    });

    const secondUpload = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: secondUpload.data.response.data as string },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeFalsy();
    expect(data.response!.logo?.large).toBeFalsy();
    expect(data.response!.logo?.medium).toBeFalsy();
    expect(data.response!.logo?.small).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Other room fields are not changed by logo deletion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const title = "Autotest Logo Del Preserves Fields";
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["AutotestLogoDelTag"] },
    });

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(data.response!.title).toBe(title);
    expect(data.response!.roomType).toBe(RoomType.CustomRoom);
    expect(data.response!.tags).toContain("AutotestLogoDelTag");
  });

  test("DELETE /files/rooms/:id/logo - Logo URLs are present before delete and gone after", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo URLs Before After",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const before = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(before.data.response!.logo?.original).toBeTruthy();
    expect(before.data.response!.logo?.large).toBeTruthy();
    expect(before.data.response!.logo?.medium).toBeTruthy();
    expect(before.data.response!.logo?.small).toBeTruthy();

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const after = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(after.data.response!.logo?.original).toBeFalsy();
    expect(after.data.response!.logo?.large).toBeFalsy();
    expect(after.data.response!.logo?.medium).toBeFalsy();
    expect(after.data.response!.logo?.small).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Cannot delete logo from a deleted room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del After Room Deleted",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.rooms.deleteRoomLogo({ id: roomId });
    expect(status).toBe(404);
  });

  test("DELETE /files/rooms/:id/logo - New logo can be uploaded after deletion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Re-upload Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const firstUpload = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: firstUpload.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const secondUpload = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: secondUpload.data.response.data as string },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("DELETE /files/rooms/:id/logo - Resets cover to default 'schedule'", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Resets Cover",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(data.response!.logo?.cover?.id).toBe("schedule");
  });

  test("DELETE /files/rooms/:id/logo - Rooms list reflects reset logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const title = "Autotest Logo Del In List Room";
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const { data: list } = await ownerApi.rooms.getRoomsFolder({
      filterValue: title,
    });
    const room = (list.response!.folders ?? []).find(
      (f) => (f as { id?: number }).id === roomId,
    ) as { logo?: { original?: string } } | undefined;

    expect(room).toBeDefined();
    expect(room!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Template created from a room with deleted logo has no logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Then Template Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId,
        title: "Autotest Logo Del Then Template",
        copyLogo: true,
      },
    });
    const templateId = await waitForRoomTemplate(ownerApi.rooms);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: templateId });
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Room created from template with deleted logo has no custom logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Template With Deleted Logo Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId,
        title: "Autotest Logo Template With Deleted Logo",
        copyLogo: true,
      },
    });
    const templateId = await waitForRoomTemplate(ownerApi.rooms);

    await ownerApi.rooms.deleteRoomLogo({ id: templateId });

    await ownerApi.rooms.createRoomFromTemplate({
      createRoomFromTemplateDto: {
        templateId,
        title: "Autotest Room From Template No Logo",
      },
    });
    const newRoomId = await waitForRoomFromTemplate(ownerApi.rooms);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: newRoomId });
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Sharing is preserved after logo deletion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Keeps Sharing",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const { status } = await apiSdk
      .forRole("user")
      .rooms.getRoomInfo({ id: roomId });
    expect(status).toBe(200);
  });
});
