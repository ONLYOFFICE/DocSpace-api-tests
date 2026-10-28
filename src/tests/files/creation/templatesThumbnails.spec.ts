import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType, Thumbnail } from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";
import { ApiSDK } from "@/src/services/api-sdk";

type Api = ReturnType<ApiSDK["forRole"]>;

const asset = (name: string) =>
  readFileSync(path.join(__dirname, "../../../assets", name));

// IsTemplate from the FileStatus flags.
const TEMPLATE_FLAG = 64;

async function fileInfo(api: Api, fileId: number) {
  const { data } = await api.files.getFileInfo({ fileId });
  return data.response as {
    title?: string;
    version?: number;
    fileStatus?: number;
    thumbnailStatus?: number;
    thumbnailUrl?: string | null;
  };
}

test.describe("POST/DELETE /files/templates - personal template list", () => {
  // Documented: "Only formats the portal treats as template documents survive: the
  // accepted extensions arrive in extsWebTemplate of GET api/2.0/files/settings, and
  // a file of any other format is dropped silently." The list is empty on the test
  // portal, so no file can become a template here: the positive path cannot be
  // verified, only that the accepted-format rule decides.
  test("addTemplates - A file is marked as a template only when its format is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: settings } = await ownerApi.filesSettings.getFilesSettings();
    const accepted = (settings.response?.extsWebTemplate ?? []).map((e) =>
      e.toLowerCase().replace(/^\./, ""),
    );
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Templates Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const create = async (title: string) =>
      (
        await ownerApi.files.createFile({
          folderId: roomId,
          createFileRequest: { title },
        })
      ).data.response!.id!;
    const files: Record<string, number> = {
      docx: await create("Autotest Template.docx"),
      xlsx: await create("Autotest Template.xlsx"),
      pptx: await create("Autotest Template.pptx"),
      pdf: (
        await apiSdk.insertBinaryFile(
          "owner",
          roomId,
          asset("oo-form-empty.pdf"),
          "autotest-template.pdf",
        )
      ).data.response.id as number,
    };

    const { data, status } = await ownerApi.files.addTemplates({
      fileIds: Object.values(files),
    } as never);

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    for (const [ext, fileId] of Object.entries(files)) {
      const flagged =
        ((await fileInfo(ownerApi, fileId)).fileStatus! & TEMPLATE_FLAG) !== 0;
      expect(flagged, `${ext} template flag`).toBe(accepted.includes(ext));
    }
  });

  // Documented: the answer is true "whenever the request was understood, which an
  // empty list, an id that does not exist and an unreadable file all achieve", and
  // "Repeating the call is safe".
  test("addTemplates and deleteTemplates - Answer true for empty lists, unknown ids and repeats and leave the file alone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Template Safe.docx" },
    });
    const fileId = created.response!.id!;
    const before = await fileInfo(ownerApi, fileId);

    const results = [
      await ownerApi.files.addTemplates({ fileIds: [] } as never),
      await ownerApi.files.addTemplates({ fileIds: [999999999] } as never),
      await ownerApi.files.addTemplates({ fileIds: [fileId] } as never),
      await ownerApi.files.addTemplates({ fileIds: [fileId] } as never),
      await ownerApi.files.deleteTemplates({ requestBody: [] } as never),
      await ownerApi.files.deleteTemplates({
        requestBody: [999999999],
      } as never),
      await ownerApi.files.deleteTemplates({ requestBody: [fileId] } as never),
      await ownerApi.files.deleteTemplates({ requestBody: [fileId] } as never),
    ];

    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(results.map((r) => r.data.response)).toEqual(Array(8).fill(true));
    // Only the template mark is touched, never the file itself.
    const after = await fileInfo(ownerApi, fileId);
    expect(after.title).toBe(before.title);
    expect(after.version).toBe(before.version);
  });
});

