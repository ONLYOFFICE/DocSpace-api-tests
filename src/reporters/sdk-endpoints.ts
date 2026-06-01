import { readdirSync, readFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const SDK_API_ROOT = "node_modules/@onlyoffice/docspace-api-sdk/dist/api";
const PATH_RX = /localVarPath\s*=\s*`([^`]+)`/g;
const METHOD_RX = /method:\s*'([A-Z]+)'/g;

export type SdkEndpoint = {
  key: string;
  section: string;
  className: string;
};

export function extractSdkEndpoints(
  repoRoot: string = process.cwd(),
): SdkEndpoint[] {
  const root = join(repoRoot, SDK_API_ROOT);
  const endpointMap = new Map<string, SdkEndpoint>();

  for (const file of walkJs(root)) {
    const section = basename(dirname(file));
    const className = fileToClassName(basename(file, ".js"));
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
      if (chosen) {
        const key = `${m[1]} ${chosen.path}`;
        if (!endpointMap.has(key)) {
          endpointMap.set(key, { key, section, className });
        }
      }
    }
  }

  return [...endpointMap.values()].sort(
    (a, b) =>
      a.section.localeCompare(b.section) ||
      a.className.localeCompare(b.className) ||
      a.key.localeCompare(b.key),
  );
}

function fileToClassName(filename: string): string {
  return filename
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
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
