import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  createOwnerPrivateRoom,
  inviteToRoom as inviteRaw,
  okBody,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  addAccounts,
  containsMarker,
  fetchAs,
  markedBytes,
  uploadEncrypted,
} from "@/src/helpers/private-room-download";
import { anonymousGet } from "@/src/helpers/private-room-isolation";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

/**
 * What an issued download address does after it has been issued, and the
 * other addresses a private file carries (PR-SEC-028/029, PR-DL-020, SPEC-018).
 *
 * Who may be ISSUED an address is covered with every other general read method
 * in privacyroom.isolation.spec.ts (getPresignedUri and getPresignedFileUri are
 * rows of its table, for every kind of outsider, the Portal Owner and an
 * anonymous caller). Here only addresses the tests issued to their own files are
 * used - no signature is altered or guessed - and none is printed.
 *
 * The SDK JSDoc says an address is built with a token that can expire, but gives
 * no lifetime and no revocation rule. So what an old address does for a holder who
 * presents NO credentials (after a membership change, an archive) is not asserted
 * and not recorded here (SPEC-018, SPEC GAP in the audit); the assertions are the
 * parts that hold either way: a refusal carries no bytes, a removed member's own
 * credentials never open the file, and a new address is never issued to them.
 */

/** Invites a member and proves the invitation went through: every later refusal rests on it. */
const inviteToRoom = async (
  ...args: Parameters<typeof inviteRaw>
): Promise<Awaited<ReturnType<typeof inviteRaw>>> => {
  const res = await inviteRaw(...args);
  expect(res.status, "inviting a member").toBe(200);
  return res;
};

const room = async (apiSdk: ApiSDK, marker: string) => {
  const owner = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const roomId = await createOwnerPrivateRoom(apiSdk);
  const file = await uploadEncrypted(owner, roomId, {
    bytes: markedBytes(marker),
  });
  return { owner, ownerToken, roomId, file };
};

/** The address a getPresignedUri answer carries; the answer must be a 200 with a string. */
const addressOf = (res: { status: number; data: { response?: unknown } }) => {
  expect(res.status, "getPresignedUri").toBe(200);
  expect(typeof res.data.response, "the address").toBe("string");
  return res.data.response as string;
};

