"use client";
import { useEffect, useState } from "react";
import { sendChat } from "./actions";

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
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, marginTop: 16 }}>
        <tbody>
          {([["Login", s.login], ["Account", s.email], ["Agents", s.status]] as [string, string | undefined][]).map(([k, v]) => {
            const green = k === "Login" && v === "signed in";
            return (
              <tr key={k}>
                <td style={{ padding: "7px 10px", borderBottom: "1px solid #1d2742", color: "#9fb0d8", whiteSpace: "nowrap" }}>{k}</td>
                <td style={{ padding: "7px 10px", borderBottom: "1px solid #1d2742", fontFamily: "ui-monospace,monospace", color: green ? "#4ade80" : undefined }}>{String(v ?? "…")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {orgs.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 8 }}>Your organizations</h3>
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
    </div>
  );
}
