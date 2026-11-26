import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileShare,
  FileType,
  FormFillingManageAction,
} from "@onlyoffice/docspace-api-sdk";
import { AiAttachments } from "@/src/helpers/ai-attachments";
import {
  containsMarker,
  downloadVia,
  markedBytes,
  uploadEncrypted,
} from "@/src/helpers/private-room-download";
import {
  KIT_ROLES,
  Kit,
  Pair,
  buildKit,
  fileJson,
  keysJson,
  roomFileIds,
  settle,
  unfinishedOperations,
  uploadPlain,
} from "@/src/helpers/private-room-forbidden";
import {
  filesIn,
  openSession,
  sendNext,
} from "@/src/helpers/private-room-upload";

/**
 * Operations a private-room file must refuse even to the people who may manage
 * the room (PR-FORB-*, PR-SEC-027/032, PR-ARC, SPEC-035/036).
 *
 * Every operation is tried on a pair of files of the same kind - an ordinary
 * file in an ordinary room (the positive control: the same call, with the same
 * body, works) and a file of a private room - and the private file, its room and
 * the destination are read back afterwards. The private files carry REAL
 * document bytes uploaded as `encrypted` ones, so a refusal is the portal's
 * decision and not a failure to read junk.
 *
 * What is ASSERTED is the functional prohibition (nothing was created, nothing
 * about the private file changed, no operation was left running) and every
 * status the SDK JSDoc defines (docs.convertFile: 403 for a file of a private
 * room and for a result that would be saved into one; the favorite and recent
 * calls: 200 and never recorded). A status the JSDoc leaves open is RECORDED as
 * an `observation`. An operation whose control does not work for the caller is
 * reported as having no control and is not counted as covered.
 *
 * Operations with no REST surface (sending a file by e-mail, batch rename), with
 * no way to be exercised in an ordinary room either (sharing a single file with a
 * user in a room) or that need a Document Server callback (restoring or deleting
 * an older version of an encrypted file) are not here; see the audit.
 */

const observe = (what: string) =>
  test.info().annotations.push({ type: "observation", description: what });

type Reply = { status: number; data?: unknown };

type Op = {
  name: string;
  pair: (k: Kit) => Pair;
  run: (k: Kit, fileId: number) => Promise<Reply>;
  /** A status the JSDoc defines for the refusal. */
  documented?: number;
  /** Links are read back with getFileLinks. */
  links?: boolean;
  /** The result of the operation lands in the file's own room, not in the destination. */
  inOwnRoom?: boolean;
};

const OPS: Op[] = [
  {
    name: "docs.convertFile (docx to pdf)",
    pair: (k) => k.docx,
    run: (k, fileId) =>
      k.actor.docs.convertFile({
        convertFileRequestDto: {
          fileId,
          outputtype: "pdf",
          folderId: k.otherRoom,
        },
      }),
    documented: 403,
  },
  {
    name: "files.copyFileAs (docx to pdf)",
    pair: (k) => k.docx,
    run: (k, fileId) =>
      k.actor.files.copyFileAs({
        fileId,
        copyAsRequest: { destTitle: "copy-as.pdf", destFolderId: k.otherRoom },
      }),
  },
  {
    name: "operations.startFileConversion (rtf to docx)",
    pair: (k) => k.rtf,
    run: (k, fileId) =>
      k.actor.operations.startFileConversion({
        fileId,
        checkConversionRequestDto: { startConvert: true, sync: true },
      }),
    inOwnRoom: true,
  },
  {
    name: "files.createFilePrimaryExternalLink (view)",
    pair: (k) => k.docx,
    run: (k, id) =>
      k.actor.files.createFilePrimaryExternalLink({
        id,
        fileLinkRequest: { access: FileShare.Read },
      }),
    links: true,
  },
  {
    name: "files.setFileExternalLink (view)",
    pair: (k) => k.docx,
    run: (k, id) =>
      k.actor.files.setFileExternalLink({
        id,
        fileLinkRequest: { access: FileShare.Read, title: "view" },
      }),
    links: true,
  },
  {
    name: "files.setFileExternalLink (edit)",
    pair: (k) => k.docx,
    run: (k, id) =>
      k.actor.files.setFileExternalLink({
        id,
        fileLinkRequest: { access: FileShare.Editing, title: "edit" },
      }),
    links: true,
  },
  {
    name: "files.setFileExternalLink (for participants)",
    pair: (k) => k.docx,
    run: (k, id) =>
      k.actor.files.setFileExternalLink({
        id,
        fileLinkRequest: {
          access: FileShare.Read,
          internal: true,
          title: "members",
        },
      }),
    links: true,
  },
  {
    name: "files.startFillingFile (PDF form)",
    pair: (k) => k.form,
    run: (k, fileId) => k.actor.files.startFillingFile({ fileId }),
  },
  {
    name: "files.manageFormFilling start (PDF form)",
    pair: (k) => k.form,
    run: (k, fileId) =>
      k.actor.files.manageFormFilling({
        fileId: String(fileId),
        manageFormFillingDto: {
          formId: fileId,
          action: FormFillingManageAction.Start,
        },
      }),
  },
];

