// File-backed schedules + per-schedule run history — the LOCAL source of truth for web-channel agent
// schedules. Mirrors lib/store.ts: node:fs APIs (so `next build` under node type-checks and deno runs it),
// and the filesystem is the only state shared across Next's separate server module graphs (route handlers,
// Server Actions, the background scheduler node). All mutations are serialized through a single in-module
// promise chain so concurrent read-modify-write calls don't lose updates.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { APP_DIR } from "./config";

const FILE = `${APP_DIR}/schedules.json`;
const HISTORY_DIR = `${APP_DIR}/schedule-history`;
const HISTORY_CAP = 200; // keep the newest N runs per schedule

export type Schedule = {
  id: string;
  botId: string;
  botName: string;
  name: string;
  prompt: string;
  cron: string; // standard 5-field cron, evaluated in machine local time
  enabled: boolean;
  createdAt: string; // ISO
  lastRunMinute?: string; // "YYYY-MM-DDTHH:mm" (local) — duplicate-fire guard within a minute
};

export type RunStatus = "sent" | "done" | "failed" | "runner-offline";
export type Run = {
  id: string;
  at: string; // ISO — when the schedule fired
  status: RunStatus;
  prompt: string;
  turnId?: string;
  reply?: string;
  note?: string; // error/status detail
};

// Serialize all mutations (single background node, low volume → one global lock is sufficient).
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    /* exists */
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function historyFile(scheduleId: string): string {
  return `${HISTORY_DIR}/${scheduleId}.json`;
}

// ---- schedules ----

export async function listSchedules(): Promise<Schedule[]> {
  return readJson<Schedule[]>(FILE, []);
}

export async function getSchedule(id: string): Promise<Schedule | null> {
  return (await listSchedules()).find((s) => s.id === id) ?? null;
}

export function newScheduleId(): string {
  return randomUUID();
}

// Insert or replace a schedule by id, then return the full list.
export async function upsertSchedule(s: Schedule): Promise<Schedule[]> {
  return withLock(async () => {
    await ensureDir(APP_DIR);
    const all = await listSchedules();
    const i = all.findIndex((x) => x.id === s.id);
    if (i >= 0) all[i] = s;
    else all.push(s);
    await writeFile(FILE, JSON.stringify(all, null, 2));
    return all;
  });
}

// Patch a subset of fields on an existing schedule (e.g. enabled, lastRunMinute, or edited fields).
export async function patchSchedule(id: string, patch: Partial<Schedule>): Promise<Schedule | null> {
  return withLock(async () => {
    await ensureDir(APP_DIR);
    const all = await listSchedules();
    const i = all.findIndex((x) => x.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch, id: all[i].id };
    await writeFile(FILE, JSON.stringify(all, null, 2));
    return all[i];
  });
}

export async function setLastRunMinute(id: string, minute: string): Promise<void> {
  await patchSchedule(id, { lastRunMinute: minute });
}

export async function deleteSchedule(id: string): Promise<void> {
  await withLock(async () => {
    const all = await listSchedules();
    await writeFile(FILE, JSON.stringify(all.filter((s) => s.id !== id), null, 2));
    await rm(historyFile(id), { force: true }).catch(() => {});
  });
}

// ---- run history (per schedule) ----

export async function listRuns(scheduleId: string): Promise<Run[]> {
  return readJson<Run[]>(historyFile(scheduleId), []);
}

export function newRunId(): string {
  return randomUUID();
}

export async function appendRun(scheduleId: string, run: Run): Promise<void> {
  await withLock(async () => {
    await ensureDir(HISTORY_DIR);
    const runs = await readJson<Run[]>(historyFile(scheduleId), []);
    runs.push(run);
    const trimmed = runs.slice(-HISTORY_CAP);
    await writeFile(historyFile(scheduleId), JSON.stringify(trimmed, null, 2));
  });
}

export async function updateRun(scheduleId: string, runId: string, patch: Partial<Run>): Promise<void> {
  await withLock(async () => {
    const runs = await readJson<Run[]>(historyFile(scheduleId), []);
    const i = runs.findIndex((r) => r.id === runId);
    if (i < 0) return;
    runs[i] = { ...runs[i], ...patch, id: runs[i].id };
    await writeFile(historyFile(scheduleId), JSON.stringify(runs, null, 2));
  });
}
