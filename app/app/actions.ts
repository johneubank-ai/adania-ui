"use server";
import { authorizeUrl, genPkce } from "../lib/oauth";
import { openBrowser } from "../lib/agent-node";
import { ADANIA_API } from "../lib/config";
import { ensureFreshIdToken } from "../lib/secrets";
import { patchState } from "../lib/store";

export async function signIn() {
  const { verifier, challenge } = genPkce();
  // stash the verifier in the file store so the loopback listener (a different realm) can read it
  await patchState({ pkceVerifier: verifier, login: "signing in…" });
  openBrowser(authorizeUrl(challenge)); // Cognito hosted UI; user types their password in the browser
}

export async function signOut() {
  await patchState({ login: "signed out", email: "—", pkceVerifier: "" });
}

// Web-chat send: post a text message to a Desktop-app bot. The backend enqueues it for the bot's assignee
// runner (npx adania-runner) and returns a turnId the UI then polls (getChatReply) for the agent's reply.
export async function sendChat(
  botId: string,
  message: string,
): Promise<{ ok: boolean; note?: string; turnId?: string }> {
  const text = message.trim();
  if (!text) return { ok: false, note: "empty" };
  const idToken = await ensureFreshIdToken();
  if (!idToken) return { ok: false, note: "not signed in" };
  try {
    const r = await fetch(`${ADANIA_API}/api/chat/${botId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!r.ok) return { ok: false, note: `send ${r.status}` };
    const j = (await r.json().catch(() => ({}))) as { turnId?: string; runnerOffline?: boolean };
    return {
      ok: true,
      turnId: j.turnId,
      note: j.runnerOffline ? "your runner appears offline — start `npx adania-runner`" : undefined,
    };
  } catch (e) {
    return { ok: false, note: (e as Error).message };
  }
}

// Read one webchat turn's reply (mirrors the scheduler's pollReply). The chat UI calls this repeatedly after
// sendChat until the status is terminal: "done" (reply ready) or "failed"/"missed" (runner never answered).
export async function getChatReply(turnId: string): Promise<{ status?: string; reply?: string }> {
  const idToken = await ensureFreshIdToken();
  if (!idToken) return {};
  try {
    const r = await fetch(`${ADANIA_API}/api/chat/turn/${turnId}`, {
      headers: { authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    if (!r.ok) return {};
    return (await r.json()) as { status?: string; reply?: string };
  } catch {
    return {};
  }
}
