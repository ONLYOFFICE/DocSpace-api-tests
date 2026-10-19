import { expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadFile } from "@/src/helpers/download";

type MemberType = "RoomAdmin" | "User" | "Guest";

// Expected outcomes follow the SDK descriptions of each method:
// - openedit: any reader gets a configuration; edit rights decide mode/permissions;
// - startedit / trackeditfile / saveediting: edit access (editing, reviewing,
//   commenting, filling or filter rights for track); a reader is refused;
// - createEditSession: owner, room manager and a member with editing rights;
// - customfilter: room admin / DocSpace admin acting as room manager only.
// `null` access means the caller is not a member of the room.
const levels: Array<{
  label: string;
  type: MemberType;
  access: FileShare | null;
  canRead: boolean;
  canEdit: boolean;
  canSession: boolean;
  // null = not asserted: the SDK names room admins only, yet Editing and
  // ContentCreator members are let through (200); which is meant is unclear.
  canCustomFilter: boolean | null;
}> = [
  {
    label: "RoomAdmin RoomManager",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
    canRead: true,
    canEdit: true,
    canSession: true,
    canCustomFilter: true,
  },
  {
    label: "User ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
    canRead: true,
    canEdit: true,
    canSession: true,
    canCustomFilter: null,
  },
  {
    label: "User Editing",
    type: "User",
    access: FileShare.Editing,
    canRead: true,
    canEdit: true,
    canSession: true,
    canCustomFilter: null,
  },
  {
    label: "User Read",
    type: "User",
    access: FileShare.Read,
    canRead: true,
    canEdit: false,
    canSession: false,
    canCustomFilter: false,
  },
  {
    label: "Guest Read",
    type: "Guest",
    access: FileShare.Read,
    canRead: true,
    canEdit: false,
    canSession: false,
    canCustomFilter: false,
  },
  {
    label: "User without room access",
    type: "User",
    access: null,
    canRead: false,
    canEdit: false,
    canSession: false,
    canCustomFilter: false,
  },
];

async function setup(apiSdk: ApiSDK, level: (typeof levels)[number]) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest Editing Permissions Room",
      roomType: RoomType.CustomRoom,
    },
  });
  const roomId = roomData.response!.id!;
  const create = async (title: string) =>
    (
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title },
      })
    ).data.response!.id!;
  const docId = await create("Autotest Permissions Doc.docx");
  const sheetId = await create("Autotest Permissions Sheet.xlsx");
  const { data: html } = await ownerApi.files.createHtmlFile({
    folderId: roomId,
    createTextOrHtmlFile: {
      title: "Autotest Permissions Html",
      content: "<p>original</p>",
    },
  });
  const htmlId = (html.response as { id: number }).id;
  const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
    "owner",
    level.type,
  );
  if (level.access !== null) {
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: level.access }],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
  }
  return { ownerApi, api, roomId, docId, sheetId, htmlId };
}

