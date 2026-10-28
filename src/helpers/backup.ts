import { expect } from "@playwright/test";
import {
  BackupApi,
  BackupProgressDto,
  StartBackupRestoreRequestDto,
  BackupStorageType,
  BackupsCountResultDto,
  DistributedTaskStatus,
} from "@onlyoffice/docspace-api-sdk";

type BackupClient = Pick<
  BackupApi,
  "startBackup" | "getBackupProgress" | "getBackupHistory"
>;

/**
 * A job has stopped when it is completed and its status says how it ended. The
 * progress can show `isCompleted` for a moment while the status is still
 * Created or Running, so the flag alone is not taken as the end.
 */
export function hasStopped(job: BackupProgressDto | undefined): boolean {
  return (
    !!job?.isCompleted &&
    job.status !== DistributedTaskStatus.Created &&
    job.status !== DistributedTaskStatus.Running
  );
}

/**
 * Starts a DataStore backup and waits until exactly that job has finished.
 *
 * The job is bound by `taskId`: the `startbackup` response carries it, the
 * progress endpoint reports it while the job is in the queue, and the history
 * record of the finished archive uses it as its `id`. Either of the last two is
 * accepted as proof of completion, because the queue may drop a finished job
 * before the first poll sees it.
 */
export async function runBackup(api: BackupClient): Promise<string> {
  const { data, status } = await api.startBackup({
    startBackupRequestDto: { storageType: BackupStorageType.DataStore },
  });
  expect(status, `startbackup: ${JSON.stringify(data)}`).toBe(200);

  const taskId = data.response!.taskId!;
  expect(taskId).toBeTruthy();

  let failure: string | undefined;

  await expect(async () => {
    if (failure) return;

    const { data: progress } = await api.getBackupProgress();
    if (progress.response?.taskId === taskId) {
      if (progress.response.error) {
        failure = `backup ${taskId} failed: ${progress.response.error}`;
        return;
      }
      if (hasStopped(progress.response)) return;
    }

    const { data: history } = await api.getBackupHistory();
    expect(history.response?.map((record) => record.id)).toContain(taskId);
  }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });

  if (failure) throw new Error(failure);

  return taskId;
}

type BackupStateClient = Pick<
  BackupApi,
  "getBackupProgress" | "getBackupHistory" | "getBackupsCounts"
>;

export interface BackupSnapshot {
  /** The backup job in the queue, or undefined when there is none. */
  job: BackupProgressDto | undefined;
  historyIds: string[];
  counts: BackupsCountResultDto | undefined;
}

/**
 * Everything a rejected `startbackup`, `deletebackup` or `startrestore` could
 * have changed: the job queue, the history and the counters.
 */
export async function snapshotBackups(
  api: BackupStateClient,
): Promise<BackupSnapshot> {
  const { data: progress } = await api.getBackupProgress();
  const { data: history } = await api.getBackupHistory();
  const { data: counts } = await api.getBackupsCounts();

  return {
    job: progress.response,
    historyIds: (history.response ?? []).map((record) => record.id).sort(),
    counts: counts.response,
  };
}

/** Waits until the given job has stopped, however it ended, and returns its final state. */
export async function waitForBackupJobEnd(
  api: Pick<BackupApi, "getBackupProgress">,
  taskId: string,
): Promise<BackupProgressDto> {
  let final: BackupProgressDto | undefined;

  await expect(async () => {
    const { data } = await api.getBackupProgress();
    expect(data.response?.taskId).toBe(taskId);
    expect(hasStopped(data.response)).toBe(true);
    final = data.response;
  }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });

  return final!;
}

const GUID_LIKE =
  /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;

// The only fields `startrestore` reads, and the only storageParams key a safe
// request may carry.
const RESTORE_BODY_FIELDS = [
  "backupId",
  "storageType",
  "storageParams",
  "notify",
  "dump",
];
const RESTORE_PARAM_KEYS = ["folderId"];
// Letters and hyphens, and short: too short to hold the 32 digits of any form
// of a GUID, and with no digit, slash or dot to make a path of it.
const SAFE_BACKUP_ID = /^[A-Za-z-]{0,20}$/;

