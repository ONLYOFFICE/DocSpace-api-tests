import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

async function createRoom(apiSdk: ApiSDK, roomType: RoomType, title: string) {
  const { data } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  return data.response!.id!;
}

// createHtmlFile is typed as a bare entry; the file fields exist at runtime.
const asFile = (response: unknown) =>
  response as {
    id: number;
    title: string;
    folderId: number;
    fileExst: string;
    version: number;
  };

test.describe("POST /files/:folderId/html - Create an HTML file", () => {
  for (const { label, roomType } of roomTypes) {
    test(`POST /files/:folderId/html - ${label} room: stores the markup and adds the .html extension`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await createRoom(
        apiSdk,
        roomType,
        `Autotest Html ${label}`,
      );
      const markup = `<h1>${label}</h1><p>Привет</p>`;

      const { data, status } = await ownerApi.files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFile: { title: "Notes", content: markup },
      });

      expect(status).toBe(200);
      const file = asFile(data.response);
      expect(file.title).toBe("Notes.html");
      expect(file.fileExst).toBe(".html");
      expect(file.folderId).toBe(roomId);
      expect(file.version).toBe(1);
      const download = await downloadFile(apiSdk, "owner", file.id);
      expect(download.bytes.toString("utf8")).toBe(markup);
    });
  }

  test("POST /files/:folderId/html - Title that already ends with .html is not doubled", async ({
    apiSdk,
  }) => {
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Ext",
    );

    const { data } = await apiSdk.forRole("owner").files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "Report.html", content: "<p>r</p>" },
    });

    expect(asFile(data.response).title).toBe("Report.html");
  });

  test("POST /files/:folderId/html - Created in a subfolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Subfolder",
    );
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder" },
    });
    const subfolderId = folder.response!.id!;

    const { data, status } = await ownerApi.files.createHtmlFile({
      folderId: subfolderId,
      createTextOrHtmlFile: { title: "Nested", content: "<p>n</p>" },
    });

    expect(status).toBe(200);
    expect(asFile(data.response).folderId).toBe(subfolderId);
  });

  // Documented: "with false, which is also the default, another file is created
  // and its title made unique, as in Notes (1).html".
  test("POST /files/:folderId/html - Same title gets a numbered title and its own content", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Unique",
    );
    const create = (content: string) =>
      ownerApi.files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFile: { title: "Notes", content },
      });

    const first = await create("<p>one</p>");
    const second = await create("<p>two</p>");

    expect(asFile(first.data.response).title).toBe("Notes.html");
    expect(asFile(second.data.response).title).toBe("Notes (1).html");
    expect(
      (
        await downloadFile(apiSdk, "owner", asFile(first.data.response).id)
      ).bytes.toString(),
    ).toBe("<p>one</p>");
    expect(
      (
        await downloadFile(apiSdk, "owner", asFile(second.data.response).id)
      ).bytes.toString(),
    ).toBe("<p>two</p>");
  });

  // Documented: with true "the file that already carries this title is updated,
  // the markup replacing its content and a version appearing in its history".
  test("POST /files/:folderId/html - createNewIfExist updates the content and adds a version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Update",
    );
    const { data: first } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "Notes", content: "<p>one</p>" },
    });
    const fileId = asFile(first.response).id;

    const { data: second, status } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: {
        title: "Notes",
        content: "<p>two</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(asFile(second.response).id).toBe(fileId);
    expect(asFile(second.response).version).toBe(2);
    expect((await downloadFile(apiSdk, "owner", fileId)).bytes.toString()).toBe(
      "<p>two</p>",
    );
    const { data: versions } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    expect(versions.response).toHaveLength(2);
  });

  // Documented: a file "open in an editing session ... or locked is left alone
  // and a new file appears beside it instead".
  test("POST /files/:folderId/html - File locked by another user is left alone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Locked",
    );
    const { data: first } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "Locked", content: "<p>original</p>" },
    });
    const fileId = asFile(first.response).id;
    const { api: memberApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    const { status: lockStatus } = await memberApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });
    expect(lockStatus).toBe(200);

    const { data, status } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: {
        title: "Locked",
        content: "<p>replacement</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(asFile(data.response).id).not.toBe(fileId);
    expect((await downloadFile(apiSdk, "owner", fileId)).bytes.toString()).toBe(
      "<p>original</p>",
    );
  });

  // Documented: "a request carrying no content is rejected as an invalid request".
  test("POST /files/:folderId/html - Missing content returns 400 and creates nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html No Content",
    );

    const { status } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "NoContent" },
    });

    expect(status).toBe(400);
    const { data: room } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    expect(room.response?.current?.filesCount).toBe(0);
  });

  for (const title of ["", "   "]) {
    test(`POST /files/:folderId/html - ${title === "" ? "Empty" : "Whitespace-only"} title returns 400`, async ({
      apiSdk,
    }) => {
      const roomId = await createRoom(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Html Title",
      );

      const { status } = await apiSdk.forRole("owner").files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFile: { title, content: "<p/>" },
      });

      expect(status).toBe(400);
    });
  }

  test("POST /files/:folderId/html - Title over the length limit returns 400", async ({
    apiSdk,
  }) => {
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Long",
    );

    const { status } = await apiSdk.forRole("owner").files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "t".repeat(300), content: "<p/>" },
    });

    expect(status).toBe(400);
  });

  test("POST /files/:folderId/html - Forbidden title characters are replaced by underscores", async ({
    apiSdk,
  }) => {
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Chars",
    );

    const { data, status } = await apiSdk
      .forRole("owner")
      .files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFile: { title: 'a<b>c"d/e', content: "<p/>" },
      });

    expect(status).toBe(200);
    expect(asFile(data.response).title).toBe("a_b_c_d_e.html");
  });

  test("POST /files/:folderId/html - Markup is stored as sent, not sanitised", async ({
    apiSdk,
  }) => {
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Verbatim",
    );
    const markup = "<script>alert(1)</script><p>x</p>";

    const { data } = await apiSdk.forRole("owner").files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "Verbatim", content: markup },
    });

    const download = await downloadFile(
      apiSdk,
      "owner",
      asFile(data.response).id,
    );
    expect(download.bytes.toString("utf8")).toBe(markup);
  });

  test("POST /files/:folderId/html - Non-existent folder returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").files.createHtmlFile({
      folderId: 999999999,
      createTextOrHtmlFile: { title: "X", content: "<p/>" },
    });

    expect(status).toBe(404);
  });

  test("POST /files/:folderId/html - File id used as folder id returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html File As Folder",
    );
    const { data: file } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "File", content: "<p/>" },
    });

    const { status } = await ownerApi.files.createHtmlFile({
      folderId: asFile(file.response).id,
      createTextOrHtmlFile: { title: "X", content: "<p/>" },
    });

    expect(status).toBe(404);
  });

  test("POST /files/:folderId/html - Archived room is refused and stays empty", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Html Archived",
    );
    await archiveRoomAndWait(apiSdk, roomId);

    const { status } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "X", content: "<p/>" },
    });

    expect(status).toBe(403);
    const { data: room } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    expect(room.response?.current?.filesCount).toBe(0);
  });

  // A form-filling room only takes PDF forms. The portal reports the rejection as
  // an unhandled System.Exception, i.e. a 500, for every non-PDF creation.
  test.fail(
    "BUG XXXXX: POST /files/:folderId/html - Form-filling room rejects HTML with a client error, not 500",
    async ({ apiSdk }) => {
      const roomId = await createRoom(
        apiSdk,
        RoomType.FillingFormsRoom,
        "Autotest Html Forms",
      );

      const { status } = await apiSdk.forRole("owner").files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFile: { title: "X", content: "<p/>" },
      });

      expect(status).not.toBe(500);
    },
  );

  test.fail(
    "BUG XXXXX: POST /files/:folderId/text - Form-filling room rejects text files with a client error, not 500",
    async ({ apiSdk }) => {
      const roomId = await createRoom(
        apiSdk,
        RoomType.FillingFormsRoom,
        "Autotest Text Forms",
      );

      const { status } = await apiSdk.forRole("owner").files.createTextFile({
        folderId: roomId,
        createTextOrHtmlFile: { title: "X", content: "x" },
      });

      expect(status).not.toBe(500);
    },
  );

  test.fail(
    "BUG XXXXX: POST /files/:folderId/file - Form-filling room rejects a docx with a client error, not 500",
    async ({ apiSdk }) => {
      const roomId = await createRoom(
        apiSdk,
        RoomType.FillingFormsRoom,
        "Autotest File Forms",
      );

      const { status } = await apiSdk.forRole("owner").files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "X.docx" },
      });

      expect(status).not.toBe(500);
    },
  );
});

