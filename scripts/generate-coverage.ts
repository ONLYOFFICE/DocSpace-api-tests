import fs from "node:fs";
import path from "node:path";

import { extractSdkEndpoints, type SdkEndpoint } from "../src/reporters/sdk-endpoints";

const TESTS_ROOT = path.join(process.cwd(), "src/tests");
const OUT_DIR = path.join(process.cwd(), "playwright-report/coverage");

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
const TITLE_RX = new RegExp(`\\b(${HTTP_METHODS.join("|")})\\s+(/\\S+)`);

const ROLE_TOKENS: Record<string, string> = {
  owner: "Owner",
  docspaceadmin: "DocSpaceAdmin",
  roomadmin: "RoomAdmin",
  user: "User",
  guest: "Guest",
};

type MethodStats = {
  key: string;
  testCount: number;
  roles: Set<string>;
};

type ClassStats = {
  className: string;
  methods: Map<string, MethodStats>;
};

type SectionStats = {
  section: string;
  classes: Map<string, ClassStats>;
};

type Summary = {
  generatedAt: string;
  totalMethods: number;
  coveredMethods: number;
  totalTests: number;
  percent: number;
  sections: SectionStats[];
  unparseableTitles: string[];
};

function collectSpecTitles(dir: string): string[] {
  const titles: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      titles.push(...collectSpecTitles(full));
    } else if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
      titles.push(...extractTitlesFromFile(full));
    }
  }
  return titles;
}

