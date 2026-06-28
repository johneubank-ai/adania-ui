// The local cron engine. Runs INSIDE the Adania Client (started from the /api/state request graph, the
// only place background work reliably runs under deno desktop — see instrumentation.ts). It does NOT run
// when the app window is closed, and it does NOT backfill missed minutes (cron semantics, not a queue).
//
// On each tick it finds due schedules and fires them by POSTing the fixed prompt to the SAME webchat send
// path a manual message uses (POST /api/chat/[botId] with the member's token) — i.e. "as if the user sent
// it" — then polls GET /api/chat/turn/[turnId] for the agent's reply and records the run in local history.
import { ADANIA_API } from "./config";
import { ensureFreshIdToken } from "./secrets";
import { cronMatches, minuteKey } from "./cron";
import {
  appendRun,
  getSchedule,
  listSchedules,
  newRunId,
  setLastRunMinute,
  updateRun,
  type Schedule,
} from "./schedules";

const TICK_MS = 30_000; // 2 ticks/minute → every target minute is hit; the minute-guard dedupes
// How long we poll a turn for the runner's reply before recording it as timed out. Tracks the backend's
// RELAY_REPLY_TIMEOUT_MS (95 min = adania-runner's 90-min hard cap, ADANIA_MAX_RUNTIME_MS, + 5-min grace) so
// the runner always wins the race and we capture its real reply (a result, or its own ⚠️ runtime-limit
// message) instead of giving up first. The poll RETURNS THE MOMENT the reply lands, so a normal fast turn is
// unaffected — only a genuinely long turn (a cadenced multi-message job, or one waiting on background work)
// waits longer. Override via ADANIA_REPLY_TIMEOUT_MS.
const POLL_TIMEOUT_MS = Number(process.env.ADANIA_REPLY_TIMEOUT_MS ?? 95 * 60_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll the turn until the assignee runner answers (status=done) or we give up. Updates the run in place.
async function pollReply(scheduleId: string, runId: string, turnId: string, idToken: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let pollMs = 1_200; // snappy for the common fast turn; backs off (→5s) so a long wait doesn't hammer the backend
  while (Date.now() < deadline) {
    await sleep(pollMs);
    pollMs = Math.min(pollMs * 1.5, 5_000);
    try {
      const r = await fetch(`${ADANIA_API}/api/chat/turn/${turnId}`, {
        headers: { authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { status?: string; reply?: string };
      if (j.status === "done") {
        await updateRun(scheduleId, runId, { status: "done", reply: j.reply ?? "" });
        return;
      }
      if (j.status === "failed") {
        await updateRun(scheduleId, runId, { status: "failed", note: "turn failed" });
        return;
      }
    } catch {
      /* transient — retry until the deadline */
    }
  }
  await updateRun(scheduleId, runId, { status: "failed", note: "no reply (timed out)" });
}

// Fire one schedule now: send the prompt exactly like a manual webchat send, then capture the reply.
// Resolves only after the reply poll finishes, so callers can `await` (manual run) or `void` (scheduled).
export async function fire(s: Schedule): Promise<void> {
  const runId = newRunId();
  const at = new Date().toISOString();
  const idToken = await ensureFreshIdToken();
  if (!idToken) {
    await appendRun(s.id, { id: runId, at, status: "failed", prompt: s.prompt, note: "not signed in" });
    return;
  }
  try {
    const r = await fetch(`${ADANIA_API}/api/chat/${s.botId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: s.prompt }),
    });
    if (!r.ok) {
      await appendRun(s.id, { id: runId, at, status: "failed", prompt: s.prompt, note: `send ${r.status}` });
      return;
    }
    const j = (await r.json().catch(() => ({}))) as { turnId?: string; runnerOffline?: boolean };
    if (j.runnerOffline || !j.turnId) {
      await appendRun(s.id, {
        id: runId,
        at,
        status: "runner-offline",
        prompt: s.prompt,
        turnId: j.turnId,
        note: "your runner appears offline — start `npx adania-runner`",
      });
      return;
    }
    await appendRun(s.id, { id: runId, at, status: "sent", prompt: s.prompt, turnId: j.turnId });
    await pollReply(s.id, runId, j.turnId, idToken);
  } catch (e) {
    await appendRun(s.id, { id: runId, at, status: "failed", prompt: s.prompt, note: (e as Error).message });
  }
}

// Run a schedule on demand (the "Run now" test action) — same path as a scheduled fire.
export async function runScheduleById(id: string): Promise<{ ok: boolean; note?: string }> {
  const s = await getSchedule(id);
  if (!s) return { ok: false, note: "schedule not found" };
  await fire(s);
  return { ok: true };
}

async function tick(): Promise<void> {
  let schedules: Schedule[];
  try {
    schedules = await listSchedules();
  } catch {
    return;
  }
  const now = new Date();
  const mk = minuteKey(now);
  for (const s of schedules) {
    if (!s.enabled || s.lastRunMinute === mk || !cronMatches(s.cron, now)) continue;
    // Stamp the minute BEFORE firing so an overlapping tick in the same minute can't double-fire it.
    await setLastRunMinute(s.id, mk);
    void fire(s); // don't block the tick loop on the reply poll
  }
}

let started = false;
export function startScheduler(): void {
  if (started) return;
  started = true;
  setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick(); // run once promptly on startup
}
