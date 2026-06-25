"use client";
import { useMemo, useState } from "react";
import { buildCron, cronToForm, describeCron, isValidCron, nextRun, type CronForm } from "../lib/cron";
import type { Schedule } from "../lib/schedules";
import { createSchedule, updateSchedule } from "./schedule-actions";

type Freq = CronForm["freq"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #2b3a64",
  background: "#0b1020",
  color: "#e7ecff",
  fontSize: 14,
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#9fb0d8", display: "block", marginBottom: 4 };

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default function ScheduleForm({
  botId,
  botName,
  schedule,
  onDone,
  onCancel,
}: {
  botId: string;
  botName: string;
  schedule?: Schedule;
  onDone: () => void;
  onCancel: () => void;
}) {
  const initial = useMemo<CronForm>(() => (schedule ? cronToForm(schedule.cron) : { freq: "daily", hour: 9, minute: 0 }), [schedule]);

  const [name, setName] = useState(schedule?.name ?? "");
  const [prompt, setPrompt] = useState(schedule?.prompt ?? "");
  const [freq, setFreq] = useState<Freq>(initial.freq);
  const [every, setEvery] = useState(initial.freq === "minutes" ? initial.every : 15);
  const [hourlyMinute, setHourlyMinute] = useState(initial.freq === "hourly" ? initial.minute : 0);
  const [time, setTime] = useState(
    initial.freq === "daily" || initial.freq === "weekly" || initial.freq === "monthly"
      ? hhmm(initial.hour, initial.minute)
      : "09:00",
  );
  const [days, setDays] = useState<number[]>(initial.freq === "weekly" ? initial.days : [1, 2, 3, 4, 5]);
  const [dom, setDom] = useState(initial.freq === "monthly" ? initial.day : 1);
  const [custom, setCustom] = useState(initial.freq === "custom" ? initial.cron : schedule?.cron ?? "0 9 * * *");

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const form: CronForm = useMemo(() => {
    const [hh, mm] = time.split(":").map((x) => Number(x) || 0);
    switch (freq) {
      case "minutes":
        return { freq, every: Math.max(1, every) };
      case "hourly":
        return { freq, minute: hourlyMinute };
      case "daily":
        return { freq, hour: hh, minute: mm };
      case "weekly":
        return { freq, days, hour: hh, minute: mm };
      case "monthly":
        return { freq, day: dom, hour: hh, minute: mm };
      case "custom":
        return { freq, cron: custom };
    }
  }, [freq, every, hourlyMinute, time, days, dom, custom]);

  const cron = buildCron(form);
  const valid = isValidCron(cron);
  const preview = valid ? `${describeCron(cron)} · Next: ${nextRun(cron)?.toLocaleString() ?? "never"}` : "Invalid schedule";

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  const save = async () => {
    if (busy) return;
    if (!prompt.trim()) {
      setNote("Prompt is required.");
      return;
    }
    if (!valid) {
      setNote("That schedule isn't valid.");
      return;
    }
    setBusy(true);
    const r = schedule
      ? await updateSchedule(schedule.id, { name, prompt, cron })
      : await createSchedule({ botId, botName, name, prompt, cron });
    setBusy(false);
    if (r.ok) onDone();
    else setNote(r.note ?? "Failed to save.");
  };

  return (
    <div style={{ border: "1px solid #2b3a64", borderRadius: 10, padding: 14, marginTop: 10, background: "#0d1426" }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{schedule ? "Edit schedule" : "New schedule"}</div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Name</label>
        <input style={fieldStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning digest" />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Prompt (sent to {botName} as if you typed it)</label>
        <textarea
          style={{ ...fieldStyle, minHeight: 64, resize: "vertical", fontFamily: "inherit" }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Summarize my open tasks and flag anything overdue."
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={labelStyle}>Frequency</label>
          <select style={fieldStyle} value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
            <option value="minutes">Every N minutes</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom cron</option>
          </select>
        </div>

        {freq === "minutes" && (
          <div style={{ flex: "1 1 120px" }}>
            <label style={labelStyle}>Every (minutes)</label>
            <input type="number" min={1} max={1440} style={fieldStyle} value={every} onChange={(e) => setEvery(Number(e.target.value))} />
          </div>
        )}
        {freq === "hourly" && (
          <div style={{ flex: "1 1 120px" }}>
            <label style={labelStyle}>At minute</label>
            <input type="number" min={0} max={59} style={fieldStyle} value={hourlyMinute} onChange={(e) => setHourlyMinute(Number(e.target.value))} />
          </div>
        )}
        {(freq === "daily" || freq === "weekly" || freq === "monthly") && (
          <div style={{ flex: "1 1 120px" }}>
            <label style={labelStyle}>At time</label>
            <input type="time" style={fieldStyle} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}
        {freq === "monthly" && (
          <div style={{ flex: "1 1 120px" }}>
            <label style={labelStyle}>Day of month</label>
            <input type="number" min={1} max={31} style={fieldStyle} value={dom} onChange={(e) => setDom(Number(e.target.value))} />
          </div>
        )}
      </div>

      {freq === "weekly" && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>On days</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DOW.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  border: days.includes(i) ? "1px solid #4ade80" : "1px solid #2b3a64",
                  background: days.includes(i) ? "#16203c" : "transparent",
                  color: "#e7ecff",
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {freq === "custom" && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Cron expression (min hour day-of-month month day-of-week)</label>
          <input style={{ ...fieldStyle, fontFamily: "ui-monospace,monospace" }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0 9 * * 1-5" />
        </div>
      )}

      <div style={{ fontSize: 12, color: valid ? "#7dd3fc" : "#f87171", marginBottom: 10 }}>
        {preview} <span style={{ color: "#6b7794", fontFamily: "ui-monospace,monospace" }}>({cron})</span>
      </div>

      {note && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{note}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={save}
          disabled={busy}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2b3a64", background: "#16203c", color: "#e7ecff", cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "Saving…" : schedule ? "Save changes" : "Create schedule"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #2b3a64", background: "transparent", color: "#9fb0d8", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#6b7794" }}>
        Times are in this computer's timezone. Schedules run only while Adania Client is open.
      </div>
    </div>
  );
}
