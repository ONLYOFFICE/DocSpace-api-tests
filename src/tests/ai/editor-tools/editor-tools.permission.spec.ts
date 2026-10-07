import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, FolderType, RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  AiEditorTools,
  GENERATOR_TOOLS,
  generatedFile,
  readToolResult,
} from "@/src/helpers/ai-editor-tools";
import { AgentRole } from "@/src/helpers/ai-http";
import { listFolderFiles } from "@/src/helpers/text-to-docx";
import { ApiSDK, UserType } from "@/src/services/api-sdk";

// Who may use `GET /ai/editor-tools/list` and `POST /ai/editor-tools/call`, and
// what the second one is allowed to do on their behalf.
//
// The measured shape (2026-10-07):
//
//   * every authenticated type gets /list — 26 tools, a Guest 23: the three
//     `onlyoffice_generate_*` generators are not offered to a Guest;
//   * /call runs the tool AS THE CALLER, through the portal's own REST API, so
//     the caller's rights are the rights the tool has — a User that points
//     `delete_file` at the Owner's file gets the portal's own 403 inside `result`;
//   * `entityId` splits two cases that must never be confused. A value that does
//     not name a room (nonexistent, "abc", 0 …) falls back to the portal scope —
//     pinned in editor-tools.spec.ts. A room that EXISTS but the caller may not
//     use is refused with `tool_not_available` and nothing is created anywhere —
//     pinned here.
//
// One authenticated member per test on purpose: `apiSdk.request` is a single
// context whose session cookie beats the bearer token, so owner-side setup and
// the owner's own /list come first and the member's calls last. Every state check
// goes through the SDK clients, which keep acting as the role their token
// belongs to (see messages.permission.spec.ts).
//
// The portal seeds its sample documents a little after registration, so a
// "nothing was created" check looks for the names the test could have caused
// instead of comparing a listing taken at the start.

const MEMBERS: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
];

const fieldsOf = (...names: string[]) => ({ fields: names });

async function ownerRoom(apiSdk: ApiSDK, title: string) {
  const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

const generate = (
  api: AiEditorTools,
  role: AgentRole,
  fileName: string,
  entityId?: unknown,
) =>
  api
    .callTool(role, {
      name: "onlyoffice_generate_docx",
      arguments: { fileName, description: "One short line." },
      ...(entityId === undefined ? {} : { entityId }),
    })
    .then((r) => {
      expect(r.status, `generate as ${role}: ${r.text.slice(0, 200)}`).toBe(
        200,
      );
      return readToolResult(r.data?.result);
    });

test.describe("AI Editor Tools - GET /list by user type", () => {
  for (const { type, role } of MEMBERS) {
    test(`GET /api/2.0/ai/editor-tools/list - ${role} gets the same catalogue as the Owner`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
      const ownerNames = (await api.tools("owner")).map((t) => t.name);
      expect(ownerNames.length).toBeGreaterThan(0);

      await apiSdk.addAuthenticatedMember("owner", type);
      const { status, data } = await api.list(role);

      expect(status).toBe(200);
      expect((data?.tools ?? []).map((t) => t.name)).toEqual(ownerNames);
    });
  }

  test("GET /api/2.0/ai/editor-tools/list - a Guest gets the catalogue without the document generators", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const ownerNames = (await api.tools("owner")).map((t) => t.name);
    for (const generator of GENERATOR_TOOLS) {
      expect(ownerNames, "the Owner is offered the generators").toContain(
        generator,
      );
    }

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const { status, data } = await api.list("guest");

    expect(status).toBe(200);
    const guestNames = (data?.tools ?? []).map((t) => t.name);
    expect(guestNames).toEqual(
      ownerNames.filter((n) => !GENERATOR_TOOLS.includes(n)),
    );
  });
});

