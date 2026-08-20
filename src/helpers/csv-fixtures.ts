import fs from "fs";
import path from "path";

// Fixtures for the AI-agent CSV reasoning suite (src/tests/ai/ai-reasoning).
// Read once at module load from src/assets — Playwright is invoked from the
// repo root, so process.cwd() resolves there.

const ASSETS_DIR = path.join(process.cwd(), "src", "assets");

export type CsvFixture = { fileName: string; buffer: Buffer };

function loadFixture(fileName: string): CsvFixture {
  return {
    fileName,
    buffer: fs.readFileSync(path.join(ASSETS_DIR, fileName)),
  };
}

export const STANDARD_PAYROLL_CSV = loadFixture("employees_standard.csv");
export const EDGE_CASE_PAYROLL_CSV = loadFixture("employees_edge_cases.csv");
export const MONTHLY_PAYROLL_CSV = loadFixture("employees_monthly_payroll.csv");
