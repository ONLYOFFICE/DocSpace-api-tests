import fs from "node:fs";
import path from "node:path";

import type { Reporter, Suite, TestCase } from "@playwright/test/reporter";

import { extractSdkEndpoints } from "./sdk-endpoints";

type GroupStats = {
  total: number;
  declared: number;
  percent: number;
};

type Summary = {
  generatedAt: string;
  total: number;
  declared: number;
  percent: number;
  byGroup: Record<string, GroupStats>;
  endpointTests: Record<string, string[]>;
  missing: string[];
  unparseableTitles: string[];
  driftedTokens: Record<string, { tests: string[]; suggestions: string[] }>;
};

type Pattern = { key: string; method: string; path: string };

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];
const TITLE_RX = new RegExp(`\\b(${HTTP_METHODS.join("|")})\\s+(/\\S+)`);

const reportDir = `./playwright-report/${process.env.JOB_NAME ?? "local"}`;

export default class ApiCoverageReporter implements Reporter {
  private readonly declaredByTest = new Map<string, string[]>();
  private readonly unparseable: string[] = [];
  private sdkEndpoints: string[] = [];
  private patterns: Pattern[] = [];

  onBegin(_config: unknown, suite: Suite): void {
    this.sdkEndpoints = extractSdkEndpoints();
    this.patterns = buildPatterns(this.sdkEndpoints);

    for (const t of suite.allTests()) {
      const title = titleOf(t);
      const fullTitle = t
        .titlePath()
        .filter((s) => s.length > 0)
        .join(" › ");
      const endpoints = parseDeclaredEndpoints(fullTitle, this.patterns);
      if (endpoints.length === 0) {
        this.unparseable.push(title);
      } else {
        this.declaredByTest.set(title, endpoints);
      }
    }
  }

  async onEnd(): Promise<void> {
    const declaredBy: Record<string, Set<string>> = {};
    for (const [testTitle, endpoints] of this.declaredByTest) {
      for (const ep of endpoints) {
        (declaredBy[ep] ??= new Set()).add(testTitle);
      }
    }

    const all = this.sdkEndpoints;
    const declaredSet = new Set(Object.keys(declaredBy));

    const byGroup: Record<string, GroupStats> = {};
    for (const ep of all) {
      const g = (byGroup[groupOf(ep)] ??= {
        total: 0,
        declared: 0,
        percent: 0,
      });
      g.total += 1;
      if (declaredSet.has(ep)) g.declared += 1;
    }
    for (const g of Object.values(byGroup)) {
      g.percent = pct(g.declared, g.total);
    }

    const endpointTests: Record<string, string[]> = {};
    for (const ep of declaredSet) {
      endpointTests[ep] = [...(declaredBy[ep] ?? [])].sort();
    }

    const missing = all.filter((ep) => !declaredSet.has(ep)).sort();

    const driftedTokens = buildDriftedTokens(
      this.unparseable,
      this.sdkEndpoints,
    );

    const summary: Summary = {
      generatedAt: new Date().toISOString(),
      total: all.length,
      declared: declaredSet.size,
      percent: pct(declaredSet.size, all.length),
      byGroup,
      endpointTests: Object.fromEntries(
        Object.entries(endpointTests).sort((a, b) => a[0].localeCompare(b[0])),
      ),
      missing,
      unparseableTitles: this.unparseable.sort(),
      driftedTokens,
    };

    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, "api-coverage.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(reportDir, "api-coverage.html"),
      renderHtml(summary),
    );
    if (summary.unparseableTitles.length > 0) {
      console.warn(
        `[api-coverage] ${summary.unparseableTitles.length} test title(s) have no parseable METHOD /path — see api-coverage.html`,
      );
    }
  }
}

function titleOf(t: TestCase): string {
  return t.titlePath().slice(1).join(" › ") || t.title;
}

function buildPatterns(endpoints: string[]): Pattern[] {
  return endpoints.map((entry) => {
    const spaceIdx = entry.indexOf(" ");
    return {
      key: entry,
      method: entry.slice(0, spaceIdx),
      path: entry.slice(spaceIdx + 1),
    };
  });
}

function parseDeclaredEndpoints(title: string, patterns: Pattern[]): string[] {
  const m = title.match(TITLE_RX);
  if (!m) return [];
  const method = m[1];
  const rawPath = m[2].split("?")[0].replace(/[.,;:)\]]+$/, "");
  const normalised = rawPath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
  return matchTitlePath(method, normalised, patterns);
}