test.describe("POST /files/@my/html - Create an HTML file in My Documents", () => {
  // Documented: "repeating it with true keeps a single file and grows its
  // history, repeating it with false fills the section with numbered copies".
  test("POST /files/@my/html - createNewIfExist true keeps one file and grows its history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const write = (content: string) =>
      ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest History",
          content,
          createNewIfExist: true,
        },
      });

    const first = await write("<p>1</p>");
    const second = await write("<p>2</p>");
    const third = await write("<p>3</p>");

    const fileId = asFile(first.data.response).id;
    expect(asFile(second.data.response).id).toBe(fileId);
    expect(asFile(third.data.response).id).toBe(fileId);
    expect(asFile(third.data.response).version).toBe(3);
    const { data: versions } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    expect(versions.response).toHaveLength(3);
    expect((await downloadFile(apiSdk, "owner", fileId)).bytes.toString()).toBe(
      "<p>3</p>",
    );
  });

  test("POST /files/@my/html - Content is stored in the caller's own section, not in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest My Html Context",
    );

    const { data } = await ownerApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: { title: "Mine", content: "<p>m</p>" },
    });

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    expect(asFile(data.response).folderId).toBe(myFolder.response!.current!.id);
    const { data: room } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    expect(room.response?.current?.filesCount).toBe(0);
  });
});
