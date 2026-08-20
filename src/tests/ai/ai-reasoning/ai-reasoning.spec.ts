import { test } from "@/src/fixtures";
import {
  EDGE_CASE_PAYROLL_CSV,
  MONTHLY_PAYROLL_CSV,
  STANDARD_PAYROLL_CSV,
} from "@/src/helpers/csv-fixtures";
import { ATTACHMENT_METHODS } from "@/src/helpers/csv-attachment-strategies";
import {
  EDGE_CASE_QUESTIONS,
  MONTHLY_QUESTIONS,
  STANDARD_QUESTIONS,
} from "@/src/helpers/csv-reasoning-questions";

// Runs the same question batteries from questions.ts against each of the
// three CSV fixtures, once per way a user can get a file in front of an AI
// agent — Knowledge upload, attach from device, and select an existing
// DocSpace file — to check the three are equally capable of reading,
// calculating over, aggregating and not fabricating the attached payroll
// data.
//
// Grouped as `test.step`s inside one test per method rather than one test per
// question: each `test()` spins up its own fresh portal (see
// src/fixtures/index.ts), so one separate portal per question would multiply
// setup cost for no extra correctness signal. A failing step still fails the
// test and is reported individually, and every assertion in text-assertions.ts
// is a soft one, so one wrong answer does not abort the rest of the battery.

test.describe("AI Agent reasoning over employees_standard.csv", () => {
  for (const method of ATTACHMENT_METHODS) {
    test(`${method.name} - agent reads and reasons over employees_standard.csv`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await method.attach(
        apiSdk,
        paymentsApi,
        STANDARD_PAYROLL_CSV,
        `Autotest Standard Payroll (${method.name})`,
      );

      for (const question of STANDARD_QUESTIONS) {
        await test.step(question.name, async () => {
          const { text } = await ctx.ask(question.prompt);
          question.assert(text);
        });
      }
    });
  }
});

// Tests against employees_edge_cases.csv, once per attachment method. This
// fixture is the one built to catch a model "fixing" data it finds
// implausible — zero-net records, negative net pay from deductions exceeding
// gross pay, a negative adjustment, a very large amount, and a cent-level
// amount — so every assertion here is checking that nothing got silently
// corrected or dropped.
test.describe("AI Agent reasoning over employees_edge_cases.csv", () => {
  for (const method of ATTACHMENT_METHODS) {
    test(`${method.name} - agent reads and reasons over employees_edge_cases.csv`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await method.attach(
        apiSdk,
        paymentsApi,
        EDGE_CASE_PAYROLL_CSV,
        `Autotest Edge Case Payroll (${method.name})`,
      );

      for (const question of EDGE_CASE_QUESTIONS) {
        await test.step(question.name, async () => {
          const { text } = await ctx.ask(question.prompt);
          question.assert(text);
        });
      }
    });
  }
});

// Tests against employees_monthly_payroll.csv, once per attachment method.
// This fixture covers cross-row aggregation the other two files don't
// exercise: totals per calendar month, comparing months against each other,
// and aggregating one employee's rows across months.
test.describe("AI Agent reasoning over employees_monthly_payroll.csv", () => {
  for (const method of ATTACHMENT_METHODS) {
    test(`${method.name} - agent reads and reasons over employees_monthly_payroll.csv`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await method.attach(
        apiSdk,
        paymentsApi,
        MONTHLY_PAYROLL_CSV,
        `Autotest Monthly Payroll (${method.name})`,
      );

      for (const question of MONTHLY_QUESTIONS) {
        await test.step(question.name, async () => {
          const { text } = await ctx.ask(question.prompt);
          question.assert(text);
        });
      }
    });
  }
});
