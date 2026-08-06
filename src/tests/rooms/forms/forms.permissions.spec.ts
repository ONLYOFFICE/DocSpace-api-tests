import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileShare,
  FolderType,
  RoomType,
  SearchArea,
} from "@onlyoffice/docspace-api-sdk";
import { createRoomOfType, folderIds } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";

/**
 * Only the checks that confirm the new Forms area filters correctly per role.
 * The general room permission matrix is covered in rooms.permissions.spec.ts and
 * is not repeated here.
 *
 * Established live:
 *   - GET /files/rooms?searchArea=Forms and GET /files/@forms answer 200 for
 *     every authenticated role and are membership-scoped: a non-member gets an
 *     empty list rather than 403.
 *   - A DocSpaceAdmin sees other people's form filling rooms without membership;
 *     RoomAdmin, User and Guest do not.
 *   - Creating a form filling room follows the ordinary room rule: Owner,
 *     DocSpaceAdmin and RoomAdmin may, User and Guest get 403.
 *   - Form templates are scoped to their creator, including for a DocSpaceAdmin.
 */
test.describe("Forms section permissions", () => {
  test.describe("who may create a form filling room", () => {
    const creators = [
      { type: "DocSpaceAdmin" },
      { type: "RoomAdmin" },
    ] as const;

    for (const { type } of creators) {
      test(`POST /files/rooms - ${type} creates a form filling room and sees it in their Forms section`, async ({
        apiSdk,
      }) => {
        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { data, status } = await api.rooms.createRoom({
          createRoomRequestDto: {
            title: `${type} Form Room`,
            roomType: RoomType.FillingFormsRoom,
          },
        });

        expect(status).toBe(200);
        expect(data.response!.roomType).toBe(RoomType.FillingFormsRoom);
        const roomId = data.response!.id!;

        const { data: forms } = await api.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
        });
        expect(folderIds(forms)).toContain(roomId);

        const { data: rooms } = await api.rooms.getRoomsFolder({});
        expect(folderIds(rooms)).not.toContain(roomId);
      });
    }

    const forbidden = [{ type: "User" }, { type: "Guest" }] as const;

    for (const { type } of forbidden) {
      test(`POST /files/rooms - ${type} cannot create a form filling room`, async ({
        apiSdk,
      }) => {
        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { status } = await api.rooms.createRoom({
          createRoomRequestDto: {
            title: `${type} Form Room`,
            roomType: RoomType.FillingFormsRoom,
          },
        });
        expect(status).toBe(403);

        // nothing was created behind the 403
        const { data: forms, status: listStatus } =
          await api.rooms.getRoomsFolder({ searchArea: SearchArea.Forms });
        expect(listStatus).toBe(200);
        expect(folderIds(forms)).toEqual([]);
      });
    }
  });

  test.describe("who may list the Forms section", () => {
    const roles = [
      { type: "DocSpaceAdmin", seesOthersRooms: true },
      { type: "RoomAdmin", seesOthersRooms: false },
      { type: "User", seesOthersRooms: false },
      { type: "Guest", seesOthersRooms: false },
    ] as const;

    for (const { type, seesOthersRooms } of roles) {
      test(`GET /files/rooms?searchArea=Forms - ${type} gets 200 and a membership-scoped list`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Owner Form Room",
          RoomType.FillingFormsRoom,
        );
        // control: the owner does see it, so an empty list below is about scoping
        const { data: ownerForms } = await ownerApi.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
        });
        expect(folderIds(ownerForms)).toEqual([ffrId]);

        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { data, status } = await api.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
        });
        expect(status).toBe(200);
        expect(data.response!.current!.rootFolderType).toBe(FolderType.Forms);

        if (seesOthersRooms) {
          expect(folderIds(data)).toContain(ffrId);
        } else {
          expect(folderIds(data)).not.toContain(ffrId);
          expect(data.response!.total).toBe(0);
        }
      });

      test(`GET /files/@forms - ${type} gets the same scoping as the rooms endpoint`, async ({
        apiSdk,
      }) => {
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Owner At Form Room",
          RoomType.FillingFormsRoom,
        );

        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { data: viaFolders, status } = await api.folders.getFormsFolder(
          {},
        );
        const { data: viaRooms } = await api.rooms.getRoomsFolder({
          searchArea: SearchArea.Forms,
        });

        expect(status).toBe(200);
        expect(folderIds(viaFolders).sort()).toEqual(
          folderIds(viaRooms).sort(),
        );
        if (!seesOthersRooms) {
          expect(folderIds(viaFolders)).not.toContain(ffrId);
        }
      });
    }

    test("GET /files/rooms?searchArea=Forms - Anonymous requests are rejected with 401", async ({
      apiSdk,
    }) => {
      await createRoomOfType(
        apiSdk,
        "owner",
        "Anon Form Room",
        RoomType.FillingFormsRoom,
      );
      const anon = apiSdk.forAnonymous();

      expect(
        (await anon.rooms.getRoomsFolder({ searchArea: SearchArea.Forms }))
          .status,
      ).toBe(401);
      expect((await anon.folders.getFormsFolder({})).status).toBe(401);
      expect(
        (
          await anon.rooms.getRoomsFolder({
            searchArea: SearchArea.FormTemplates,
          })
        ).status,
      ).toBe(401);
    });
  });

  test.describe("who may see a specific form filling room", () => {
    const roles = [
      { type: "DocSpaceAdmin", expected: 200 },
      { type: "RoomAdmin", expected: 403 },
      { type: "User", expected: 403 },
      { type: "Guest", expected: 403 },
    ] as const;

    for (const { type, expected } of roles) {
      test(`GET /files/rooms/:id - ${type} who is not a member gets ${expected}`, async ({
        apiSdk,
      }) => {
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Scoped Form Room",
          RoomType.FillingFormsRoom,
        );

        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { status } = await api.rooms.getRoomInfo({ id: ffrId });
        expect(status).toBe(expected);
      });
    }

    test("GET /files/rooms/:id - A member with FillForms access sees the room through Forms and by id", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Member Form Room",
        RoomType.FillingFormsRoom,
      );
      const otherId = await createRoomOfType(
        apiSdk,
        "owner",
        "Other Custom Room",
        RoomType.CustomRoom,
      );

      const member = await apiSdk.addMember("owner", "User");
      const api = await apiSdk.authenticateMember(member.userData, "User");

      const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
        id: ffrId,
        roomInvitationRequest: {
          invitations: [
            { id: member.data.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      });
      expect(inviteStatus).toBe(200);

      const { data: forms, status } = await api.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(status).toBe(200);
      expect(folderIds(forms)).toEqual([ffrId]);

      const { data: viaFolders } = await api.folders.getFormsFolder({});
      expect(folderIds(viaFolders)).toEqual([ffrId]);

      expect((await api.rooms.getRoomInfo({ id: ffrId })).status).toBe(200);
      // membership in the Forms section grants nothing in the Rooms section
      expect((await api.rooms.getRoomInfo({ id: otherId })).status).toBe(403);
      const { data: rooms } = await api.rooms.getRoomsFolder({});
      expect(folderIds(rooms)).toEqual([]);
    });

    test("PUT /files/rooms/:id/share - A revoked member loses the room from Forms, Favorites and by id", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Revoked Form Room",
        RoomType.FillingFormsRoom,
      );

      const member = await apiSdk.addMember("owner", "User");
      const api = await apiSdk.authenticateMember(member.userData, "User");

      await ownerApi.rooms.setRoomSecurity({
        id: ffrId,
        roomInvitationRequest: {
          invitations: [
            { id: member.data.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      });

      await api.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
      });

      // premise: while invited, the member really does see it everywhere
      expect(
        folderIds(
          (await api.rooms.getRoomsFolder({ searchArea: SearchArea.Forms }))
            .data,
        ),
      ).toEqual([ffrId]);
      expect(
        folderIds((await api.folders.getFavoritesFolder({})).data),
      ).toEqual([ffrId]);

      const { status: revokeStatus } = await ownerApi.rooms.setRoomSecurity({
        id: ffrId,
        roomInvitationRequest: {
          invitations: [
            { id: member.data.response!.id!, access: FileShare.None },
          ],
          notify: false,
        },
      });
      expect(revokeStatus).toBe(200);

      const { data: forms, status } = await api.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(status).toBe(200);
      expect(folderIds(forms)).toEqual([]);

      const { data: viaFolders } = await api.folders.getFormsFolder({});
      expect(folderIds(viaFolders)).toEqual([]);

      const { data: favorites } = await api.folders.getFavoritesFolder({});
      expect(folderIds(favorites)).toEqual([]);

      expect((await api.rooms.getRoomInfo({ id: ffrId })).status).toBe(403);
    });
  });

  test.describe("who may favorite a form filling room", () => {
    test("POST /files/favorites - A member with access favorites the room; Favorites is per user", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Shared Fav Form Room",
        RoomType.FillingFormsRoom,
      );

      const member = await apiSdk.addMember("owner", "User");
      const api = await apiSdk.authenticateMember(member.userData, "User");
      await ownerApi.rooms.setRoomSecurity({
        id: ffrId,
        roomInvitationRequest: {
          invitations: [
            { id: member.data.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      });

      const { status } = await api.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
      });
      expect(status).toBe(200);

      const { data: theirs } = await api.folders.getFavoritesFolder({});
      expect(folderIds(theirs)).toEqual([ffrId]);

      // the owner's own Favorites are unaffected by someone else's choice
      const { data: ownerFavorites } =
        await ownerApi.folders.getFavoritesFolder({});
      expect(folderIds(ownerFavorites)).toEqual([]);
    });

    test("POST /files/favorites - A non-member's request is accepted but discloses nothing", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Outsider Fav Form Room",
        RoomType.FillingFormsRoom,
      );

      const outsider = await apiSdk.addMember("owner", "User");
      const api = await apiSdk.authenticateMember(outsider.userData, "User");

      // The endpoint answers 200 for a room the caller cannot see, so the state
      // is what matters: nothing is stored and nothing becomes readable.
      const { status } = await api.operations.addFavorites({
        baseBatchRequestDto: { folderIds: [ffrId as never], fileIds: [] },
      });
      expect(status).toBe(200);

      const { data: favorites, status: favStatus } =
        await api.folders.getFavoritesFolder({});
      expect(favStatus).toBe(200);
      expect(folderIds(favorites)).toEqual([]);

      const { data: forms } = await api.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toEqual([]);
      expect((await api.rooms.getRoomInfo({ id: ffrId })).status).toBe(403);

      // and the owner's Favorites were not written to either
      const { data: ownerFavorites } =
        await ownerApi.folders.getFavoritesFolder({});
      expect(folderIds(ownerFavorites)).toEqual([]);
    });
  });

  test.describe("who may delete or archive a form filling room", () => {
    // Archive and delete do NOT share a matrix: a DocSpaceAdmin may archive
    // somebody else's form filling room but may not delete it (403). Verified
    // live - deleting stays with the actual room owner.
    const archiveRoles = [
      { type: "DocSpaceAdmin", expected: 200 },
      { type: "RoomAdmin", expected: 403 },
      { type: "User", expected: 403 },
      { type: "Guest", expected: 403 },
    ] as const;

    const deleteRoles = [
      { type: "DocSpaceAdmin", expected: 403 },
      { type: "RoomAdmin", expected: 403 },
      { type: "User", expected: 403 },
      { type: "Guest", expected: 403 },
    ] as const;

    for (const { type, expected } of archiveRoles) {
      test(`PUT /files/rooms/:id/archive - ${type} who is not a member gets ${expected}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Archivable Form Room",
          RoomType.FillingFormsRoom,
        );

        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { status } = await api.rooms.archiveRoom({
          id: ffrId,
          archiveRoomRequest: { deleteAfter: false },
        });
        expect(status).toBe(expected);

        if (expected === 403) {
          // the room is still active in the owner's Forms section
          const { data: forms } = await ownerApi.rooms.getRoomsFolder({
            searchArea: SearchArea.Forms,
          });
          expect(folderIds(forms)).toEqual([ffrId]);
        }
      });
    }

    for (const { type, expected } of deleteRoles) {
      test(`DELETE /files/rooms/:id - ${type} who is not a member gets ${expected}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const ffrId = await createRoomOfType(
          apiSdk,
          "owner",
          "Deletable Form Room",
          RoomType.FillingFormsRoom,
        );

        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { status } = await api.rooms.deleteRoom({
          id: ffrId,
          deleteRoomRequest: { deleteAfter: false },
        });
        expect(status).toBe(expected);

        if (expected === 403) {
          const { data: forms } = await ownerApi.rooms.getRoomsFolder({
            searchArea: SearchArea.Forms,
          });
          expect(folderIds(forms)).toEqual([ffrId]);
          expect((await ownerApi.rooms.getRoomInfo({ id: ffrId })).status).toBe(
            200,
          );
        }
      });
    }

    test("PUT /files/rooms/:id/archive - A member with FillForms access cannot archive the room", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const ffrId = await createRoomOfType(
        apiSdk,
        "owner",
        "Member Archive Form Room",
        RoomType.FillingFormsRoom,
      );

      const member = await apiSdk.addMember("owner", "User");
      const api = await apiSdk.authenticateMember(member.userData, "User");
      await ownerApi.rooms.setRoomSecurity({
        id: ffrId,
        roomInvitationRequest: {
          invitations: [
            { id: member.data.response!.id!, access: FileShare.FillForms },
          ],
          notify: false,
        },
      });

      // premise: the member can see the room, so a 403 below is about the action
      expect((await api.rooms.getRoomInfo({ id: ffrId })).status).toBe(200);

      expect(
        (
          await api.rooms.archiveRoom({
            id: ffrId,
            archiveRoomRequest: { deleteAfter: false },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await api.rooms.deleteRoom({
            id: ffrId,
            deleteRoomRequest: { deleteAfter: false },
          })
        ).status,
      ).toBe(403);

      const { data: forms } = await api.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toEqual([ffrId]);
    });
  });

  test.describe("who may create and use a form template", () => {
    const creators = [
      { type: "DocSpaceAdmin" },
      { type: "RoomAdmin" },
    ] as const;

    for (const { type } of creators) {
      test(`POST /files/roomtemplate - ${type} makes a form template from their own room and sees it in FormTemplates`, async ({
        apiSdk,
      }) => {
        const member = await apiSdk.addMember("owner", type);
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { data: created, status: createStatus } =
          await api.rooms.createRoom({
            createRoomRequestDto: {
              title: `${type} Tpl Form Source`,
              roomType: RoomType.FillingFormsRoom,
            },
          });
        expect(createStatus).toBe(200);

        const { status } = await api.rooms.createRoomTemplate({
          roomTemplateDto: {
            roomId: created.response!.id!,
            title: `${type} Form Template`,
          },
        });
        expect(status).toBe(200);
        const templateId = await waitForRoomTemplate(api.rooms);

        const { data: formTemplates } = await api.rooms.getRoomsFolder({
          searchArea: SearchArea.FormTemplates,
        });
        expect(folderIds(formTemplates)).toEqual([templateId]);

        // it did not land in the ordinary Templates area
        const { data: roomTemplates } = await api.rooms.getRoomsFolder({
          searchArea: SearchArea.Templates,
        });
        expect(folderIds(roomTemplates)).toEqual([]);
      });
    }

    test("GET /files/rooms?searchArea=FormTemplates - A form template is scoped to its creator", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Scoped Tpl Form Source",
        RoomType.FillingFormsRoom,
      );
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: formRoomId,
          title: "Owner Only Form Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const types = ["DocSpaceAdmin", "RoomAdmin", "User", "Guest"] as const;

      // every plain member has to be created before any of them authenticates -
      // an addMember that follows an authenticateMember answers 403
      const members = [];
      for (const type of types) {
        members.push({ type, member: await apiSdk.addMember("owner", type) });
      }

      for (const { type, member } of members) {
        const api = await apiSdk.authenticateMember(member.userData, type);

        const { data, status } = await api.rooms.getRoomsFolder({
          searchArea: SearchArea.FormTemplates,
        });
        expect(status, type).toBe(200);
        expect(folderIds(data), type).not.toContain(templateId);
      }

      // control: the creator still sees it
      const { data: mine } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(mine)).toEqual([templateId]);
    });

    test("DELETE /files/rooms/:id - A non-owner cannot delete someone else's form template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Protected Tpl Form Source",
        RoomType.FillingFormsRoom,
      );
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: {
          roomId: formRoomId,
          title: "Protected Form Template",
        },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const member = await apiSdk.addMember("owner", "RoomAdmin");
      const api = await apiSdk.authenticateMember(member.userData, "RoomAdmin");

      const { status } = await api.rooms.deleteRoom({
        id: templateId,
        deleteRoomRequest: { deleteAfter: false },
      });
      expect(status).toBe(403);

      // still there for the creator
      const { data: mine } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(mine)).toEqual([templateId]);
    });

    test("DELETE /files/rooms/:id - The creator deletes their own form template", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const formRoomId = await createRoomOfType(
        apiSdk,
        "owner",
        "Own Tpl Form Source",
        RoomType.FillingFormsRoom,
      );
      await ownerApi.rooms.createRoomTemplate({
        roomTemplateDto: { roomId: formRoomId, title: "Own Form Template" },
      });
      const templateId = await waitForRoomTemplate(ownerApi.rooms);

      const { status } = await ownerApi.rooms.deleteRoom({
        id: templateId,
        deleteRoomRequest: { deleteAfter: false },
      });
      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.FormTemplates,
      });
      expect(folderIds(data)).toEqual([]);

      // the source room is untouched by templating and by the template delete
      const { data: forms } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.Forms,
      });
      expect(folderIds(forms)).toEqual([formRoomId]);
    });
  });
});