function extractTitlesFromFile(filePath: string): string[] {
  const src = fs.readFileSync(filePath, "utf8");
  const titles: string[] = [];

  // collect describe blocks in order (name + start position)
  const describeRx = /test\.describe(?:\.\w+)?\s*\(\s*["'`]([^"'`\n]+)["'`]/g;
  const describes: { name: string; idx: number }[] = [];
  for (const m of src.matchAll(describeRx)) {
    if (m.index !== undefined) describes.push({ name: m[1], idx: m.index });
  }

  // find all test() calls
  const testRx = /\btest(?:\.fail|\.skip|\.only)?\s*\(\s*["'`]([^"'`\n]+)["'`]/g;
  for (const m of src.matchAll(testRx)) {
    if (m.index === undefined) continue;
    const testTitle = m[1];

    // find the closest preceding describe
    let describe = "";
    for (const d of describes) {
      if (d.idx < m.index) describe = d.name;
      else break;
    }

    const fullTitle = describe ? `${describe} › ${testTitle}` : testTitle;
    titles.push(fullTitle);
  }

  return titles;
}

function buildPatterns(endpoints: SdkEndpoint[]) {
  return endpoints.map((e) => ({
    key: e.key,
    method: e.key.slice(0, e.key.indexOf(" ")),
    path: e.key.slice(e.key.indexOf(" ") + 1),
  }));
}

function parseDeclaredEndpoints(
  title: string,
  patterns: ReturnType<typeof buildPatterns>,
): string[] {
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
  patterns: ReturnType<typeof buildPatterns>,
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
    if (/^\{.+\}$/.test(h) && /^\{.+\}$/.test(n)) continue;
    return false;
  }
  return true;
}

function parseRoles(title: string): string[] {
  const lower = title.toLowerCase();
  return Object.entries(ROLE_TOKENS)
    .filter(([token]) => lower.includes(token))
    .map(([, label]) => label);
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return +((n / d) * 100).toFixed(1);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("Extracting SDK endpoints...");
const sdkEndpoints = extractSdkEndpoints();
console.log(`  ${sdkEndpoints.length} endpoints found`);

console.log("Collecting test titles from spec files...");
const allTitles = collectSpecTitles(TESTS_ROOT);
console.log(`  ${allTitles.length} test titles found`);

const patterns = buildPatterns(sdkEndpoints);
const endpointTestMap = new Map<string, { tests: string[]; roles: Set<string> }>();
const unparseable: string[] = [];

for (const title of allTitles) {
  const endpoints = parseDeclaredEndpoints(title, patterns);
  const roles = parseRoles(title);

  if (endpoints.length === 0) {
    unparseable.push(title);
  } else {
    for (const ep of endpoints) {
      let entry = endpointTestMap.get(ep);
      if (!entry) {
        entry = { tests: [], roles: new Set() };
        endpointTestMap.set(ep, entry);
      }
      entry.tests.push(title);
      for (const r of roles) entry.roles.add(r);
    }
  }
}

const sectionMap = new Map<string, SectionStats>();
for (const ep of sdkEndpoints) {
  let section = sectionMap.get(ep.section);
  if (!section) {
    section = { section: ep.section, classes: new Map() };
    sectionMap.set(ep.section, section);
  }
  let cls = section.classes.get(ep.className);
  if (!cls) {
    cls = { className: ep.className, methods: new Map() };
    section.classes.set(ep.className, cls);
  }
  const coverage = endpointTestMap.get(ep.key);
  cls.methods.set(ep.key, {
    key: ep.key,
    testCount: coverage?.tests.length ?? 0,
    roles: coverage?.roles ?? new Set(),
  });
}

const sections = [...sectionMap.values()].sort((a, b) =>
  a.section.localeCompare(b.section),
);
const totalMethods = sdkEndpoints.length;
const coveredMethods = endpointTestMap.size;
const totalTests = new Set(allTitles).size;

const summary: Summary = {
  generatedAt: new Date().toISOString(),
  totalMethods,
  coveredMethods,
  totalTests,
  percent: pct(coveredMethods, totalMethods),
  sections,
  unparseableTitles: unparseable.sort(),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), renderHtml(summary));

console.log(`\nCoverage: ${summary.percent}% (${coveredMethods}/${totalMethods} methods)`);
console.log(`Report: ${path.join(OUT_DIR, "index.html")}`);
if (unparseable.length > 0) {
  console.warn(`\nWarning: ${unparseable.length} titles have no METHOD /path token`);
}

// ── render ─────────────────────────────────────────────────────────────────────

function renderHtml(s: Summary): string {
  const sectionRows = s.sections
    .map((sec) => {
      const classes = [...sec.classes.values()];
      const secMethods = classes.reduce((n, c) => n + c.methods.size, 0);
      const secCovered = classes.reduce(
        (n, c) =>
          n + [...c.methods.values()].filter((m) => m.testCount > 0).length,
        0,
      );
      const secTests = classes.reduce(
        (n, c) =>
          n + [...c.methods.values()].reduce((t, m) => t + m.testCount, 0),
        0,
      );
      const secPct = pct(secCovered, secMethods);
      const barColor =
        secPct >= 75 ? "#2da44e" : secPct >= 40 ? "#d29922" : "#cf222e";

      const classRows = classes
        .sort((a, b) => a.className.localeCompare(b.className))
        .map((cls) => {
          const methods = [...cls.methods.values()];
          const clsCovered = methods.filter((m) => m.testCount > 0).length;
          const clsTests = methods.reduce((t, m) => t + m.testCount, 0);
          const clsPct = pct(clsCovered, methods.length);
          const clsBarColor =
            clsPct >= 75 ? "#2da44e" : clsPct >= 40 ? "#d29922" : "#cf222e";

          const methodRows = methods
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((m) => {
              const roleBadges = [...m.roles]
                .sort()
                .map((r) => `<span class="badge">${escHtml(r)}</span>`)
                .join(" ");
              const depthClass =
                m.testCount === 0
                  ? "depth-none"
                  : m.testCount <= 2
                    ? "depth-low"
                    : "depth-ok";
              return `<tr class="method-row ${depthClass}">
                <td class="method-key"><code>${escHtml(m.key)}</code></td>
                <td class="num">${m.testCount}</td>
                <td>${roleBadges || '<span class="muted">—</span>'}</td>
              </tr>`;
            })
            .join("");

          return `<tr class="class-row" data-cls="${escHtml(cls.className)}">
            <td class="cls-name">${escHtml(cls.className)}</td>
            <td class="num">${methods.length}</td>
            <td class="num">${clsTests}</td>
            <td class="num"><span style="color:${clsBarColor}">${clsCovered} / ${methods.length}</span></td>
            <td class="num"><span class="pct" style="color:${clsBarColor}">${clsPct}%</span></td>
          </tr>
          <tr class="detail-row hidden" data-for="${escHtml(cls.className)}">
            <td colspan="5">
              <table class="method-table">
                <thead><tr><th>Method / Path</th><th>Tests</th><th>Roles</th></tr></thead>
                <tbody>${methodRows}</tbody>
              </table>
            </td>
          </tr>`;
        })
        .join("");

      return `<tr class="section-row">
        <td colspan="5" class="section-header">
          <strong>${escHtml(sec.section)}</strong>
          <span class="section-summary">${secCovered}/${secMethods} methods · ${secTests} tests · <span style="color:${barColor}">${secPct}%</span></span>
        </td>
      </tr>
      ${classRows}`;
    })
    .join("");

  const unparsedList = s.unparseableTitles.length
    ? s.unparseableTitles.map((t) => `<li>${escHtml(t)}</li>`).join("")
    : "<li><em>none</em></li>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>API coverage — ${s.percent}%</title>
<style>
  * { box-sizing: border-box; }
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 16px; color: #1f2328; }
  h1 { margin: 0 0 4px; }
  h2 { margin-top: 32px; font-size: 16px; }
  .meta { color: #656d76; font-size: 12px; margin-bottom: 16px; }
  .total { font-size: 36px; font-weight: 700; margin: 12px 0 4px; }
  .total small { font-size: 14px; color: #656d76; font-weight: 400; }
  .stat-row { display: flex; gap: 32px; margin-bottom: 24px; }
  .stat { font-size: 13px; color: #656d76; }
  .stat strong { display: block; font-size: 22px; color: #1f2328; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #d0d7de; }
  th { background: #f6f8fa; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; }
  .pct { font-weight: 600; }
  .section-row td { background: #f6f8fa; padding: 10px; border-top: 2px solid #d0d7de; }
  .section-header { display: flex; align-items: center; gap: 16px; }
  .section-summary { font-size: 12px; color: #656d76; font-weight: 400; }
  .class-row { cursor: pointer; }
  .class-row:hover td { background: #f6f8fa; }
  .cls-name { padding-left: 24px; font-weight: 500; }
  .cls-name::before { content: "▶ "; font-size: 10px; color: #656d76; }
  .cls-name.open::before { content: "▼ "; }
  .detail-row td { padding: 0; background: #fafbfc; }
  .hidden { display: none; }
  .method-table { margin: 0; }
  .method-table th { background: #eef0f2; }
  .method-key { padding-left: 36px; }
  code { font: 12px/1.4 ui-monospace, Menlo, monospace; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 11px; background: #ddf4ff; color: #0969da; margin-right: 2px; }
  .muted { color: #aaa; }
  .depth-none td { color: #cf222e; }
  .depth-low td { color: #d29922; }
  details { margin-top: 24px; }
  summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
  ul { padding-left: 20px; }
</style>
</head>
<body>
  <h1>API coverage</h1>
  <div class="meta">Generated ${escHtml(s.generatedAt)}</div>
  <div class="total">${s.percent}% <small>of SDK methods have at least one test</small></div>
  <div class="stat-row">
    <div class="stat"><strong>${s.coveredMethods} / ${s.totalMethods}</strong>methods covered</div>
    <div class="stat"><strong>${s.totalTests}</strong>test titles parsed</div>
    <div class="stat"><strong>${s.unparseableTitles.length}</strong>titles without METHOD /path</div>
  </div>

  <h2>Coverage by section &amp; class</h2>
  <p style="font-size:12px;color:#656d76;margin:4px 0 12px">Click a row to expand per-method detail. Red = 0 tests, yellow = 1–2, green = 3+.</p>
  <table>
    <thead>
      <tr>
        <th>Class</th>
        <th class="num">Methods</th>
        <th class="num">Tests</th>
        <th class="num">Covered</th>
        <th class="num">%</th>
      </tr>
    </thead>
    <tbody>${sectionRows}</tbody>
  </table>

  <details>
    <summary>Titles without a METHOD /path token (${s.unparseableTitles.length})</summary>
    <p style="font-size:12px;color:#656d76">These tests are invisible to coverage until renamed to follow the <code>METHOD /path - description</code> convention.</p>
    <ul>${unparsedList}</ul>
  </details>

  <script>
    document.querySelectorAll('.class-row').forEach(row => {
      row.addEventListener('click', () => {
        const cls = row.dataset.cls;
        const detail = document.querySelector('.detail-row[data-for="' + cls + '"]');
        const nameCell = row.querySelector('.cls-name');
        if (detail) {
          detail.classList.toggle('hidden');
          nameCell.classList.toggle('open');
        }
      });
    });
  </script>
</body>
</html>
`;
}
