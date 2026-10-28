import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FormFillingManageAction,
} from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";
import { startFormFilling } from "@/src/helpers/files";

test.describe("PUT /files/file/:fileId/manageformfilling", () => {
  test("PUT /files/file/:fileId/manageformfilling - Owner starts and stops form filling", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Form Filling Room",
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

    await test.step("Start form filling", async () => {
      const { status } = await ownerApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDto: {
          formId,
          action: FormFillingManageAction.Start,
        },
      });

      expect(status).toBe(200);
    });

    await test.step("Stop form filling", async () => {
      const { status } = await ownerApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDto: {
          formId,
          action: FormFillingManageAction.Stop,
        },
      });

      expect(status).toBe(200);
    });
  });
});

const FORM_PATH = "../../../assets/oo-form-empty.pdf";

async function createFillingRoom(
  apiSdk: Parameters<Parameters<typeof test>[2]>[0]["apiSdk"],
  title: string,
) {
  const { data } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.FillingFormsRoom },
  });
  return data.response!.id!;
}

async function insertUnstartedForm(
  apiSdk: Parameters<Parameters<typeof test>[2]>[0]["apiSdk"],
  roomId: number,
) {
  const { data } = await apiSdk.insertBinaryFile(
    "owner",
    roomId,
    readFileSync(path.join(__dirname, FORM_PATH)),
    "oo-form-empty.pdf",
  );
  return data.response.id as number;
}

test.describe("GET /files/file/:fileId/submissions", () => {
  test("GET /files/file/:fileId/submissions - Started form without answers returns empty metadata and submissions", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createFillingRoom(apiSdk, "Autotest Submissions Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const { data, status } = await ownerApi.files.getFormSubmissions({
      fileId: formId,
    });

    expect(status).toBe(200);
    expect(data.response?.metadata).toEqual([]);
    expect(data.response?.submissions).toEqual([]);
  });

  test("GET /files/file/:fileId/submissions - Repeated read is stable and has no side effects", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createFillingRoom(apiSdk, "Autotest Submissions Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const first = await ownerApi.files.getFormSubmissions({ fileId: formId });
    const second = await ownerApi.files.getFormSubmissions({ fileId: formId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data.response).toEqual(first.data.response);

    const { data: info } = await ownerApi.files.getFileInfo({ fileId: formId });
    expect(info.response?.version).toBe(1);
  });

  test("GET /files/file/:fileId/submissions - Regular docx file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Submissions Docx.docx" },
    });

    const { status } = await ownerApi.files.getFormSubmissions({
      fileId: created.response!.id!,
    });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/submissions - Form that is not started returns 403", async ({
    apiSdk,
  }) => {
    const roomId = await createFillingRoom(apiSdk, "Autotest Submissions Room");
    const formId = await insertUnstartedForm(apiSdk, roomId);

    const { status } = await apiSdk
      .forRole("owner")
      .files.getFormSubmissions({ fileId: formId });

    expect(status).toBe(403);
  });

  // The SDK describes 403 only for a caller without access and a form that was
  // never started; the status for an unknown id is not documented, so it is not
  // asserted here.
});

