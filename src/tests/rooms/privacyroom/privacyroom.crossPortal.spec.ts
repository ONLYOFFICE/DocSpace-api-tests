import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import API from "@/src/services/api";
import { ApiSDK } from "@/src/services/api-sdk";
import { createOwnerPrivateRoom } from "@/src/helpers/private-rooms";
import { downloadVia, markedBytes } from "@/src/helpers/private-room-download";
import {
  READERS,
  buildScene,
  leaks,
  snapshot,
} from "@/src/helpers/private-room-isolation";
import { openSession, sendNext } from "@/src/helpers/private-room-upload";

/**
 * Isolation between two portals (PR-SEC-016, PR-ACL-036, PR-DL-021).
 *
 * A second test portal is created the way the fixtures create the first one,
 * with its own owner, a private room, nested folders, files and an open upload
 * session; it is deleted at the end whatever happens. The objects are REAL ones
 * of the second portal, not invented ids: the first portal's owner (the Portal
 * Owner of a different tenant) tries each of them on the first portal, and with
 * the first portal's credentials on the second portal's host.
 *
 * The second portal's own owner is the positive control for every refusal, and
 * the second portal is read back at the end to prove nothing changed there.
 */

const UNKNOWN_IS_403 = ["files.getEncryptionInfo", "files.getFileVersionInfo"];

test.describe("Two portals - a private room of one portal is unreachable from the other", () => {
  test("GET /files/* - The owner of one portal reaches nothing of a private room of another portal", async ({
    apiSdk,
    playwright,
  }) => {
    test.setTimeout(300_000);
    const ownerA = apiSdk.forRole("owner");
    const tokenA = apiSdk.tokenStore.getToken("owner");

    const context = await playwright.request.newContext({ timeout: 30_000 });
    const portalB = new API(context);
    try {
      await portalB.setup();
      const sdkB = new ApiSDK(context, portalB.tokenStore);
      const ownerB = sdkB.forRole("owner");
      const tokenB = sdkB.tokenStore.getToken("owner");
      const titleB = "P3PORTALB" + Math.random().toString(36).slice(2, 8);
      const roomB = await createOwnerPrivateRoom(sdkB, titleB);
      const sceneB = await buildScene(ownerB, tokenB, roomB, titleB);
      const sessionB = await openSession(ownerB, roomB, { size: 20 });
      expect(sessionB.status).toBe(200);
      // The first portal has a room of its own, so its owner's calls are not broken ones.
      const roomA = await createOwnerPrivateRoom(apiSdk);
      expect((await ownerA.rooms.getRoomInfo({ id: roomA })).status).toBe(200);
      const before = await snapshot(ownerB, sceneB);

      // Controls: the second portal's owner reads every object.
      for (const reader of READERS)
        expect
          .soft(
            (await reader.call(ownerB, sceneB)).status,
            `${reader.name}: control (owner of the second portal)`,
          )
          .toBe(200);

      // The first portal's owner, on the first portal, with the second portal's ids.
      // getEncryptionInfo and getFileVersionInfo answer 403 for an unknown file everywhere.
      for (const reader of READERS) {
        const res = await reader.call(ownerA, sceneB);
        const expected = UNKNOWN_IS_403.some((n) => reader.name.startsWith(n))
          ? 403
          : 404;
        expect
          .soft(res.status, `${reader.name}: ids of another portal`)
          .toBe(expected);
        expect
          .soft(
            leaks(sceneB, res.data),
            `${reader.name}: data of another portal`,
          )
          .toEqual([]);
      }
      // An upload into the other portal's room and its folder, and the other portal's session.
      expect((await openSession(ownerA, roomB, { size: 20 })).status).toBe(404);
      expect(
        (await openSession(ownerA, sceneB.innerId, { size: 20 })).status,
      ).toBe(404);
      expect(
        (await sendNext(ownerA, roomA, sessionB.id!, Buffer.alloc(20, 1)))
          .status,
      ).toBe(404);
      expect(
        (await sendNext(ownerA, roomB, sessionB.id!, Buffer.alloc(20, 1)))
          .status,
      ).toBe(404);
      const abort = await ownerA.operations.abortUploadSession({
        folderId: roomB,
        sessionId: sessionB.id!,
      });
      // Cancelling is the opener's alone: another portal's caller is refused like any non-opener.
      expect(abort.status).toBe(403);

      // The first portal's credentials on the second portal's host.
      const hostB = sdkB.tokenStore.portalBaseUrl;
      for (const [name, path] of [
        ["room", `rooms/${roomB}`],
        ["folder", `folder/${sceneB.innerId}`],
        ["file", `file/${sceneB.rootFile.id}`],
        ["file keys", `file/${sceneB.rootFile.id}/publickeys`],
        ["download address", `file/${sceneB.rootFile.id}/presigneduri`],
      ] as const) {
        const res = await apiSdk.request.fetch(
          `${hostB}/api/2.0/files/${path}`,
          {
            headers: {
              Authorization: `Bearer ${tokenA}`,
              Origin: `http://${sdkB.tokenStore.newTenantDomain}`,
              Cookie: "",
            },
          },
        );
        expect
          .soft(
            res.status(),
            `${name} with the first portal's token on the second portal`,
          )
          .toBe(401);
        expect
          .soft(
            leaks(sceneB, await res.text()),
            `${name}: data of the second portal`,
          )
          .toEqual([]);
      }

      // Nothing changed over there: the same state, the bytes, and the session still usable by its owner.
      expect(await snapshot(ownerB, sceneB)).toEqual(before);
      const got = await downloadVia(ownerB, tokenB, sceneB.rootFile.id);
      expect(got.bytes!.equals(sceneB.rootFile.bytes)).toBe(true);
      expect(
        (
          await sendNext(
            ownerB,
            roomB,
            sessionB.id!,
            markedBytes("P3-B", 20).subarray(0, 20),
          )
        ).status,
      ).toBe(201);
    } finally {
      try {
        await portalB.auth.authenticateOwner();
        await portalB.cleanup();
      } catch (error) {
        console.warn(
          `ORPHANED PORTAL: cleanup failed for ${portalB.portalDomain}. Reason: ${error}`,
        );
      }
      await context.dispose();
    }
  });
});
