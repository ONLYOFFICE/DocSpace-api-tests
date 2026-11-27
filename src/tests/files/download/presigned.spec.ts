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
import { okBody } from "@/src/helpers/private-rooms";
import { ApiSDK } from "@/src/services/api-sdk";

type OwnerApi = ReturnType<ApiSDK["forRole"]>;

// Setup calls: the exact status is asserted, an error answer never reads as an id.
const makeRoom = async (api: OwnerApi, title: string, roomType: RoomType) =>
  okBody(
    await api.rooms.createRoom({ createRoomRequestDto: { title, roomType } }),
    `createRoom ${title}`,
  ).id!;

const makeHtml = async (
  api: OwnerApi,
  folderId: number,
  title: string,
  content: string,
) =>
  okBody(
    await api.files.createHtmlFile({
      folderId,
      createTextOrHtmlFileRequest: { title, content },
    }),
    `createHtmlFile ${title}`,
  ).id!;

const makeMyDocsHtml = async (
  api: OwnerApi,
  title: string,
  content: string,
  createNewIfExist?: boolean,
) =>
  okBody(
    await api.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFileRequest: { title, content, createNewIfExist },
    }),
    `createHtmlFileInMyDocuments ${title}`,
  );

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
      const roomId = await makeRoom(
        ownerApi,
        `Autotest Presigned ${label} Room`,
        roomType,
      );
      const fileId = await makeHtml(
        ownerApi,
        roomId,
        "Autotest Presigned",
        MARKUP,
      );

      const { data, status } = await ownerApi.files.getPresignedUri({
        fileId,
      });

      expect(status).toBe(200);
      expect(typeof data.response).toBe("string");
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
    const formsRoomId = await makeRoom(
      ownerApi,
      "Autotest Presigned Forms Room",
      RoomType.FillingFormsRoom,
    );
    const original = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "owner",
        formsRoomId,
        original,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, JSON.stringify(insertData)).toBe(200);
    expect(original.length).toBeGreaterThan(0);

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
    const file = await makeMyDocsHtml(ownerApi, "Autotest Presigned", MARKUP);

    const download = await downloadFile(apiSdk, "owner", file.id!);

    expect(download.status).toBe(200);
    expect(download.bytes.toString("utf8")).toBe(MARKUP);
  });

  // Documented: the address "keeps naming the version that was current when it
  // was built rather than following later edits".
  test("GET /files/file/:fileId/presigneduri - Old address keeps serving the version it was built for", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const created = await makeMyDocsHtml(
      ownerApi,
      "Autotest Presigned Version",
      "<p>v1</p>",
    );
    const fileId = created.id!;
    const oldUrl = await getDownloadUrl(ownerApi, fileId);

    const updated = await makeMyDocsHtml(
      ownerApi,
      "Autotest Presigned Version",
      "<p>v2</p>",
      true,
    );
    expect(updated.id).toBe(fileId);
    expect(updated.version).toBe(2);
    const newUrl = await getDownloadUrl(ownerApi, fileId);

    expect(new URL(oldUrl).searchParams.get("version")).toBe("1");
    expect(new URL(newUrl).searchParams.get("version")).toBe("2");
    const oldDownload = await downloadAs(apiSdk, "owner", oldUrl);
    expect(oldDownload.status).toBe(200);
    expect(oldDownload.bytes.toString()).toBe("<p>v1</p>");
    const newDownload = await downloadAs(apiSdk, "owner", newUrl);
    expect(newDownload.status).toBe(200);
    expect(newDownload.bytes.toString()).toBe("<p>v2</p>");
  });

  // Documented: "every call mints a new key".
  test("GET /files/file/:fileId/presigneduri - Every call mints a new key for the same version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileId = (
      await makeMyDocsHtml(ownerApi, "Autotest Presigned Key", MARKUP)
    ).id!;

    const first = new URL(await getDownloadUrl(ownerApi, fileId));
    const second = new URL(await getDownloadUrl(ownerApi, fileId));

    expect(first.searchParams.get("stream_auth"), "first key").toBeTruthy();
    expect(second.searchParams.get("stream_auth"), "second key").toBeTruthy();

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
  test("BUG XXXXX: GET /files/file/:fileId/presigneduri - Address downloads without a portal session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const file = await makeMyDocsHtml(
      ownerApi,
      "Autotest Presigned Anonymous",
      MARKUP,
    );
    const url = await getDownloadUrl(ownerApi, file.id!);
    // Setup control: the same address works with a session.
    const withSession = await downloadAs(apiSdk, "owner", url);
    expect(withSession.status, "setup: the address with a session").toBe(200);
    expect(withSession.bytes.toString("utf8")).toBe(MARKUP);

    const response = await fetch(url);
    const status = response.status;
    const text = await response.text();

    // Known violation (setup succeeded): the stand-alone key address answers 403.
    test.fail();
    expect(status).toBe(200);
    expect(text).toBe(MARKUP);
  });

  test("GET /files/file/:fileId/presigneduri - Address without a key and without a session is refused", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const file = await makeMyDocsHtml(
      ownerApi,
      "Autotest Presigned No Key",
      MARKUP,
    );
    const full = await getDownloadUrl(ownerApi, file.id!);
    // Positive control: the complete address downloads the content with a session.
    const control = await downloadAs(apiSdk, "owner", full);
    expect(control.status, "control: the complete address").toBe(200);
    expect(control.bytes.toString("utf8")).toBe(MARKUP);
    const url = new URL(full);
    expect(url.searchParams.get("stream_auth")).toBeTruthy();
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
      const roomId = await makeRoom(
        ownerApi,
        `Autotest Presigned Token ${label} Room`,
        roomType,
      );
      const fileId = await makeHtml(
        ownerApi,
        roomId,
        "Autotest Signed",
        MARKUP,
      );

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
    const fileId = (
      await makeMyDocsHtml(ownerApi, "Autotest Signed Fresh", MARKUP)
    ).id!;

    const first = await ownerApi.files.getPresignedFileUri({ fileId });
    const second = await ownerApi.files.getPresignedFileUri({ fileId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.response?.token, "first token").toBeTruthy();
    expect(second.data.response?.token, "second token").toBeTruthy();
    expect(second.data.response?.token).not.toBe(first.data.response?.token);
    expect(decodeJwtPayload(second.data.response!.token!).url).not.toBe(
      decodeJwtPayload(first.data.response!.token!).url,
    );
  });
});
