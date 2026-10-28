import fs from "node:fs";
import path from "node:path";
import { test } from "@/src/fixtures/index";
import {
  BackupApi,
  BackupProgressDto,
  BackupStorageType,
  DistributedTaskStatus,
} from "@onlyoffice/docspace-api-sdk";

/**
 * Reproducer and measuring tool for two behaviours of the backup job queue:
 *
 *  1. `cancelbackup` answers true for a job that the backup worker has not
 *     registered yet, and the job then runs to the end.
 *  2. `getbackupprogress` can show `isCompleted: true` while the status is still
 *     Running.
 *
 * It is NOT part of the regression: it is skipped unless BACKUP_RACE_REPRO=1, and
 * it asserts nothing about the product - it records what happened, one JSON line
 * per iteration, to BACKUP_RACE_OUT (default test-output/backup-race.jsonl) and
 * to the console as `RACE_JSON {...}`.
 *
 *   BACKUP_RACE_REPRO=1 BACKUP_RACE_ITERATIONS=12 \
 *     npx playwright test src/tests/backup/backup.cancel-race.repro.spec.ts \
 *       --workers=8 --fully-parallel --repeat-each=3
 *
 * Every request is timed on one clock that starts with the iteration, so the
 * order of "start answered", "job visible in the queue", "cancel answered" and
 * "state changed" can be read off directly.
 */
const ENABLED = process.env.BACKUP_RACE_REPRO === "1";
const ITERATIONS = Number(process.env.BACKUP_RACE_ITERATIONS ?? 12);
const OUT = path.resolve(
  process.env.BACKUP_RACE_OUT ?? "test-output/backup-race.jsonl",
);

const dataStore = { storageType: BackupStorageType.DataStore };
const TERMINAL: number[] = [
  DistributedTaskStatus.Completed,
  DistributedTaskStatus.Canceled,
  DistributedTaskStatus.Failted,
];

interface Sample {
  /** ms since the start request was sent */
  t: number;
  state: string;
  progress?: number;
  link?: boolean;
}