test.describe("AI Editor Tools - POST /call by user type", () => {
  for (const { type, role } of [
    ...MEMBERS,
    { type: "Guest" as UserType, role: "guest" as AgentRole },
  ]) {
    test(`POST /api/2.0/ai/editor-tools/call - ${role} can call a read tool`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
      await apiSdk.addAuthenticatedMember("owner", type);

      const { status, data } = await api.callTool(role, {
        name: "get_room_types",
      });
      const outcome = readToolResult(data?.result);

      expect(status).toBe(200);
      expect(outcome.isError, outcome.text).toBe(false);
      expect(outcome.text).toContain("Form Filling Room");
    });
  }

  for (const { type, role } of MEMBERS) {
    test(`POST /api/2.0/ai/editor-tools/call - a ${role}'s tools act in the ${role}'s own My Documents`, async ({
      apiSdk,
    }) => {
      // The tool runs as the caller: the folder and the generated file land in
      // the member's own My Documents, not in the Owner's.
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      const { data: mine } = await memberApi.folders.getMyFolder({});
      const folderId = mine.response!.current!.id!;

      const folderTitle = `Autotest ${apiSdk.faker.generateString(6)}`;
      const created = await api.callTool(role, {
        name: "create_folder",
        arguments: {
          parentId: folderId,
          title: folderTitle,
          filters: fieldsOf("id", "title"),
        },
      });
      expect(created.status).toBe(200);
      expect(
        readToolResult(created.data?.result).isError,
        created.text.slice(0, 300),
      ).toBe(false);
      const { data: listing } = await memberApi.folders.getFolderByFolderId({
        folderId,
      });
      expect((listing.response?.folders ?? []).map((f) => f.title)).toContain(
        folderTitle,
      );

      const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;
      const outcome = await generate(api, role, fileName);
      expect(outcome.isError, outcome.raw).toBe(false);
      expect(generatedFile(outcome)?.parentId).toBe(folderId);
      expect(
        (await listFolderFiles(memberApi, folderId)).map((f) => f.title),
      ).toContain(`${fileName}.docx`);
    });
  }
});

test.describe("AI Editor Tools - a member's tools never exceed the member's rights", () => {
  test("POST /api/2.0/ai/editor-tools/call - a User cannot read, rename, delete or archive the Owner's data", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const { data: myFolder } = await owner.folders.getMyFolder({});
    const myId = myFolder.response!.current!.id!;
    const { data: file } = await owner.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest owner private.docx" },
    });
    const fileId = file.response!.id!;
    const roomId = await ownerRoom(apiSdk, "Autotest owner room");

    // The premise: both tools work for the Owner on exactly these targets, so
    // the refusals below can only be about who is asking.
    const readable = await api.callTool("owner", {
      name: "get_file_info",
      arguments: { fileId, filters: fieldsOf("id") },
    });
    expect(readToolResult(readable.data?.result).isError).toBe(false);
    const roomReadable = await api.callTool("owner", {
      name: "get_room_info",
      arguments: { roomId, filters: fieldsOf("id") },
    });
    expect(readToolResult(roomReadable.data?.result).isError).toBe(false);

    await apiSdk.addAuthenticatedMember("owner", "User");

    const attempts: Array<[string, Record<string, unknown>]> = [
      [
        "get_file_info",
        {
          name: "get_file_info",
          arguments: { fileId, filters: fieldsOf("id") },
        },
      ],
      [
        "download_file_as_text",
        { name: "download_file_as_text", arguments: { fileId } },
      ],
      [
        "update_file",
        { name: "update_file", arguments: { fileId, title: "hijacked.docx" } },
      ],
      ["delete_file", { name: "delete_file", arguments: { fileId } }],
      [
        "get_room_info",
        {
          name: "get_room_info",
          arguments: { roomId, filters: fieldsOf("id") },
        },
      ],
      ["archive_room", { name: "archive_room", arguments: { roomId } }],
      [
        "upload_file",
        {
          name: "upload_file",
          arguments: { parentId: roomId, filename: "x.txt", content: "hi" },
        },
      ],
      [
        "create_folder",
        {
          name: "create_folder",
          arguments: {
            parentId: myId,
            title: "intruder",
            filters: fieldsOf("id"),
          },
        },
      ],
    ];
    const offenders: string[] = [];
    for (const [label, body] of attempts) {
      const { status, data } = await api.callTool("user", body);
      const outcome = readToolResult(data?.result);
      // The portal's own refusal, carried inside the 200.
      if (
        status !== 200 ||
        !outcome.isError ||
        !outcome.text.includes(": 403 ")
      )
        offenders.push(
          `${label}: ${status} isError=${outcome.isError} "${outcome.text.slice(0, 120)}"`,
        );
    }

    // State first: a refusal that still did the work is the same defect.
    const { status: fileStatus, data: fileNow } = await owner.files.getFileInfo(
      {
        fileId,
      },
    );
    expect(fileStatus).toBe(200);
    expect(fileNow.response?.title).toBe("Autotest owner private.docx");
    const { data: roomNow } = await owner.rooms.getRoomInfo({ id: roomId });
    expect(roomNow.response?.rootFolderType).not.toBe(FolderType.Archive);
    const { data: ownerListing } = await owner.folders.getFolderByFolderId({
      folderId: myId,
    });
    expect(
      (ownerListing.response?.folders ?? []).map((f) => f.title),
      "no folder was created in the Owner's My Documents",
    ).not.toContain("intruder");
    expect(await listFolderFiles(owner, roomId)).toEqual([]);
    expect(offenders).toEqual([]);
  });
});

