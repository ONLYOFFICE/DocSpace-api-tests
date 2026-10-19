import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";
import {
  decodeJwtPayload,
  downloadAs,
  downloadFile,
  getDownloadUrl,
} from "@/src/helpers/download";

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

const MARKUP = "<p>Autotest presigned content</p>";

test.describe("GET /files/file/:fileId/presigneduri - download address", () => {
  for (const { label, roomType } of roomTypes) {
    test(`GET /files/file/:fileId/presigneduri - ${label} room: address names the file and version and serves its bytes`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Presigned ${label} Room`,
          roomType,
        },
      });
      const { data: fileData } = await ownerApi.files.createHtmlFile({
        folderId: roomData.response!.id!,
        createTextOrHtmlFile: { title: "Autotest Presigned", content: MARKUP },
      });
      const fileId = fileData.response!.id!;

      const { data, status } = await ownerApi.files.getPresignedUri({
        fileId,
      });

      expect(status).toBe(200);
      const url = new URL(data.response as unknown as string);
      expect(url.searchParams.get("fileid")).toBe(String(fileId));
      expect(url.searchParams.get("version")).toBe("1");
      expect(url.searchParams.get("stream_auth")).toBeTruthy();

      const download = await downloadAs(
        apiSdk,
        "owner",
        data.response as unknown as string,
      );
      expect(download.status).toBe(200);
      expect(download.bytes.toString("utf8")).toBe(MARKUP);
    });
  }

  test("GET /files/file/:fileId/presigneduri - PDF form in a form-filling room serves the original bytes", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Presigned Forms Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const original = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData } = await apiSdk.insertBinaryFile(
      "owner",
      roomData.response!.id!,
      original,
      "oo-form-empty.pdf",
    );

    const download = await downloadFile(
      apiSdk,
      "owner",
      insertData.response.id as number,
    );

    expect(download.status).toBe(200);
    expect(download.bytes.equals(original)).toBe(true);
  });

  test("GET /files/file/:fileId/presigneduri - File in My Documents serves its bytes", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createHtmlFileInMyDocuments(
      {
        createTextOrHtmlFile: { title: "Autotest Presigned", content: MARKUP },
      },
    );

    const download = await downloadFile(
      apiSdk,
      "owner",
      fileData.response!.id!,
    );

    expect(download.status).toBe(200);
    expect(download.bytes.toString("utf8")).toBe(MARKUP);
  });

  // Documented: the address "keeps naming the version that was current when it
  // was built rather than following later edits".
  test("GET /files/file/:fileId/presigneduri - Old address keeps serving the version it was built for", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Presigned Version",
        content: "<p>v1</p>",
      },
    });
    const fileId = created.response!.id!;
    const oldUrl = await getDownloadUrl(ownerApi, fileId);

    const { data: updated } = await ownerApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Presigned Version",
        content: "<p>v2</p>",
        createNewIfExist: true,
      },
    });
    expect(updated.response!.id).toBe(fileId);
    expect(updated.response!.version).toBe(2);
    const newUrl = await getDownloadUrl(ownerApi, fileId);

    expect(new URL(oldUrl).searchParams.get("version")).toBe("1");
    expect(new URL(newUrl).searchParams.get("version")).toBe("2");
    expect((await downloadAs(apiSdk, "owner", oldUrl)).bytes.toString()).toBe(
      "<p>v1</p>",
    );
    expect((await downloadAs(apiSdk, "owner", newUrl)).bytes.toString()).toBe(
      "<p>v2</p>",
    );
  });

  // Documented: "every call mints a new key".
  test("GET /files/file/:fileId/presigneduri - Every call mints a new key for the same version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createHtmlFileInMyDocuments(
      {
        createTextOrHtmlFile: {
          title: "Autotest Presigned Key",
          content: MARKUP,
        },
      },
    );
    const fileId = fileData.response!.id!;

    const first = new URL(await getDownloadUrl(ownerApi, fileId));
    const second = new URL(await getDownloadUrl(ownerApi, fileId));

    expect(second.searchParams.get("fileid")).toBe(
      first.searchParams.get("fileid"),
    );
    expect(second.searchParams.get("version")).toBe(
      first.searchParams.get("version"),
    );
    expect(second.searchParams.get("stream_auth")).not.toBe(
      first.searchParams.get("stream_auth"),
    );
  });

  // Documented: the key lets the address go "to a downloader that cannot sign in
  // to the portal itself". Today the address answers 403 without a session, and
  // with a session the key makes no difference (a wrong or missing key still
  // downloads). Needs confirmation that the key is meant to work stand-alone.
  test.fail(
    "BUG XXXXX: GET /files/file/:fileId/presigneduri - Address downloads without a portal session",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: fileData } =
        await ownerApi.files.createHtmlFileInMyDocuments({
          createTextOrHtmlFile: {
            title: "Autotest Presigned Anonymous",
            content: MARKUP,
          },
        });
      const url = await getDownloadUrl(ownerApi, fileData.response!.id!);

      const response = await fetch(url);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(MARKUP);
    },
  );

  test("GET /files/file/:fileId/presigneduri - Address without a key and without a session is refused", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createHtmlFileInMyDocuments(
      {
        createTextOrHtmlFile: {
          title: "Autotest Presigned No Key",
          content: MARKUP,
        },
      },
    );
    const url = new URL(await getDownloadUrl(ownerApi, fileData.response!.id!));
    url.searchParams.delete("stream_auth");

    const response = await fetch(url);

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(MARKUP);
  });
});

test.describe("GET /files/file/:fileId/presigned - signed download address", () => {
  for (const { label, roomType } of roomTypes) {
    test(`GET /files/file/:fileId/presigned - ${label} room: extension with dot and a signed token naming the file`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Presigned Token ${label} Room`,
          roomType,
        },
      });
      const { data: fileData } = await ownerApi.files.createHtmlFile({
        folderId: roomData.response!.id!,
        createTextOrHtmlFile: { title: "Autotest Signed", content: MARKUP },
      });
      const fileId = fileData.response!.id!;

      const { data, status } = await ownerApi.files.getPresignedFileUri({
        fileId,
      });

      expect(status).toBe(200);
      expect(data.response?.filetype).toBe(".html");
      expect(data.response?.token?.split(".")).toHaveLength(3);
      const payload = decodeJwtPayload(data.response!.token!);
      expect(String(payload.url)).toContain(`fileid=${fileId}`);
      expect(String(payload.url)).toContain("version=1");
    });
  }

  // Documented: "each call mints a fresh address and token".
  test("GET /files/file/:fileId/presigned - Every call returns a fresh token", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createHtmlFileInMyDocuments(
      {
        createTextOrHtmlFile: {
          title: "Autotest Signed Fresh",
          content: MARKUP,
        },
      },
    );
    const fileId = fileData.response!.id!;

    const first = await ownerApi.files.getPresignedFileUri({ fileId });
    const second = await ownerApi.files.getPresignedFileUri({ fileId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data.response?.token).not.toBe(first.data.response?.token);
    expect(decodeJwtPayload(second.data.response!.token!).url).not.toBe(
      decodeJwtPayload(first.data.response!.token!).url,
    );
  });
});
