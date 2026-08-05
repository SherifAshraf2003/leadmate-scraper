# Multi-User Google Sheets Linking — Design

**Date:** 2026-08-05
**Status:** Approved design, ready for implementation planning
**Repos:** `leads-scraper` (Next.js frontend), `leads-scraper-backend` (Express + Puppeteer)

## Problem

The app saves scraped leads to a single hard-coded spreadsheet. `GOOGLE_SHEETS_SPREADSHEET_ID` lives in server env, and `page.tsx` posts every scrape result to that one sheet. There is no concept of a user.

Clients need to run scrapes themselves and have leads land in a sheet of their own.

## Decisions

| Question | Decision |
|---|---|
| Audience | A handful of onboarded clients, each running scrapes themselves |
| Sheet origin | The app creates a sheet in each client's own Drive, owned by them |
| Identity | Google Sign-In via Auth.js, plus the `drive.file` scope |
| Storage | Postgres on Neon, accessed with Prisma |
| Access control | Open self-serve — anyone who signs in gets a sheet |
| Backend coupling | Signed short-lived tokens, not a shared database connection |
| Automated tests | None |

### Accepted risk: open self-serve

Any Google account can sign in, receive a provisioned sheet, and consume scraping
capacity. This costs Render compute, though the Drive files now live in each
signer's own Drive rather than yours. The design keeps a `maxLeads` claim in the scrape token so a per-user cap
can be enforced later by changing one value in the token issuer, with no other
changes.

### Revision 2026-08-05: no service account

The original design used a service account to create and share sheets. Google's
`iam.disableServiceAccountKeyCreation` organization policy blocks key creation on this
account, and there is no organization to lift it from — the project has no
organization at all, so no policy administrator exists to appeal to.

The app therefore acts as each user instead. At sign-in a client grants the
`drive.file` scope, and the app uses their own credentials to create their
spreadsheet. This is a better end state than the original:

- Clients own their sheets outright, rather than holding Writer access to a file a
  robot owns. Ownership no longer depends on a key that could be revoked.
- `drive.file` grants per-file access to files this app creates and nothing else. It
  cannot read the rest of a client's Drive.
- The scope is non-sensitive, so publishing the app needs no Google verification
  review.
- Sharing disappears: no `drive.permissions.create`, no `sendNotificationEmail`
  caveat, no Drive API dependency.

The cost is token lifecycle management — access tokens last about an hour, so the app
stores refresh tokens and renews them. See "Per-user credentials" below.

### Accepted constraint: consent screen audience

While the OAuth consent screen stays in Testing mode, only accounts listed as test
users can sign in, capped at 100. Publishing removes the cap and, because `drive.file`
is non-sensitive, requires no verification review.

## Architecture

```
Browser ──Sign in with Google──▶ Next.js (Vercel) ──▶ Neon Postgres
   │                                    │                (stores OAuth tokens)
   │                                    └──as the user──▶ Sheets API
   │
   └──GET /scrape (Bearer token)──▶ Express + Puppeteer (Render)
```

The scrape request goes from the browser to Render directly, bypassing Vercel. This
is not optional: one batch of 10 leads takes roughly 90-180 seconds given the delays
in `constants.js` (2-5s between businesses, up to 8 website visits at up to 8s each),
and Vercel Hobby functions are cut off at 60 seconds. Proxying scrapes through Next.js
would fail on the first batch.

Because the browser makes that call itself, the backend must authenticate it without
holding a shared secret in the browser. Hence signed tokens.

### Per-user credentials

One Google identity now, not two. The OAuth client (`AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET`) both proves who the client is and authorizes sheet access.

Sign-in requests `access_type: "offline"` and `prompt: "consent"`, which is what makes
Google return a refresh token — it issues one only on first consent unless consent is
forced. Auth.js's Prisma adapter stores `access_token`, `refresh_token`, and
`expires_at` on the `Account` row.

`getUserGoogleClient(userId)` loads those, refreshes the access token when it is
expired or within 60 seconds of expiring, and persists the new values through the
client's `tokens` event. When no refresh token exists or renewal fails, it throws
`GoogleAuthError`, which API routes surface as a 401 telling the client to sign in
again.

### Data model

