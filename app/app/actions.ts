"use server";
import { authorizeUrl, genPkce } from "../lib/oauth";
import { openBrowser } from "../lib/agent-node";
import { ADANIA_API } from "../lib/config";
import { readTokens } from "../lib/secrets";
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

// Web-chat send (v1): fire-and-forget a text message to a Desktop-app bot. The backend enqueues it for
// the bot's assignee runner (npx adania-runner). We do NOT wait for or display the reply yet.
export async function sendChat(botId: string, message: string): Promise<{ ok: boolean; note?: string }> {
  const text = message.trim();
  if (!text) return { ok: false, note: "empty" };
  const tok = await readTokens();
  if (!tok?.id_token) return { ok: false, note: "not signed in" };
  try {
    const r = await fetch(`${ADANIA_API}/api/chat/${botId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok.id_token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!r.ok) return { ok: false, note: `send ${r.status}` };
    const j = (await r.json().catch(() => ({}))) as { runnerOffline?: boolean };
    return { ok: true, note: j.runnerOffline ? "sent (your runner appears offline — start `npx adania-runner`)" : "sent" };
  } catch (e) {
    return { ok: false, note: (e as Error).message };
  }
}
