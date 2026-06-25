// Thin UI background node: the OAuth loopback callback + a config fetch. NO agent runtime and NO relay
// WebSocket — those moved to the `adania-runner` npm package (npx adania-runner). This app only signs you
// in (writing the SHARED keychain session the runner also reads) and shows your orgs + web-chat agents.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { ADANIA_API, CALLBACK_PORT } from "./config";
import { exchangeCode, emailFromIdToken, verifyIdToken } from "./oauth";
import { readTokens, storeTokens } from "./secrets";
import { patchState, readState } from "./store";

// Fetch the member's orgs + assigned agents and store them for the UI (relay URLs are ignored here).
async function loadAgents(idToken: string): Promise<void> {
  try {
    const r = await fetch(`${ADANIA_API}/api/bots`, { headers: { authorization: `Bearer ${idToken}` } });
    if (!r.ok) {
      await patchState({ status: `agents fetch ${r.status}` });
      return;
    }
    const data = (await r.json()) as { orgs?: unknown[]; bots?: unknown[] };
    await patchState({
      status: "ready",
      orgsJson: JSON.stringify(data.orgs ?? []),
      botsJson: JSON.stringify(data.bots ?? []),
    });
  } catch (e) {
    await patchState({ status: `agents fetch error: ${(e as Error).message}` });
  }
}

async function handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${CALLBACK_PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end();
    return;
  }
  const code = url.searchParams.get("code");
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><meta charset=utf-8><body style='font:16px system-ui;padding:2rem'><h2>Signed in ✓</h2><p>You can return to Adania Client.</p>");
  if (!code) return;
  try {
    const { pkceVerifier } = await readState();
    const tok = await exchangeCode(code, pkceVerifier);
    await verifyIdToken(tok.id_token ?? ""); // JWKS RS256
    await storeTokens(tok); // shared keychain (service "adania", account "session")
    await patchState({ login: "signed in", email: emailFromIdToken(tok.id_token ?? ""), pkceVerifier: "" });
    await loadAgents(tok.id_token);
  } catch (e) {
    await patchState({ login: "sign-in failed: " + ((e as Error).message ?? String(e)) });
  }
}

let attempted = false;
export function startAgentNode(): void {
  if (attempted) return;
  attempted = true;
  const srv = createServer(handleCallback);
  srv.on("error", () => {
    /* EADDRINUSE → the runner (or another realm) owns the loopback; fine, sessions are shared */
  });
  srv.on("listening", async () => {
    const tok = await readTokens(); // resume a shared session on launch
    if (tok?.id_token) {
      try {
        await verifyIdToken(tok.id_token);
        await patchState({ login: "signed in", email: emailFromIdToken(tok.id_token) });
        await loadAgents(tok.id_token);
      } catch {
        /* expired/invalid — user signs in again */
      }
    }
  });
  srv.listen(CALLBACK_PORT, "127.0.0.1");
}

export function openBrowser(url: string): void {
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}
