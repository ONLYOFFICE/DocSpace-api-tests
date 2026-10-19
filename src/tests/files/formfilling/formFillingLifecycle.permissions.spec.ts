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

type MemberType = "RoomAdmin" | "User" | "DocSpaceAdmin";

// Documented (manageFormFilling): starting needs the right to start the filling,
// "which the room admin and a member with content-creator rights have"; stopping a
// filling somebody else started "belongs to room managers alone".
// Documented (startFillingFile): "a member holding only form-filling access on the
// room may not start filling, and a caller with no access ... is refused with 403
// unless they can manage it, which the room owner, a room administrator and a
// DocSpace administrator can".
// `null` access means the caller is not a member of the room.
const callers: Array<{
  label: string;
  type: MemberType;
  access: FileShare | null;
  canStart: boolean;
  canStopOwners: boolean;
  canStartFilling: boolean;
}> = [
  {
    label: "RoomAdmin RoomManager",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
    canStart: true,
    canStopOwners: true,
    canStartFilling: true,
  },
  {
    label: "User ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
    canStart: true,
    canStopOwners: false,
    canStartFilling: true,
  },
  {
    label: "User FillForms",
    type: "User",
    access: FileShare.FillForms,
    canStart: false,
    canStopOwners: false,
    canStartFilling: false,
  },
  {
    label: "User without room access",
    type: "User",
    access: null,
    canStart: false,
    canStopOwners: false,
    canStartFilling: false,
  },
  {
    label: "DocSpaceAdmin without room access",
    type: "DocSpaceAdmin",
    access: null,
    canStart: false,
    canStopOwners: false,
    canStartFilling: true,
  },
];

async function setup(apiSdk: ApiSDK, caller: (typeof callers)[number]) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest Form Lifecycle Permissions Room",
      roomType: RoomType.FillingFormsRoom,
    },
  });
  const roomId = roomData.response!.id!;
  const { data: inserted } = await apiSdk.insertBinaryFile(
    "owner",
    roomId,
    readFileSync(path.join(__dirname, "../../../assets/oo-form-empty.pdf")),
    "autotest-form.pdf",
  );
  const formId = inserted.response.id as number;
  const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
    "owner",
    caller.type,
  );
  if (caller.access !== null) {
    const { status } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: caller.access }],
        notify: false,
      },
    });
    expect(status).toBe(200);
  }
  return { ownerApi, api, roomId, formId };
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

test.describe("Form-filling lifecycle - permissions in a form-filling room", () => {
  for (const caller of callers) {
    test(`manageformfilling Start - ${caller.label} ${caller.canStart ? "can" : "cannot"} open the form`, async ({
      apiSdk,
    }) => {
      const { api, formId } = await setup(apiSdk, caller);

      const { status } = await manage(
        api,
        formId,
        FormFillingManageAction.Start,
      );

      expect(await started(apiSdk, formId)).toBe(caller.canStart);
      expect(status).toBe(caller.canStart ? 200 : 403);
    });

    test(`manageformfilling Stop - ${caller.label} ${caller.canStopOwners ? "can" : "cannot"} stop a filling the owner started`, async ({
      apiSdk,
    }) => {
      const { ownerApi, api, formId } = await setup(apiSdk, caller);
      await manage(ownerApi, formId, FormFillingManageAction.Start);
      expect(await started(apiSdk, formId)).toBe(true);

      const { status } = await manage(
        api,
        formId,
        FormFillingManageAction.Stop,
      );

      expect(await started(apiSdk, formId)).toBe(!caller.canStopOwners);
      expect(status).toBe(caller.canStopOwners ? 200 : 403);
    });

    test(`startfilling - ${caller.label} ${caller.canStartFilling ? "can" : "cannot"} open the form`, async ({
      apiSdk,
    }) => {
      const { api, formId } = await setup(apiSdk, caller);

      const { data, status } = await api.files.startFillingFile({
        fileId: formId,
      });

      expect(await started(apiSdk, formId)).toBe(caller.canStartFilling);
      expect(status).toBe(caller.canStartFilling ? 200 : 403);
      if (caller.canStartFilling) {
        expect((data.response as { id: number }).id).toBe(formId);
      }
    });
  }

  // A content creator may stop a filling that content creator started.
  test("manageformfilling - A ContentCreator can stop the filling they started", async ({
    apiSdk,
  }) => {
    const { api, formId } = await setup(apiSdk, callers[1]);
    const start = await manage(api, formId, FormFillingManageAction.Start);
    expect(start.status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(true);

    const { status } = await manage(api, formId, FormFillingManageAction.Stop);

    expect(status).toBe(200);
    expect(await started(apiSdk, formId)).toBe(false);
  });

  // Documented (checkFillFormDraft): "Read access to the form is enough to get an
  // address, fill-forms access is what puts the caller into the filling flow",
  // i.e. a member limited to filling forms is handed a draft copy. Today the call
  // answers 403 "Access denied" for that member on a started form.
  test.fail(
    "BUG XXXXX: checkfillformdraft - A member limited to FillForms is handed a draft copy",
    async ({ apiSdk }) => {
      const { ownerApi, api, formId } = await setup(apiSdk, callers[2]);
      await manage(ownerApi, formId, FormFillingManageAction.Start);

      const { data, status } = await api.files.checkFillFormDraft({
        fileId: formId,
        checkFillFormDraft: { version: 1 },
      });

      expect(status).toBe(200);
      const copyId = Number(/fileid=(\d+)/.exec(String(data.response))?.[1]);
      expect(copyId).not.toBe(formId);
    },
  );

  test("checkfillformdraft - A caller without room access is refused and no copy is made", async ({
    apiSdk,
  }) => {
    const { ownerApi, api, roomId, formId } = await setup(apiSdk, callers[3]);
    await manage(ownerApi, formId, FormFillingManageAction.Start);
    const { data: before } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });

    const { status } = await api.files.checkFillFormDraft({
      fileId: formId,
      checkFillFormDraft: { version: 1 },
    });

    expect(status).toBe(403);
    const { data: after } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    expect(after.response?.current?.filesCount).toBe(
      before.response?.current?.filesCount,
    );
  });
});
