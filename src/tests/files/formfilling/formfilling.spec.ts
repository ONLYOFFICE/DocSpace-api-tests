import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FormFillingManageAction } from "@onlyoffice/docspace-api-sdk";
import { readFileSync } from "fs";
import path from "path";

test.describe("PUT /files/file/:fileId/manageformfilling", () => {
  test("PUT /files/file/:fileId/manageformfilling - Owner starts and stops form filling", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Form Filling Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const buffer = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const { data: insertData, status: insertStatus } =
      await apiSdk.insertBinaryFile(
        "owner",
        roomId,
        buffer,
        "oo-form-empty.pdf",
      );
    expect(insertStatus, `Insert failed: ${JSON.stringify(insertData)}`).toBe(
      200,
    );
    const formId = insertData.response.id as number;

    await test.step("Start form filling", async () => {
      const { status } = await ownerApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDtoInteger: {
          formId,
          action: FormFillingManageAction.Start,
        },
      });

      expect(status).toBe(200);
    });

    await test.step("Stop form filling", async () => {
      const { status } = await ownerApi.files.manageFormFilling({
        fileId: String(formId),
        manageFormFillingDtoInteger: {
          formId,
          action: FormFillingManageAction.Stop,
        },
      });

      expect(status).toBe(200);
    });
  });
});
