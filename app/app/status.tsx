"use client";
import { useCallback, useEffect, useState } from "react";
import { sendChat } from "./actions";
import { deleteSchedule, runScheduleNow, toggleSchedule } from "./schedule-actions";
import ScheduleForm from "./schedule-form";
import { describeCron, nextRun } from "../lib/cron";
import type { Schedule } from "../lib/schedules";

type Org = { organizationId: string; organizationName: string; role: string };
type Bot = { id: string; name: string; organizationId: string; organizationName: string; channels: string[] };
type State = { login?: string; email?: string; status?: string; orgsJson?: string; botsJson?: string };

function parse<T>(s: string | undefined): T[] {
  try {
    return JSON.parse(s ?? "[]");
  } catch {
    return [];
  }
}

export default function Status() {
  const [s, setS] = useState<State>({});
  const [org, setOrg] = useState<string | null>(null);
  useEffect(() => {
    const tick = async () => {
      try {
        setS(await (await fetch("/api/state", { cache: "no-store" })).json());
      } catch {}
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);

  const orgs = parse<Org>(s.orgsJson);
  const bots = parse<Bot>(s.botsJson);
  const selected = org ?? orgs[0]?.organizationId ?? null;
  const chatBots = bots.filter((b) => b.organizationId === selected && (b.channels ?? []).includes("webchat"));

  return (
    <div>
      {orgs.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {orgs.map((o) => (
              <button
                key={o.organizationId}
                onClick={() => setOrg(o.organizationId)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  border: o.organizationId === selected ? "1px solid #4ade80" : "1px solid #2b3a64",
                  background: o.organizationId === selected ? "#16203c" : "transparent",
                  color: "#e7ecff",
                }}
              >
                {o.organizationName} <span style={{ color: "#7f8db0" }}>· {o.role}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <section style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 8 }}>Web chat</h3>
          {chatBots.length === 0 ? (
            <p style={{ color: "#9fb0d8", fontSize: 13 }}>No web-chat agents assigned to you in this org.</p>
          ) : (
            chatBots.map((b) => <ChatBox key={b.id} botId={b.id} name={b.name} />)
          )}
        </section>
      )}
    </div>
  );
}

function ChatBox({ botId, name }: { botId: string; name: string }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await sendChat(botId, text);
    setNote(r.ok ? (r.note ?? "sent") : `error: ${r.note ?? "failed"}`);
    if (r.ok) setText("");
    setBusy(false);
  };
  return (
    <div style={{ border: "1px solid #1d2742", borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{name}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message this agent…"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #2b3a64", background: "#0b1020", color: "#e7ecff", fontSize: 14 }}
        />
        <button
          onClick={send}
          disabled={busy}
          style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #2b3a64", background: "#16203c", color: "#e7ecff", cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
      {note && <div style={{ marginTop: 8, fontSize: 12, color: note.startsWith("error") ? "#f87171" : "#4ade80" }}>{note}</div>}
      <div style={{ marginTop: 6, fontSize: 11, color: "#6b7794" }}>Sent to your running agent (replies aren’t shown here yet).</div>
      <Schedules botId={botId} botName={name} />
    </div>
  );
}

const statusColor: Record<string, string> = {
  done: "#4ade80",
  sent: "#7dd3fc",
  failed: "#f87171",
  "runner-offline": "#fbbf24",
};

function Schedules({ botId, botName }: { botId: string; botName: string }) {
  const [list, setList] = useState<Schedule[]>([]);
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = (await (await fetch("/api/schedules", { cache: "no-store" })).json()) as { schedules?: Schedule[] };
      setList((j.schedules ?? []).filter((s) => s.botId === botId));
    } catch {}
  }, [botId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  const newSchedule = () => {
    setEditing(null);
    setShowForm(true);
  };
  const edit = (s: Schedule) => {
    setEditing(s);
    setShowForm(true);
  };
  const onDone = async () => {
    setShowForm(false);
    setEditing(null);
    await load();
  };
  const remove = async (s: Schedule) => {
    if (!confirm(`Delete schedule “${s.name}”? Its run history is removed too.`)) return;
    await deleteSchedule(s.id);
    await load();
  };
  const toggle = async (s: Schedule) => {
    await toggleSchedule(s.id, !s.enabled);
    await load();
  };
  const runNow = async (s: Schedule) => {
    setRunningId(s.id);
    await runScheduleNow(s.id);
    setRunningId(null);
    await load();
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #1d2742", paddingTop: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "transparent", border: "none", color: "#9fb0d8", cursor: "pointer", fontSize: 13, padding: 0 }}
      >
        {open ? "▾" : "▸"} Schedules{list.length ? ` (${list.length})` : ""}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {list.length === 0 && <div style={{ fontSize: 12, color: "#6b7794", marginBottom: 8 }}>No schedules yet.</div>}
          {list.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #141d36", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.enabled ? "#e7ecff" : "#6b7794" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#9fb0d8" }}>{describeCron(s.cron)}</div>
                <div style={{ fontSize: 11, color: "#6b7794" }}>
                  {s.enabled ? `Next: ${nextRun(s.cron)?.toLocaleString() ?? "never"}` : "Paused"}
                </div>
              </div>
              <a href={`/schedules/${s.id}`} style={{ fontSize: 12, color: "#7dd3fc", textDecoration: "none" }}>
                History
              </a>
              <button onClick={() => runNow(s)} disabled={runningId === s.id} style={linkBtn}>
                {runningId === s.id ? "Running…" : "Run now"}
              </button>
              <button onClick={() => toggle(s)} style={linkBtn}>
                {s.enabled ? "Pause" : "Resume"}
              </button>
              <button onClick={() => edit(s)} style={linkBtn}>
                Edit
              </button>
              <button onClick={() => remove(s)} style={{ ...linkBtn, color: "#f87171" }}>
                Delete
              </button>
            </div>
          ))}

          {showForm ? (
            <ScheduleForm
              botId={botId}
              botName={botName}
              schedule={editing ?? undefined}
              onDone={onDone}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
            />
          ) : (
            <button
              onClick={newSchedule}
              style={{ marginTop: 10, padding: "7px 14px", borderRadius: 8, border: "1px solid #2b3a64", background: "#16203c", color: "#e7ecff", cursor: "pointer", fontSize: 13 }}
            >
              + New schedule
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#9fb0d8",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};
