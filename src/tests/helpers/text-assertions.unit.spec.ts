import { test, expect } from "@playwright/test";
import { diffExactIdSet } from "@/src/helpers/text-assertions";

// Pure unit tests for the id-set parser behind `expectExactIdSet(...,
// { lastBlockOnly: true })`. No portal, no network — they use plain
// @playwright/test rather than the portal-creating fixtures. Most replies are
// verbatim model answers captured from repeated runs of the CSV-reasoning
// suite (ai-reasoning.spec.ts, Tests 14 and 15).

const X_ID = /\bX\d{3}\b/i;
const ZERO_NET = ["X001", "X007"];
const NEGATIVE_NET = ["X008", "X014"];

const diff = (text: string, expected: string[]) =>
  diffExactIdSet(text, X_ID, expected, { lastBlockOnly: true });

const SCAN_ALL = [
  "- X001: 0.00",
  "- X002: 7585000.76",
  "- X003: 1248.96",
  "- X004: 2708.15",
  "- X005: 1913.75",
  "- X006: 621.05",
  "- X007: **0.00** ✓",
  "- X008: -214.75",
  "- X009: 0.04",
  "- X010: 1014.69",
  "- X011: 3884.60",
  "- X012: 6923.50",
  "- X013: 3275.00",
  "- X014: -75.00",
].join("\n");

test.describe("expectExactIdSet parser: false failures that were fixed", () => {
  test("Test 14 run #7 - correct answer followed by a negated trailing note", () => {
    const text = [
      "I'll look at the CSV data provided to find records where Expected_Net_Pay is exactly zero.",
      'Let me scan through the records:\n\nLooking at the "Expected_Net_Pay" column for each record:',
      SCAN_ALL.replace("X001: 0.00", "X001: 0.00 ✓"),
      "Two records have an Expected_Net_Pay of exactly zero:\n- **X001** (Zero hours and zero pay scenario — no earnings, no deductions)\n- **X007** (Deductions equal gross pay - exactly zero net pay)",
      "The match is:",
      "```\nX001\nX007\n```",
      "Notably, X009 (0.04) and X014 (-75.00) are close but not exactly zero, so they don't match.",
    ].join("\n\n");

    expect(diff(text, ZERO_NET)).toEqual({ missing: [], extra: [] });
  });

  test("Test 15 - correct table followed by a prose line naming one of the ids", () => {
    const text = [
      "Scanning the data for records where Expected_Net_Pay is below zero (negative):",
      "- **X008** — Expected_Net_Pay = -214.75 (Deductions exceed gross pay)\n- **X014** — Expected_Net_Pay = -75.00 (Deduction-only record, no earnings)",
      "Here are the results:",
      "| Employee_ID | Expected_Net_Pay |\n|---|---|\n| X008 | -214.75 |\n| X014 | -75.00 |",
      "Both records have negative net pay because total deductions exceed gross earnings (including the zero-earnings case in X014).",
    ].join("\n\n");

    expect(diff(text, NEGATIVE_NET)).toEqual({ missing: [], extra: [] });
  });
});

test.describe("expectExactIdSet parser: regression found in the live rerun", () => {
  test("Test 14 - correct final answer after a small candidate list and a full scan", () => {
    // The early list names X014 as a (rejected) candidate; the structured-block
    // override must not pull it into the answer when the scan sits in between.
    const text = [
      "I'll analyze the data to find records where Expected_Net_Pay is exactly zero.",
      "Looking at the data:",
      "- X001: 0.00 — zero\n- X007: 0.00 — zero\n- X014: -75.00 — no",
      "Let me verify each record's Expected_Net_Pay:",
      SCAN_ALL,
      "The records where Expected_Net_Pay is exactly zero are: **X001** and **X007**.",
    ].join("\n\n");
    expect(diff(text, ZERO_NET)).toEqual({ missing: [], extra: [] });
  });
});

