import { inflateRawSync } from "zlib";

export type ZipEntry = { name: string; bytes: Buffer };

/**
 * Reads the entries of a ZIP archive held in memory (stored and deflated
 * entries, no encryption, no ZIP64). Enough to check what a portal archive
 * contains without adding a dependency.
 */
export function readZip(zip: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error("not a ZIP archive: no end-of-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50)
      throw new Error("bad central entry");
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + compressed);
    let bytes: Buffer;
    if (method === 0) bytes = Buffer.from(raw);
    else if (method === 8) bytes = inflateRawSync(raw);
    else throw new Error(`unsupported compression method ${method}`);
    entries.push({ name, bytes });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries.filter((e) => !e.name.endsWith("/"));
}

export const isZip = (b: Buffer) =>
  b.length > 3 && b.readUInt32LE(0) === 0x04034b50;
