import zlib from "node:zlib";

// A .docx is a zip, so the text of a generated document is not visible in the
// raw bytes: `word/document.xml` is deflate-compressed. Asserting on a download
// therefore needs the entry inflated, which is what this does — enough zip
// parsing to pull one member out of the central directory, no dependency added.

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error("not a zip archive: no end-of-central-directory");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      name: buffer
        .subarray(offset + 46, offset + 46 + nameLength)
        .toString("utf8"),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const local = entry.localHeaderOffset;
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  return entry.method === 0 ? raw : zlib.inflateRawSync(raw);
}

/** Names of the archive members, e.g. `word/document.xml`. */
export function listDocxEntries(buffer: Buffer): string[] {
  return readCentralDirectory(buffer).map((entry) => entry.name);
}

/**
 * Visible text of a .docx, with paragraphs separated by newlines. Throws if the
 * buffer is not a zip or has no `word/document.xml` — both are real failures for
 * a document a caller was told had been generated.
 */
export function extractDocxText(buffer: Buffer): string {
  const entries = readCentralDirectory(buffer);
  const document = entries.find((entry) => entry.name === "word/document.xml");
  if (!document) {
    throw new Error(
      `no word/document.xml in the archive: ${entries.map((e) => e.name).join(", ")}`,
    );
  }

  return readEntry(buffer, document)
    .toString("utf8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