test.describe("POST /files/thumbnails - preview thumbnails", () => {
  async function roomFile(apiSdk: ApiSDK, roomType: RoomType, asPdf = false) {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title: "Autotest Thumbnail Room", roomType },
    });
    const roomId = roomData.response!.id!;
    const { data, status } = await apiSdk.insertBinaryFile(
      "owner",
      roomId,
      asPdf ? asset("oo-form-empty.pdf") : asset("test-image.png"),
      asPdf ? "autotest-thumb.pdf" : "autotest-thumb.png",
    );
    expect(status).toBe(200);
    return { ownerApi, roomId, fileId: data.response.id as number };
  }

  const waitCreated = (api: Api, fileId: number) =>
    expect
      .poll(async () => (await fileInfo(api, fileId)).thumbnailStatus, {
        timeout: 60_000,
        intervals: [1000, 2000, 3000, 5000],
      })
      .toBe(Thumbnail.Created);

  for (const { label, roomType, pdf } of [
    { label: "Custom", roomType: RoomType.CustomRoom, pdf: false },
    { label: "Collaboration", roomType: RoomType.EditingRoom, pdf: false },
    { label: "Public", roomType: RoomType.PublicRoom, pdf: false },
    { label: "VDR", roomType: RoomType.VirtualDataRoom, pdf: false },
    {
      label: "FormFilling (PDF form)",
      roomType: RoomType.FillingFormsRoom,
      pdf: true,
    },
  ] as const) {
    // Documented: the thumbnails are "read from thumbnailStatus and thumbnailUrl of
    // the file ... until the status reports the thumbnail as created".
    test(`createThumbnails - ${label} room: the thumbnail is built and served`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId } = await roomFile(apiSdk, roomType, pdf);
      const before = await fileInfo(ownerApi, fileId);
      expect(before.thumbnailUrl).toBeFalsy();

      const { data, status } = await ownerApi.files.createThumbnails({
        baseBatchRequestDto: { fileIds: [fileId] as never },
      });

      expect(status).toBe(200);
      expect((data.response as unknown as number[]).map(Number)).toEqual([
        fileId,
      ]);
      await waitCreated(ownerApi, fileId);
      const after = await fileInfo(ownerApi, fileId);
      expect(after.thumbnailUrl).toBeTruthy();
      expect(after.title).toBe(before.title);
      expect(after.version).toBe(before.version);
    });
  }

  // Documented: asynchronous and "safe to repeat".
  test("createThumbnails - Repeating the request keeps the finished thumbnail", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomFile(apiSdk, RoomType.CustomRoom);
    await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] as never },
    });
    await waitCreated(ownerApi, fileId);
    const first = await fileInfo(ownerApi, fileId);

    const { status } = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] as never },
    });

    expect(status).toBe(200);
    const second = await fileInfo(ownerApi, fileId);
    expect(second.thumbnailStatus).toBe(Thumbnail.Created);
    expect(second.thumbnailUrl).toBeTruthy();
    expect(second.version).toBe(first.version);
  });

  // Documented: "the folder ids are ignored, and a request naming no files at all
  // is answered with an empty list"; the answer echoes the sent file ids.
  test("createThumbnails - Folder ids and an empty request answer with an empty list, unknown file ids are echoed", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId } = await roomFile(apiSdk, RoomType.CustomRoom);

    const folders = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { folderIds: [roomId] as never },
    });
    const empty = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [] },
    });
    const unknown = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [999999999] as never },
    });

    expect(folders.status).toBe(200);
    expect(folders.data.response).toEqual([]);
    expect(empty.status).toBe(200);
    expect(empty.data.response).toEqual([]);
    expect(unknown.status).toBe(200);
    expect((unknown.data.response as unknown as number[]).map(Number)).toEqual([
      999999999,
    ]);
  });

  // Documented: "Access to the individual files is not checked here", so a caller
  // without access gets the echo; the thumbnail itself stays unreadable to them.
  test("createThumbnails - A caller without access to the file gets the echo but not the file", async ({
    apiSdk,
  }) => {
    const { fileId } = await roomFile(apiSdk, RoomType.CustomRoom);
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await api.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] as never },
    });

    expect(status).toBe(200);
    expect((data.response as unknown as number[]).map(Number)).toEqual([
      fileId,
    ]);
    const { status: infoStatus } = await api.files.getFileInfo({ fileId });
    expect(infoStatus).toBe(403);
  });

  test("createThumbnails - A member with Read access can request thumbnails for a room file", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, fileId } = await roomFile(
      apiSdk,
      RoomType.CustomRoom,
    );
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);

    const { status } = await api.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] as never },
    });

    expect(status).toBe(200);
    await waitCreated(ownerApi, fileId);
  });
});
