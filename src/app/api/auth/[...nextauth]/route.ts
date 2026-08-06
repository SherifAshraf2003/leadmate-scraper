import { handlers } from "@/auth";

// The OAuth callback is the heaviest route in the app, not the lightest. It
// awaits events.linkAccount, which provisions the user's spreadsheet
// (spreadsheets.create + values.update + batchUpdate, plus a token refresh
// check) — and @auth/core awaits that event at
// @auth/core/lib/actions/callback/handle-login.js:265, BEFORE createSession at
// :266-271. So a new user on a cold lambda can be killed by the platform
// timeout after their User and Account rows exist but before the session
// cookie is set. They would see an error, and their retry would go down the
// returning-user path where linkAccount never fires again, leaving them
// permanently without a sheet. Same 60s headroom as /api/provision-sheet,
// which does strictly less work.
export const maxDuration = 60;

export const { GET, POST } = handlers;
