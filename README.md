# adania-ui

The thin macOS desktop app (Deno Desktop) for Adania members. It signs you in (Cognito), shows your
organizations and the agents that have a **web-chat** channel, and lets you message them with a text box.

It does **not** run agents — that's the separate **[adania-runner](https://github.com/johneubank-ai/adania-runner)**
(`npx adania-runner`). The two **share the same local sign-in** (macOS Keychain, service `adania`), so you
log in once. This app is just login + a thin web UI.

## Install (one command)

```sh
./install.sh
```

Ensures Deno (canary — `deno desktop`) + pnpm, builds the UI, compiles the native `.app` into `dist/`,
and opens it. Re-run any time to rebuild. (Node 18+ required.)

## Using it

1. **Sign in with Cognito** → pick an organization → see its **web-chat** agents.
2. Type a message to an agent and **Send**. It's delivered to your running `adania-runner`, which executes
   the turn locally. (v1: the UI is send-only — replies aren't shown here yet.)
3. Start your runner so messages are served: `npx github:johneubank-ai/adania-runner` (or `npx adania-runner`
   once published).

## How it works

- **Auth:** Cognito Authorization-Code + PKCE (public client, no secret); id_token JWKS-verified; session
  stored in the macOS **Keychain** (`adania`/`session`) — the **same entry adania-runner reads/writes**.
- **Send:** `POST /api/chat/[botId]` on the deployed backend enqueues the message onto the relay bus for the
  agent's assignee runner — the same reverse-WS path used by slack/linear/github.
- **Config:** `GET /api/bots` returns your orgs + assigned agents (the UI shows the web-chat ones).

## Layout

```
app/         the Deno Desktop app (Next.js: login + orgs/agents + web-chat input)
install.sh   one-command macOS install/build/launch
dist/        built .app (gitignored)
```
