import { expect, test } from "@playwright/test";
import { waitForCascade } from "@/src/helpers/metadata";

// Contract of the polling helper itself, against a stubbed client (no portal).
type Op = {
  id?: string | null;
  isCompleted?: boolean;
  progress?: number;
  error?: string | null;
};

function stub(responses: Array<{ status?: number; op?: Op }>) {
  let calls = 0;
  const api = {
    metadata: {
      getCascadeProgress: async () => {
        const r = responses[Math.min(calls++, responses.length - 1)];
        return { status: r.status ?? 200, data: { response: r.op } };
      },
    },
  };
  return { api: api as never, calls: () => calls };
}

test.describe("waitForCascade helper", () => {
  test("returns once the pass is completed at 100% and polls until then", async () => {
    const s = stub([
      { op: { id: "a", isCompleted: false, progress: 10 } },
      { op: { id: "a", isCompleted: false, progress: 60 } },
      { op: { id: "a", isCompleted: true, progress: 100, error: "" } },
    ]);
    const op = await waitForCascade(s.api, 1, { operationId: "a" });
    expect(op.isCompleted).toBe(true);
    expect(s.calls()).toBe(3);
  });

  test("a failed pass throws with the reported error", async () => {
    const s = stub([
      { op: { id: "a", isCompleted: true, progress: 40, error: "boom" } },
    ]);
    await expect(waitForCascade(s.api, 1)).rejects.toThrow(/failed.*boom/);
  });

  test("a completed pass that did not reach 100% is not success", async () => {
    const s = stub([{ op: { id: "a", isCompleted: true, progress: 70 } }]);
    await expect(waitForCascade(s.api, 1)).rejects.toThrow(/100%/);
  });

  test("an unknown state (no isCompleted flag) is never taken for success and times out with diagnostics", async () => {
    const s = stub([{ op: { id: "a", progress: 100 } }]);
    await expect(waitForCascade(s.api, 1, { timeoutMs: 600 })).rejects.toThrow(
      /did not finish within 600 ms.*Last state:.*"progress":100/,
    );
  });

  test("a stale completed pass of another operation is ignored", async () => {
    const s = stub([
      { op: { id: "old", isCompleted: true, progress: 100 } },
      { op: { id: "new", isCompleted: true, progress: 100 } },
    ]);
    const op = await waitForCascade(s.api, 1, { operationId: "new" });
    expect(op.id).toBe("new");
    expect(s.calls()).toBe(2);
  });

  test("a non-200 answer fails immediately with the body", async () => {
    const s = stub([{ status: 404, op: undefined }]);
    await expect(waitForCascade(s.api, 1)).rejects.toThrow(/returned 404/);
    expect(s.calls()).toBe(1);
  });

  test("the wait is bounded by the timeout", async () => {
    const s = stub([{ op: { id: "a", isCompleted: false, progress: 1 } }]);
    const started = Date.now();
    await expect(
      waitForCascade(s.api, 1, { timeoutMs: 1_500 }),
    ).rejects.toThrow(/did not finish/);
    expect(Date.now() - started).toBeLessThan(6_000);
  });
});
