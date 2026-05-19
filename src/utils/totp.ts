import crypto from "crypto";

function base32ToKey(base32Secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = base32Secret.replace(/=+$/, "").toUpperCase();
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTOTP(base32Secret: string): string {
  return generateTOTPAtCounter(
    base32Secret,
    Math.floor(Date.now() / 1000 / 30),
  );
}

export function generateTOTPAtCounter(
  base32Secret: string,
  counter: number,
): string {
  const key = base32ToKey(base32Secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}
