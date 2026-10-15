import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadFile } from "@/src/helpers/download";

type OwnerApi = ReturnType<ApiSDK["forRole"]>;

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

async function recentIds(api: OwnerApi) {
  const { data } = await api.folders.getRecentFolder();
  return (data.response?.files ?? []).map((f) => (f as { id: number }).id);
}

async function createRoomFile(
  apiSdk: ApiSDK,
  roomType: RoomType,
  title: string,
) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  const roomId = roomData.response!.id!;
  const { data: fileData } = await ownerApi.files.createHtmlFile({
    folderId: roomId,
    createTextOrHtmlFile: {
      title: "Autotest Recent",
      content: "<p>keep me</p>",
    },
  });
  return { roomId, fileId: (fileData.response as { id: number }).id };
}

// The Recent listing is eventually consistent for room files, so a fresh entry is
// awaited before it is used as a positive control.
async function addToRecent(api: OwnerApi, fileId: number) {
  await api.files.addFileToRecent({ fileId });
  await expect
    .poll(() => recentIds(api), {
      timeout: 30_000,
      intervals: [1000, 2000, 3000, 5000],
    })
    .toContain(fileId);
}

const del = (api: OwnerApi, fileIds: number[], folderIds: number[] = []) =>
  api.files.deleteRecent({
    baseBatchRequestDto: {
      fileIds: fileIds as never,
      folderIds: folderIds as never,
    },
  });

test.describe("DELETE /files/recent - Delete recent files", () => {
  for (const { label, roomType } of roomTypes) {
    test(`DELETE /files/recent - ${label} room file leaves Recent but stays in the room`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { roomId, fileId } = await createRoomFile(
        apiSdk,
        roomType,
        `Autotest Recent ${label}`,
      );
      await addToRecent(ownerApi, fileId);
      await expect
        .poll(() => recentIds(ownerApi), {
          timeout: 30_000,
          intervals: [1000, 2000, 3000, 5000],
        })
        .toContain(fileId);

      const { status } = await del(ownerApi, [fileId]);

      expect(status).toBe(204);
      await expect
        .poll(() => recentIds(ownerApi), {
          timeout: 30_000,
          intervals: [1000, 2000, 3000, 5000],
        })
        .not.toContain(fileId);
      const { data: info, status: infoStatus } =
        await ownerApi.files.getFileInfo({
          fileId,
        });
      expect(infoStatus).toBe(200);
      expect(info.response?.folderId).toBe(roomId);
      expect(
        (await downloadFile(apiSdk, "owner", fileId)).bytes.toString("utf8"),
      ).toBe("<p>keep me</p>");
    });
  }

  // Documented: "no other member's history is touched".
  test("DELETE /files/recent - Clearing one user's Recent leaves another user's entry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { roomId, fileId } = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent Isolation",
    );
    const { api: memberApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    await addToRecent(ownerApi, fileId);
    await addToRecent(memberApi, fileId);
    await expect
      .poll(() => recentIds(memberApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toContain(fileId);

    const { status } = await del(ownerApi, [fileId]);

    expect(status).toBe(204);
    await expect
      .poll(() => recentIds(ownerApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .not.toContain(fileId);
    await expect
      .poll(() => recentIds(memberApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toContain(fileId);
  });

  test("DELETE /files/recent - Only the listed files are removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const first = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent A",
    );
    const second = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent B",
    );
    await addToRecent(ownerApi, first.fileId);
    await addToRecent(ownerApi, second.fileId);

    const { status } = await del(ownerApi, [first.fileId]);

    expect(status).toBe(204);
    const ids = await recentIds(ownerApi);
    expect(ids).not.toContain(first.fileId);
    expect(ids).toContain(second.fileId);
  });

  // Documented: "Repeating the call is safe, but an entry returns the next time
  // the file is opened or POST .../recent is called for it."
  test("DELETE /files/recent - Repeated call is safe and the entry returns when the file is added again", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { fileId } = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent Repeat",
    );
    await addToRecent(ownerApi, fileId);

    const first = await del(ownerApi, [fileId]);
    const second = await del(ownerApi, [fileId]);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    await expect
      .poll(() => recentIds(ownerApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .not.toContain(fileId);

    await addToRecent(ownerApi, fileId);
    await expect
      .poll(() => recentIds(ownerApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toContain(fileId);
  });

  // Documented: "an empty request and an id that was never in the section are
  // accepted alike".
  test("DELETE /files/recent - Empty request and unknown id are accepted and change nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { fileId } = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent Noop",
    );
    await addToRecent(ownerApi, fileId);

    const empty = await del(ownerApi, []);
    const unknown = await del(ownerApi, [999999999]);
    const noBody = await ownerApi.files.deleteRecent({});

    expect(empty.status).toBe(204);
    expect(unknown.status).toBe(204);
    expect(noBody.status).toBe(204);
    await expect
      .poll(() => recentIds(ownerApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toContain(fileId);
  });

  // Documented: "folder ids are accepted but change nothing".
  test("DELETE /files/recent - Folder ids are accepted and change nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { roomId, fileId } = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent Folder",
    );
    await addToRecent(ownerApi, fileId);

    const { status } = await del(ownerApi, [], [roomId]);

    expect(status).toBe(204);
    await expect
      .poll(() => recentIds(ownerApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toContain(fileId);
  });

  // Documented: "access to the entries is not checked at all, so a file the
  // caller can no longer read can still be cleared from their own history".
  test("DELETE /files/recent - File the caller lost access to can still be cleared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { roomId, fileId } = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent Lost Access",
    );
    const { api: memberApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });
    await addToRecent(memberApi, fileId);
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.None }],
        notify: false,
      },
    });
    expect((await memberApi.files.getFileInfo({ fileId })).status).toBe(403);

    const { status } = await del(memberApi, [fileId]);

    expect(status).toBe(204);
    expect((await ownerApi.files.getFileInfo({ fileId })).status).toBe(200);
  });

  test("DELETE /files/recent - Anonymous user gets 401 and Recent is untouched", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { fileId } = await createRoomFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Recent Anonymous",
    );
    await addToRecent(ownerApi, fileId);

    const { status } = await apiSdk.forAnonymous().files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId] as never },
    });

    expect(status).toBe(401);
    await expect
      .poll(() => recentIds(ownerApi), {
        timeout: 30_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toContain(fileId);
  });
});
