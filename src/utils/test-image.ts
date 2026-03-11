// Minimal valid 1x1 PNG image
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

export function createTestImageBuffer(): Buffer {
  return Buffer.from(PNG_BASE64, "base64");
}
