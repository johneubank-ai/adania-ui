import { startAgentNode } from "../../../lib/agent-node";
import { startScheduler } from "../../../lib/scheduler";
import { readState } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  startAgentNode(); // idempotent; binds the loopback listener once
  startScheduler(); // idempotent; runs the local cron engine in this (request) module graph
  const { pkceVerifier, ...safe } = await readState(); // don't leak the PKCE verifier to the UI
  return Response.json(safe);
}
