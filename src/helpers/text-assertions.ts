import { expect } from "@playwright/test";

// Assertions for grading a free-form model answer against facts known ahead
// of time, without pinning its exact wording — see the automation strategy
// notes in the CSV-reasoning suite (src/tests/ai/ai-reasoning). Every check
// here uses `expect.soft`: a battery of many questions is run per test (one
// `test()` per attachment method, one inference call per question), and one
// wrong answer should not abort the rest of the battery and hide how the
// remaining questions did.
//
// A plain substring/token search is not enough for numbers and ID sets: a
// model that writes "E002 does not have the highest Net Pay. Its Net Pay is
// not 5665.80." would pass a naive `text.includes("5665.80")` check while
// saying the opposite of what is being asserted. Every check below that cares
// about a CLAIM (a number, or "this id belongs in the result") is therefore
// clause-scoped: it only counts a match found in a clause that is not itself
// negated. This is a heuristic, not a parser — a negation phrased outside
// NEGATION_RE (e.g. "... are in other departments" with no explicit negation
// word) can still slip past it. It catches the concrete failure mode above,
// it does not replace an LLM-judge for adversarial phrasing.

/** Every decimal number in the text, tolerant of "$", thousands commas and "USD". */
export function extractAmounts(text: string): number[] {
  // Normalise typographic minus signs (U+2212 −, U+2013 –) to ASCII hyphen so
  // the regex below matches negative numbers regardless of how the model typed them.
  const cleaned = text
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/[−–]/g, "-");
  return Array.from(cleaned.matchAll(/-?\d+(?:\.\d+)?/g), (match) =>
    Number(match[0]),
  );
}

