import { expect } from "@playwright/test";
import { OperationsApi, FileOperationDto } from "@onlyoffice/docspace-api-sdk";

type OperationRef = { id?: string | null };

export type WaitOptions = {
  /**
   * The operations the starting request returned. When given, the wait is for
   * THESE operations (matched by id), so a finished operation of an earlier
   * request is never taken for the current one. Without it the newest listed
   * operation is used, which is only safe while the caller has no other
   * operation running.
   */
  started?: OperationRef | OperationRef[] | null;
  /** Fail when the operation reports an error (leave it off where the error is the thing under test). */
  failOnError?: boolean;
};

export async function waitForOperation(
  operations: OperationsApi,
  options: WaitOptions = {},
): Promise<FileOperationDto> {
  let result: FileOperationDto | undefined;
  // A starting call answers with one operation (archive, delete a room) or a list (bulk jobs).
  const ids = ([] as OperationRef[])
    .concat(options.started ?? [])
    .map((o) => o.id)
    .filter((id): id is string => !!id);

  await expect(async () => {
    const { data, status } = await operations.getOperationStatuses();
    expect(status, "getOperationStatuses: HTTP status").toBe(200);
    const ops = data.response;
    expect(Array.isArray(ops), "getOperationStatuses: no list").toBe(true);
    expect(
      ops!.length,
      "getOperationStatuses: no operation listed",
    ).toBeGreaterThan(0);
    let op: FileOperationDto;
    if (ids.length > 0) {
      const mine = ops!.filter((o) => o.id && ids.includes(o.id));
      expect(
        mine.length,
        `none of the started operations ${ids} is listed`,
      ).toBeGreaterThan(0);
      op = mine[mine.length - 1];
    } else {
      op = ops![ops!.length - 1];
    }
    expect(op.finished).toBe(true);
    result = op;
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  if (options.failOnError)
    expect(result!.error || null, "the operation reported an error").toBeNull();
  return result!;
}
