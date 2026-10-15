import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FormFillingManageAction,
  FileShare,
} from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";
import { startFormFilling } from "@/src/helpers/files";

test.describe("PUT /files/file/:fileId/manageformfilling - permissions", () => {
  test("PUT /files/file/:fileId/manageformfilling - DocSpaceAdmin with RoomManager access can start and stop form filling", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ManageFormFilling RoomManager Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const buffer = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "owner",
        roomId,
        buffer,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, `Insert failed: ${JSON.stringify(insertData)}`).toBe(
      200,
    );
    const formId = insertData.response.id as number;

    const { api: dsAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    await test.step("Start form filling", async () => {
      const { status } = await dsAdminApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDto: {
          formId,
          action: FormFillingManageAction.Start,
        },
      });

      expect(status).toBe(200);
    });

    await test.step("Stop form filling", async () => {
      const { status } = await dsAdminApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDto: {
          formId,
          action: FormFillingManageAction.Stop,
        },
      });

      expect(status).toBe(200);
    });
  });

  test("PUT /files/file/:fileId/manageformfilling - ContentCreator can start form filling", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ManageFormFilling ContentCreator Start Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const buffer = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "owner",
        roomId,
        buffer,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, `Insert failed: ${JSON.stringify(insertData)}`).toBe(
      200,
    );
    const formId = insertData.response.id as number;

    const { api: contentCreatorApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { status } = await contentCreatorApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDto: {
        formId,
        action: FormFillingManageAction.Start,
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /files/file/:fileId/manageformfilling - ContentCreator can start and stop form filling they created", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ManageFormFilling ContentCreator Own Form Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: contentCreatorApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const buffer = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "docSpaceAdmin",
        roomId,
        buffer,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, `Insert failed: ${JSON.stringify(insertData)}`).toBe(
      200,
    );
    const formId = insertData.response.id as number;

    await test.step("Start form filling", async () => {
      const { status } = await contentCreatorApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDto: {
          formId,
          action: FormFillingManageAction.Start,
        },
      });

      expect(status).toBe(200);
    });

    await test.step("Stop form filling", async () => {
      const { status } = await contentCreatorApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDto: {
          formId,
          action: FormFillingManageAction.Stop,
        },
      });

      expect(status).toBe(200);
    });
  });

  test("BUG 81470: PUT /files/file/:fileId/manageformfilling - ContentCreator can stop form filling they started", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ManageFormFilling ContentCreator Stop Started Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const buffer = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "owner",
        roomId,
        buffer,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, `Insert failed: ${JSON.stringify(insertData)}`).toBe(
      200,
    );
    const formId = insertData.response.id as number;

    const { api: contentCreatorApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    await contentCreatorApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDto: {
        formId,
        action: FormFillingManageAction.Start,
      },
    });

    const { status } = await contentCreatorApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDto: {
        formId,
        action: FormFillingManageAction.Stop,
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /files/file/:fileId/manageformfilling - ContentCreator cannot stop form filling started by owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ManageFormFilling ContentCreator Cannot Stop Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const buffer = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "owner",
        roomId,
        buffer,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, `Insert failed: ${JSON.stringify(insertData)}`).toBe(
      200,
    );
    const formId = insertData.response.id as number;

    const { api: contentCreatorApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    await ownerApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDto: {
        formId,
        action: FormFillingManageAction.Start,
      },
    });

    const { status } = await contentCreatorApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDto: {
        formId,
        action: FormFillingManageAction.Stop,
      },
    });

    expect(status).toBe(403);
  });
});

type MemberType = "RoomAdmin" | "User" | "Guest";