function escapeRegExp(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits into clause-sized chunks: sentence and list-item boundaries. */
export function splitClauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

const NEGATION_RE =
  /\b(not|isn[‘’]?t|doesn[‘’]?t|didn[‘’]?t|wasn[‘’]?t|weren[‘’]?t|aren[‘’]?t|hasn[‘’]?t|haven[‘’]?t|won[‘’]?t|can[‘’]?t|cannot|never|no longer|without|excluded?|instead of|rather than|other than|none|neither|nor)\b|n[‘’]t\b/i;

/** Whether a clause negates or excludes rather than positively asserts. */
export function isNegatedClause(clause: string): boolean {
  return NEGATION_RE.test(clause);
}

/**
 * Returns the last double-newline-separated paragraph that contains at least
 * one match for `pattern`. Falls back to the full text when none match
 * (shouldn't happen for well-formed model output, but avoids silent breakage).
 */
function extractLastBlockWithIds(text: string, pattern: RegExp): string {
  // Use a fresh RegExp so we don't advance the caller's lastIndex.
  const probe = new RegExp(pattern.source, pattern.flags);
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  for (let i = blocks.length - 1; i >= 0; i--) {
    probe.lastIndex = 0;
    if (probe.test(blocks[i])) return blocks[i];
  }
  return text;
}

/**
 * Asserts one of the numbers in the text is `expected` (within `tolerance`)
 * AND that the number appears in a clause that is not itself negated — a
 * figure that shows up only inside "... is not 5665.80" does not count as the
 * model claiming that figure.
 */
export function expectContainsAmount(
  text: string,
  expected: number,
  label?: string,
  tolerance = 0.01,
): void {
  const clauses = splitClauses(text);
  let positiveHit = false;
  let sawAnywhere = false;

  for (const clause of clauses) {
    const hit = extractAmounts(clause).some(
      (amount) => Math.abs(amount - expected) <= tolerance,
    );
    if (!hit) continue;
    sawAnywhere = true;
    if (!isNegatedClause(clause)) {
      positiveHit = true;
      break;
    }
  }

  const what = label ?? `amount ${expected}`;
  const message = sawAnywhere
    ? `${what} only appears inside a negated clause (e.g. "not ${expected}") — not counted as claimed:\n${text}`
    : `${what} not found in:\n${text}`;
  expect.soft(positiveHit, message).toBe(true);
}

/** Asserts `token` appears as a whole word, case-insensitively, anywhere. */
export function expectContainsToken(
  text: string,
  token: string,
  label?: string,
): void {
  const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
  expect
    .soft(
      pattern.test(text),
      `${label ?? `token "${token}"`} not found in:\n${text}`,
    )
    .toBe(true);
}

/**
 * Asserts `token` is never positively claimed — i.e. it may appear only
 * inside a negated/excluding clause ("E004 is not in Engineering" is fine;
 * "Engineering: E002, E004, E007" is not).
 */
export function expectDoesNotContainToken(
  text: string,
  token: string,
  label?: string,
): void {
  const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
  const positiveHit = splitClauses(text).some(
    (clause) => pattern.test(clause) && !isNegatedClause(clause),
  );
  expect
    .soft(
      positiveHit,
      `${label ?? `token "${token}"`} positively asserted as included in:\n${text}`,
    )
    .toBe(false);
}

/** Asserts at least one of several equally-acceptable phrasings matched. */
export function expectMatchesAny(
  text: string,
  patterns: RegExp[],
  label: string,
): void {
  expect
    .soft(
      patterns.some((pattern) => pattern.test(text)),
      `${label} — none of [${patterns.map(String).join(", ")}] matched:\n${text}`,
    )
    .toBe(true);
}

/**
 * Asserts the answer's positively-claimed ids matching `idPattern` are
 * EXACTLY `expectedIds` — not a superset, not a subset. This is the set-exact
 * check a filter/selection question needs: "Return every record where X" is
 * wrong both when it drops a real match and when it pads the list with one
 * that does not belong (the concrete case: {X008, X014, X007} for a question
 * whose true answer is {X008, X014}).
 *
 * `idPattern` should be a non-global RegExp matching one id, e.g. /\bX\d{3}\b/i
 * — the "g" flag is added internally to walk every match per clause.
 *
 * `lastBlockOnly` (default false): when true, only the last double-newline-
 * separated paragraph of `text` is scanned for IDs. Use this when the model
 * shows a row-by-row analysis (listing every ID with its value) before giving
 * a concise final answer — the analysis enumerates all IDs in non-negated
 * clauses, which would otherwise make every ID look like a positive claim.
 * Errors still show the full text so failures are debuggable.
 */
export function expectExactIdSet(
  text: string,
  idPattern: RegExp,
  expectedIds: string[],
  label = "id set",
  { lastBlockOnly = false }: { lastBlockOnly?: boolean } = {},
): void {
  const globalPattern = new RegExp(
    idPattern.source,
    idPattern.flags.includes("g") ? idPattern.flags : `${idPattern.flags}g`,
  );

  const textToScan = lastBlockOnly
    ? extractLastBlockWithIds(text, globalPattern)
    : text;

  const positive = new Set<string>();
  for (const clause of splitClauses(textToScan)) {
    if (isNegatedClause(clause)) continue;
    for (const match of clause.matchAll(globalPattern)) {
      positive.add(match[0].toUpperCase());
    }
  }

  const expectedSet = new Set(expectedIds.map((id) => id.toUpperCase()));
  const missing = expectedIds.filter((id) => !positive.has(id.toUpperCase()));
  const extra = Array.from(positive).filter((id) => !expectedSet.has(id));

  expect
    .soft(missing, `${label} — missing [${missing.join(", ")}] in:\n${text}`)
    .toEqual([]);
  expect
    .soft(
      extra,
      `${label} — unexpectedly claimed [${extra.join(", ")}] in:\n${text}`,
    )
    .toEqual([]);
}

const ABSENCE_PATTERNS: RegExp[] = [
  /not (?:be )?found/i,
  /does(?:n't| not) exist/i,
  /no (?:such|matching) (?:employee|record|row|entry)/i,
  /no (?:record|data|information|entry|column)s? (?:for|on|about|named|called)/i,
  /(?:can(?:not|'t)|unable to) (?:find|locate|determine)/i,
  /is not (?:in|present|listed|included)/i,
  /isn'?t (?:in|present|listed|included)/i,
  /not (?:in|present|listed|included) in the (?:file|data|attached|csv)/i,
  /not available in the (?:file|data|attached|csv)/i,
  /does not (?:contain|include|have)/i,
  /no such column/i,
  /there is no/i,
];

/**
 * Asserts the answer acknowledges missing data instead of inventing it — the
 * hallucination/grounding half of the CSV-reasoning suite. Deliberately a set
 * of common phrasings rather than one fixed sentence: the model's wording is
 * not a contract, only that it says "not here" in some recognisable way.
 */
export function expectAbsenceAcknowledged(
  text: string,
  label = "absence acknowledgement",
): void {
  expect
    .soft(
      ABSENCE_PATTERNS.some((pattern) => pattern.test(text)),
      `${label} — expected the model to say the data is missing, got:\n${text}`,
    )
    .toBe(true);
}