const linksOf = async (k: Kit, fileId: number) => {
  const { data, status } = await k.admin.files.getFileLinks({ id: fileId });
  expect(status).toBe(200);
  return (data.response ?? []).length;
};

test.describe("Forbidden operations - a private file is refused them, whoever manages the room", () => {
  for (const { role, label } of KIT_ROLES) {
    test(`Files API - ${label[0].toUpperCase()}${label.slice(1)} cannot convert, share or fill a file of a private room`, async ({
      apiSdk,
    }) => {
      test.setTimeout(280_000);
      const kit = await buildKit(apiSdk, role);

      for (const op of OPS) {
        const pair = op.pair(kit);
        // The control: the same call on the ordinary file works for this caller.
        const control = await op.run(kit, pair.plain);
        if (control.status < 200 || control.status >= 300) {
          observe(
            `${role}: ${op.name}: NO CONTROL (the ordinary file answers ${control.status}); not counted as covered`,
          );
          continue;
        }
        if (op.links)
          expect
            .soft(await linksOf(kit, pair.plain), `${op.name}: control link`)
            .toBeGreaterThan(0);
        await settle(kit.actor);

        const before = {
          file: await fileJson(kit.admin, pair.priv),
          keys: await keysJson(kit.admin, pair.priv),
          privRoom: await roomFileIds(kit.admin, kit.privRoom),
          dest: await roomFileIds(kit.admin, kit.otherRoom),
          links: op.links ? await linksOf(kit, pair.priv) : 0,
        };

        const refused = await op.run(kit, pair.priv);
        await settle(kit.actor);

        observe(
          `${role}: ${op.name}: control ${control.status}, private file ${refused.status}`,
        );
        if (op.documented)
          expect
            .soft(refused.status, `${op.name}: documented status`)
            .toBe(op.documented);
        expect
          .soft(
            await fileJson(kit.admin, pair.priv),
            `${op.name}: the private file changed`,
          )
          .toEqual(before.file);
        expect
          .soft(
            await keysJson(kit.admin, pair.priv),
            `${op.name}: file keys changed`,
          )
          .toEqual(before.keys);
        expect
          .soft(
            await roomFileIds(kit.admin, kit.privRoom),
            `${op.name}: files of the private room`,
          )
          .toEqual(before.privRoom);
        expect
          .soft(
            await roomFileIds(kit.admin, kit.otherRoom),
            `${op.name}: files of the destination`,
          )
          .toEqual(before.dest);
        if (op.links)
          expect
            .soft(
              await linksOf(kit, pair.priv),
              `${op.name}: links of the private file`,
            )
            .toBe(before.links);
        expect
          .soft(
            await unfinishedOperations(kit.admin),
            `${op.name}: operations left running`,
          )
          .toEqual([]);
        // The legitimate member still downloads the file afterwards.
        const got = await downloadVia(kit.admin, kit.adminToken, pair.priv);
        expect
          .soft(
            got.bytes?.equals(pair.bytes),
            `${op.name}: the file can still be downloaded`,
          )
          .toBe(true);
      }
    });

    test(`Files API - The favorite and recent calls of ${label} never record a file of a private room`, async ({
      apiSdk,
    }) => {
      test.setTimeout(240_000);
      const kit = await buildKit(apiSdk, role);
      const { actor } = kit;
      const favorites = async () =>
        (
          (await actor.folders.getFavoritesFolder({})).data.response?.files ??
          []
        ).map((f) => (f as { id?: number }).id);
      const recent = async () =>
        (
          (await actor.folders.getRecentFolder({})).data.response?.files ?? []
        ).map((f) => (f as { id?: number }).id);
      const before = await fileJson(kit.admin, kit.docx.priv);

      // Documented: the answer only echoes the value, an encrypted file of a private room is never marked.
      const markedPlain = await actor.files.toggleFileFavorite({
        fileId: kit.docx.plain,
        favorite: true,
      });
      expect(markedPlain.status).toBe(200);
      expect(
        await favorites(),
        "control: the ordinary file is a favorite",
      ).toContain(kit.docx.plain);
      for (let again = 0; again < 2; again++) {
        const marked = await actor.files.toggleFileFavorite({
          fileId: kit.docx.priv,
          favorite: true,
        });
        expect(marked.status).toBe(200);
        expect(marked.data.response).toBe(true);
      }
      expect(await favorites()).not.toContain(kit.docx.priv);

      // A batch of one ordinary and one private file: the ordinary one is marked, the other skipped silently.
      const batch = await actor.operations.addFavorites({
        baseBatchRequestDto: {
          fileIds: [kit.rtf.plain, kit.rtf.priv] as never,
        },
      });
      expect(batch.status).toBe(200);
      const marks = await favorites();
      expect(marks).toContain(kit.rtf.plain);
      expect(marks).not.toContain(kit.rtf.priv);

      // Recent: "answered normally but never recorded", and repeating is safe.
      expect(
        (await actor.files.addFileToRecent({ fileId: kit.docx.plain })).status,
      ).toBe(200);
      expect(await recent(), "control: the ordinary file is recent").toContain(
        kit.docx.plain,
      );
      for (let again = 0; again < 2; again++)
        expect(
          (await actor.files.addFileToRecent({ fileId: kit.docx.priv })).status,
        ).toBe(200);
      expect(await recent()).not.toContain(kit.docx.priv);

      // Removing them again is harmless, and nothing about the private file changed.
      observe(
        `${kit.role}: deleteFavoritesFromBody ${(await actor.operations.deleteFavoritesFromBody({ baseBatchRequestDto: { fileIds: [kit.docx.priv] as never } })).status}, deleteRecent ${(await actor.files.deleteRecent({ baseBatchRequestDto: { fileIds: [kit.docx.priv] as never } })).status}`,
      );
      expect(await fileJson(kit.admin, kit.docx.priv)).toEqual(before);
    });

    test.fail(
      `BUG XXXXX: POST /files/file/:id/saveaspdf - ${label[0].toUpperCase()}${label.slice(1)} saves a PDF made from a file of a private room into an ordinary room`,
      async ({ apiSdk }) => {
        test.setTimeout(240_000);
        const kit = await buildKit(apiSdk, role);
        const { actor, docx } = kit;
        // The control: the same call makes a PDF of the ordinary file in the destination.
        const control = await actor.files.saveFileAsPdf({
          id: docx.plain,
          saveAsPdfRequest: {
            folderId: kit.otherRoom,
            title: "saved-control.pdf",
          },
        });
        expect(control.status).toBe(200);
        await settle(actor);
        const destBefore = await roomFileIds(kit.admin, kit.otherRoom);
        expect(
          destBefore,
          "control: the PDF is in the destination",
        ).toHaveLength(1);
        const fileBefore = await fileJson(kit.admin, docx.priv);

        const attempt = await actor.files.saveFileAsPdf({
          id: docx.priv,
          saveAsPdfRequest: {
            folderId: kit.otherRoom,
            title: "saved-private.pdf",
          },
        });
        await settle(actor);
        const dest = await filesIn(kit.admin, kit.otherRoom);
        const made = dest.filter((f) => !destBefore.includes(f.id));
        observe(
          `${role}: saveFileAsPdf of the private file into an ordinary room answered ${attempt.status}; new files there: ${made.map((f) => f.title + " (" + f.size + " bytes)").join(", ") || "none"}`,
        );

        // What must hold either way: the private file itself is untouched.
        expect(await fileJson(kit.admin, docx.priv)).toEqual(fileBefore);
        // The portal does not convert a file of a private room (docs.convertFile and copyFileAs refuse it),
        // so nothing may come out of it in an ordinary room.
        expect(made.map((f) => f.title)).toEqual([]);
      },
    );

    test.fail(
      `BUG XXXXX: PUT /files/file/:fileId - ${label[0].toUpperCase()}${label.slice(1)} renames a file of a private room, replacing its server name`,
      async ({ apiSdk }) => {
        const kit = await buildKit(apiSdk, role);
        const { actor, docx } = kit;
        // The control: the same call renames the ordinary file.
        const renamedPlain = await actor.files.updateFile({
          fileId: docx.plain,
          updateFileRequest: { title: "Renamed.docx" },
        });
        expect(renamedPlain.status).toBe(200);
        expect(
          (await kit.admin.files.getFileInfo({ fileId: docx.plain })).data
            .response?.title,
        ).toBe("Renamed.docx");
        const keys = await keysJson(kit.admin, docx.priv);

        const attempt = await actor.files.updateFile({
          fileId: docx.priv,
          updateFileRequest: { title: "Readable-Name.docx" },
        });
        const after = (await kit.admin.files.getFileInfo({ fileId: docx.priv }))
          .data.response!;

        // What may not change either way: the content, the flag, the keys.
        expect(after.encrypted).toBe(true);
        expect(await keysJson(kit.admin, docx.priv)).toEqual(keys);
        observe(
          `${role}: rename of the private file answered ${attempt.status}; title now ${after.title === docx.privTitle ? "unchanged" : "replaced"}`,
        );
        // The server name is the one the client generated; a rename must not replace it with a readable one.
        expect(after.title).toBe(docx.privTitle);
      },
    );
  }
});