test.describe("GET /files/file/:fileId/presigneduri - an issued address", () => {
  test("GET /files/file/:fileId/presigneduri - getPresignedUri and getPresignedFileUri both serve a member the file; the second adds a document-service token", async ({
    apiSdk,
  }) => {
    const { owner, roomId, file } = await room(apiSdk, "P3-FILEURI");
    const [member] = await addAccounts(apiSdk, [{ type: "User", key: true }]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    expect((await roomMemberAccess(owner, roomId)).get(member.id)).toBe(
      FileShare.Read,
    );

    const plain = await member.api.files.getPresignedUri({ fileId: file.id });
    const signed = await member.api.files.getPresignedFileUri({
      fileId: file.id,
    });

    expect(plain.status).toBe(200);
    expect(signed.status).toBe(200);
    const body = signed.data.response as unknown as {
      filetype?: string;
      token?: string;
      url?: string;
    };
    expect(body.filetype).toBe(".docx");
    expect(typeof body.token).toBe("string");
    expect(body.token!.length).toBeGreaterThan(0);
    // Both address the same file and version, and both serve its bytes.
    const a = new URL(addressOf(plain));
    const b = new URL(body.url!);
    expect(b.searchParams.get("fileid")).toBe(a.searchParams.get("fileid"));
    expect(b.searchParams.get("version")).toBe(a.searchParams.get("version"));
    for (const [name, url] of [
      ["getPresignedUri", addressOf(plain)],
      ["getPresignedFileUri", body.url!],
    ] as const) {
      const got = await fetchAs(url, member.token);
      expect(got.status, name).toBe(200);
      expect(got.bytes.equals(file.bytes), `${name}: bytes`).toBe(true);
    }
  });

  test("GET /filehandler.ashx - An address opens for its holder's session and never for another user or without its signature", async ({
    apiSdk,
  }) => {
    const { owner, roomId, file } = await room(apiSdk, "P3-BEARER");
    const [member, stranger] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    const url = addressOf(
      await member.api.files.getPresignedUri({ fileId: file.id }),
    );
    const unsigned = new URL(url);
    expect(unsigned.searchParams.has("stream_auth")).toBe(true);
    unsigned.searchParams.delete("stream_auth");

    // The holder's own session opens it: the control for every refusal below.
    const own = await fetchAs(url, member.token);
    expect(own.status).toBe(200);
    expect(own.bytes.equals(file.bytes)).toBe(true);
    // Without its signature it opens only for someone who may read the file.
    const bare = await fetchAs(unsigned.toString(), null);
    expect(bare.status).toBe(403);
    expect(containsMarker(bare.bytes, "P3-BEARER")).toBe(false);
    const bareMember = await fetchAs(unsigned.toString(), member.token);
    expect(bareMember.status).toBe(200);
    // Another signed-in user is refused, signature or not.
    const other = await fetchAs(url, stranger.token);
    expect(other.status).toBe(403);
    expect(containsMarker(other.bytes, "P3-BEARER")).toBe(false);
  });

  test("GET /filehandler.ashx - After the member is removed, no new address is issued and the old one never opens for their own credentials", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await room(
      apiSdk,
      "P3-REMOVED",
    );
    const [member, stranger] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    const old = addressOf(
      await member.api.files.getPresignedUri({ fileId: file.id }),
    );
    const oldSigned = okBody(
      await member.api.files.getPresignedFileUri({ fileId: file.id }),
      "getPresignedFileUri",
    ) as unknown as { url: string };
    expect(typeof oldSigned.url, "the document-service address").toBe("string");
    expect(
      (await fetchAs(old, member.token)).status,
      "control: before removal",
    ).toBe(200);

    const removed = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: member.id, access: FileShare.None }],
        notify: false,
      },
    });
    expect(removed.status).toBe(200);
    expect([...(await roomMemberAccess(owner, roomId)).keys()]).not.toContain(
      member.id,
    );

    // A new address: refused, for both methods.
    expect(
      (await member.api.files.getPresignedUri({ fileId: file.id })).status,
    ).toBe(403);
    expect(
      (await member.api.files.getPresignedFileUri({ fileId: file.id })).status,
    ).toBe(403);
    // The old one with the removed member's own session or another user's.
    for (const [who, token] of [
      ["the removed member", member.token],
      ["another user", stranger.token],
    ] as const) {
      for (const [name, url] of [
        ["address", old],
        ["document-service address", oldSigned.url],
      ] as const) {
        const got = await fetchAs(url, token);
        expect.soft(got.status, `${name} used by ${who}`).toBe(403);
        expect
          .soft(
            containsMarker(got.bytes, "P3-REMOVED"),
            `${name} used by ${who}: bytes`,
          )
          .toBe(false);
      }
    }
    // The file itself is untouched and the owner still downloads it.
    expect(
      (
        await fetchAs(
          addressOf(await owner.files.getPresignedUri({ fileId: file.id })),
          ownerToken,
        )
      ).status,
    ).toBe(200); // SPEC-018 (the old address for a holder with no credentials) is deliberately not asserted.
  });

  test("GET /filehandler.ashx - After the file is deleted an old address serves no bytes", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await room(
      apiSdk,
      "P3-DELFILE",
    );
    const url = addressOf(
      await owner.files.getPresignedUri({ fileId: file.id }),
    );
    expect(
      (await fetchAs(url, ownerToken)).bytes.equals(file.bytes),
      "control",
    ).toBe(true);

    const deleted = await owner.files.deleteFile({
      fileId: file.id,
      deleteFileRequest: { immediately: true },
    });
    expect(deleted.status, "deleteFile").toBe(200);
    const deletion = await waitForOperation(owner.operations, {
      started: deleted.data.response,
    });
    expect(deletion.error).toBe("");
    expect((await owner.files.getFileInfo({ fileId: file.id })).status).toBe(
      404,
    );

    const holder = await fetchAs(url, null);
    const asOwner = await fetchAs(url, ownerToken);
    expect(holder.status).toBe(403);
    expect(containsMarker(holder.bytes, "P3-DELFILE")).toBe(false);
    // The refusal status for the owner's own session is not fixed: a client refusal, no bytes.
    expect(asOwner.status).toBeGreaterThanOrEqual(400);
    expect(asOwner.status).toBeLessThan(500);
    expect(containsMarker(asOwner.bytes, "P3-DELFILE")).toBe(false);
    expect(
      (await owner.folders.getFolderByFolderId({ folderId: roomId })).status,
    ).toBe(200);
  });

  test("GET /filehandler.ashx - After the room is deleted an old address serves no bytes", async ({
    apiSdk,
  }) => {
    const { owner, roomId, file } = await room(apiSdk, "P3-DELROOM");
    const url = addressOf(
      await owner.files.getPresignedUri({ fileId: file.id }),
    );
    expect(
      (await fetchAs(url, null)).bytes.equals(file.bytes),
      "control: the address works",
    ).toBe(true);

    await archiveRoomAndWait(apiSdk, roomId);
    const deleted = await owner.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(deleted.status, "deleteRoom").toBe(200);
    const deletion = await waitForOperation(owner.operations, {
      started: [deleted.data.response!],
    });
    expect(deletion.error).toBe("");
    expect((await owner.rooms.getRoomInfo({ id: roomId })).status).toBe(404);

    const holder = await fetchAs(url, null);
    expect(holder.status).toBe(403);
    expect(containsMarker(holder.bytes, "P3-DELROOM")).toBe(false);
  });
});