function record(entry: Record<string, unknown>) {
  const line = JSON.stringify(entry);
  console.log(`RACE_JSON ${line}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.appendFileSync(OUT, `${line}\n`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(job: BackupProgressDto | undefined, taskId: string): string {
  if (!job) return "none";
  const who = job.taskId === taskId ? "ours" : "other";
  return `${who}:done=${job.isCompleted}:status=${job.status}`;
}

async function drainQueue(backup: BackupApi) {
  for (let i = 0; i < 6; i++) {
    const { data } = await backup.getBackupProgress();
    if (!data.response) return;
    await backup.cancelBackup();
  }
}

/**
 * Polls the queue every `pollMs`, keeping each change of state with its time,
 * until the job has been in a terminal state for `quietMs` (or `timeoutMs`).
 */
async function observe(
  backup: BackupApi,
  taskId: string,
  t0: number,
  { pollMs = 100, quietMs = 8_000, timeoutMs = 90_000 } = {},
) {
  const samples: Sample[] = [];
  let last = "";
  let terminalSince: number | undefined;
  const started = Date.now();

  for (;;) {
    const sent = Date.now();
    const { data } = await backup.getBackupProgress();
    const job = data.response;
    const state = describe(job, taskId);
    const signature = `${state}:${job?.progress}:${!!job?.link}`;

    if (signature !== last) {
      samples.push({
        t: sent - t0,
        state,
        progress: job?.progress,
        link: job ? !!job.link : undefined,
      });
      last = signature;
    }

    const terminal =
      !job || (job.isCompleted && TERMINAL.includes(job.status as number));
    if (terminal) {
      terminalSince ??= Date.now();
      if (Date.now() - terminalSince >= quietMs) {
        return { samples, final: job, timedOut: false };
      }
    } else {
      terminalSince = undefined;
    }
    if (Date.now() - started > timeoutMs) {
      return { samples, final: job, timedOut: true };
    }
    await sleep(pollMs);
  }
}

function classify(
  final: BackupProgressDto | undefined,
  taskId: string,
  archived: boolean,
  timedOut: boolean,
): string {
  if (timedOut) return "STUCK_RUNNING";
  if (final?.taskId === taskId) {
    if (final.status === DistributedTaskStatus.Canceled) {
      return archived ? "CANCELED_BUT_ARCHIVED" : "CANCELED";
    }
    if (final.status === DistributedTaskStatus.Completed) {
      return archived ? "COMPLETED_ARCHIVED" : "COMPLETED_NO_RECORD";
    }
    return `OTHER_STATUS_${final.status}`;
  }
  return archived ? "NONE_BUT_ARCHIVED" : "NONE";
}

test.describe("Backup cancel race - reproducer (BACKUP_RACE_REPRO=1)", () => {
  test.skip(!ENABLED, "Diagnostic tool: set BACKUP_RACE_REPRO=1 to run");

  for (const variant of [
    "immediate",
    "afterVisible",
    "afterRunning",
    "legacy",
  ] as const) {
    test(`cancel after start: ${variant}`, async ({ apiSdk, paymentsApi }) => {
      test.setTimeout(30 * 60_000);
      await paymentsApi.setupPayment();
      await paymentsApi.makeWalletTopUp(500);
      const { backup } = apiSdk.forRole("owner");

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        await drainQueue(backup);

        const t0 = Date.now();
        const at = () => Date.now() - t0;

        const startSent = at();
        const { data: started } = await backup.startBackup({
          startBackupRequestDto: dataStore,
        });
        const startAnswered = at();
        const taskId = started.response!.taskId!;
        const startStatus = started.response!.status;

        // What the queue shows before the cancel is sent, and when the job
        // first became visible: the registration moment, as seen from outside.
        let visibleAt: number | undefined;
        let runningAt: number | undefined;
        let visibleBeforeCancel = false;
        // The last state the queue showed before the cancel was sent: only a
        // job seen not yet completed was really still running when it was
        // canceled; one seen completed is a legitimate cancel after the end.
        let lastSeenBeforeCancel = "unseen";

        if (variant === "afterVisible" || variant === "afterRunning") {
          const wanted =
            variant === "afterVisible"
              ? (job?: BackupProgressDto) => job?.taskId === taskId
              : (job?: BackupProgressDto) =>
                  job?.taskId === taskId &&
                  job.status === DistributedTaskStatus.Running;
          const deadline = Date.now() + 30_000;
          for (;;) {
            const { data } = await backup.getBackupProgress();
            lastSeenBeforeCancel = `${describe(data.response, taskId)}:progress=${data.response?.progress}@${at()}`;
            if (data.response?.taskId === taskId) visibleAt ??= at();
            if (
              data.response?.taskId === taskId &&
              data.response.status === DistributedTaskStatus.Running
            ) {
              runningAt ??= at();
            }
            if (wanted(data.response)) {
              visibleBeforeCancel = true;
              break;
            }
            if (Date.now() > deadline) break;
            await sleep(30);
          }
        } else if (variant === "immediate") {
          visibleBeforeCancel = false;
        }

        const cancelSent = at();
        const { data: cancelled } = await backup.cancelBackup();
        const cancelAnswered = at();

        if (variant === "legacy") {
          // The body of the two existing cancel tests, unchanged.
          let legacyWaited = false;
          const deadline = Date.now() + 60_000;
          for (;;) {
            const { data } = await backup.getBackupProgress();
            if (data.count === 0 || data.response?.isCompleted === true) {
              legacyWaited = true;
              break;
            }
            if (Date.now() > deadline) break;
            await sleep(2_000);
          }
          const { data: strict } = await backup.getBackupProgress();
          const legacyPasses =
            strict.count === 0 ||
            (strict.response?.isCompleted === true &&
              strict.response?.status === DistributedTaskStatus.Canceled);
          record({
            variant,
            iteration,
            taskId,
            startStatus,
            startAnswered,
            cancelAnswer: cancelled.response,
            legacyWaited,
            legacyPasses,
            legacyFinal: describe(strict.response, taskId),
            legacyStrictStatus: strict.response?.status,
          });
          continue;
        }

        const { samples, final, timedOut } = await observe(backup, taskId, t0);
        const { data: history } = await backup.getBackupHistory();
        const archived = (history.response ?? []).some(
          (item) => item.id === taskId,
        );
        const outcome = classify(final, taskId, archived, timedOut);

        record({
          variant,
          iteration,
          taskId,
          outcome,
          cancelAnswer: cancelled.response,
          visibleBeforeCancel,
          lastSeenBeforeCancel,
          startStatus,
          times: {
            startSent,
            startAnswered,
            visibleAt,
            runningAt,
            cancelSent,
            cancelAnswered,
          },
          // the queue as seen after the cancel: first sample at or after it
          afterCancel: samples.filter((s) => s.t >= cancelSent),
          before: samples.filter((s) => s.t < cancelSent),
        });
      }
    });
  }

  /**
   * The contract as the SDK states it: cancelbackup "drops the backup job ...
   * which cancels it". A cancel that was answered true must not be followed by
   * an archive of that backup, however early it was sent.
   *
   * It fails for as long as the product race exists (a cancel sent before the
   * backup worker has the job running is answered true and the job still runs to
   * the end), so it is kept here, out of the regression, as the executable proof
   * to hand to the product team and to switch on again once it is fixed. It is
   * bounded: it stops at the first violation, and fails if none shows within
   * BACKUP_RACE_ITERATIONS attempts only because the race did not occur.
   */
  test("STRICT: a cancel answered true never leaves an archive of that backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(30 * 60_000);
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(500);
    const { backup } = apiSdk.forRole("owner");

    let violation: string | undefined;
    const run = `${process.pid}-${Date.now()}`;

    for (let attempt = 1; attempt <= ITERATIONS && !violation; attempt++) {
      await drainQueue(backup);

      const t0 = Date.now();
      const { data: started } = await backup.startBackup({
        startBackupRequestDto: dataStore,
      });
      const taskId = started.response!.taskId!;
      const { data: cancelled } = await backup.cancelBackup();
      const cancelAnswered = Date.now() - t0;

      const { samples, final, timedOut } = await observe(backup, taskId, t0);
      const { data: history } = await backup.getBackupHistory();
      const archived = (history.response ?? []).some(
        (item) => item.id === taskId,
      );
      const outcome = classify(final, taskId, archived, timedOut);

      record({
        variant: "strict",
        run,
        attempt,
        taskId,
        outcome,
        cancelAnswer: cancelled.response,
        cancelAnswered,
        samples,
      });

      if (cancelled.response === true && archived) {
        violation = `attempt ${attempt}: cancel answered true at ${cancelAnswered} ms, outcome ${outcome}, queue ${samples
          .map((sample) => `${sample.t}ms ${sample.state}`)
          .join(" -> ")}`;
      }
    }

    test
      .expect(violation, "no archive after a cancel that answered true")
      .toBe(undefined);
  });

  test("what happens to a job that is still Running after a cancel", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(30 * 60_000);
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(500);
    const { backup } = apiSdk.forRole("owner");

    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      await drainQueue(backup);

      const t0 = Date.now();
      const { data: started } = await backup.startBackup({
        startBackupRequestDto: dataStore,
      });
      const taskId = started.response!.taskId!;
      const { data: cancelled } = await backup.cancelBackup();
      const cancelAnswered = Date.now() - t0;

      // Only the cancels that did not take are interesting: follow those jobs
      // for as long as it takes, to see whether they finish, are canceled or hang.
      const { samples, final, timedOut } = await observe(backup, taskId, t0, {
        quietMs: 20_000,
        timeoutMs: 180_000,
      });
      const { data: history } = await backup.getBackupHistory();
      const archived = (history.response ?? []).some(
        (item) => item.id === taskId,
      );

      record({
        variant: "followUp",
        iteration,
        taskId,
        outcome: classify(final, taskId, archived, timedOut),
        cancelAnswer: cancelled.response,
        cancelAnswered,
        samples,
      });
    }
  });

  test("isCompleted true while the status is Running", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(30 * 60_000);
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(500);
    const { backup } = apiSdk.forRole("owner");

    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      await drainQueue(backup);

      const t0 = Date.now();
      const { data: started } = await backup.startBackup({
        startBackupRequestDto: dataStore,
      });
      const taskId = started.response!.taskId!;

      // Two reads in flight at the same moment, every 50 ms, to tell a state
      // that is changing from two answers that disagree with each other.
      const reads: {
        t: number;
        a: string;
        b: string;
        progressA?: number;
        progressB?: number;
        linkA: boolean;
        linkB: boolean;
      }[] = [];
      let completedFor = 0;
      const deadline = Date.now() + 90_000;

      while (Date.now() < deadline) {
        const sent = Date.now() - t0;
        const [a, b] = await Promise.all([
          backup.getBackupProgress(),
          backup.getBackupProgress(),
        ]);
        reads.push({
          t: sent,
          a: describe(a.data.response, taskId),
          b: describe(b.data.response, taskId),
          progressA: a.data.response?.progress,
          progressB: b.data.response?.progress,
          linkA: !!a.data.response?.link,
          linkB: !!b.data.response?.link,
        });
        const done =
          a.data.response?.isCompleted &&
          a.data.response.status === DistributedTaskStatus.Completed &&
          b.data.response?.isCompleted &&
          b.data.response.status === DistributedTaskStatus.Completed;
        completedFor = done ? completedFor + 1 : 0;
        if (completedFor >= 10) break;
        await sleep(50);
      }

      const sequence: string[] = [];
      for (const read of reads) {
        const entry = `${read.a}|${read.b}`;
        if (entry !== sequence[sequence.length - 1]) sequence.push(entry);
      }
      const anomalous = reads.filter(
        (read) =>
          /done=true:status=(0|1)\b/.test(read.a) ||
          /done=true:status=(0|1)\b/.test(read.b),
      );
      const disagree = reads.filter((read) => read.a !== read.b);
      const regressions = reads.filter((read, index) => {
        if (index === 0) return false;
        const before = reads[index - 1].a;
        return /done=true:status=2/.test(before) && !/done=true/.test(read.a);
      });

      record({
        variant: "anomaly",
        iteration,
        taskId,
        anomalousReads: anomalous.length,
        disagreeingPairs: disagree.length,
        regressionsAfterCompleted: regressions.length,
        // the exact reads around the anomaly, with times and link/progress
        window: anomalous.length
          ? reads.filter(
              (read) =>
                read.t >= anomalous[0].t - 300 &&
                read.t <= anomalous[anomalous.length - 1].t + 300,
            )
          : [],
        sequence,
        totalReads: reads.length,
      });
    }
  });
});