test.describe("Forbidden operations - renaming and versions of a private file", () => {
  test("PUT /files/file/:fileId - Another extension in a new title never changes the extension of a file", async ({
    apiSdk,
  }) => {
    const kit = await buildKit(apiSdk, "owner");
    for (const [name, id] of [
      ["ordinary", kit.docx.plain],
      ["private", kit.docx.priv],
    ] as const) {
      const res = await kit.actor.files.updateFile({
        fileId: id,
        updateFileRequest: { title: "other.pdf" },
      });
      const info = (await kit.admin.files.getFileInfo({ fileId: id })).data
        .response!;
      observe(
        `${name} file renamed to other.pdf: ${res.status}, now ${info.title}`,
      );
      expect(info.fileExst, `${name} file: extension`).toBe(".docx");
    }
    expect(
      (
        await downloadVia(kit.admin, kit.adminToken, kit.docx.priv)
      ).bytes?.equals(kit.docx.bytes),
    ).toBe(true);
  });

  test("GET /files/file/:fileId/log, /versions - What a private file shows about its versions and history (recorded), and cannot be given a second one", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const kit = await buildKit(apiSdk, "owner");
    const { actor, docx } = kit;
    const state = async (id: number) => {
      const f = (await kit.admin.files.getFileInfo({ fileId: id })).data
        .response!;
      return JSON.stringify([
        f.title,
        f.version,
        f.versionGroup,
        f.encrypted,
        f.pureContentLength,
      ]);
    };
    const before = await state(docx.priv);

    const calls: [string, (id: number) => Promise<Reply>][] = [
      [
        "getFileVersionInfo",
        (id) => actor.files.getFileVersionInfo({ fileId: id }),
      ],
      ["getFileHistory", (id) => actor.files.getFileHistory({ fileId: id })],
      [
        "getFileInfo(version 1)",
        (id) => actor.files.getFileInfo({ fileId: id, version: 1 }),
      ],
      [
        "updateFileComment(version 1)",
        (id) =>
          actor.operations.updateFileComment({
            fileId: id,
            updateCommentRequest: { version: 1, comment: "note" },
          }),
      ],
      [
        "changeVersionHistory(version 1)",
        (id) =>
          actor.files.changeVersionHistory({
            fileId: id,
            changeHistoryRequest: { version: 1, continueVersion: true },
          }),
      ],
      [
        "restoreFileVersion(version 1)",
        (id) => actor.files.restoreFileVersion({ fileId: id, version: 1 }),
      ],
    ];
    for (const [name, call] of calls) {
      const control = await call(docx.plain);
      const subject = await call(docx.priv);
      observe(
        `${name}: ordinary file ${control.status}, private file ${subject.status}`,
      );
    }
    // Only the single version exists, and the content, flag and name are what they were.
    expect(await state(docx.priv)).toEqual(before);
    const versions = (
      await actor.files.getFileVersionInfo({ fileId: docx.priv })
    ).data.response as unknown as unknown[];
    expect(versions).toHaveLength(1);

    // A second version of a private file through the upload route: refused, and nothing changed.
    const bytes = markedBytes("FORB-V2", 40);
    const second = await openSession(actor, kit.privRoom, {
      size: bytes.length,
      fileName: docx.privTitle,
      createNewIfExist: false,
    });
    observe(
      `a session that takes the private file over as its next version: ${second.status}`,
    );
    if (second.id) {
      const sent = await sendNext(actor, kit.privRoom, second.id, bytes);
      observe(`sending its bytes: ${sent.status}`);
    }
    observe(
      `files named like the private file afterwards: ${(await filesIn(kit.admin, kit.privRoom)).filter((f) => f.title === docx.privTitle).length}`,
    );
    expect(await state(docx.priv)).toEqual(before);
    expect(
      (await downloadVia(kit.admin, kit.adminToken, docx.priv)).bytes?.equals(
        docx.bytes,
      ),
    ).toBe(true);
  });
});

