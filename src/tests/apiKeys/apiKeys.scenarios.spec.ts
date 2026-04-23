import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/keys - scenarios", () => {
  test.fail(
    "BUG XXXX: API key with files:read scope cannot create another API key",
    async ({ apiSdk }) => {
      let apiKeyValue: string;

      await test.step("Owner creates an API key with files:read only", async () => {
        const { data, status } = await apiSdk
          .forRole("owner")
          .apiKeys.createApiKey({
            createApiKeyRequestDto: {
              name: "read-only key",
              permissions: ["files:read"],
            },
          });

        expect(status).toBe(200);
        apiKeyValue = data.response!.key!;
      });

      await test.step("Request with that key to create a full-access key returns 403", async () => {
        const { data, status } = await apiSdk
          .forApiKey(apiKeyValue!)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: {
              name: "full access key",
            },
          });

        expect(status).toBe(403);
        expect((data.response as any)?.error?.message).toBe("Access denied");
      });
    },
  );

  test.fail(
    "BUG XXXX: API key with contacts:read scope cannot access rooms",
    async ({ apiSdk }) => {
      let roomId: number;
      let apiKeyValue: string;

      await test.step("Owner creates a room", async () => {
        const { data, status } = await apiSdk
          .forRole("owner")
          .rooms.createRoom({
            createRoomRequestDto: {
              title: "Autotest Room",
              roomType: RoomType.EditingRoom,
            },
          });

        expect(status).toBe(200);
        roomId = data.response!.id!;
      });

      await test.step("Owner creates a file in the room", async () => {
        const { status } = await apiSdk.forRole("owner").files.createFile({
          folderId: roomId!,
          createFileJsonElement: { title: "Autotest File.docx" },
        });

        expect(status).toBe(200);
      });

      await test.step("Owner creates an API key with contacts:read only", async () => {
        const { data, status } = await apiSdk
          .forRole("owner")
          .apiKeys.createApiKey({
            createApiKeyRequestDto: {
              name: "contacts-read key",
              permissions: ["accounts:read"],
            },
          });

        expect(status).toBe(200);
        apiKeyValue = data.response!.key!;
      });

      await test.step("Request room with that key returns 403", async () => {
        const { data, status } = await apiSdk
          .forApiKey(apiKeyValue!)
          .rooms.getRoomInfo({ id: roomId! });

        expect(status).toBe(403);
        expect((data.response as any)?.error?.message).toBe("Access denied");
      });
    },
  );
});