function matchTitlePath(
  method: string,
  titlePath: string,
  patterns: Pattern[],
): string[] {
  const sameMethod = patterns.filter((p) => p.method === method);

  const exact = sameMethod.find((p) => p.path === titlePath);
  if (exact) return [exact.key];

  if (!titlePath.startsWith("/api/2.0/")) {
    const candidate = `/api/2.0${titlePath}`;
    const prefixed = sameMethod.find((p) => p.path === candidate);
    if (prefixed) return [prefixed.key];
  }

  const titleSegs = segs(titlePath);
  const suffixMatches = sameMethod.filter((p) =>
    segsEndWith(segs(p.path), titleSegs),
  );
  if (suffixMatches.length === 1) return [suffixMatches[0].key];
  if (suffixMatches.length > 1) {
    suffixMatches.sort((a, b) => segs(a.path).length - segs(b.path).length);
    return [suffixMatches[0].key];
  }
  return [];
}

function segs(p: string): string[] {
  return p.split("/").filter((s) => s.length > 0);
}

function segsEndWith(haystack: string[], needle: string[]): boolean {
  if (needle.length > haystack.length) return false;
  for (let i = 0; i < needle.length; i++) {
    const h = haystack[haystack.length - needle.length + i];
    const n = needle[i];
    if (h === n) continue;
    if (isPlaceholder(h) && isPlaceholder(n)) continue;
    return false;
  }
  return true;
}

function isPlaceholder(s: string): boolean {
  return /^\{.+\}$/.test(s);
}

function buildDriftedTokens(
  unparseableTitles: string[],
  sdkEndpoints: string[],
): Record<string, { tests: string[]; suggestions: string[] }> {
  const byToken: Record<string, string[]> = {};
  for (const title of unparseableTitles) {
    const m = title.match(TITLE_RX);
    if (!m) continue;
    const path = m[2].split("?")[0].replace(/[.,;:)\]]+$/, "");
    const normalised = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
    const token = `${m[1]} ${normalised}`;
    (byToken[token] ??= []).push(title);
  }

  const result: Record<string, { tests: string[]; suggestions: string[] }> = {};
  for (const [token, tests] of Object.entries(byToken)) {
    result[token] = {
      tests: tests.sort(),
      suggestions: suggestEndpoints(token, sdkEndpoints),
    };
  }
  return result;
}