test.describe("POST /files/file/:fileId/xlsx and GET /files/file/:fileId/xlsx", () => {
  test("POST /files/file/:fileId/xlsx - Generates a report that getXlsx reports as completed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createFillingRoom(apiSdk, "Autotest Xlsx Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    let resultsFolderId = 0;
    await test.step("Generate the report", async () => {
      const { data, status } = await ownerApi.files.generateXlsx({
        fileId: formId,
      });

      expect(status).toBe(200);
      expect(data.response?.isNewFile).toBe(true);
      expect(data.response?.form?.id).toBe(formId);
      expect(data.response?.task?.id).toBeTruthy();
      resultsFolderId = data.response!.form!.resultsFolderId!;
      expect(resultsFolderId).toBeGreaterThan(0);
    });

    let resultFileId = 0;
    await test.step("Poll the task until it completes", async () => {
      await expect
        .poll(
          async () => {
            const { data } = await ownerApi.files.getXlsx({ fileId: formId });
            return data.response?.isCompleted;
          },
          { timeout: 60_000, intervals: [500, 1000, 2000] },
        )
        .toBe(true);

      const { data, status } = await ownerApi.files.getXlsx({ fileId: formId });
      expect(status).toBe(200);
      expect(data.response?.percentage).toBe(100);
      expect(data.response?.error).toBeFalsy();
      expect(data.response?.resultFileName).toMatch(/\.xlsx$/);
      resultFileId = Number(data.response!.resultFileId);
      expect(resultFileId).toBeGreaterThan(0);
    });

    await test.step("The report file exists in the results folder", async () => {
      const { data: info, status } = await ownerApi.files.getFileInfo({
        fileId: resultFileId,
      });
      expect(status).toBe(200);
      expect(info.response?.fileExst).toBe(".xlsx");
      expect(info.response?.folderId).toBe(resultsFolderId);
    });
  });

  test("POST /files/file/:fileId/xlsx - Second call reuses the report instead of creating another", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createFillingRoom(apiSdk, "Autotest Xlsx Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const first = await ownerApi.files.generateXlsx({ fileId: formId });
    expect(first.status).toBe(200);
    const resultsFolderId = first.data.response!.form!.resultsFolderId!;

    await expect
      .poll(
        async () => {
          const { data } = await ownerApi.files.getXlsx({ fileId: formId });
          return data.response?.isCompleted;
        },
        { timeout: 60_000 },
      )
      .toBe(true);

    const second = await ownerApi.files.generateXlsx({ fileId: formId });
    expect(second.status).toBe(200);
    expect(second.data.response?.isNewFile).toBe(false);

    const { data: folder } = await ownerApi.folders.getFolderByFolderId({
      folderId: resultsFolderId,
    });
    const xlsxFiles = (folder.response?.files ?? []).filter((f) =>
      f.title?.endsWith(".xlsx"),
    );
    expect(xlsxFiles).toHaveLength(1);
  });

  test("GET /files/file/:fileId/xlsx - Before any generation returns no task", async ({
    apiSdk,
  }) => {
    const roomId = await createFillingRoom(apiSdk, "Autotest Xlsx Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const { data, status } = await apiSdk
      .forRole("owner")
      .files.getXlsx({ fileId: formId });

    expect(status).toBe(200);
    expect(data.response).toBeUndefined();
    expect(data.count).toBe(0);
  });

  test("POST /files/file/:fileId/xlsx - Regular docx file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Xlsx Docx.docx" },
    });

    const { status } = await ownerApi.files.generateXlsx({
      fileId: created.response!.id!,
    });

    expect(status).toBe(403);
  });

  test("POST /files/file/:fileId/xlsx - Form that is not started returns 403", async ({
    apiSdk,
  }) => {
    const roomId = await createFillingRoom(apiSdk, "Autotest Xlsx Room");
    const formId = await insertUnstartedForm(apiSdk, roomId);

    const { status } = await apiSdk
      .forRole("owner")
      .files.generateXlsx({ fileId: formId });

    expect(status).toBe(403);
  });

  test("POST /files/file/:fileId/xlsx - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .files.generateXlsx({ fileId: 999999999 });

    expect(status).toBe(404);
  });

  // Documented: a run is kept per caller and form, and "nothing at all comes
  // back when no run is on record ... not an error", so an unknown id reads as
  // "no run" instead of 404.
  test("GET /files/file/:fileId/xlsx - Unknown fileId reads as no run on record", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .files.getXlsx({ fileId: 999999999 });

    expect(status).toBe(200);
    expect(data.response).toBeUndefined();
  });

  // Documented: either the original form id or the id of the XLSX result file
  // in the room's Complete folder resolves to the same form.
  test("POST /files/file/:fileId/xlsx - Result file id resolves to the original form", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createFillingRoom(apiSdk, "Autotest Xlsx Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);
    await ownerApi.files.generateXlsx({ fileId: formId });
    await expect
      .poll(
        async () => {
          const { data } = await ownerApi.files.getXlsx({ fileId: formId });
          return data.response?.isCompleted;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const { data: task } = await ownerApi.files.getXlsx({ fileId: formId });

    const { data, status } = await ownerApi.files.generateXlsx({
      fileId: Number(task.response!.resultFileId),
    });

    expect(status).toBe(200);
    expect(data.response?.form?.id).toBe(formId);
    expect(data.response?.isNewFile).toBe(false);
  });
});

