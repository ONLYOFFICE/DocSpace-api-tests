import { expect } from "@playwright/test";

/**
 * A room reaches the search index about a second after it is created or
 * renamed, so a listing filtered by `filterValue` right after the write
 * answers 200 without it. Repeats the query until `check` stops throwing.
 *
 * Absence cannot be waited for this way - "not indexed yet" and "never
 * matches" look alike - so a test asserting a room is NOT found waits here
 * for a positive control on the same index first.
 *
 * Takes the whole call as a closure, so it serves `GET /files/rooms` and
 * `GET /files/@forms` alike.
 */
export async function waitForRoomsSearch<T extends { status: number }>(
  query: () => Promise<T>,
  check: (result: T) => void,
  timeoutMs = 20_000,
): Promise<T> {
  let last: T | undefined;

  await expect(async () => {
    last = await query();
    expect(last.status).toBe(200);
    check(last);
  }).toPass({
    intervals: [250, 500, 1_000, 2_000],
    timeout: timeoutMs,
  });

  return last!;
}