/**
 * `POST /backup/startrestore` replaces the data of the portal. A body whose
 * `backupId` is a GUID is looked up in the history and queued, and so is one
 * whose `storageParams` carry a `filePath`: even an all-zero GUID was seen to
 * be accepted with 200 and to queue a restore. Every request this suite sends
 * is therefore built so that it cannot reach the queue, and this guard throws
 * before anything is sent when a body is not provably of that kind.
 *
 * It is an allow-list, not a list of known bad shapes, so a form of the GUID
 * or of the path that nobody thought of is refused as well: the backupId has to
 * be a short string of letters and hyphens or a value the framework itself
 * refuses, the storageParams may only name a `folderId`, and no field outside
 * the DTO, no `dump: true` and no GUID anywhere is let through.
 */
export function assertRestoreRequestCannotQueue(dto: unknown): void {
  const refuse = (why: string): never => {
    throw new Error(
      `Refusing to send a restore request (${why}): ${JSON.stringify(dto)}`,
    );
  };
  const isEmpty = (value: object) => Object.keys(value).length === 0;

  if (dto === undefined || dto === null) return;
  if (typeof dto !== "object" || Array.isArray(dto)) {
    return refuse("the body is not an object");
  }

  const body = dto as Record<string, unknown>;

  for (const field of Object.keys(body)) {
    if (!RESTORE_BODY_FIELDS.includes(field)) {
      refuse(`the field ${field} is not part of the DTO`);
    }
  }

  if (GUID_LIKE.test(JSON.stringify(dto))) refuse("it holds a GUID");

  const { backupId, storageParams, dump } = body;

  if (typeof backupId === "string") {
    if (!SAFE_BACKUP_ID.test(backupId)) {
      refuse("the backupId could be a GUID or a path");
    }
  } else if (
    backupId !== undefined &&
    backupId !== null &&
    typeof backupId !== "number" &&
    typeof backupId !== "boolean" &&
    !(typeof backupId === "object" && isEmpty(backupId))
  ) {
    refuse("the backupId is not a plain value");
  }

  if (
    dump === true ||
    (typeof dump === "string" && /^\s*(true|1)\s*$/i.test(dump)) ||
    (typeof dump === "number" && dump !== 0)
  ) {
    refuse("it asks for a server-wide restore");
  }

  if (/path/i.test(JSON.stringify(storageParams) ?? "")) {
    refuse("the storageParams mention a path");
  }

  if (Array.isArray(storageParams)) {
    for (const item of storageParams) {
      if (item === null) continue;
      if (typeof item !== "object" || Array.isArray(item)) {
        refuse("a storageParams item is not an object");
      }
      const { key, ...rest } = item as Record<string, unknown>;
      if (Object.keys(rest).some((field) => field !== "value")) {
        refuse("a storageParams item has an unexpected field");
      }
      if (key !== undefined && !RESTORE_PARAM_KEYS.includes(String(key))) {
        refuse(`the storageParams key ${String(key)} is not allowed`);
      }
    }
  } else if (
    typeof storageParams === "object" &&
    storageParams !== null &&
    !isEmpty(storageParams)
  ) {
    refuse("the storageParams are not an array");
  }
}

export async function startRestoreThatCannotQueue(
  api: Pick<BackupApi, "startBackupRestore">,
  dto: unknown,
) {
  assertRestoreRequestCannotQueue(dto);

  return api.startBackupRestore({
    startBackupRestoreRequestDto: dto as
      | StartBackupRestoreRequestDto
      | undefined,
  });
}

/**
 * Proves no restore was started. An empty restore queue alone is not enough,
 * because the job is queued asynchronously, so this also requires the portal
 * to still be fully operational: while a portal is being restored every other
 * operation of the backup service answers 403.
 */
export async function expectRestoreNotStarted(
  api: Pick<BackupApi, "getRestoreProgress" | "getBackupHistory">,
): Promise<void> {
  const { data: progress, status: progressStatus } =
    await api.getRestoreProgress();
  expect(progressStatus).toBe(200);
  expect(progress.response).toBeUndefined();
  expect(progress.count).toBe(0);

  const { status: historyStatus } = await api.getBackupHistory();
  expect(historyStatus).toBe(200);
}

/** Waits until the history holds a record with this id, which is how a finished backup shows up. */
export async function waitForBackupRecord(
  api: Pick<BackupApi, "getBackupHistory">,
  taskId: string,
): Promise<void> {
  await expect(async () => {
    const { data } = await api.getBackupHistory();
    expect(data.response?.map((record) => record.id)).toContain(taskId);
  }).toPass({ intervals: [500, 1_000, 2_000, 5_000], timeout: 60_000 });
}