test.describe("POST /files/file/:fileId/formrolemapping", () => {
  test("POST /files/file/:fileId/formrolemapping - Saved role is returned by getAllFormRoles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const roomId = await createFillingRoom(apiSdk, "Autotest RoleMapping Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const { status } = await ownerApi.files.saveFormRoleMapping({
      fileId: String(formId),
      saveFormRoleMappingDto: {
        formId,
        roles: [
          { roleName: "Autotest Role", sequence: 1, userId: me.response!.id! },
        ],
      },
    });
    expect(status).toBe(200);

    const { data: roles } = await ownerApi.files.getAllFormRoles({
      fileId: formId,
    });
    expect(roles.response).toHaveLength(1);
    expect(roles.response![0].roleName).toBe("Autotest Role");
    expect(roles.response![0].sequence).toBe(1);
    expect(roles.response![0].user?.id).toBe(me.response!.id);
    expect(roles.response![0].submitted).toBe(false);
  });

  test("POST /files/file/:fileId/formrolemapping - Two roles keep their sequence and users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const { data: member } = await apiSdk.addMember("owner", "User");
    const roomId = await createFillingRoom(apiSdk, "Autotest RoleMapping Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const { status } = await ownerApi.files.saveFormRoleMapping({
      fileId: String(formId),
      saveFormRoleMappingDto: {
        formId,
        roles: [
          { roleName: "First", sequence: 1, userId: me.response!.id! },
          { roleName: "Second", sequence: 2, userId: member.response!.id! },
        ],
      },
    });
    expect(status).toBe(200);

    const { data: roles } = await ownerApi.files.getAllFormRoles({
      fileId: formId,
    });
    const byName = Object.fromEntries(
      (roles.response ?? []).map((r) => [r.roleName, r]),
    );
    expect(byName["First"].sequence).toBe(1);
    expect(byName["First"].user?.id).toBe(me.response!.id);
    expect(byName["Second"].sequence).toBe(2);
    expect(byName["Second"].user?.id).toBe(member.response!.id);
  });

  test("POST /files/file/:fileId/formrolemapping - Mapping applies to the form named in the body", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const roomA = await createFillingRoom(
      apiSdk,
      "Autotest RoleMapping Room A",
    );
    const roomB = await createFillingRoom(
      apiSdk,
      "Autotest RoleMapping Room B",
    );
    const formA = await startFormFilling(apiSdk, "owner", roomA);
    const formB = await startFormFilling(apiSdk, "owner", roomB);

    await ownerApi.files.saveFormRoleMapping({
      fileId: String(formA),
      saveFormRoleMappingDto: {
        formId: formA,
        roles: [{ roleName: "Only A", sequence: 1, userId: me.response!.id! }],
      },
    });

    const { data: rolesA } = await ownerApi.files.getAllFormRoles({
      fileId: formA,
    });
    const { data: rolesB } = await ownerApi.files.getAllFormRoles({
      fileId: formB,
    });
    expect(rolesA.response?.map((r) => r.roleName)).toEqual(["Only A"]);
    expect(rolesB.response).toEqual([]);
  });

  test("POST /files/file/:fileId/formrolemapping - Missing body returns 400 and stores nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createFillingRoom(apiSdk, "Autotest RoleMapping Room");
    const formId = await startFormFilling(apiSdk, "owner", roomId);

    const { status } = await ownerApi.files.saveFormRoleMapping({
      fileId: String(formId),
    });
    const { data: roles } = await ownerApi.files.getAllFormRoles({
      fileId: formId,
    });

    expect(roles.response).toEqual([]);
    expect(status).toBe(400);
  });

  test("POST /files/file/:fileId/formrolemapping - Regular docx file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: me } = await ownerApi.profiles.getSelfProfile();
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest RoleMapping Docx.docx" },
    });
    const docId = created.response!.id!;

    const { status } = await ownerApi.files.saveFormRoleMapping({
      fileId: String(docId),
      saveFormRoleMappingDto: {
        formId: docId,
        roles: [{ roleName: "R", sequence: 1, userId: me.response!.id! }],
      },
    });

    expect(status).toBe(403);
  });

  // 400 is returned, but the role is already stored: the request fails half-way.
  test.fail(
    "BUG XXXXX: POST /files/file/:fileId/formrolemapping - Unknown user returns 400 and stores no role",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await createFillingRoom(
        apiSdk,
        "Autotest RoleMapping Room",
      );
      const formId = await startFormFilling(apiSdk, "owner", roomId);

      const { status } = await ownerApi.files.saveFormRoleMapping({
        fileId: String(formId),
        saveFormRoleMappingDto: {
          formId,
          roles: [
            {
              roleName: "Ghost",
              sequence: 1,
              userId: "11111111-1111-1111-1111-111111111111",
            },
          ],
        },
      });
      const { data: roles } = await ownerApi.files.getAllFormRoles({
        fileId: formId,
      });

      expect(roles.response).toEqual([]);
      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG XXXXX: POST /files/file/:fileId/formrolemapping - Blank role name returns 400 and stores no role",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: me } = await ownerApi.profiles.getSelfProfile();
      const roomId = await createFillingRoom(
        apiSdk,
        "Autotest RoleMapping Room",
      );
      const formId = await startFormFilling(apiSdk, "owner", roomId);

      const { status } = await ownerApi.files.saveFormRoleMapping({
        fileId: String(formId),
        saveFormRoleMappingDto: {
          formId,
          roles: [{ roleName: "", sequence: 1, userId: me.response!.id! }],
        },
      });
      const { data: roles } = await ownerApi.files.getAllFormRoles({
        fileId: formId,
      });

      expect(roles.response).toEqual([]);
      expect(status).toBe(400);
    },
  );

  // A missing form crashes the handler with a NullReferenceException. The SDK
  // does not name the status for an unknown id, but a server fault is never a
  // valid answer to a client error.
  test.fail(
    "BUG XXXXX: POST /files/file/:fileId/formrolemapping - Non-existent fileId does not crash with 500",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .files.saveFormRoleMapping({
          fileId: "999999999",
          saveFormRoleMappingDto: { formId: 999999999, roles: [] },
        });

      expect(status).not.toBe(500);
    },
  );

  // Documented: "The whole set is replaced on every call ... idempotent for a
  // given set of roles but not additive". Today the roles accumulate.
  test.fail(
    "BUG XXXXX: POST /files/file/:fileId/formrolemapping - Second mapping replaces the first set of roles",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: me } = await ownerApi.profiles.getSelfProfile();
      const roomId = await createFillingRoom(
        apiSdk,
        "Autotest RoleMapping Room",
      );
      const formId = await startFormFilling(apiSdk, "owner", roomId);
      const save = (roleName: string) =>
        ownerApi.files.saveFormRoleMapping({
          fileId: String(formId),
          saveFormRoleMappingDto: {
            formId,
            roles: [{ roleName, sequence: 1, userId: me.response!.id! }],
          },
        });

      expect((await save("First")).status).toBe(200);
      expect((await save("Second")).status).toBe(200);

      const { data: roles } = await ownerApi.files.getAllFormRoles({
        fileId: formId,
      });
      expect(roles.response?.map((r) => r.roleName)).toEqual(["Second"]);
    },
  );

  // Documented: "Sending an empty role list resets the filling instead,
  // dropping the assignment altogether". Today the owner gets 403.
  test.fail(
    "BUG XXXXX: POST /files/file/:fileId/formrolemapping - Empty role list resets the assignment",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: me } = await ownerApi.profiles.getSelfProfile();
      const roomId = await createFillingRoom(
        apiSdk,
        "Autotest RoleMapping Room",
      );
      const formId = await startFormFilling(apiSdk, "owner", roomId);
      await ownerApi.files.saveFormRoleMapping({
        fileId: String(formId),
        saveFormRoleMappingDto: {
          formId,
          roles: [
            { roleName: "Reset me", sequence: 1, userId: me.response!.id! },
          ],
        },
      });

      const { status } = await ownerApi.files.saveFormRoleMapping({
        fileId: String(formId),
        saveFormRoleMappingDto: { formId, roles: [] },
      });
      const { data: roles } = await ownerApi.files.getAllFormRoles({
        fileId: formId,
      });

      expect(status).toBe(200);
      expect(roles.response).toEqual([]);
    },
  );
});