test.describe("AI Editor Tools - entityId: a room the caller may not use is denied, not 'fallen back' from", () => {
  for (const { type, role } of MEMBERS.filter(
    (m) => m.role !== "docSpaceAdmin",
  )) {
    test(`POST /api/2.0/ai/editor-tools/call - a ${role} naming the Owner's room gets nothing, and nothing lands in My Documents instead`, async ({
      apiSdk,
    }) => {
      const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
      const owner = apiSdk.forRole("owner");
      const roomId = await ownerRoom(apiSdk, "Autotest owner room");
      const { data: ownerFolder } = await owner.folders.getMyFolder({});
      const ownerMy = ownerFolder.response!.current!.id!;

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      const { data: mine } = await memberApi.folders.getMyFolder({});
      const memberMy = mine.response!.current!.id!;

      // Control: a value that names no room is a fallback, and the generator
      // works for this role. Without it "nothing was created" could just mean
      // the generator is broken for them.
      const control = `Autotest control ${apiSdk.faker.generateString(6)}`;
      const fallback = await generate(api, role, control, "999999999");
      expect(fallback.isError, fallback.raw).toBe(false);
      expect(generatedFile(fallback)?.parentId).toBe(memberMy);

      const blocked = `Autotest blocked ${apiSdk.faker.generateString(6)}`;
      const denied = await generate(api, role, blocked, String(roomId));

      expect(
        (await listFolderFiles(memberApi, memberMy)).map((f) => f.title),
        "the refused call did not fall back to the member's My Documents",
      ).not.toContain(`${blocked}.docx`);
      expect(
        (await listFolderFiles(owner, ownerMy)).map((f) => f.title),
        "nor to the Owner's",
      ).not.toContain(`${blocked}.docx`);
      expect(await listFolderFiles(owner, roomId)).toEqual([]);
      expect(generatedFile(denied)).toBeUndefined();
      expect(denied.isError).toBe(true);
      expect(denied.text).toContain("tool_not_available");

      // The same refusal for a REST tool: it must not run against the member's
      // own file with the room merely ignored.
      const { data: own } = await memberApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest member own.docx" },
      });
      const ownId = own.response!.id!;
      const rest = await api.callTool(role, {
        name: "delete_file",
        arguments: { fileId: ownId },
        entityId: String(roomId),
      });
      expect(readToolResult(rest.data?.result).text).toContain(
        "tool_not_available",
      );
      expect(
        (await listFolderFiles(memberApi, memberMy)).map((f) => f.id),
        "the member's own file survived",
      ).toContain(ownId);
    });
  }

  test("POST /api/2.0/ai/editor-tools/call - a DocSpaceAdmin who is not a member of the room is refused like the Files API refuses them", async ({
    apiSdk,
  }) => {
    // Held up as a possible inconsistency and measured not to be one: a
    // DocSpaceAdmin outside a room cannot create files in it through the Files
    // API either (403), so the generator's `tool_not_available` agrees with the
    // portal. The Files API answer is the premise that makes the refusal mean it.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const roomId = await ownerRoom(apiSdk, "Autotest owner room");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { status: direct } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest admin direct" },
    });
    expect(direct, "the Files API refuses a non-member admin").toBe(403);

    const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;
    const outcome = await generate(
      api,
      "docSpaceAdmin",
      fileName,
      String(roomId),
    );

    expect(await listFolderFiles(owner, roomId)).toEqual([]);
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain("tool_not_available");
  });

  test("POST /api/2.0/ai/editor-tools/call - a member with Content Creator access may scope a generator into the room", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const roomId = await ownerRoom(apiSdk, "Autotest shared room");
    const { data: member, userData } = await apiSdk.addMember("owner", "User");
    const { status: shareStatus } = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: member.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    expect(shareStatus).toBe(200);
    const memberApi = await apiSdk.authenticateMember(userData, "User");
    const fileName = `Autotest ${apiSdk.faker.generateString(6)}`;

    const outcome = await generate(api, "user", fileName, String(roomId));

    expect(outcome.isError, outcome.raw).toBe(false);
    expect(generatedFile(outcome)?.parentId).toBe(roomId);
    expect(
      (await listFolderFiles(memberApi, roomId)).map((f) => f.title),
    ).toContain(`${fileName}.docx`);
  });
});

