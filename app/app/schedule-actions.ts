"use server";
// Server Actions for schedule CRUD (called from the client form/list). Mirrors app/actions.ts. A "use
// server" module may only export async functions, so param shapes are inlined rather than exported as types.
import { isValidCron } from "../lib/cron";
import {
  deleteSchedule as removeSchedule,
  getSchedule,
  newScheduleId,
  patchSchedule,
  upsertSchedule,
  type Schedule,
} from "../lib/schedules";
import { runScheduleById } from "../lib/scheduler";

export async function createSchedule(input: {
  botId: string;
  botName: string;
  name: string;
  prompt: string;
  cron: string;
}): Promise<{ ok: boolean; id?: string; note?: string }> {
  const prompt = input.prompt.trim();
  const cron = input.cron.trim();
  if (!input.botId) return { ok: false, note: "missing bot" };
  if (!prompt) return { ok: false, note: "prompt required" };
  if (!isValidCron(cron)) return { ok: false, note: "invalid schedule" };
  const s: Schedule = {
    id: newScheduleId(),
    botId: input.botId,
    botName: input.botName,
    name: input.name.trim() || "Untitled schedule",
    prompt,
    cron,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await upsertSchedule(s);
  return { ok: true, id: s.id };
}

export async function updateSchedule(
  id: string,
  input: { name: string; prompt: string; cron: string },
): Promise<{ ok: boolean; note?: string }> {
  const existing = await getSchedule(id);
  if (!existing) return { ok: false, note: "not found" };
  const cron = input.cron.trim();
  if (!input.prompt.trim()) return { ok: false, note: "prompt required" };
  if (!isValidCron(cron)) return { ok: false, note: "invalid schedule" };
  await patchSchedule(id, { name: input.name.trim() || existing.name, prompt: input.prompt.trim(), cron });
  return { ok: true };
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  await patchSchedule(id, { enabled });
  return { ok: true };
}

export async function deleteSchedule(id: string): Promise<{ ok: boolean }> {
  await removeSchedule(id);
  return { ok: true };
}

// Manual "Run now" test fire — resolves after the reply poll (or the runner-offline / timeout path).
export async function runScheduleNow(id: string): Promise<{ ok: boolean; note?: string }> {
  return runScheduleById(id);
}
