// Token storage. PROD-style: the OS keychain (macOS Keychain via the `security` CLI), with a 0600 file
// fallback on other platforms. Same store/read interface as before. (Replaces the spike's plain 0600 file.)
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { refreshTokens, verifyIdToken } from "./oauth";

const exec = promisify(execFile);
// SHARED with adania-runner — both read/write this exact Keychain entry so one sign-in serves both.
const SERVICE = "adania";
const ACCOUNT = "session";
const DIR = `${process.env.HOME ?? "/tmp"}/.adania`;
const FILE = `${DIR}/session.json`;

export async function storeTokens(tokens: unknown): Promise<void> {
  const json = JSON.stringify(tokens);
  if (process.platform === "darwin") {
    try {
      // -U updates if present. (Token is the member's own session on their own machine.)
      await exec("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", json]);
      return;
    } catch {
      /* fall through to file */
    }
  }
  try {
    await mkdir(DIR, { recursive: true });
  } catch {
    /* exists */
  }
  await writeFile(FILE, json, { mode: 0o600 });
}

export async function readTokens(): Promise<any | null> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await exec("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]);
      return JSON.parse(stdout.trim());
    } catch {
      /* not in keychain — try file */
    }
  }
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return null;
  }
}

// Return a currently-valid id_token for background callers (the scheduler), refreshing if it has expired
// and persisting the refreshed session back to the shared keychain. Returns null if there's no session
// or the refresh fails (caller records the scheduled run as failed and the member signs in again).
export async function ensureFreshIdToken(): Promise<string | null> {
  const tok = await readTokens();
  if (!tok?.id_token) return null;
  try {
    await verifyIdToken(tok.id_token);
    return tok.id_token; // still valid
  } catch {
    if (!tok.refresh_token) return null;
    try {
      const refreshed = await refreshTokens(tok.refresh_token);
      const merged = { ...tok, ...refreshed };
      await verifyIdToken(merged.id_token);
      await storeTokens(merged);
      return merged.id_token;
    } catch {
      return null;
    }
  }
}
