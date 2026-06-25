"use client";
import { useEffect, useState } from "react";
import { describeCron, nextRun } from "../../../lib/cron";
import type { Run, Schedule } from "../../../lib/schedules";

const statusColor: Record<string, string> = {
  done: "#4ade80",
  sent: "#7dd3fc",
  failed: "#f87171",
  "runner-offline": "#fbbf24",
};
const statusLabel: Record<string, string> = {
  done: "Done",
  sent: "Waiting for reply…",
  failed: "Failed",
  "runner-offline": "Runner offline",
};

export default function HistoryView({ scheduleId }: { scheduleId: string }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/schedules/${scheduleId}`, { cache: "no-store" });
        if (res.status === 404) {
          if (alive) setNotFound(true);
          return;
        }
        const j = (await res.json()) as { schedule?: Schedule; runs?: Run[] };
        if (!alive) return;
        setSchedule(j.schedule ?? null);
        setRuns(j.runs ?? []);
      } catch {}
    };
    load();
    const id = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [scheduleId]);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 28, color: "#e7ecff" }}>
      <a href="/" style={{ fontSize: 13, color: "#7dd3fc", textDecoration: "none" }}>
        ← Back
      </a>

      {notFound ? (
        <p style={{ color: "#f87171", marginTop: 20 }}>That schedule no longer exists.</p>
      ) : !schedule ? (
        <p style={{ color: "#9fb0d8", marginTop: 20 }}>Loading…</p>
      ) : (
        <>
          <h1 style={{ marginBottom: 4, marginTop: 16 }}>{schedule.name}</h1>
          <p style={{ color: "#9fb0d8", marginTop: 0 }}>
            {schedule.botName} · {describeCron(schedule.cron)}{" "}
            <span style={{ color: "#6b7794", fontFamily: "ui-monospace,monospace" }}>({schedule.cron})</span>
          </p>
          <p style={{ color: "#6b7794", fontSize: 13, marginTop: -4 }}>
            {schedule.enabled ? `Enabled · Next: ${nextRun(schedule.cron)?.toLocaleString() ?? "never"}` : "Paused"}
          </p>

          <div style={{ marginTop: 20, padding: 12, border: "1px solid #1d2742", borderRadius: 10, background: "#0d1426" }}>
            <div style={{ fontSize: 12, color: "#9fb0d8", marginBottom: 4 }}>Prompt</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{schedule.prompt}</div>
          </div>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Run history</h3>
          {runs.length === 0 ? (
            <p style={{ color: "#6b7794", fontSize: 13 }}>No runs yet. The first run happens at the next scheduled time (or use “Run now”).</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...runs].reverse().map((r) => (
                <div key={r.id} style={{ border: "1px solid #1d2742", borderRadius: 10, padding: 12, background: "#0b1020" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#9fb0d8" }}>{new Date(r.at).toLocaleString()}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: statusColor[r.status] ?? "#9fb0d8" }}>
                      {statusLabel[r.status] ?? r.status}
                      {r.note ? ` — ${r.note}` : ""}
                    </span>
                  </div>
                  {r.reply !== undefined && r.reply !== "" && (
                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 14, color: "#e7ecff" }}>{r.reply}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