Auth.js standard tables (`Account`, `Session`, `VerificationToken`) come verbatim from
the Prisma adapter documentation. `User` gains one column:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  image         String?
  emailVerified DateTime?
  spreadsheetId String?   // null until provisioning succeeds
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
}
```

`spreadsheetId` is nullable deliberately. Provisioning depends on a live Google token and
can fail; a nullable column lets sign-in succeed and the app retry later, rather than
failing the whole sign-in.

## Components

### Frontend (`leads-scraper`)

New files:

| File | Responsibility |
|---|---|
| `src/lib/prisma.ts` | Prisma client singleton with a `globalThis` guard |
| `src/auth.ts` | Auth.js config: Google provider with `drive.file` + offline access, Prisma adapter, `createUser` event |
| `src/lib/googleClient.ts` | `getUserGoogleClient(userId)` — per-user OAuth client with token refresh; `GoogleAuthError` |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js route handlers |
| `src/lib/sheetProvisioning.ts` | `provisionSheetForUser(user)` — create in the user's Drive, write headers, persist |
| `src/app/api/provision-sheet/route.ts` | Manual retry endpoint when `spreadsheetId` is null |
| `src/app/api/scrape-token/route.ts` | Session check, then sign a scrape token |
| `prisma/schema.prisma` | Models above |

Changed files:

- `src/lib/googleSheets.ts` — take the authenticated client from the caller instead of
  building one from a module-level credential. Move header creation out of
  `ensureSheetExists` into provisioning, since a newly created sheet needs headers
  exactly once. Narrow the dedupe read (see below).
- `src/app/api/save-to-sheets/route.ts` — resolve the spreadsheet from the session
  instead of `process.env.GOOGLE_SHEETS_SPREADSHEET_ID`. Return 401 without a session.
  Provision on demand if `spreadsheetId` is null.
- `src/lib/scraperApi.ts` — fetch a scrape token once per run, send it as
  `Authorization: Bearer` on each batch. Save after each batch rather than once at the
  end.
- `src/app/page.tsx` — sign-in gate, a link to the client's sheet, sign-out.

There is deliberately no `middleware.ts`. Auth.js middleware runs on the edge
runtime, where the Prisma adapter cannot run; the documented workaround is a split
config. With a single page, the gate belongs in the page itself, and the security
boundary is the server-side session check in each API route either way.

### Backend (`leads-scraper-backend`)

- New `src/middleware/auth.js` — verify the Bearer token against
  `SCRAPE_TOKEN_SECRET`, attach `req.user`, return 401 otherwise. Applied to `/scrape`
  only; `/` and `/health` stay open so uptime pings keep working.
- `index.js` — replace `cors()` with an origin allowlist from `CORS_ORIGIN`.
- `src/controllers/scrapeController.js` — clamp the `limit` query parameter to the
  token's `maxLeads` claim, so a hand-edited query string cannot request more.

### Scrape token

A JWT signed with HS256 using `SCRAPE_TOKEN_SECRET`, a random string generated once
(`openssl rand -base64 32`) and set identically in Vercel and Render. The browser
receives the token but never the secret; it can read the claims but cannot alter them
without invalidating the signature.

Claims: `{ userId, maxLeads, exp }`, expiring 10 minutes after issue — long enough to
outlive a 60-lead run.

The secret must never use the `NEXT_PUBLIC_` prefix, which would ship it to the
browser and defeat the mechanism.

## Data flow

### Provisioning (first sign-in)

1. Client signs in with Google; Auth.js completes the OAuth round trip.
2. The Prisma adapter inserts a `User` row and Auth.js fires the `createUser` event.
3. The event calls `provisionSheetForUser`, using the client's own credentials:
   1. `sheets.spreadsheets.create` — title `Leads — <email>`, one tab named `Leads`.
      Created in their Drive, owned by them.
   2. `values.update` — write and bold the five headers
   3. `UPDATE User SET spreadsheetId = …`

   No sharing step: it is already their file.

   One ordering caveat: on a brand-new user, `createUser` can fire before the `Account`
   row holding the tokens is written. Provisioning then throws `GoogleAuthError` and
   falls through to the retry paths below — which is why both of them exist.
4. The dashboard reads `spreadsheetId` and shows a link to the sheet.

Provisioning runs inside the sign-in callback and must finish within Vercel's 60
seconds. Three Google calls normally take about two seconds.

### Provisioning failure

`createUser` fires once and never again, so it cannot be the only path. Provisioning
is idempotent and re-entrant, keyed on `spreadsheetId IS NULL`:

- The dashboard shows "Set up your sheet" when the id is null, calling
  `/api/provision-sheet`.
- `/api/save-to-sheets` provisions on demand rather than erroring.

The four steps are ordered so that a crash partway through leaks an unshared empty
sheet, never a stored id pointing at a sheet the client cannot open.

### Scrape run

1. `POST /api/scrape-token` — session check, then sign the token.
2. `scrapeBusinessesBatch` sends it on every batch request to Render.
3. Render verifies signature and expiry, clamps `limit`, scrapes.
4. After each batch, the browser posts results to `/api/save-to-sheets`, which
   resolves the sheet from the session, deduplicates, and appends.

Saving per batch rather than once at the end means a closed tab loses one batch
instead of the entire run.

## Save endpoint cost

`/api/save-to-sheets` makes a fixed four Google API calls regardless of lead count:
`spreadsheets.get`, `values.get` for headers, `values.get` for existing rows, and a
single `values.append`. Typical total is two to three seconds — far below the Vercel
limit.

The one call that grows is the dedupe read, which currently pulls every existing row.
Two bounds:

- Read only the columns `createLeadKey` uses — name and website — via `values.batchGet`
  on `A2:A` and `D2:D`, rather than `A2:E`.
- Read at most the last 5,000 rows. The sheet's row count comes from the
  `spreadsheets.get` call already being made, so the ranges become
  `A{max(2, rowCount-4999)}:A` and the matching `D` range. Duplicates in practice come
  from re-running a recent query.

If a save ever approaches the limit, `export const maxDuration` in the route raises it
(300 seconds with fluid compute; confirm the current tier in the Vercel dashboard).

## Error handling

| Case | Behavior |
|---|---|
| No session on an API route | 401; client redirects to sign-in |
| Token expired mid-run | Render returns 401; client fetches a fresh token and retries that batch once |
| Render cold start (~50s) | First batch waits; existing per-batch error handling covers a timeout |
| Google API failure during provisioning | User row persists with a null id; "Set up your sheet" retries |
| Client deleted or unshared their sheet | Sheets 404 clears `spreadsheetId`; next save reprovisions |
| Partial batch failure | Unchanged — the existing `errorOccurred` flag keeps whatever landed |

The reprovision-on-404 path matters more than it appears: clients delete sheets, and
without it every subsequent save fails permanently.

## Verification

No automated tests. Manual smoke check after deploy:

1. Sign in with a second Google account.
2. Confirm the sheet appears in that account's **My Drive**, owned by them.
3. Scrape 10 leads; confirm rows land in that sheet.
4. Scrape the same query again; confirm duplicates are skipped.
5. Open `/scrape` in a plain browser tab with no token; confirm 401.

## Deploy

Order matters — the OAuth redirect URI needs the Vercel domain, which does not exist
until after the first deploy.

1. Create the Neon project; copy the pooled connection string; run `prisma migrate deploy`.
2. In Google Cloud: create an OAuth client with a placeholder redirect URI, request the
   `drive.file` scope on the consent screen, and add test users (or publish the app —
   no verification review is needed for a non-sensitive scope).
3. Generate `AUTH_SECRET` and `SCRAPE_TOKEN_SECRET` with `openssl rand -base64 32`.
4. Backend: add the auth middleware, CORS allowlist, and `limit` clamp. Deploy to
   Render; copy the service URL.
5. Frontend: set all environment variables including the Render URL. Deploy; copy the
   Vercel domain.
6. Return to Google Cloud and set the real redirect URI
   `https://<domain>/api/auth/callback/google`. Set `CORS_ORIGIN` on Render to the
   Vercel domain and redeploy.