async function guestInRoom(apiSdk: ApiSDK) {
  const owner = apiSdk.forRole("owner");
  const roomId = await ownerRoom(apiSdk, "Autotest guest room");
  const { data: control } = await owner.files.createFile({
    folderId: roomId,
    createFileJsonElement: { title: "Autotest Control" },
  });
  const { data: guestData, userData } = await apiSdk.addMember(
    "owner",
    "Guest",
  );
  const { status: shareStatus } = await owner.rooms.setRoomSecurity({
    id: roomId,
    roomInvitationRequest: {
      invitations: [
        { id: guestData.response!.id!, access: FileShare.ContentCreator },
      ],
      notify: false,
    },
  });
  expect(shareStatus).toBe(200);
  const guestApi = await apiSdk.authenticateMember(userData, "Guest");

  // The premise: this Guest really may create files in the room.
  const { status: createStatus, data: direct } =
    await guestApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Direct Create" },
    });
  expect(createStatus, "the Guest may create files in the room").toBe(200);
  return {
    roomId,
    guestApi,
    seeded: [control.response!.id!, direct.response!.id!].sort((a, b) => a - b),
  };
}

const guestGeneratorArgs = (fileName: string) => ({
  fileName,
  description: "One short line.",
  topic: "x",
  slideCount: "1",
  style: "x",
});

test.describe("AI Editor Tools - Guest", () => {
  test("POST /api/2.0/ai/editor-tools/call - a Guest naming a generator without a room gets nothing", async ({
    apiSdk,
  }) => {
    // /list leaves the generators out for a Guest. That is only a restriction if
    // naming one directly fails too, and creates nothing.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const owner = apiSdk.forRole("owner");
    const { data: ownerFolder } = await owner.folders.getMyFolder({});
    const ownerMy = ownerFolder.response!.current!.id!;
    const { roomId, guestApi, seeded } = await guestInRoom(apiSdk);

    const names: string[] = [];
    const results = [];
    for (const name of GENERATOR_TOOLS) {
      const fileName = `Autotest guest ${apiSdk.faker.generateString(6)}`;
      names.push(fileName);
      const { status, data } = await api.callTool("guest", {
        name,
        arguments: guestGeneratorArgs(fileName),
      });
      results.push({ name, status, outcome: readToolResult(data?.result) });
    }

    const ids = (await listFolderFiles(guestApi, roomId))
      .map((f) => f.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual(seeded);
    const ownerTitles = (await listFolderFiles(owner, ownerMy))
      .map((f) => f.title)
      .join("|");
    for (const fileName of names) {
      expect(ownerTitles).not.toContain(fileName);
    }
    for (const r of results) {
      expect(r.status, r.name).toBe(200);
      expect(r.outcome.text, r.name).toContain("tool_not_available");
    }
  });

  test("BUG XXXXX: POST /api/2.0/ai/editor-tools/call - a Guest who is not offered the generators runs them anyway when a room is named", async ({
    apiSdk,
  }) => {
    // The Guest's /list has no generators, and the same Guest names one with the
    // id of a room where they hold Content Creator and gets a document written
    // into it — measured 2026-10-07, the same shape as BUG 83256 for
    // text-to-docx. The listing comes before the result on purpose: a refusal
    // message next to a file that was written is the same defect.
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);
    const { roomId, guestApi, seeded } = await guestInRoom(apiSdk);
    expect(
      (await api.tools("guest")).map((t) => t.name),
      "the generators are not offered to a Guest",
    ).not.toContain("onlyoffice_generate_docx");

    const results = [];
    for (const name of GENERATOR_TOOLS) {
      const { data } = await api.callTool("guest", {
        name,
        arguments: guestGeneratorArgs(
          `Autotest guest ${apiSdk.faker.generateString(6)}`,
        ),
        entityId: String(roomId),
      });
      results.push({ name, outcome: readToolResult(data?.result) });
    }

    const ids = (await listFolderFiles(guestApi, roomId))
      .map((f) => f.id)
      .sort((a, b) => a - b);
    test.fail();
    expect(ids, "no generator wrote into the room").toEqual(seeded);
    for (const r of results) {
      expect(r.outcome.text, r.name).toContain("tool_not_available");
    }
  });
});

test.describe("AI Editor Tools - anonymous", () => {
  test("GET /api/2.0/ai/editor-tools/list - anonymous gets 401", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await api.list("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("POST /api/2.0/ai/editor-tools/call - anonymous gets 401, for a valid and for an invalid body", async ({
    apiSdk,
  }) => {
    const api = new AiEditorTools(apiSdk.request, apiSdk.tokenStore);

    const valid = await api.callTool("anonymous", { name: "get_room_types" });
    const invalid = await api.callTool("anonymous", {});

    expect(valid.error).toBe("Unauthorized");
    expect(valid.status).toBe(401);
    expect(invalid.error).toBe("Unauthorized");
    expect(invalid.status).toBe(401);
  });
});
