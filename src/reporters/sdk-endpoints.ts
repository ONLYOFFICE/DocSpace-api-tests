import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SDK_API_ROOT = "node_modules/@onlyoffice/docspace-api-sdk/dist/api";
const PATH_RX = /localVarPath\s*=\s*`([^`]+)`/g;
const METHOD_RX = /method:\s*'([A-Z]+)'/g;

export function extractSdkEndpoints(
  repoRoot: string = process.cwd(),
): string[] {
  const root = join(repoRoot, SDK_API_ROOT);
  const endpoints = new Set<string>();

  for (const file of walkJs(root)) {
    const src = readFileSync(file, "utf8");

    const paths: { idx: number; path: string }[] = [];
    for (const m of src.matchAll(PATH_RX)) {
      if (m.index !== undefined) paths.push({ idx: m.index, path: m[1] });
    }

    for (const m of src.matchAll(METHOD_RX)) {
      if (m.index === undefined) continue;
      let chosen: { idx: number; path: string } | null = null;
      for (const p of paths) {
        if (p.idx < m.index && (!chosen || p.idx > chosen.idx)) chosen = p;
      }
      if (chosen) endpoints.add(`${m[1]} ${chosen.path}`);
    }
  }

  return [...endpoints].sort();
}

function walkJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}