7. Run the smoke check.

### Environment variables

**Vercel:** `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`SCRAPE_TOKEN_SECRET`, `NEXT_PUBLIC_SCRAPER_API_URL`.

`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, and
`GOOGLE_SHEETS_CREDENTIALS` are all removed — the first is the single-tenant assumption
this design replaces, the others belonged to the service account that no longer exists.

**Render:** `SCRAPE_TOKEN_SECRET`, `CORS_ORIGIN`.

## Pre-existing blockers

Found during a deployment audit before this design, and still open:

- `next build` fails on three unescaped apostrophes in `src/app/page.tsx` around line
  538. An edit was applied but the build has not been re-run to confirm.
- `google-auth-library` is imported by `src/lib/googleSheets.ts` but is not a declared
  dependency; it currently resolves only as a transitive dependency of `googleapis`.
- `.puppeteerrc.cjs` does not exist in the backend. Without it, Render wipes the
  Puppeteer Chromium download between build and runtime and the first scrape fails
  with "Could not find Chrome".

## Out of scope

- Proxy support for scraping. Entirely backend-internal — a `--proxy-server` launch
  argument or a per-context `proxyServer` option — and independent of this design.
  Deserves its own spec.
- A durable job queue, where the backend persists results and the browser polls. The
  upgrade path when runs get long enough that a closed tab or a dropped connection
  loses real work.
- Billing, quotas, and usage history.