// Expected status per endpoint for a caller with the given membership in the
// Read access is enough for getAllFormRoles and getFormSubmissions (documented:
// "every member of the room" can read them); generateXlsx and saveFormRoleMapping
// need the right to start the filling.
// only: whether it may read getFormSubmissions is an open contract question.
const formAccessMatrix: Array<{
  label: string;
  type: MemberType;
  access: FileShare | null;
  canManage: boolean;
}> = [
  {
    label: "RoomAdmin RoomManager",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
    canManage: true,
  },
  {
    label: "RoomAdmin ContentCreator",
    type: "RoomAdmin",
    access: FileShare.ContentCreator,
    canManage: true,
  },
  {
    label: "User ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
    canManage: true,
  },
  {
    label: "User FillForms",
    type: "User",
    access: FileShare.FillForms,
    canManage: false,
  },
  {
    label: "RoomAdmin without room access",
    type: "RoomAdmin",
    access: null,
    canManage: false,
  },
  {
    label: "User without room access",
    type: "User",
    access: null,
    canManage: false,
  },
  {
    label: "Guest without room access",
    type: "Guest",
    access: null,
    canManage: false,
  },
];

test.describe("Form results and role mapping - permissions", () => {
  for (const { label, type, access, canManage } of formAccessMatrix) {
    test(`Form results endpoints - ${label} ${canManage ? "can" : "cannot"} manage the form`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: me } = await ownerApi.profiles.getSelfProfile();
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Form Results Permissions Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const roomId = roomData.response!.id!;
      const formId = await startFormFilling(apiSdk, "owner", roomId);

      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      if (access !== null) {
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberData.response!.id!, access }],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);
      }
      const expected = canManage ? 200 : 403;

      // Positive control: the owner can use every endpoint on this form.
      const { status: ownerGenerate } = await ownerApi.files.generateXlsx({
        fileId: formId,
      });
      expect(ownerGenerate).toBe(200);

      await test.step("generateXlsx", async () => {
        const { status } = await api.files.generateXlsx({ fileId: formId });
        expect(status).toBe(expected);
      });

      await test.step("saveFormRoleMapping stores nothing when denied", async () => {
        const { status } = await api.files.saveFormRoleMapping({
          fileId: String(formId),
          saveFormRoleMappingDto: {
            formId,
            roles: [
              {
                roleName: "Permission Role",
                sequence: 1,
                userId: me.response!.id!,
              },
            ],
          },
        });
        const { data: roles } = await ownerApi.files.getAllFormRoles({
          fileId: formId,
        });

        expect(roles.response?.length).toBe(canManage ? 1 : 0);
        expect(status).toBe(expected);
      });

      await test.step("getAllFormRoles", async () => {
        const { status } = await api.files.getAllFormRoles({ fileId: formId });
        const rolesExpected = access !== null ? 200 : 403;
        expect(status).toBe(rolesExpected);
      });

      await test.step("getFormSubmissions", async () => {
        const { status } = await api.files.getFormSubmissions({
          fileId: formId,
        });
        expect(status).toBe(access !== null ? 200 : 403);
      });
    });
  }

  test("GET /files/file/:fileId/xlsx - Member without room access does not see the owner's task", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Xlsx Isolation Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const formId = await startFormFilling(
      apiSdk,
      "owner",
      roomData.response!.id!,
    );
    await ownerApi.files.generateXlsx({ fileId: formId });

    // Positive control: the generating user sees the task.
    const { data: ownerTask } = await ownerApi.files.getXlsx({
      fileId: formId,
    });
    expect(ownerTask.response?.id).toBeTruthy();

    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");
    const { data, status } = await api.files.getXlsx({ fileId: formId });

    expect(status).toBe(200);
    expect(data.response).toBeUndefined();
  });

  test("Form results endpoints - Anonymous user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Form Results Anonymous Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const formId = await startFormFilling(
      apiSdk,
      "owner",
      roomData.response!.id!,
    );
    const anonymousApi = apiSdk.forAnonymous();

    const results = await Promise.all([
      anonymousApi.files.getFormSubmissions({ fileId: formId }),
      anonymousApi.files.generateXlsx({ fileId: formId }),
      anonymousApi.files.getXlsx({ fileId: formId }),
      anonymousApi.files.saveFormRoleMapping({
        fileId: String(formId),
        saveFormRoleMappingDto: { formId, roles: [] },
      }),
    ]);

    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });
});
