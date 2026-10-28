import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileShare,
  FormFillingManageAction,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";
import { ApiSDK } from "@/src/services/api-sdk";

// Form-filling lifecycle without a Document Server: states are read back from the
// file (`startFilling`), drafts from the file info of the copy. Actual filling in
// the editor and the submitted result are out of reach here.

const FORM = path.join(__dirname, "../../../assets/oo-form-empty.pdf");

async function formIn(
  apiSdk: ApiSDK,
  roomType: RoomType,
  title = "Autotest Form Room",
) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  const roomId = roomData.response!.id!;
  const { data, status } = await apiSdk.insertBinaryFile(
    "owner",
    roomId,
    readFileSync(FORM),
    "autotest-form.pdf",
  );
  expect(status).toBe(200);
  return { ownerApi, roomId, formId: data.response.id as number };
}

async function started(apiSdk: ApiSDK, formId: number) {
  const { data } = await apiSdk
    .forRole("owner")
    .files.getFileInfo({ fileId: formId });
  return Boolean((data.response as { startFilling?: boolean }).startFilling);
}

const manage = (
  api: ReturnType<ApiSDK["forRole"]>,
  formId: number,
  action: FormFillingManageAction,
) =>
  api.files.manageFormFilling({
    fileId: String(formId),
    manageFormFillingDto: { formId, action },
  });

test.describe("PUT /files/file/:fileId/manageformfilling - states", () => {
  // Documented: action 2 starts the filling, 0 stops it ("closes the form for
  // filling" in a form-filling room).
  test("manageformfilling - Start and Stop open and close the form in a form-filling room", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(
      apiSdk,
      RoomType.FillingFormsRoom,
    );
    expect(await started(apiSdk, formId)).toBe(false);

    const start = await manage(ownerApi, formId, FormFillingManageAction.Start);
    expect(start.status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(true);

    const stop = await manage(ownerApi, formId, FormFillingManageAction.Stop);
    expect(stop.status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(false);

    const again = await manage(ownerApi, formId, FormFillingManageAction.Start);
    expect(again.status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(true);
  });

  test("manageformfilling - Starting twice leaves the form open", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(
      apiSdk,
      RoomType.FillingFormsRoom,
    );

    await manage(ownerApi, formId, FormFillingManageAction.Start);
    const second = await manage(
      ownerApi,
      formId,
      FormFillingManageAction.Start,
    );

    expect(second.status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(true);
  });

  // Documented: action 3 "puts the form back into editing, closing it for filling".
  test("manageformfilling - Edit closes a started form for filling", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(
      apiSdk,
      RoomType.FillingFormsRoom,
    );
    await manage(ownerApi, formId, FormFillingManageAction.Start);
    expect(await started(apiSdk, formId)).toBe(true);

    const { status } = await manage(
      ownerApi,
      formId,
      FormFillingManageAction.Edit,
    );

    expect(status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(false);
  });

  for (const [name, action] of [
    ["Stop", FormFillingManageAction.Stop],
    ["Resume", FormFillingManageAction.Resume],
    ["Edit", FormFillingManageAction.Edit],
  ] as const) {
    test(`manageformfilling - Action ${name} on a form that was never started changes nothing`, async ({
      apiSdk,
    }) => {
      const { ownerApi, formId } = await formIn(
        apiSdk,
        RoomType.FillingFormsRoom,
      );

      await manage(ownerApi, formId, action);

      expect(await started(apiSdk, formId)).toBe(false);
    });
  }

  // Observed: the portal answers 403 for an action outside the enum, the same
  // way setRoomSecurity treats an invalid access value, and changes nothing.
  test("manageformfilling - Unknown action value is refused and the state stays", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(
      apiSdk,
      RoomType.FillingFormsRoom,
    );
    await manage(ownerApi, formId, FormFillingManageAction.Start);

    const { status } = await manage(
      ownerApi,
      formId,
      99 as unknown as FormFillingManageAction,
    );

    expect(await started(apiSdk, formId)).toBe(true);
    expect(status).toBe(403);
  });

  test("manageformfilling - Unknown form id is refused", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await manage(
      ownerApi,
      999999999,
      FormFillingManageAction.Start,
    );

    expect(status).toBe(403);
  });

  // Documented: "The file has to be a PDF form lying in a room."
  test("manageformfilling - A docx outside any room is refused and nothing starts", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Not A Form.docx" },
    });
    const fileId = created.response!.id!;

    const { status } = await manage(
      ownerApi,
      fileId,
      FormFillingManageAction.Start,
    );

    expect(await started(apiSdk, fileId)).toBe(false);
    expect(status).toBe(403);
  });

  // Observed: only form-filling rooms and virtual data rooms accept the call.
  for (const { label, roomType } of [
    { label: "Custom", roomType: RoomType.CustomRoom },
    { label: "Collaboration", roomType: RoomType.EditingRoom },
    { label: "Public", roomType: RoomType.PublicRoom },
  ] as const) {
    test(`manageformfilling - ${label} room refuses to start the filling and the form stays closed`, async ({
      apiSdk,
    }) => {
      const { ownerApi, formId } = await formIn(apiSdk, roomType);

      const { status } = await manage(
        ownerApi,
        formId,
        FormFillingManageAction.Start,
      );

      expect(await started(apiSdk, formId)).toBe(false);
      expect(status).toBe(403);
    });
  }

  test("manageformfilling - Virtual data room accepts Start", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(apiSdk, RoomType.VirtualDataRoom);

    const { status } = await manage(
      ownerApi,
      formId,
      FormFillingManageAction.Start,
    );

    expect(status).toBe(200);
  });
});