test.describe("Forbidden operations - delete, restore and batches", () => {
  test("DELETE /files/file/:fileId - A file deleted from a private room bypasses the Trash and cannot be restored", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const kit = await buildKit(apiSdk, "owner");
    const { actor } = kit;
    const trash = async () =>
      ((await actor.folders.getTrashFolder({})).data.response?.files ?? []).map(
        (f) => (f as { id?: number }).id,
      );
    const removed = async (fileId: number) => {
      const res = await actor.files.deleteFile({
        fileId,
        deleteFileRequest: { deleteAfter: false, immediately: false },
      });
      expect(res.status).toBe(200);
      await settle(actor);
    };

    // The control: an ordinary file goes to the Trash and can be taken back.
    await removed(kit.docx.plain);
    await expect
      .poll(trash, { message: "control: the ordinary file is in the Trash" })
      .toContain(kit.docx.plain);
    const restore = await actor.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [kit.docx.plain] as never,
        destFolderId: kit.plainRoom as never,
        deleteAfter: true,
      },
    });
    expect(restore.status).toBe(200);
    await settle(actor);
    await expect
      .poll(() => roomFileIds(kit.admin, kit.plainRoom), {
        message: "control: restored",
      })
      .toContain(kit.docx.plain);

    // The private file: deleted for good.
    await removed(kit.docx.priv);
    await expect
      .poll(
        async () =>
          (await kit.admin.files.getFileInfo({ fileId: kit.docx.priv })).status,
      )
      .toBe(404);
    expect(await trash()).not.toContain(kit.docx.priv);
    expect(await roomFileIds(kit.admin, kit.privRoom)).not.toContain(
      kit.docx.priv,
    );
    // There is nothing to restore.
    const again = await actor.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [kit.docx.priv] as never,
        destFolderId: kit.privRoom as never,
        deleteAfter: true,
      },
    });
    observe(`restoring the deleted private file: ${again.status}`);
    await settle(actor);
    expect(await roomFileIds(kit.admin, kit.privRoom)).not.toContain(
      kit.docx.priv,
    );
    expect(
      (await kit.admin.files.getFileInfo({ fileId: kit.docx.priv })).status,
    ).toBe(404);
  });

  test("DELETE /files/fileops/delete - A batch of an ordinary and a private file deletes each by its own rules", async ({
    apiSdk,
  }) => {
    const kit = await buildKit(apiSdk, "owner");
    const { actor } = kit;
    const res = await actor.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: [kit.rtf.plain, kit.rtf.priv] as never,
        deleteAfter: false,
        immediately: false,
      },
    });
    expect(res.status).toBe(200);
    await settle(actor);
    const trashIds = async () =>
      ((await actor.folders.getTrashFolder({})).data.response?.files ?? []).map(
        (f) => (f as { id?: number }).id,
      );
    await expect.poll(trashIds).toContain(kit.rtf.plain);
    const trash = await trashIds();
    expect(trash).not.toContain(kit.rtf.priv);
    expect(
      (await kit.admin.files.getFileInfo({ fileId: kit.rtf.priv })).status,
    ).toBe(404);
    // The other private files of the room are untouched.
    expect(await roomFileIds(kit.admin, kit.privRoom)).toEqual(
      [kit.docx.priv, kit.form.priv].sort(),
    );
  });

  test("PUT /files/fileops/{copy,move} - A batch that includes a private file is refused as a whole and copies or moves no private file", async ({
    apiSdk,
  }) => {
    test.setTimeout(240_000);
    const kit = await buildKit(apiSdk, "owner");
    const { actor } = kit;
    const second = await uploadEncrypted(actor, kit.privRoom, {
      ext: "docx",
      bytes: markedBytes("FORB-B2"),
    });
    const plainTwo = await uploadPlain(
      actor,
      kit.plainRoom,
      "two.rtf",
      Buffer.from("{\\rtf1 two}"),
    );

    // The control: a batch of ordinary files copies.
    const ok = await actor.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [kit.rtf.plain, plainTwo] as never,
        destFolderId: kit.otherRoom as never,
        deleteAfter: false,
      },
    });
    expect(ok.status).toBe(200);
    await settle(actor);
    await expect
      .poll(() => roomFileIds(kit.admin, kit.otherRoom), {
        message: "control: two copies",
      })
      .toHaveLength(2);
    const copied = await roomFileIds(kit.admin, kit.otherRoom);

    const cases: { name: string; ids: number[] }[] = [
      {
        name: "an ordinary and a private file",
        ids: [kit.docx.plain, kit.docx.priv],
      },
      {
        name: "two private files of one room",
        ids: [kit.docx.priv, second.id],
      },
    ];
    for (const verb of ["copy", "move"] as const) {
      for (const { name, ids } of cases) {
        const privBefore = await roomFileIds(kit.admin, kit.privRoom);
        const plainBefore = await roomFileIds(kit.admin, kit.plainRoom);
        const body = {
          batchRequestDto: {
            fileIds: ids as never,
            destFolderId: kit.otherRoom as never,
            deleteAfter: verb === "move",
          },
        };
        const res =
          verb === "copy"
            ? await actor.operations.copyBatchItems(body)
            : await actor.operations.moveBatchItems(body);
        await settle(actor);
        observe(
          `${verb} of ${name}: ${res.status}; ordinary file ${ids.includes(kit.docx.plain) ? ((await roomFileIds(kit.admin, kit.otherRoom)).length > copied.length ? "was transferred" : "was NOT transferred") : "n/a"}`,
        );

        // No private file reached the destination or left its room.
        expect(
          await roomFileIds(kit.admin, kit.privRoom),
          `${verb} ${name}: the private room`,
        ).toEqual(privBefore);
        const dest = await filesIn(kit.admin, kit.otherRoom);
        expect(
          dest.filter((f) => /^[0-9a-f-]{36}\./i.test(f.title)),
          `${verb} ${name}: a private file arrived`,
        ).toEqual([]);
        // The ordinary file is still where it was unless the batch really moved it; the private ones are intact.
        for (const id of ids.filter((x) => x !== kit.docx.plain))
          expect(
            (await kit.admin.files.getFileInfo({ fileId: id })).data.response
              ?.encrypted,
          ).toBe(true);
        void plainBefore;
      }
    }
  });
});

