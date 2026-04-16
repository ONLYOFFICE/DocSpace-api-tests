import fs from "fs";
import path from "path";

export function readIconAsBase64(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const buffer = fs.readFileSync(absolutePath);
  return buffer.toString("base64");
}
