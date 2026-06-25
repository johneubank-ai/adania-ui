import HistoryView from "./history-view";

export const dynamic = "force-dynamic";

// Standalone per-schedule history page (/schedules/[id]). Thin server shell; the live table is a client
// component that polls /api/schedules/[id] so in-flight runs update (sent → done) without a refresh.
export default async function Page({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  return <HistoryView scheduleId={scheduleId} />;
}