test.describe("PUT /files/file/:fileId/startfilling - open a form for filling", () => {
  // Documented: the form is marked as open and the call is "safe to repeat".
  test("startfilling - Form-filling room: opens the form, answers with it, repeats safely", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(
      apiSdk,
      RoomType.FillingFormsRoom,
    );
    expect(await started(apiSdk, formId)).toBe(false);

    const first = await ownerApi.files.startFillingFile({ fileId: formId });
    const second = await ownerApi.files.startFillingFile({ fileId: formId });

    expect(first.status).toBe(200);
    expect((first.data.response as { id: number }).id).toBe(formId);
    expect(second.status).toBe(200);
    expect((second.data.response as { id: number }).id).toBe(formId);
    expect(await started(apiSdk, formId)).toBe(true);
  });

  // Documented: a file whose parent is not a form-filling room "is answered
  // unchanged and nothing is stored".
  for (const { label, roomType } of [
    { label: "Custom", roomType: RoomType.CustomRoom },
    { label: "Collaboration", roomType: RoomType.EditingRoom },
    { label: "Public", roomType: RoomType.PublicRoom },
    { label: "VDR", roomType: RoomType.VirtualDataRoom },
  ] as const) {
    test(`startfilling - ${label} room: the form is answered unchanged and nothing is stored`, async ({
      apiSdk,
    }) => {
      const { ownerApi, formId } = await formIn(apiSdk, roomType);

      const { data, status } = await ownerApi.files.startFillingFile({
        fileId: formId,
      });

      expect(status).toBe(200);
      expect((data.response as { id: number }).id).toBe(formId);
      expect(await started(apiSdk, formId)).toBe(false);
    });
  }

  test("startfilling - A docx is answered unchanged and nothing is stored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Not A Form.docx" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.startFillingFile({ fileId });

    expect(status).toBe(200);
    expect((data.response as { id: number }).id).toBe(fileId);
    expect(await started(apiSdk, fileId)).toBe(false);
  });
});

test.describe("POST /files/masterform/:fileId/checkfillformdraft - drafts", () => {
  async function startedForm(apiSdk: ApiSDK) {
    const room = await formIn(apiSdk, RoomType.FillingFormsRoom);
    await manage(room.ownerApi, room.formId, FormFillingManageAction.Start);
    return room;
  }

  const fileIdIn = (url: unknown) =>
    Number(/fileid=(\d+)/.exec(String(url))?.[1]);

  // Documented: a caller who may edit the form, and a form whose filling has not
  // started, "are all sent straight to the form itself".
  test("checkfillformdraft - Owner and an unstarted form get the form itself", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(
      apiSdk,
      RoomType.FillingFormsRoom,
    );

    const unstarted = await ownerApi.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraftRequest: { version: 1 },
    });
    await manage(ownerApi, formId, FormFillingManageAction.Start);
    const startedForm = await ownerApi.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraftRequest: { version: 1 },
    });

    expect(unstarted.status).toBe(200);
    expect(fileIdIn(unstarted.data.response)).toBe(formId);
    expect(startedForm.status).toBe(200);
    expect(fileIdIn(startedForm.data.response)).toBe(formId);
  });

  // Documented: "a request naming view or embedded as the action" goes to the
  // form itself.
  test("checkfillformdraft - Action view goes to the form itself", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await startedForm(apiSdk);

    const { data, status } = await ownerApi.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraftRequest: { version: 1, action: "view" },
    });

    expect(status).toBe(200);
    expect(fileIdIn(data.response)).toBe(formId);
  });

  // Documented: in the filling case the call "copies the form into the room's
  // in-progress folder under the caller's name ... A repeated call reuses that copy".
  test("checkfillformdraft - A content creator gets a personal draft copy that later calls reuse", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, formId } = await startedForm(apiSdk);
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    const { data: formInfo } = await ownerApi.files.getFileInfo({
      fileId: formId,
    });

    const first = await api.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraftRequest: { version: 1 },
    });
    const second = await api.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraftRequest: { version: 1 },
    });

    expect(first.status).toBe(200);
    const copyId = fileIdIn(first.data.response);
    expect(copyId).not.toBe(formId);
    expect(String(first.data.response)).toContain("#message/");
    expect(fileIdIn(second.data.response)).toBe(copyId);
    const { data: copy, status: copyStatus } = await ownerApi.files.getFileInfo(
      {
        fileId: copyId,
      },
    );
    expect(copyStatus).toBe(200);
    expect(copy.response?.folderId).not.toBe(formInfo.response?.folderId);
    expect(copy.response?.title).toContain("autotest-form.pdf");
    // The original form is untouched by the draft.
    const { data: after } = await ownerApi.files.getFileInfo({
      fileId: formId,
    });
    expect(after.response?.version).toBe(formInfo.response?.version);
  });

  test("checkfillformdraft - A form outside a form-filling room goes to the form itself", async ({
    apiSdk,
  }) => {
    const { ownerApi, formId } = await formIn(apiSdk, RoomType.CustomRoom);

    const { data, status } = await ownerApi.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraftRequest: { version: 1 },
    });

    expect(status).toBe(200);
    expect(fileIdIn(data.response)).toBe(formId);
  });
});