test.describe("Forbidden operations - what the server does with the content of a private file", () => {
  test("POST /ai/attachments/save-file - A private file is accepted as an AI attachment and its content read (recorded)", async ({
    apiSdk,
  }) => {
    const kit = await buildKit(apiSdk, "owner");
    const text = Buffer.from(
      "FORB-SECRET-TEXT the quick brown fox jumps over the lazy dog",
    );
    const plainTxt = await uploadPlain(
      kit.actor,
      kit.plainRoom,
      "notes.txt",
      text,
    );
    const privTxt = await uploadEncrypted(kit.actor, kit.privRoom, {
      ext: "txt",
      bytes: text,
    });
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const before = await fileJson(kit.admin, privTxt.id);

    const control = await attachments.saveFile("owner", {
      input: { path: String(plainTxt), content: "", type: FileType.Document },
    });
    // The control: the portal extracts the text of an ordinary file into the draft.
    expect(control.status).toBe(200);
    expect(JSON.stringify(control.data)).toContain("FORB-SECRET-TEXT");

    const subject = await attachments.saveFile("owner", {
      input: { path: String(privTxt.id), content: "", type: FileType.Document },
    });
    observe(
      `an encrypted file of a private room saved as an AI attachment: ${subject.status}; its content ${JSON.stringify(subject.data ?? subject.error).includes("FORB-SECRET-TEXT") ? "was read into the draft" : "was not read"}`,
    );
    // Whatever the answer, the file itself is untouched.
    expect(await fileJson(kit.admin, privTxt.id)).toEqual(before);
    expect(
      containsMarker(
        (await downloadVia(kit.admin, kit.adminToken, privTxt.id)).bytes!,
        "FORB-SECRET-TEXT",
      ),
    ).toBe(true);
  });
});
