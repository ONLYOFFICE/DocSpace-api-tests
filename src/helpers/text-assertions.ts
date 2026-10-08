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

type BlockIds = { block: string; positive: Set<string>; all: Set<string> };

function analyseBlock(block: string, pattern: RegExp): BlockIds {
  const positive = new Set<string>();
  const all = new Set<string>();
  for (const clause of splitClauses(block)) {
    const negated = isNegatedClause(clause);
    for (const match of clause.matchAll(pattern)) {
      const id = match[0].toUpperCase();
      all.add(id);
      if (!negated) positive.add(id);
    }
  }
  return { block, positive, all };
}

const LIST_OR_TABLE_LINE_RE = /^\s*(?:[-*•]\s|\d+[.)]\s|\|)/;

/** A bullet/numbered list, a table or a fenced code block — the shapes a model uses for "the answer". */
function isStructuredBlock(block: string): boolean {
  if (block.startsWith("```")) return true;
  const lines = block.split("\n").filter((line) => line.trim() !== "");
  return lines.length > 0 && lines.every((l) => LIST_OR_TABLE_LINE_RE.test(l));
}

const EXCLUSIVITY_RE = /\b(?:only|sole|solely|just|single|exactly one)\b/i;

/**
 * Picks the block of `text` that holds the model's final answer for an
 * id-selection question, so a row-by-row analysis earlier in the reply does not
 * count as a claim.
 *
 * Default: the last double-newline-separated block with a NON-negated id. A
 * block whose ids are all negated ("X009 and X014 are close but not zero") is
 * trailing commentary, never the answer — the old "last block with any id"
 * rule picked it and reported the real answer as missing.
 *
 * Override: when that last block is prose that merely restates a SUBSET of the
 * structured block IMMEDIATELY before it (a table, list or code block — "Both records have
 * negative net pay … (including X014)" after the table of X008 and X014), the
 * structured block is the answer. The override is withheld when
 *  - the prose makes an exclusivity claim ("the only record is X007"), because
 *    then it is the model narrowing its own list, and
 *  - the structured block lists more than `maxStructuredIds` ids, because that
 *    is a scan of every row, not an answer.
 *
 * Known gap: a small structured list directly followed by exclusivity-free prose
 * naming a subset is read as "the list is the answer". Only the adjacent block
 * is considered: a candidate list further up (before other prose) once swallowed
 * a correct final answer as a false "extra" id.
 *
 * Falls back to the last block with any id, then to the whole text.
 */
function extractAnswerBlock(
  text: string,
  pattern: RegExp,
  maxStructuredIds = Infinity,
): string {
  const probe = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => analyseBlock(b, probe));

  let lastPositive = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].positive.size > 0) {
      lastPositive = i;
      break;
    }
  }
  if (lastPositive === -1) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].all.size > 0) return blocks[i].block;
    }
    return text;
  }

  const last = blocks[lastPositive];
  if (isStructuredBlock(last.block) || EXCLUSIVITY_RE.test(last.block)) {
    return last.block;
  }
  const candidate = blocks[lastPositive - 1];
  if (
    candidate &&
    candidate.positive.size > 0 &&
    candidate.all.size <= maxStructuredIds &&
    isStructuredBlock(candidate.block) &&
    [...last.positive].every((id) => candidate.positive.has(id))
  ) {
    return candidate.block;
  }
  return last.block;
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
 * Computes the diff between the ids positively claimed in a model answer and
 * `expectedIds`. Split from `expectExactIdSet` so the parsing is unit-testable
 * (src/tests/helpers/text-assertions.unit.spec.ts).
 */
export function diffExactIdSet(
  text: string,
  idPattern: RegExp,
  expectedIds: string[],
  { lastBlockOnly = false }: { lastBlockOnly?: boolean } = {},
): { missing: string[]; extra: string[] } {
  const globalPattern = new RegExp(
    idPattern.source,
    idPattern.flags.includes("g") ? idPattern.flags : `${idPattern.flags}g`,
  );

  const textToScan = lastBlockOnly
    ? extractAnswerBlock(text, globalPattern, expectedIds.length + 3)
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
  return { missing, extra };
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
 * `lastBlockOnly` (default false): when true, only the block that holds the
 * model's final answer is scanned — see `extractAnswerBlock`. Use this when the
 * model shows a row-by-row analysis (listing every ID with its value) before
 * giving a concise final answer; the analysis enumerates all IDs in non-negated
 * clauses, which would otherwise make every ID look like a positive claim.
 * Errors still show the full text so failures are debuggable.
 */
export function expectExactIdSet(
  text: string,
  idPattern: RegExp,
  expectedIds: string[],
  label = "id set",
  options: { lastBlockOnly?: boolean } = {},
): void {
  const { missing, extra } = diffExactIdSet(
    text,
    idPattern,
    expectedIds,
    options,
  );

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
  // Markdown emphasis splits phrases: "There is **no Home_Address column**".
  const plain = text.replace(/[*`]/g, "");
  expect
    .soft(
      ABSENCE_PATTERNS.some((pattern) => pattern.test(plain)),
      `${label} — expected the model to say the data is missing, got:\n${text}`,
    )
    .toBe(true);
}
