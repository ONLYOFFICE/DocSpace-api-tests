import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// Broken access control in the legacy ChunkedUploader.ashx handler (H1 report,
// 2026-10-14). ChunkedUploaderHandler.TryAuthorizeAsync only checks that the
// caller is authenticated - it never checks the caller's access to the target
// folder/file, which the modern path (POST /api/2.0/files/{folderId}/session)
// does via FileUploader.GetFolderIdAsync (CanCreateAsync + folder-type
// deny-list + CanEditAsync for overwrites). The legacy handler is a parallel
// entry point into the same upload machinery that was never given either
// check - filed as two separate bugs since each is its own missing
// authorization check and may be fixed independently of the other:
// - BUG 84580: missing CanCreateAsync - creates a file in a room the caller
//   is not a member of;
// - BUG YYYYY: missing CanEditAsync - overwrites an existing file the caller
//   cannot read/edit, keeping its real title and extension (only the version
//   is bumped), so the response discloses the file's real title/creator/root
//   folder even though the caller supplied a different, wrong title in the
//   request.
//
// Both confirmed live (2026-10-19) with a low-privilege "User" account that
// the normal API already denies 403 on the same target.
//
// Protocol (reverse-engineered from the report, confirmed live): GET (or
// POST) /ChunkedUploader.ashx?initiate=true&folderid=<id>[&fileid=<id>]
// &title=<name>&fileSize=<n> returns an upload session id; POST
// /ChunkedUploader.ashx?uid=<id> as multipart/form-data with the file bytes
// in field "file" commits it in one chunk (no further chunks needed for a
// payload this small).

async function initiateChunkedUpload(
  apiSdk: ApiSDK,
  role: Role,
  opts: { folderId: number; fileId?: number; title: string; fileSize: number },
) {
  const params = new URLSearchParams({
    initiate: "true",
    folderid: String(opts.folderId),
    title: opts.title,
    fileSize: String(opts.fileSize),
  });
  if (opts.fileId !== undefined) {
    params.set("fileid", String(opts.fileId));
  }

  const response = await apiSdk.request.get(
    `${apiSdk.tokenStore.portalBaseUrl}/ChunkedUploader.ashx?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  const body = await response.json();
  return {
    status: response.status(),
    uid: body?.data?.id as string | undefined,
  };
}

async function uploadChunk(
  apiSdk: ApiSDK,
  role: Role,
  uid: string,
  content: string,
  fileName: string,
) {
  const axiosInstance = apiSdk.createAxiosInstance();
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([Buffer.from(content, "utf8")], { type: "text/plain" }),
    fileName,
  );
  const response = await axiosInstance.post(
    `${apiSdk.tokenStore.portalBaseUrl}/ChunkedUploader.ashx?uid=${uid}`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  return { status: response.status as number, data: response.data };
}

test.describe("GET+POST /ChunkedUploader.ashx - broken access control", () => {
  test.fail(
    "BUG 84580: ChunkedUploader.ashx - missing CanCreateAsync check lets an attacker create a file in a room they are not a member of",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Chunked Uploader Victim Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "User");

      // Sanity: the attacker is genuinely denied by the normal API.
      const sanity = await apiSdk
        .forRole("user")
        .folders.getFolderInfo({ folderId: roomId as any });
      expect(sanity.status).toBe(403);

      const payload = "PLANTED BY NON-MEMBER";
      const { uid } = await initiateChunkedUpload(apiSdk, "user", {
        folderId: roomId,
        title: "attacker-file.txt",
        fileSize: payload.length,
      });

      // A caller denied by the normal API must not be able to commit a file
      // through this legacy path either, whichever step ends up rejecting it.
      if (uid) {
        const { status: uploadStatus } = await uploadChunk(
          apiSdk,
          "user",
          uid,
          payload,
          "attacker-file.txt",
        );
        expect(uploadStatus).not.toBe(201);
      }

      const roomAfter = await ownerApi.folders.getFolderInfo({
        folderId: roomId as any,
      });
      expect(roomAfter.data.response!.filesCount).toBe(0);
    },
  );

  test.fail(
    "BUG YYYYY: ChunkedUploader.ashx - missing CanEditAsync check lets an attacker overwrite any file and discloses its real title/creator",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Chunked Uploader Overwrite Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "victim-original.docx" },
      });
      const victimFileId = fileData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "User");

      // Sanity: the attacker is genuinely denied by the normal API.
      const sanity = await apiSdk
        .forRole("user")
        .sharing.getFileSecurityInfo({ id: victimFileId as any });
      expect(sanity.status).toBe(403);

      const payload = "ATTACKER CONTENT";
      const { uid } = await initiateChunkedUpload(apiSdk, "user", {
        folderId: roomId,
        fileId: victimFileId,
        title: "wrong-name.txt",
        fileSize: payload.length,
      });

      // A caller denied edit access by the normal API must not be able to
      // commit a new version through this legacy path either.
      if (uid) {
        const { status: uploadStatus } = await uploadChunk(
          apiSdk,
          "user",
          uid,
          payload,
          "wrong-name.txt",
        );
        expect(uploadStatus).not.toBe(201);
      }

      const after = await ownerApi.files.getFileInfo({
        fileId: victimFileId as any,
      });
      // The victim's file - title and version alike - must be untouched by a
      // caller with no edit access.
      expect(after.data.response!.version).toBe(1);
      expect(after.data.response!.title).toBe("victim-original.docx");
    },
  );
});
