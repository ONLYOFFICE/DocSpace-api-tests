import {
  expectAbsenceAcknowledged,
  expectContainsAmount,
  expectContainsToken,
  expectExactIdSet,
  expectMatchesAny,
} from "@/src/helpers/text-assertions";

const EMPLOYEE_ID_PATTERN = /\bE\d{3}\b/i;
const EDGE_CASE_ID_PATTERN = /\bX\d{3}\b/i;

export type CsvQuestion = {
  name: string;
  prompt: string;
  assert: (text: string) => void;
};

// One question bank per fixture file. Expected figures were independently
// recomputed from src/assets/*.csv (not copied from the spec that proposed
// them) before being written in here.

/** src/assets/employees_standard.csv — Tests 1-13, 25-27. */
export const STANDARD_QUESTIONS: CsvQuestion[] = [
  {
    name: "Test 1 - counts employee records, excluding the header",
    prompt:
      "How many employee records are in the attached CSV file? Do not count the header row.",
    assert: (text) => expectContainsToken(text, "12", "record count"),
  },
  {
    name: "Test 2 - reads E007's name, department, Gross_Pay and Net_Pay",
    prompt:
      "Find employee E007. Return their full name, department, Gross_Pay and Net_Pay.",
    assert: (text) => {
      expectContainsToken(text, "Mia");
      expectContainsToken(text, "Collins");
      expectContainsToken(text, "Engineering");
      expectContainsAmount(text, 6710.0, "E007 Gross_Pay");
      expectContainsAmount(text, 4903.65, "E007 Net_Pay");
    },
  },
  {
    name: "Test 3 - reads E008's Base_Pay, Overtime_Pay, Bonus and a negative Other_Adjustments",
    prompt:
      "What are the Base_Pay, Overtime_Pay, Bonus and Other_Adjustments for employee E008?",
    assert: (text) => {
      expectContainsAmount(text, 4300.0, "E008 Base_Pay");
      expectContainsAmount(text, 125.0, "E008 Overtime_Pay");
      expectContainsAmount(text, 180.0, "E008 Bonus");
      expectContainsAmount(text, -50.0, "E008 Other_Adjustments");
    },
  },
  {
    name: "Test 4 - recalculates Gross Pay for E005 from its components",
    prompt:
      "Calculate Gross Pay for employee E005 using Base_Pay + Overtime_Pay + Bonus + Other_Adjustments. Show the result.",
    assert: (text) =>
      expectContainsAmount(text, 5175.0, "E005 recalculated Gross Pay"),
  },
  {
    name: "Test 5 - recalculates Total Deductions for E001",
    prompt:
      "Calculate Total Deductions for employee E001 from all deduction columns.",
    assert: (text) =>
      expectContainsAmount(text, 1557.8, "E001 Total Deductions"),
  },
  {
    name: "Test 6 - recalculates Net Pay for E002 from Gross_Pay minus Total_Deductions",
    prompt:
      "Calculate Net Pay for employee E002 using Gross_Pay minus Total_Deductions.",
    assert: (text) =>
      expectContainsAmount(text, 5665.8, "E002 recalculated Net Pay"),
  },
  {
    name: "Test 7 - sums Gross_Pay across all employees",
    prompt: "Calculate the total Gross_Pay for all employees in the file.",
    assert: (text) => expectContainsAmount(text, 70000.0, "total Gross_Pay"),
  },
  {
    name: "Test 8 - sums Net_Pay across all employees",
    prompt: "Calculate the total Net_Pay for all employees.",
    assert: (text) => expectContainsAmount(text, 51189.09, "total Net_Pay"),
  },
  {
    name: "Test 9 - sums Total_Deductions across all employees",
    prompt: "Calculate the total Total_Deductions across all employees.",
    assert: (text) =>
      expectContainsAmount(text, 18810.91, "total Total_Deductions"),
  },
  {
    name: "Test 10 - finds the employee with the highest Net_Pay",
    prompt:
      "Which employee has the highest Net_Pay? Return Employee_ID, full name and Net_Pay.",
    assert: (text) => {
      expectContainsToken(text, "E002");
      expectContainsToken(text, "Liam");
      expectContainsAmount(text, 5665.8, "highest Net_Pay");
    },
  },
  {
    name: "Test 11 - finds the employee with the lowest Net_Pay",
    prompt: "Which employee has the lowest Net_Pay?",
    assert: (text) => {
      expectContainsToken(text, "E008");
      expectContainsToken(text, "Lucas");
      expectContainsAmount(text, 3376.05, "lowest Net_Pay");
    },
  },
  {
    name: "Test 12 - filters employees by department (Engineering)",
    prompt:
      "List all employees in the Engineering department with their Employee_ID and Gross_Pay.",
    assert: (text) =>
      expectExactIdSet(
        text,
        EMPLOYEE_ID_PATTERN,
        ["E002", "E007"],
        "Engineering department roster",
        { lastBlockOnly: true },
      ),
  },
  {
    name: "Test 13 - aggregates Gross_Pay for one department (Engineering)",
    prompt: "Calculate total Gross_Pay for the Engineering department.",
    assert: (text) =>
      expectContainsAmount(text, 14630.0, "Engineering total Gross_Pay"),
  },
  {
    name: "Test 25 - does not hallucinate a non-existent employee (E999)",
    prompt:
      "Find employee E999 and tell me their Net_Pay. Use only the attached file.",
    assert: (text) => expectAbsenceAcknowledged(text, "E999 absence"),
  },
  {
    name: "Test 26 - does not hallucinate a non-existent column (Home_Address)",
    prompt:
      "What is the Home_Address of employee E001? Use only information from the attached CSV.",
    assert: (text) => expectAbsenceAcknowledged(text, "Home_Address absence"),
  },
  {
    name: "Test 27 - combined report: count, totals, top earner and top department",
    prompt:
      "Analyze the attached employees_standard.csv and provide: number of employees; total Gross_Pay; total Net_Pay; employee with the highest Net_Pay; department with the highest combined Gross_Pay. Use only values from the file.",
    assert: (text) => {
      expectContainsToken(text, "12", "combined report employee count");
      expectContainsAmount(text, 70000.0, "combined report total Gross_Pay");
      expectContainsAmount(text, 51189.09, "combined report total Net_Pay");
      expectContainsToken(text, "E002");
      expectContainsAmount(text, 5665.8, "combined report highest Net_Pay");
      expectContainsToken(text, "Engineering");
      expectContainsAmount(
        text,
        14630.0,
        "combined report top department Gross_Pay",
      );
    },
  },
];

