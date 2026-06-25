// adania-customers-dev Cognito (us-east-1) + the dedicated PUBLIC desktop client (PKCE, no secret).
// All values here are non-secret (public client id + hosted-UI domain + the deployed API origin).
export const COGNITO = {
  domain: "adania-customers-660601648861.auth.us-east-1.amazoncognito.com",
  region: "us-east-1",
  poolId: "us-east-1_XinOnJ2F4",
  issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XinOnJ2F4",
  clientId: "1c05scns13a3nofh7tj7v6ccp9",
  redirectUri: "http://127.0.0.1:8976/callback",
  scope: "openid profile email",
};
export const CALLBACK_PORT = 8976;
// The deployed adania backend the UI talks to: GET /api/bots (orgs + assigned agents) and
// POST /api/chat/[botId] (web-chat send). Override via ADANIA_API for local dev.
export const ADANIA_API = process.env.ADANIA_API ?? "https://app.adania.johneubank.ai";
// Transient UI state file (NOT the session — that's the shared keychain entry in secrets.ts).
export const APP_DIR = `${process.env.HOME ?? "/tmp"}/.adania-client`;