test.describe("expectExactIdSet parser: previously passing shapes still pass", () => {
  test("single concise final line after a full scan", () => {
    const text = [
      "Looking at the data:",
      SCAN_ALL,
      "The records where Expected_Net_Pay is exactly zero:",
      "**X001** and **X007**",
    ].join("\n\n");
    expect(diff(text, ZERO_NET)).toEqual({ missing: [], extra: [] });
  });

  test("final prose repeating the list answer, with an exclusivity claim", () => {
    const text = [
      "The records where Expected_Net_Pay is exactly zero:",
      "- **X001** (net pay: 0.00)\n- **X007** (net pay: 0.00)",
      "Note: X008 (-214.75) and X014 (-75.00) have negative net pay, not exactly zero.",
      "The only Employee_IDs with Expected_Net_Pay exactly zero are **X001** and **X007**.",
    ].join("\n\n");
    expect(diff(text, ZERO_NET)).toEqual({ missing: [], extra: [] });
  });

  test("a padded answer is still reported as extra", () => {
    const text = "The records are:\n\n- X008\n- X014\n- X007";
    expect(diff(text, NEGATIVE_NET)).toEqual({ missing: [], extra: ["X007"] });
  });

  test("an answer with no negation words in the commentary does not leak into the claim", () => {
    // "No other record ..." has no word from NEGATION_RE, so it is a positive
    // clause naming X008/X014. It must not be merged into the answer.
    const text = [
      "- **X007** — Expected_Net_Pay = 0.00",
      "No other records have a net pay of exactly zero (X008 and X014 are negative).",
      "**Employee_ID: X007**",
    ].join("\n\n");
    expect(diff(text, ["X007"])).toEqual({ missing: [], extra: [] });
  });
});

test.describe("expectExactIdSet parser: real model errors are still caught", () => {
  test("Test 14 run #1 - X001 listed in the scan but dropped from the final answer", () => {
    const text = [
      "I'll examine the file to find records where Expected_Net_Pay is exactly zero.",
      "Looking at the data provided, scanning through all records for `Expected_Net_Pay`:",
      SCAN_ALL,
      "The records where Expected_Net_Pay is exactly zero:",
      '- **X007** (net pay: 0.00, "Deductions equal gross pay")',
      "Note: X008 (-214.75) and X014 (-75.00) have negative net pay, not exactly zero. X009 has 0.04, not zero.",
      "The only Employee_ID with Expected_Net_Pay exactly zero is **X007**.",
    ].join("\n\n");
    expect(diff(text, ZERO_NET)).toEqual({ missing: ["X001"], extra: [] });
  });

  test("Test 14 run #14 - scan lists both, final block names only X007", () => {
    const text = [
      "I'll analyze the CSV data to find records where Expected_Net_Pay is exactly zero.",
      "Looking at the data:",
      SCAN_ALL.replace("X007: 0.00", "**X007: 0.00** ✓").replace(
        "**0.00** ✓",
        "0.00",
      ),
      "The only record where Expected_Net_Pay is exactly zero is:",
      "**X007**",
    ].join("\n\n");
    expect(diff(text, ZERO_NET)).toEqual({ missing: ["X001"], extra: [] });
  });

  test("correct ids named in prose reasoning, one excluded from the final answer", () => {
    const text = [
      "Both X001 and X007 show 0.00 in the Expected_Net_Pay column.",
      "**X007**",
    ].join("\n\n");
    expect(diff(text, ZERO_NET)).toEqual({ missing: ["X001"], extra: [] });
  });

  test("correct ids in a scan, final table drops one", () => {
    const text = [
      "Scanning the data for records where Expected_Net_Pay is below zero:",
      "- **X008** — -214.75\n- **X014** — -75.00",
      "Here are the results:",
      "| Employee_ID | Expected_Net_Pay |\n|---|---|\n| X014 | -75.00 |",
    ].join("\n\n");
    expect(diff(text, NEGATIVE_NET)).toEqual({ missing: ["X008"], extra: [] });
  });

  test("a final answer that exclusively names the wrong subset is not rescued by an earlier list", () => {
    const text = [
      "Candidates:",
      "- **X008**\n- **X014**",
      "The only negative record is X014.",
    ].join("\n\n");
    expect(diff(text, NEGATIVE_NET)).toEqual({ missing: ["X008"], extra: [] });
  });

  test("an answer whose only ids are negated reports everything missing", () => {
    const text = "Neither X001 nor X007 has a net pay of zero.";
    expect(diff(text, ZERO_NET)).toEqual({
      missing: ["X001", "X007"],
      extra: [],
    });
  });

  test("an answer with no ids at all reports everything missing", () => {
    expect(diff("There are no such records.", ZERO_NET)).toEqual({
      missing: ["X001", "X007"],
      extra: [],
    });
  });
});

test.describe("expectExactIdSet parser: employee-id questions (Test 12 shape)", () => {
  const E_ID = /\bE\d{3}\b/i;

  test("table answer with a trailing note listing another department", () => {
    const text = [
      "Engineering employees:",
      "| Employee_ID | Gross_Pay |\n|---|---|\n| E002 | 5000.00 |\n| E007 | 6710.00 |",
      "E004 is in Sales, not Engineering.",
    ].join("\n\n");
    expect(
      diffExactIdSet(text, E_ID, ["E002", "E007"], { lastBlockOnly: true }),
    ).toEqual({ missing: [], extra: [] });
  });
});