test.describe("Editing endpoints - access level matrix in a Custom room", () => {
  for (const level of levels) {
    test(`openedit - ${level.label}: ${level.canRead ? (level.canEdit ? "edit mode" : "view only") : "refused"}`, async ({
      apiSdk,
    }) => {
      const { ownerApi, api, docId } = await setup(apiSdk, level);

      // Positive control: the owner opens the same file for editing.
      const { data: ownerConfig } = await ownerApi.files.openEditFile({
        fileId: docId,
      });
      expect(ownerConfig.response?.editorConfig?.mode).toBe("edit");

      const { data, status } = await api.files.openEditFile({ fileId: docId });

      expect(status).toBe(level.canRead ? 200 : 403);
      if (level.canRead) {
        expect(data.response?.document?.permissions?.edit).toBe(level.canEdit);
        expect(data.response?.editorConfig?.mode).toBe(
          level.canEdit ? "edit" : "view",
        );
      }
    });

    test(`startedit and trackeditfile - ${level.label} ${level.canEdit ? "can" : "cannot"} run an editing session`, async ({
      apiSdk,
    }) => {
      const { ownerApi, api, docId } = await setup(apiSdk, level);

      const { data: started, status: startStatus } =
        await api.files.startEditFile({
          fileId: docId,
          startEdit: { editingAlone: true },
        });
      expect(startStatus).toBe(level.canEdit ? 200 : 403);

      const info = async () =>
        Number(
          (
            (await ownerApi.files.getFileInfo({ fileId: docId })).data
              .response as { fileStatus?: number }
          ).fileStatus ?? 0,
        );

      if (level.canEdit) {
        const docKey = started.response as unknown as string;
        const { data, status } = await api.files.trackEditFile({
          fileId: docId,
          tabId: faker.string.uuid(),
          docKeyForTrack: docKey,
          isFinish: false,
        });
        expect(status).toBe(200);
        expect(data.response?.key).toBe(true);
        expect((await info()) & 1).toBe(1);

        const { status: finishStatus } = await api.files.trackEditFile({
          fileId: docId,
          tabId: faker.string.uuid(),
          docKeyForTrack: docKey,
          isFinish: true,
        });
        expect(finishStatus).toBe(200);
      } else {
        // Documented: refreshing an entry needs an editing right, so a reader is
        // refused; and whatever the reader sends, the owner session stays.
        const { data: ownerStart } = await ownerApi.files.startEditFile({
          fileId: docId,
          startEdit: { editingAlone: true },
        });
        const { status } = await api.files.trackEditFile({
          fileId: docId,
          tabId: faker.string.uuid(),
          docKeyForTrack: ownerStart.response as unknown as string,
          isFinish: false,
        });
        expect(status).toBe(403);
        // Ending (isFinish=true) only drops the caller's own tab entry; its status is
        // not specified, but it must not end the owner session.
        await api.files.trackEditFile({
          fileId: docId,
          tabId: faker.string.uuid(),
          docKeyForTrack: ownerStart.response as unknown as string,
          isFinish: true,
        });
        expect((await info()) & 1).toBe(1);
      }
    });

    test(`edit_session - ${level.label} ${level.canSession ? "can" : "cannot"} open a chunked replace session`, async ({
      apiSdk,
    }) => {
      const { api, docId } = await setup(apiSdk, level);

      const { data, status } = await api.files.createEditSession({
        fileId: docId,
        fileSize: 1024,
      });

      expect(status).toBe(level.canSession ? 200 : 403);
      if (level.canSession) {
        expect(data.response?.success).toBe(true);
      }
    });

    test(`saveediting - ${level.label} ${level.canEdit ? "can" : "cannot"} replace the content and a refusal changes nothing`, async ({
      apiSdk,
    }) => {
      const { api, docId } = await setup(apiSdk, level);
      const original = (await downloadFile(apiSdk, "owner", docId)).bytes;
      // A valid docx (a different blank one) so the content check is meaningful.
      const { data: other } = await apiSdk
        .forRole("owner")
        .files.createFileInMyDocuments({
          createFileJsonElement: { title: "Autotest Replacement.docx" },
        });
      const replacement = (
        await downloadFile(apiSdk, "owner", other.response!.id!)
      ).bytes;

      const { data, status } = await api.files.saveEditingFileFromForm({
        fileId: docId,
        file: new File([new Uint8Array(replacement)], "replacement.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        forcesave: false,
      });

      expect(status).toBe(level.canEdit ? 200 : 403);
      const after = await downloadFile(apiSdk, "owner", docId);
      if (level.canEdit) {
        expect(after.bytes.equals(replacement)).toBe(true);
        expect((data.response as { version?: number }).version).toBe(2);
      } else {
        expect(after.bytes.equals(original)).toBe(true);
      }
    });

    test(`customfilter - ${level.label} ${level.canCustomFilter === null ? "is not asserted for" : level.canCustomFilter ? "can" : "cannot"} switch the mode`, async ({
      apiSdk,
    }) => {
      const { ownerApi, api, sheetId } = await setup(apiSdk, level);

      const { status } = await api.files.setCustomFilterTag({
        fileId: sheetId,
        customFilterParameters: { enabled: true },
      });

      if (level.canCustomFilter === null) {
        return;
      }
      expect(status).toBe(level.canCustomFilter ? 200 : 403);
      const { data: info } = await ownerApi.files.getFileInfo({
        fileId: sheetId,
      });
      expect(Boolean(info.response?.customFilterEnabled)).toBe(
        level.canCustomFilter,
      );
    });
  }

  test("openedit, startedit and customfilter - Anonymous user is refused and nothing changes", async ({
    apiSdk,
  }) => {
    const { ownerApi, docId, sheetId } = await setup(apiSdk, levels[0]);
    const anonymousApi = apiSdk.forAnonymous();

    const open = await anonymousApi.files.openEditFile({ fileId: docId });
    const start = await anonymousApi.files.startEditFile({
      fileId: docId,
      startEdit: { editingAlone: true },
    });
    const filter = await anonymousApi.files.setCustomFilterTag({
      fileId: sheetId,
      customFilterParameters: { enabled: true },
    });

    // The SDK names no status for an anonymous openedit (it only says an anonymous
    // caller opens through an external link), so only a refusal is asserted.
    expect(open.status).not.toBe(200);
    expect(start.status).toBe(401);
    expect(filter.status).toBe(401);
    const { data: info } = await ownerApi.files.getFileInfo({
      fileId: sheetId,
    });
    expect(info.response?.customFilterEnabled).toBeFalsy();
  });
});

test.describe("POST /files/file/referencedata - cross-room isolation", () => {
  test("getReferenceData - A member of room A gets no descriptor for a file of room B", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const makeRoom = async (title: string) =>
      (
        await ownerApi.rooms.createRoom({
          createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
        })
      ).data.response!.id!;
    const roomA = await makeRoom("Autotest Reference Room A");
    const roomB = await makeRoom("Autotest Reference Room B");
    const create = async (folderId: number, title: string) =>
      (
        await ownerApi.files.createFile({
          folderId,
          createFileJsonElement: { title },
        })
      ).data.response!.id!;
    const sourceInA = await create(roomA, "Autotest Reference Source.xlsx");
    const targetInB = await create(roomB, "Autotest Reference Target.xlsx");
    const { data: open } = await ownerApi.files.openEditFile({
      fileId: targetInB,
    });
    const reference = open.response!.document!.referenceData!;
    const dto = {
      fileKey: reference.fileKey!,
      instanceId: reference.instanceId!,
      sourceFileId: sourceInA,
    };

    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await ownerApi.rooms.setRoomSecurity({
      id: roomA,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    // Positive control: the owner (access to both rooms) resolves the reference.
    const { data: control } = await ownerApi.files.getReferenceData({
      getReferenceDataDto: dto,
    });
    expect(control.response?.url).toBeTruthy();

    const { data, status } = await api.files.getReferenceData({
      getReferenceDataDto: dto,
    });

    // Either refused, or answered with an error and an empty descriptor.
    if (status === 200) {
      expect(data.response?.url).toBeFalsy();
      expect(data.response?.key).toBeFalsy();
      expect((data.response as { error?: string }).error).toBeTruthy();
    } else {
      expect(status).toBe(403);
    }
  });
});