/** src/assets/employees_edge_cases.csv — Tests 14-18. */
export const EDGE_CASE_QUESTIONS: CsvQuestion[] = [
  {
    name: "Test 14 - finds all records with Expected_Net_Pay exactly zero",
    prompt:
      "Find all records where Expected_Net_Pay is exactly zero. Return Employee_ID only.",
    assert: (text) =>
      expectExactIdSet(
        text,
        EDGE_CASE_ID_PATTERN,
        ["X001", "X007"],
        "zero Expected_Net_Pay records",
        { lastBlockOnly: true },
      ),
  },
  {
    name: "Test 15 - finds negative Expected_Net_Pay records instead of dropping them as 'impossible'",
    prompt:
      "Find every record where Expected_Net_Pay is below zero. Return Employee_ID and Expected_Net_Pay.",
    assert: (text) => {
      expectExactIdSet(
        text,
        EDGE_CASE_ID_PATTERN,
        ["X008", "X014"],
        "negative Expected_Net_Pay records",
        { lastBlockOnly: true },
      );
      expectContainsAmount(text, -214.75, "X008 Expected_Net_Pay");
      expectContainsAmount(text, -75.0, "X014 Expected_Net_Pay");
    },
  },
  {
    name: "Test 16 - recalculates Expected_Gross_Pay for X004 with a negative Other_Adjustments",
    prompt:
      "Calculate Expected_Gross_Pay for X004 from Base_Pay, Overtime_Pay, Bonus and Other_Adjustments.",
    assert: (text) =>
      expectContainsAmount(text, 3824.45, "X004 Expected_Gross_Pay"),
  },
  {
    name: "Test 17 - reads a very large Expected_Net_Pay value without losing precision",
    prompt:
      'What is the Expected_Net_Pay for scenario "Very large payroll amount"?',
    assert: (text) =>
      expectContainsAmount(text, 7585000.76, "very large Expected_Net_Pay"),
  },
  {
    name: "Test 18 - reads a cent-level Expected_Net_Pay value",
    prompt: "What is the Expected_Net_Pay for X009?",
    assert: (text) => expectContainsAmount(text, 0.04, "X009 Expected_Net_Pay"),
  },
];

/** src/assets/employees_monthly_payroll.csv — Tests 19-24. */
export const MONTHLY_QUESTIONS: CsvQuestion[] = [
  {
    name: "Test 19 - aggregates Expected_Gross_Pay for March 2026",
    prompt: "Calculate total Expected_Gross_Pay for March 2026.",
    assert: (text) =>
      expectContainsAmount(
        text,
        32721.29,
        "March 2026 total Expected_Gross_Pay",
      ),
  },
  {
    name: "Test 20 - aggregates Expected_Net_Pay for February 2026",
    prompt: "Calculate total Expected_Net_Pay for February 2026.",
    assert: (text) =>
      expectContainsAmount(
        text,
        19415.08,
        "February 2026 total Expected_Net_Pay",
      ),
  },
  {
    name: "Test 21 - compares months and finds the highest total Expected_Net_Pay",
    prompt: "Which month has the highest total Expected_Net_Pay?",
    assert: (text) => {
      expectMatchesAny(text, [/2026-03/, /\bmarch\b/i], "highest-total month");
      expectContainsAmount(
        text,
        24692.72,
        "highest month's total Expected_Net_Pay",
      );
    },
  },
  {
    name: "Test 22 - finds the employee/month with the highest Overtime_Hours",
    prompt:
      "Which employee and month have the highest Overtime_Hours value? Return Employee_ID, Month, Overtime_Hours and Expected_Overtime_Pay.",
    assert: (text) => {
      expectContainsToken(text, "M005");
      expectMatchesAny(
        text,
        [/2026-03/, /\bmarch\b/i],
        "M005's highest-overtime month",
      );
      expectContainsAmount(text, 20.25, "M005 Overtime_Hours");
      expectContainsAmount(text, 1674.42, "M005 Expected_Overtime_Pay");
    },
  },
  {
    name: "Test 23 - aggregates Expected_Net_Pay for one employee (M001) across all months",
    prompt:
      "Calculate total Expected_Net_Pay for employee M001 across all months.",
    assert: (text) =>
      expectContainsAmount(text, 13264.62, "M001 total Expected_Net_Pay"),
  },
  {
    name: "Test 24 - finds the zero-hour month record (M004, February 2026)",
    prompt:
      "Find any monthly record where both Regular_Hours and Overtime_Hours are zero. Return Employee_ID, Month and Expected_Net_Pay.",
    assert: (text) => {
      expectContainsToken(text, "M004");
      expectMatchesAny(
        text,
        [/2026-02/, /\bfebruary\b/i],
        "M004's zero-hour month",
      );
    },
  },
];
