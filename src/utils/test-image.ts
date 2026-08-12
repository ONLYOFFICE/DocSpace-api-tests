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

/* ---------------------------------------------------------------------------
 * Text drawn into the raster, for the OCR probe in the AI attachment tests.
 *
 * `createPngWithText` above writes a tEXt metadata chunk, which is invisible to
 * anything that looks at pixels — a model asked to read it would be answering
 * from the file name at best. A picture a model can actually read has to have
 * the glyphs in the image, so this is a 5x7 bitmap font blitted into an RGB
 * raster and scaled up.
 * ------------------------------------------------------------------------- */

/** 5x7 glyphs, one string per row, "1" = ink. Only what a marker needs. */
const FONT_5X7: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

/** Encode a full RGB raster (3 bytes per pixel, row-major) as a PNG. */
function encodeRgbPng(width: number, height: number, pixels: Buffer): Buffer {
  const rowLen = width * 3;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowLen + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A PNG with `text` really drawn into it: black glyphs on white, one font pixel
 * per `scale`x`scale` block.
 *
 * The default scale is what makes the result legible — at 1:1 a 5x7 glyph is a
 * smudge, and an OCR test on an unreadable picture would fail for a reason that
 * has nothing to do with the API. Throws on a character the font does not have,
 * so a caller never ships a marker that renders as blanks and then asserts the
 * model failed to read it.
 */
export function createPngWithRenderedText(
  text: string,
  options?: { scale?: number; margin?: number },
): Buffer {
  const scale = options?.scale ?? 16;
  const margin = options?.margin ?? 24;
  const glyphs = [...text.toUpperCase()].map((char) => {
    const glyph = FONT_5X7[char];
    if (!glyph) {
      throw new Error(`No 5x7 glyph for ${JSON.stringify(char)}`);
    }
    return glyph;
  });

  // One blank font column between glyphs, none after the last one.
  const columns = glyphs.length * (GLYPH_WIDTH + 1) - 1;
  const width = columns * scale + margin * 2;
  const height = GLYPH_HEIGHT * scale + margin * 2;

  const pixels = Buffer.alloc(width * height * 3, 0xff); // white
  glyphs.forEach((glyph, index) => {
    const originX = margin + index * (GLYPH_WIDTH + 1) * scale;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let column = 0; column < GLYPH_WIDTH; column++) {
        if (glyph[row][column] !== "1") {
          continue;
        }
        for (let y = 0; y < scale; y++) {
          const pixelY = margin + row * scale + y;
          const start = (pixelY * width + originX + column * scale) * 3;
          pixels.fill(0x00, start, start + scale * 3); // black
        }
      }
    }
  });

  return encodeRgbPng(width, height, pixels);
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
