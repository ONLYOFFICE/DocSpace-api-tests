import { expect } from "@playwright/test";

/**
 * `filterValue` is answered from a search index, not from the table the write
 * went to, and the two indexes behind these listings are refreshed
 * differently: a room is not indexed as it is created or renamed - a
 * background sweep does that, every `Period` minutes, one by default - while
 * the metadata values are indexed as they are written. So a listing read
 * right after a write can be behind in two ways: the entry is missing, or a
 * renamed room still carries its old title.
 *
 * Repeats the query until `check` stops throwing. The timeout covers a full
 * sweep at the default period, so a portal indexing at its slowest still
 * passes rather than flakes. It costs nothing while the index is current: the
 * wait ends as soon as the expectation holds.
 *
 * Absence cannot be waited for this way - "not indexed yet" and "never
 * matches" look alike - so a test asserting a room is NOT found waits here
 * for a positive control on the same index first.
 *
 * Takes the whole call as a closure, so it serves every listing answered from
 * such an index alike: the rooms and forms listings, and the two metadata
 * searches.
 */
export async function waitForRoomsSearch<T extends { status: number }>(
  query: () => Promise<T>,
  check: (result: T) => void,
  timeoutMs = 90_000,
): Promise<T> {
  let last: T | undefined;

  await expect(async () => {
    last = await query();
    expect(last.status).toBe(200);
    check(last);
  }).toPass({
    intervals: [250, 500, 1_000, 2_000, 5_000],
    timeout: timeoutMs,
  });

  return last!;
}