export interface JobObservation {
  /** The last state of the queue: no job, or a stopped one. */
  final: BackupProgressDto | undefined;
  /** Each distinct state seen on the way, oldest first. */
  states: string[];
}

const describeJob = (job: BackupProgressDto | undefined, taskId: string) =>
  job
    ? `${job.taskId === taskId ? "ours" : "other"} status=${job.status} done=${job.isCompleted}`
    : "none";

/**
 * Watches the job queue after a cancel until it has been quiet for a while.
 *
 * "No job" right after `cancelbackup` is not final: the backup worker picks the
 * job up from an event, so a job can show up in the queue after the cancel was
 * answered, and then be marked canceled or even run to the end. Time cannot
 * settle that, so the queue is polled until it has shown the same stopped state
 * (no job, or a completed one) for `stablePolls` polls in a row, and a running
 * job restarts the count.
 */
export async function observeJobUntilQuiescent(
  api: Pick<BackupApi, "getBackupProgress">,
  taskId: string,
  { stablePolls = 8, intervalMs = 250, timeoutMs = 60_000 } = {},
): Promise<JobObservation> {
  const states: string[] = [];
  const deadline = Date.now() + timeoutMs;
  let stable = 0;
  let previous = "";

  for (;;) {
    const { data } = await api.getBackupProgress();
    const job = data.response;
    const signature = describeJob(job, taskId);

    if (signature !== states[states.length - 1]) states.push(signature);

    const stopped = !job || job.isCompleted;
    stable = stopped && signature === previous ? stable + 1 : 0;
    previous = signature;

    if (stopped && stable >= stablePolls) return { final: job, states };
    if (Date.now() > deadline) {
      throw new Error(
        `The backup queue did not settle for ${taskId}: ${states.join(" -> ")}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Starts a backup and returns its id once the job has been seen Running and not
 * yet past its first step (progress 0), which is the only moment a cancel is
 * known to take.
 *
 * A cancel sent before the backup worker has picked the job up - while the job
 * is not in the queue yet, or is still Created - is answered true but the job
 * goes on to run to the end and is archived. Measured under load: a cancel of a
 * job seen Running was effective in all 107 attempts that were not overtaken by
 * the end of the backup, one of a job seen Created in 2 of 16. So the cancel
 * must wait for Running, and the job can also be gone past that point before it
 * is seen (a backup is about a second long); then that attempt proves nothing
 * about cancel and a new backup is started. Each attempt that ran to the end
 * is a real backup, so the portal needs a funded wallet.
 */
export async function startBackupAndCatchItRunning(
  api: Pick<
    BackupApi,
    "startBackup" | "getBackupProgress" | "getBackupHistory"
  >,
  { attempts = 6, pollMs = 30, timeoutMs = 20_000 } = {},
): Promise<string> {
  const outcomes: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, status } = await api.startBackup({
      startBackupRequestDto: { storageType: BackupStorageType.DataStore },
    });
    expect(status, JSON.stringify(data)).toBe(200);
    const taskId = data.response!.taskId!;

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { data: progress } = await api.getBackupProgress();
      const job = progress.response;

      if (job?.taskId === taskId) {
        if (
          job.status === DistributedTaskStatus.Running &&
          !job.isCompleted &&
          job.progress === 0
        ) {
          return taskId;
        }
        // Past the first step, or already over: this attempt cannot show a cancel.
        if (job.isCompleted || (job.progress ?? 0) > 0) {
          outcomes.push(
            `attempt ${attempt}: seen status=${job.status} progress=${job.progress}`,
          );
          break;
        }
      }
      if (Date.now() > deadline) {
        throw new Error(
          `The backup ${taskId} was never seen Running in ${timeoutMs} ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    // Let this attempt finish before the next one: a start while a job runs lands on it.
    await waitForBackupRecord(api, taskId);
    await expect(async () => {
      const { data: progress } = await api.getBackupProgress();
      expect(hasStopped(progress.response)).toBe(true);
    }).toPass({ intervals: [250, 500, 1_000], timeout: 30_000 });
  }

  throw new Error(
    `The backup was not caught Running in ${attempts} attempts: ${outcomes.join("; ")}`,
  );
}