function suggestEndpoints(token: string, sdkEndpoints: string[]): string[] {
  const [method, path] = splitEntry(token);
  const tokenSegs = segs(path);
  const lastSeg = tokenSegs[tokenSegs.length - 1] ?? "";

  const scored: { ep: string; score: number }[] = [];
  for (const ep of sdkEndpoints) {
    const [m, p] = splitEntry(ep);
    if (m !== method) continue;
    const epSegs = segs(p);
    const score = similarity(tokenSegs, epSegs, lastSeg);
    if (score > 0) scored.push({ ep, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.ep);
}

function splitEntry(entry: string): [string, string] {
  const i = entry.indexOf(" ");
  return [entry.slice(0, i), entry.slice(i + 1)];
}

function similarity(a: string[], b: string[], lastSeg: string): number {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let shared = 0;
  for (const s of setA) if (setB.has(s)) shared += 1;
  if (shared === 0 && lastSeg) {
    for (const s of setB) if (s.includes(lastSeg.toLowerCase())) shared += 0.5;
  }
  return shared;
}

function groupOf(endpoint: string): string {
  const m = endpoint.match(/\/api\/2\.0\/([^/]+)/);
  return m?.[1] ?? "other";
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return +((n / d) * 100).toFixed(1);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(s: Summary): string {
  const groupRows = Object.entries(s.byGroup)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([name, g]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${g.declared}</td><td>${g.total}</td><td>${g.percent}%</td></tr>`,
    )
    .join("");

  const coveredEntries = Object.entries(s.endpointTests);
  const coveredList = coveredEntries.length
    ? coveredEntries
        .map(
          ([ep, tests]) =>
            `<li><code>${escapeHtml(ep)}</code> <small>(${tests.length} test${tests.length === 1 ? "" : "s"})</small><ul>${tests.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></li>`,
        )
        .join("")
    : "<li><em>none</em></li>";

  const missingList = s.missing.length
    ? s.missing.map((m) => `<li><code>${escapeHtml(m)}</code></li>`).join("")
    : "<li><em>none — full coverage</em></li>";

  const driftedEntries = Object.entries(s.driftedTokens).sort(
    (a, b) => b[1].tests.length - a[1].tests.length,
  );
  const driftedList = driftedEntries.length
    ? driftedEntries
        .map(
          ([token, info]) =>
            `<li>
              <code>${escapeHtml(token)}</code>
              <small>(${info.tests.length} test${info.tests.length === 1 ? "" : "s"})</small>
              ${
                info.suggestions.length
                  ? `<div><em>maybe meant:</em><ul>${info.suggestions.map((s) => `<li><code>${escapeHtml(s)}</code></li>`).join("")}</ul></div>`
                  : `<div><em>no similar SDK endpoint found</em></div>`
              }
              <details><summary>${info.tests.length} affected test${info.tests.length === 1 ? "" : "s"}</summary><ul>${info.tests.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></details>
            </li>`,
        )
        .join("")
    : "<li><em>none</em></li>";

  const titlesWithoutToken = s.unparseableTitles.filter(
    (t) => !t.match(TITLE_RX),
  );
  const noTokenList = titlesWithoutToken.length
    ? titlesWithoutToken.map((t) => `<li>${escapeHtml(t)}</li>`).join("")
    : "<li><em>none — every title contains a METHOD /path token</em></li>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>API coverage — ${s.percent}%</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 1000px; margin: 24px auto; padding: 0 16px; color: #1f2328; }
  h1 { margin: 0 0 4px; }
  h2 { margin-top: 32px; }
  .meta { color: #656d76; font-size: 12px; margin-bottom: 24px; }
  .total { font-size: 32px; font-weight: 600; margin: 16px 0 24px; }
  .total small { font-size: 14px; color: #656d76; font-weight: 400; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid #d0d7de; }
  th { background: #f6f8fa; font-weight: 600; }
  td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
  details { margin: 8px 0; }
  summary { cursor: pointer; font-weight: 600; padding: 6px 0; }
  ul { padding-left: 20px; }
  code { font: 12px/1.4 ui-monospace, Menlo, monospace; }
  .note { font-size: 12px; color: #656d76; margin: 8px 0 16px; }
</style>
</head>
<body>
  <h1>API coverage</h1>
  <div class="meta">Generated ${escapeHtml(s.generatedAt)}</div>
  <div class="total">${s.percent}% <small>(${s.declared} / ${s.total} endpoints)</small></div>
  <p class="note">An endpoint counts as <strong>tested</strong> if at least one test title contains its <code>METHOD /path</code> token. Matching falls back to suffix when the title omits the <code>/api/2.0</code> prefix.</p>

  <h2>By API group</h2>
  <table>
    <thead><tr><th>API group</th><th>Tested</th><th>In SDK</th><th>%</th></tr></thead>
    <tbody>${groupRows}</tbody>
  </table>

  <details>
    <summary>Tested endpoints (${s.declared}) — which tests reference each one</summary>
    <ul>${coveredList}</ul>
  </details>

  <details${s.missing.length ? " open" : ""}>
    <summary>Without a test (${s.missing.length}) — no test title references this endpoint</summary>
    <ul>${missingList}</ul>
  </details>

  <details${driftedEntries.length ? " open" : ""}>
    <summary>Drifted titles (${driftedEntries.length} token${driftedEntries.length === 1 ? "" : "s"}, ${s.unparseableTitles.length - titlesWithoutToken.length} test${s.unparseableTitles.length - titlesWithoutToken.length === 1 ? "" : "s"}) — title references a path that doesn't exist in current SDK</summary>
    <p>Each entry shows the offending <code>METHOD /path</code> token from the test title and the closest matches in the SDK. Rename the test (or the SDK) to reconcile.</p>
    <ul>${driftedList}</ul>
  </details>

  <details>
    <summary>Titles without a METHOD /path token (${titlesWithoutToken.length})</summary>
    <p>Tests whose title doesn't follow the <code>"METHOD /path - description"</code> convention. They are invisible to this metric until renamed.</p>
    <ul>${noTokenList}</ul>
  </details>
</body>
</html>
`;
}
