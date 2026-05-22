import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FormFillingManageAction,
  FileShare,
} from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";

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
        manageFormFillingDtoInteger: {
          formId,
          action: FormFillingManageAction.Start,
        },
      });

      expect(status).toBe(200);
    });

    await test.step("Stop form filling", async () => {
      const { status } = await dsAdminApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDtoInteger: {
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
      manageFormFillingDtoInteger: {
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
        manageFormFillingDtoInteger: {
          formId,
          action: FormFillingManageAction.Start,
        },
      });

      expect(status).toBe(200);
    });

    await test.step("Stop form filling", async () => {
      const { status } = await contentCreatorApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDtoInteger: {
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
      manageFormFillingDtoInteger: {
        formId,
        action: FormFillingManageAction.Start,
      },
    });

    const { status } = await contentCreatorApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDtoInteger: {
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
      manageFormFillingDtoInteger: {
        formId,
        action: FormFillingManageAction.Start,
      },
    });

    const { status } = await contentCreatorApi.files.manageFormFilling({
      fileId: String(formId),
      manageFormFillingDtoInteger: {
        formId,
        action: FormFillingManageAction.Stop,
      },
    });

    expect(status).toBe(403);
  });
});
