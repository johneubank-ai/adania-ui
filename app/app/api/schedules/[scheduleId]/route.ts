import { getSchedule, listRuns } from "../../../../lib/schedules";

export const dynamic = "force-dynamic";

// GET /api/schedules/[scheduleId] — a schedule + its run history, for the standalone history page's
// live poller (so in-flight runs update sent → done without a manual refresh). Local-only.
export async function GET(_req: Request, ctx: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await ctx.params;
  const [schedule, runs] = await Promise.all([getSchedule(scheduleId), listRuns(scheduleId)]);
  if (!schedule) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  return Response.json({ schedule, runs });
}
