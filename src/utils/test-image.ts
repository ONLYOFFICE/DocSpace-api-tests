import { deflateSync } from "node:zlib";

// Minimal valid 1x1 PNG image
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

export function createTestImageBuffer(): Buffer {
  return Buffer.from(PNG_BASE64, "base64");
}

/* ---------------------------------------------------------------------------
 * Pure-JS PNG encoder (no image library available in the project).
 * Lets us build valid PNGs of arbitrary size / colour type on the fly.
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type PngColorType = 0 | 2 | 6; // 0 = grayscale, 2 = RGB, 6 = RGBA

/**
 * Build a valid PNG of the given dimensions filled with a solid colour.
 * A solid fill compresses to a few bytes, so even large dimensions upload
 * fast while still forcing the server to allocate the full raster.
 */
export function createPng(
  width: number,
  height: number,
  options?: {
    colorType?: PngColorType;
    fill?: [number, number, number, number];
  },
): Buffer {
  const colorType = options?.colorType ?? 6;
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
  const [r, g, b, a] = options?.fill ?? [255, 0, 0, 255];

  const rowLen = width * channels;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowLen + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * channels;
      if (channels === 1) {
        raw[px] = r;
      } else if (channels === 3) {
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
      } else {
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = a;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Opaque (no alpha) RGB PNG. */
export function createOpaquePng(): Buffer {
  return createPng(2, 2, { colorType: 2, fill: [10, 200, 50, 255] });
}

/** Transparent RGBA PNG (alpha 0). */
export function createTransparentPng(): Buffer {
  return createPng(2, 2, { colorType: 6, fill: [0, 0, 0, 0] });
}

/** Grayscale PNG (colour type 0). */
export function createGrayscalePng(): Buffer {
  return createPng(4, 4, { colorType: 0, fill: [128, 0, 0, 0] });
}

/** Insert a tEXt metadata chunk (keyword\0text) before IEND. */
export function createPngWithText(keyword: string, text: string): Buffer {
  const base = createPng(1, 1);
  const iendLen = 12; // length(4)+type(4)+crc(4), IEND has empty data
  const body = base.subarray(0, base.length - iendLen);
  const iend = base.subarray(base.length - iendLen);
  const textData = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(text, "latin1"),
  ]);
  return Buffer.concat([body, chunk("tEXt", textData), iend]);
}

/**
 * Decompression bomb: tiny compressed IDAT that expands to a huge raster.
 * A solid-fill grayscale image of large dimensions has a raw size of
 * width*height bytes but compresses to only a few bytes.
 */
export function createDecompressionBombPng(side = 6000): Buffer {
  return createPng(side, side, { colorType: 0, fill: [0, 0, 0, 0] });
}

/** Truncated (corrupt) PNG: valid signature + partial IHDR. */
export function createCorruptPng(): Buffer {
  return createTestImageBuffer().subarray(0, 24);
}

/* ---------------------------------------------------------------------------
 * Other image formats (used for "declared PNG but actually X" tests).
 * ------------------------------------------------------------------------- */

// 1x1 transparent GIF (GIF89a)
export function createGifBuffer(): Buffer {
  return Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
}

// 1x1 JPEG
export function createJpegBuffer(): Buffer {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
      "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
      "AAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAA" +
      "AAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVf/Z",
    "base64",
  );
}

// Minimal RIFF/WEBP container (lossy VP8 header).
export function createWebpBuffer(): Buffer {
  return Buffer.from(
    "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
    "base64",
  );
}

// SVG declared as an image.
export function createSvgBuffer(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
    "utf-8",
  );
}

// Deterministic pseudo-random binary blob (not a valid image).
export function createRandomBinaryBuffer(size = 256): Buffer {
  const buf = Buffer.alloc(size);
  let seed = 0x12345678;
  for (let i = 0; i < size; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = seed & 0xff;
  }
  return buf;
}

// Valid PNG with extra bytes appended after IEND (polyglot).
export function createPolyglotPng(): Buffer {
  return Buffer.concat([
    createTestImageBuffer(),
    Buffer.from("<html><script>alert('xss')</script></html>", "utf-8"),
  ]);
}
