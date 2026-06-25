import { listSchedules } from "../../../lib/schedules";

export const dynamic = "force-dynamic";

// GET /api/schedules — all local schedules (the client list filters by bot). Local-only, no auth needed.
export async function GET() {
  return Response.json({ schedules: await listSchedules() });
}
