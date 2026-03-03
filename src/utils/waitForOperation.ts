import { expect } from "@playwright/test";
import { OperationsApi } from "@onlyoffice/docspace-api-sdk";

export type FileOperation = {
  id: string;
  finished: boolean;
  error: string;
  progress: number;
  folders: { id: number; title: string }[];
};

export async function waitForOperation(
  operations: OperationsApi,
): Promise<FileOperation> {
  let result: FileOperation = {
    id: "",
    finished: false,
    error: "",
    progress: 0,
    folders: [],
  };

  await expect(async () => {
    const { data } = await operations.getOperationStatuses();
    const ops = (data as Record<string, FileOperation[]>).response;
    const op = ops[ops.length - 1];
    expect(op.finished).toBe(true);
    result = op;
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  return result;
}
