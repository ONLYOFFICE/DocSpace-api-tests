import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiEditorTools, readToolResult } from "@/src/helpers/ai-editor-tools";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { listFolderFiles } from "@/src/helpers/text-to-docx";
import { ApiSDK } from "@/src/services/api-sdk";

// The portal AI switch (`PUT /settings/ai-access`) as it applies to the editor
// tools. Measured 2026-10-07 and NOT uniform:
//
//   * GET  /list                        403
//   * POST /call, a generator           403
//   * POST /call, an unknown name       403
//   * POST /call, an invalid body       400   (validation runs before the switch)
//   * POST /call, a REST tool           200 and it RUNS — `delete_file` deleted
//                                       the file, `create_folder` made the folder
//
// The last line is the defect: every other path is closed, so the switch is
// bypassed by naming a REST tool. The two tests that pin it check the portal's
// state before the status — a 403 that still did the work would be the same bug.
//
// Each test starts by putting the portal in the state it claims to start from
// and reads the switch back (`setPortalAiAccess` does), as the text-to-docx
// off-state tests do.

async function myFolderId(apiSdk: ApiSDK) {
  const { data } = await apiSdk.forRole("owner").folders.getMyFolder({});
  return data.response!.current!.id!;
}

test.describe("AI Editor Tools - AI Disabled", () => {
  test("GET /api/2.0/ai/editor-tools/list - returns 403 when the portal AI switch is off", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const enabled = await setPortalAiAccess(owner, true);
    expect(enabled.enabled).toBe(true);
    const before = await api.list("owner");
    expect(before.status, "the list works while the switch is on").toBe(200);

    const disabled = await setPortalAiAccess(owner, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);
    const { status, error } = await api.list("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/editor-tools/call - a document generator returns 403 and creates nothing when the switch is off", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const folderId = await myFolderId(apiSdk);

    expect((await setPortalAiAccess(owner, true)).enabled).toBe(true);
    const onTitle = `Autotest on ${apiSdk.faker.generateString(6)}`;
    const on = await api.callTool("owner", {
      name: "onlyoffice_generate_docx",
      arguments: { fileName: onTitle, description: "One short line." },
    });
    expect(readToolResult(on.data?.result).isError, on.text).toBe(false);

    expect((await setPortalAiAccess(owner, false)).enabled).toBe(false);
    const offTitle = `Autotest off ${apiSdk.faker.generateString(6)}`;
    const { status, error } = await api.callTool("owner", {
      name: "onlyoffice_generate_docx",
      arguments: { fileName: offTitle, description: "One short line." },
    });

    const titles = (await listFolderFiles(owner, folderId)).map((f) => f.title);
    expect(titles).toContain(`${onTitle}.docx`);
    expect(titles).not.toContain(`${offTitle}.docx`);
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/editor-tools/call - an unknown tool name returns 403 when the switch is off", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    expect((await setPortalAiAccess(owner, false)).enabled).toBe(false);
    const { status, error } = await api.callTool("owner", {
      name: "no_such_tool_zz",
    });

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/editor-tools/call - body validation runs before the AI switch is checked", async ({
    apiSdk,
  }) => {
    // The trap for any off-state test: a body without a usable name is a 400 even
    // with the switch off, so such a test never sees the 403 it claims to assert.
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    expect((await setPortalAiAccess(owner, false)).enabled).toBe(false);

    for (const body of [{}, { name: "" }, { name: null }, { name: 7 }]) {
      const { status, error } = await api.callTool("owner", body);
      expect(error, JSON.stringify(body)).toBe("Unknown tool name");
      expect(status, JSON.stringify(body)).toBe(400);
    }
  });

  test("BUG XXXXX: POST /api/2.0/ai/editor-tools/call - create_folder still creates the folder when the switch is off", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const folderId = await myFolderId(apiSdk);
    const args = (title: string) => ({
      parentId: folderId,
      title,
      filters: { fields: ["id", "title"] },
    });
    const folders = async () =>
      (
        (await owner.folders.getFolderByFolderId({ folderId })).data.response
          ?.folders ?? []
      ).map((f) => f.title);

    // Control: with the switch on the tool works, so "not created" below can only
    // come from the switch.
    expect((await setPortalAiAccess(owner, true)).enabled).toBe(true);
    const onTitle = `Autotest on ${apiSdk.faker.generateString(6)}`;
    const on = await api.callTool("owner", {
      name: "create_folder",
      arguments: args(onTitle),
    });
    expect(readToolResult(on.data?.result).isError, on.text).toBe(false);
    expect(await folders()).toContain(onTitle);

    expect((await setPortalAiAccess(owner, false)).enabled).toBe(false);
    const offTitle = `Autotest off ${apiSdk.faker.generateString(6)}`;
    const { status } = await api.callTool("owner", {
      name: "create_folder",
      arguments: args(offTitle),
    });

    test.fail();
    expect(
      await folders(),
      "no folder is created while AI is off",
    ).not.toContain(offTitle);
    expect(status).toBe(403);
  });

  test("BUG XXXXX: POST /api/2.0/ai/editor-tools/call - delete_file still deletes the file when the switch is off", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const folderId = await myFolderId(apiSdk);
    const { data: file } = await owner.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest AI off victim.docx" },
    });
    const fileId = file.response!.id!;
    const { data: other } = await owner.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest AI off control.docx" },
    });
    const controlId = other.response!.id!;

    expect((await setPortalAiAccess(owner, false)).enabled).toBe(false);
    const { status } = await api.callTool("owner", {
      name: "delete_file",
      arguments: { fileId },
    });

    // The control file is the listing's positive control: it proves the folder
    // could be read, so the victim's absence means it was deleted.
    const ids = (await listFolderFiles(owner, folderId)).map((f) => f.id);
    expect(ids).toContain(controlId);
    test.fail();
    expect(ids, "the file survives while AI is off").toContain(fileId);
    expect(status).toBe(403);
  });
});
