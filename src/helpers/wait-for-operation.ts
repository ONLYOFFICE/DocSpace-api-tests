import { expect } from "@playwright/test";
import { OperationsApi, FileOperationDto } from "@onlyoffice/docspace-api-sdk";

export async function waitForOperation(
  operations: OperationsApi,
): Promise<FileOperationDto> {
  let result: FileOperationDto | undefined;

  await expect(async () => {
    const { data } = await operations.getOperationStatuses();
    const ops = data.response!;
    const op = ops[ops.length - 1];
    expect(op.finished).toBe(true);
    result = op;
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  return result!;
}