test.describe("GET /files/file/:fileId - the other addresses of a private file", () => {
  test("GET /filehandler.ashx - The view address of a file opens for a member and for nobody else; the editor address carries nothing of the file", async ({
    apiSdk,
  }) => {
    const { owner, ownerToken, roomId, file } = await room(apiSdk, "P3-VIEW");
    const [member, stranger] = await addAccounts(apiSdk, [
      { type: "User", key: true },
      { type: "User", key: true },
    ]);
    await inviteToRoom(owner, roomId, member.id, FileShare.Read);
    const info = okBody(
      await member.api.files.getFileInfo({ fileId: file.id }),
      "getFileInfo",
    ) as unknown as {
      viewUrl?: string;
      webUrl?: string;
    };
    expect(info.viewUrl).toBeDefined();
    expect(info.webUrl).toBeDefined();
    // It is an address by id, not a signed one: no credentials travel in it.
    expect([...new URL(info.viewUrl!).searchParams.keys()].sort()).toEqual([
      "action",
      "fileid",
    ]);

    // Controls: the member and the owner read the bytes through it.
    for (const [who, token] of [
      ["member", member.token],
      ["owner", ownerToken],
    ] as const) {
      const got = await fetchAs(info.viewUrl!, token);
      expect(got.status, `control: ${who}`).toBe(200);
      expect(got.bytes.equals(file.bytes), `control: ${who}: bytes`).toBe(true);
    }
    for (const [who, token] of [
      ["a user outside the room", stranger.token],
      ["an anonymous caller", null],
    ] as const) {
      const got = await fetchAs(info.viewUrl!, token);
      expect.soft(got.status, `view address used by ${who}`).toBe(403);
      expect
        .soft(
          containsMarker(got.bytes, "P3-VIEW"),
          `view address used by ${who}: bytes`,
        )
        .toBe(false);
      // The editor page is a shell: whatever it answers, it names neither the file nor its content.
      const page = await fetchAs(info.webUrl!, token);
      expect
        .soft(page.status, `editor address used by ${who}: not a server error`)
        .toBeLessThan(500);
      expect
        .soft(
          page.bytes.includes(Buffer.from(file.serverName)),
          `editor address used by ${who}: file name`,
        )
        .toBe(false);
      expect
        .soft(
          containsMarker(page.bytes, "P3-VIEW"),
          `editor address used by ${who}: bytes`,
        )
        .toBe(false);
    }
    // The same call from outside answers an outsider nothing about the file.
    expect(
      (await stranger.api.files.getFileInfo({ fileId: file.id })).status,
    ).toBe(403);
    expect((await anonymousGet(apiSdk, `files/file/${file.id}`)).status).toBe(
      401,
    );
  });
});
