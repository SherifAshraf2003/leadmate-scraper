# Multi-User Google Sheets Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each client sign in with Google and have scraped leads saved to a spreadsheet the app creates in their own Drive, replacing the single hard-coded sheet.

**Architecture:** Next.js on Vercel gains Auth.js with a Prisma/Neon database. At sign-in each user also grants the `drive.file` scope, and the app acts as that user to create and write their spreadsheet — no service account, because Google policy blocks service account key creation on this account. The browser continues to call the Render scraper directly — a scrape takes minutes and Vercel functions are capped at 60 seconds — so that call is authenticated with a short-lived JWT minted by Next.js and verified by Express.

**Tech Stack:** Next.js 15 (App Router), Auth.js v5 (`next-auth@5`), Prisma, Neon Postgres, `googleapis`, `jsonwebtoken`, Express 4.

**Spec:** `docs/superpowers/specs/2026-08-05-multi-user-sheets-linking-design.md`

## Global Constraints

- **No automated tests.** Every task ends with a manual verification step. Do not add a test runner, test files, or test scripts.
- Two repositories, side by side: `leads-scraper` (frontend) and `leads-scraper-backend` (backend). Paths in each task are relative to the repo named in that task.
- The frontend repo alias `@/` maps to `src/`.
- `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, and `GOOGLE_SHEETS_CREDENTIALS` are all removed by the end of Task 4. No new code may read them. There is no service account in this design — Google's `iam.disableServiceAccountKeyCreation` policy blocks key creation on this account and cannot be lifted.
- Every Google API call is made with the signed-in user's own OAuth credentials, obtained through `getUserGoogleClient(userId)`. Never introduce a shared or application-level credential.
- `SCRAPE_TOKEN_SECRET` must never be prefixed `NEXT_PUBLIC_`. It is read only in server code (frontend) and in Express (backend).
- Sheet tab name is `Leads`. Header row is exactly `["Name", "Emails", "Phones", "Website", "Date Added"]` — matches the existing `leadToRow` in `src/lib/googleSheets.ts`.
- Spreadsheet title format: `Leads — <email>` (em dash).
- Spreadsheets are created in the user's own Drive and owned by them. There is no sharing step and no Drive API call — `drive.file` grants per-file access to files this app creates.
- Commit after each task. Commit messages use the `feat:` / `fix:` / `chore:` prefixes already used in both repos.
- No `middleware.ts`. Auth.js middleware runs on the edge runtime where the Prisma adapter cannot run. The sign-in gate lives in the page; API routes enforce the session server-side.

---

### Task 1: Database and Prisma client

**Repo:** `leads-scraper`

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`
- Modify: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `prisma` — a `PrismaClient` singleton exported from `src/lib/prisma.ts`. `prisma.user` has fields `id: string`, `email: string`, `name: string | null`, `image: string | null`, `spreadsheetId: string | null`.

- [ ] **Step 1: Create a Neon project and get the connection string**

Sign up at https://neon.tech, create a project, and copy the **pooled** connection string from the dashboard — it contains `-pooler` in the hostname. Serverless functions open many short-lived connections and the pooled endpoint is what handles that.

Add to `.env.local` (create the file if absent; it is already gitignored):

```
DATABASE_URL="postgresql://<user>:<password>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require"
```

- [ ] **Step 2: Install Prisma and the Auth.js adapter**

```bash
npm install @prisma/client @auth/prisma-adapter
npm install --save-dev prisma
```

- [ ] **Step 3: Write the schema**

Create `prisma/schema.prisma`. The `Account`, `Session`, and `VerificationToken` models are required by the Auth.js Prisma adapter and must not be renamed. `spreadsheetId` on `User` is the only field this feature adds.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  spreadsheetId String?
  createdAt     DateTime  @default(now())

  accounts Account[]
  sessions Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Step 4: Run the first migration**

```bash
npx prisma migrate dev --name init
```

Expected: `Your database is now in sync with your schema` and a new `prisma/migrations/` directory.

- [ ] **Step 5: Write the Prisma client singleton**

Create `src/lib/prisma.ts`. Without the `globalThis` guard, Next.js hot reload creates a new client (and a new connection pool) on every edit until Neon refuses connections.

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Document the new variable**

In `.env.example`, replace the `GOOGLE_SHEETS_SPREADSHEET_ID` block with:

```
# ===========================================
# REQUIRED: Database (Neon Postgres)
# ===========================================
# Use the POOLED connection string (hostname contains "-pooler")
DATABASE_URL=postgresql://user:password@host-pooler.region.aws.neon.tech/db?sslmode=require
```

- [ ] **Step 7: Verify the connection**

```bash
npx prisma studio
```

Expected: opens on http://localhost:5555 showing empty `User`, `Account`, `Session`, `VerificationToken` tables. Close it with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib/prisma.ts .env.example package.json package-lock.json
git commit -m "feat: add Prisma schema and Neon database client"
```

---

### Task 2: Google sign-in

**Repo:** `leads-scraper`

**Files:**
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`
- Create: `src/app/providers.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces:
  - `auth()` — server-side session getter from `@/auth`. Returns `Session | null` where `session.user.id` is the database user id.
  - `handlers`, `signIn`, `signOut` from `@/auth`.
  - `<Providers>` — client component wrapping children in `SessionProvider`.

- [ ] **Step 1: Create the Google OAuth client**

In https://console.cloud.google.com → APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.

Authorized redirect URI, for local development:

```
http://localhost:3000/api/auth/callback/google
```

The production URI gets added in Task 9, once the Vercel domain exists. Copy the client ID and secret.

Only the default profile and email scopes are used, so this needs no Google app-verification review.

- [ ] **Step 2: Install Auth.js**

```bash
npm install next-auth@beta
```

`next-auth@beta` is Auth.js v5, which is what the App Router API in this plan requires.

- [ ] **Step 3: Set the environment variables**

Generate a session secret:

```bash
openssl rand -base64 32
```

Add to `.env.local`:

```
AUTH_SECRET=<the generated value>
AUTH_GOOGLE_ID=<client id from step 1>
AUTH_GOOGLE_SECRET=<client secret from step 1>
```

Auth.js v5 discovers `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` by naming convention, which is why the provider is configured with no arguments below.

- [ ] **Step 4: Write the Auth.js config**

Create `src/auth.ts`. The `session` callback is required: with a database session strategy, `session.user` does not include the database id by default, and every later task needs it to look up the user's sheet.

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

- [ ] **Step 5: Extend the session type**

Create `src/types/next-auth.d.ts`. Without this, `session.user.id` is a TypeScript error and `next build` fails.

```typescript
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
```

- [ ] **Step 6: Add the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Add the session provider**

Create `src/app/providers.tsx`:

```typescript
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

In `src/app/layout.tsx`, import it and wrap the existing `{children}` inside `<body>`:

```typescript
import { Providers } from "./providers";
```

```typescript
<Providers>{children}</Providers>
```

- [ ] **Step 8: Add a temporary sign-in control**

At the very top of the returned JSX in `src/app/page.tsx` — inside the outermost `<div>`, above the header block — add a bar. Task 8 replaces this with the real gate; for now it only needs to prove the flow works.

Add to the imports at the top of the file:

```typescript
import { useSession, signIn, signOut } from "next-auth/react";
```

Add inside the `Home` component, above `handleScrape`:

```typescript
const { data: session } = useSession();
```

Add as the first child of the `max-w-5xl` container:

```tsx
<div className="flex justify-end items-center gap-3 mb-4 text-sm">
  {session ? (
    <>
      <span className="text-gray-600 dark:text-gray-400">{session.user?.email}</span>
      <button onClick={() => signOut()} className="underline">Sign out</button>
    </>
  ) : (
    <button onClick={() => signIn("google")} className="underline">Sign in with Google</button>
  )}
</div>
```

- [ ] **Step 9: Verify sign-in end to end**

```bash
npm run dev
```

Open http://localhost:3000, click Sign in with Google, complete the Google flow. Expected: redirected back with your email shown in the bar.

Then:

```bash
npx prisma studio
```

Expected: one row in `User` with your email and a null `spreadsheetId`, one row in `Account` with provider `google`, one row in `Session`.

- [ ] **Step 10: Document the new variables**

Add to `.env.example`:

```
# ===========================================
# REQUIRED: Authentication (Auth.js + Google OAuth)
# ===========================================
# openssl rand -base64 32
AUTH_SECRET=
# Google Cloud Console -> Credentials -> OAuth client ID (Web application)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

- [ ] **Step 11: Commit**

```bash
git add src/auth.ts src/app/api/auth src/types src/app/providers.tsx src/app/layout.tsx src/app/page.tsx .env.example package.json package-lock.json
git commit -m "feat: add Google sign-in with Auth.js and Prisma adapter"
```

---

### Task 2b: Request Drive access at sign-in

**Repo:** `leads-scraper`

**Files:**
- Modify: `src/auth.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the Auth.js config from Task 2.
- Produces: `Account` rows that carry `access_token`, `refresh_token`, and `expires_at` for the `google` provider — the credentials Task 3 uses to act on a user's behalf.

**Why this task exists:** service account keys are blocked by Google policy on this account with no way to lift it, so the app acts as each user instead of as a robot. That requires asking for Drive permission at sign-in, and asking for it in a way that yields a refresh token.

- [ ] **Step 1: Request the scope and offline access**

In `src/auth.ts`, replace the bare `Google` provider entry with a configured one:

```typescript
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
```

Three parts, each load-bearing:
- `drive.file` grants per-file access to files **this app creates**. It cannot see anything else in the user's Drive. It is a non-sensitive scope, so it needs no Google verification review.
- `access_type: "offline"` is what makes Google return a refresh token at all.
- `prompt: "consent"` forces the consent screen every time. Google returns a refresh token **only on the first consent** unless you force it; without this, a user who previously signed in gets no refresh token and their access silently dies after an hour.

- [ ] **Step 2: Add yourself as a test user**

The OAuth consent screen is in Testing mode, so only listed accounts can sign in. In Google Cloud Console → APIs & Services → OAuth consent screen → Audience → **Test users** → Add users, add the Google accounts you will test with.

`drive.file` is non-sensitive, so the app can later be published without a review — but until it is, unlisted accounts get `Error 403: access_denied`.

- [ ] **Step 3: Force a fresh consent**

Existing `Account` rows predate the new scope and hold no refresh token. Delete them so the next sign-in re-consents:

```bash
set -a && source .env.local && set +a && npx prisma studio
```

Delete every row in `Account` and `Session` (leave `User` — its `spreadsheetId` is still valid). Close Studio with Ctrl-C.

- [ ] **Step 4: Verify the build and the provider config**

```bash
npx tsc --noEmit && npx next build
```

Expected: both pass.

```bash
npm run dev
```

Then:

```bash
curl -s http://localhost:3000/api/auth/providers
```

Expected: JSON listing the `google` provider. Kill the dev server.

- [ ] **Step 5: Verify the tokens land (needs a browser)**

Sign in at http://localhost:3000. The consent screen now asks for Drive access — accept it. Then open Prisma Studio and confirm the `Account` row has a non-null `refresh_token` and a non-null `expires_at`.

This is the gate for Task 3: without a refresh token, provisioning works for one hour and then fails.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts .env.example
git commit -m "feat: request drive.file scope and offline access at sign-in"
```

---

### Task 3: Per-user Google client and sheet provisioning

**Repo:** `leads-scraper`

**Files:**
- Create: `src/lib/googleClient.ts`
- Create: `src/lib/sheetProvisioning.ts`
- Create: `src/app/api/provision-sheet/route.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`; `auth` from `@/auth`; `Account` rows from Task 2b.
- Produces:
  - `getUserGoogleClient(userId: string): Promise<OAuth2Client>` — an authenticated client for that user, refreshing the access token when needed.
  - `GoogleAuthError` — thrown when a user's Google access cannot be restored without signing in again.
  - `provisionSheetForUser(user: { id: string; email: string }): Promise<string>` — returns the spreadsheet id, creating one only if the user has none. Idempotent.
  - `LEAD_HEADERS: string[]` — the header row, re-used by Task 4.
  - `POST /api/provision-sheet` → `{ spreadsheetId }` or `{ error }`.

- [ ] **Step 1: Write the per-user Google client**

Create `src/lib/googleClient.ts`. Access tokens last about an hour, so anything long-lived must refresh them; the `tokens` event fires on refresh and is where the new values get persisted.

```typescript
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "./prisma";

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

const RECONNECT = "Sign out and sign in again to reconnect your Google account.";

export async function getUserGoogleClient(
  userId: string
): Promise<OAuth2Client> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });

  if (!account?.access_token) {
    throw new GoogleAuthError(`No Google account is linked. ${RECONNECT}`);
  }

  const client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  client.on("tokens", (tokens) => {
    void prisma.account
      .updateMany({
        where: { userId, provider: "google" },
        data: {
          ...(tokens.access_token
            ? { access_token: tokens.access_token }
            : {}),
          ...(tokens.refresh_token
            ? { refresh_token: tokens.refresh_token }
            : {}),
          ...(tokens.expiry_date
            ? { expires_at: Math.floor(tokens.expiry_date / 1000) }
            : {}),
        },
      })
      .catch((error) => {
        console.error("Failed to persist refreshed Google tokens:", error);
      });
  });

  const expiresSoon =
    !account.expires_at || account.expires_at * 1000 - Date.now() < 60_000;

  if (expiresSoon) {
    if (!account.refresh_token) {
      throw new GoogleAuthError(
        `Google access expired and no refresh token is stored. ${RECONNECT}`
      );
    }

    try {
      await client.getAccessToken();
    } catch (error) {
      console.error("Google token refresh failed:", error);
      throw new GoogleAuthError(`Google access could not be renewed. ${RECONNECT}`);
    }
  }

  return client;
}
```

`getAccessToken()` refreshes automatically when the stored token is expired, which is why there is no manual refresh call. The 60-second margin avoids handing out a token that expires mid-request.

- [ ] **Step 2: Write the provisioning module**

Create `src/lib/sheetProvisioning.ts`. The spreadsheet is created with the user's own credentials, so it lands in their Drive owned by them — there is no sharing step and no Drive API call.

```typescript
import { google } from "googleapis";
import { prisma } from "./prisma";
import { getUserGoogleClient } from "./googleClient";

export const LEAD_HEADERS = ["Name", "Emails", "Phones", "Website", "Date Added"];

export async function provisionSheetForUser(user: {
  id: string;
  email: string;
}): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { spreadsheetId: true },
  });

  if (existing?.spreadsheetId) {
    return existing.spreadsheetId;
  }

  const authClient = await getUserGoogleClient(user.id);
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `Leads — ${user.email}` },
      sheets: [{ properties: { title: "Leads" } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;
  const sheetId = created.data.sheets?.[0]?.properties?.sheetId;

  if (!spreadsheetId || sheetId === undefined || sheetId === null) {
    throw new Error("Sheets API did not return a spreadsheet id");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Leads!A1:E1",
    valueInputOption: "RAW",
    requestBody: { values: [LEAD_HEADERS] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { spreadsheetId },
  });

  return spreadsheetId;
}
```

The database write is last on purpose: a failure partway through leaves an orphaned empty sheet in the user's Drive rather than a stored id pointing at something unusable.

- [ ] **Step 3: Provision on first sign-in**

In `src/auth.ts`, add the import:

```typescript
import { provisionSheetForUser } from "@/lib/sheetProvisioning";
```

and add an `events` block alongside the existing `callbacks`:

```typescript
  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) return;

      try {
        await provisionSheetForUser({ id: user.id, email: user.email });
      } catch (error) {
        console.error("Sheet provisioning failed for", user.email, error);
      }
    },
  },
```

The `try`/`catch` is deliberate: a throw here would fail the whole sign-in over a transient Google error. Instead the user gets an account with a null `spreadsheetId` and recovers through the retry endpoint below.

**Known ordering caveat, do not try to fix it here:** on a brand-new user, `createUser` may fire before the `Account` row holding the tokens is written, in which case `getUserGoogleClient` throws `GoogleAuthError` and provisioning is deferred to the retry path. That is why the retry endpoint and the on-demand provisioning in Task 4 both exist. Log it and move on.

- [ ] **Step 4: Add the retry endpoint**

Create `src/app/api/provision-sheet/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { provisionSheetForUser } from "@/lib/sheetProvisioning";
import { GoogleAuthError } from "@/lib/googleClient";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spreadsheetId = await provisionSheetForUser({
      id: session.user.id,
      email: session.user.email,
    });

    return NextResponse.json({ spreadsheetId });
  } catch (error) {
    console.error("Provisioning failed:", error);

    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to provision sheet",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: Verify the build**

```bash
npx tsc --noEmit && npx next build
```

Expected: both pass.

- [ ] **Step 6: Verify provisioning (needs a browser)**

Delete your `User` row in Prisma Studio so `createUser` fires again, then sign in at http://localhost:3000 and accept the Drive permission.

Then, in the browser devtools console on http://localhost:3000:

```javascript
await (await fetch("/api/provision-sheet", { method: "POST" })).json()
```

Expected, in order:
1. Returns `{ spreadsheetId: "..." }`.
2. https://drive.google.com — **My Drive**, not "Shared with me" — contains `Leads — <your email>`, owned by you.
3. The sheet has a bolded, grey header row: Name, Emails, Phones, Website, Date Added.
4. Running the same call again returns the **same** id and creates no second sheet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/googleClient.ts src/lib/sheetProvisioning.ts src/app/api/provision-sheet src/auth.ts
git commit -m "feat: provision each user a spreadsheet in their own Drive"
```

---

### Task 4: Per-user sheet saving

**Repo:** `leads-scraper`

**Files:**
- Modify: `src/lib/googleSheets.ts`
- Modify: `src/app/api/save-to-sheets/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `getUserGoogleClient`, `GoogleAuthError` from `@/lib/googleClient`; `provisionSheetForUser` from `@/lib/sheetProvisioning`; `auth` from `@/auth`; `prisma` from `@/lib/prisma`.
- Produces: `appendLeadsToSheet(leads: BusinessLead[], config: { spreadsheetId: string; auth: OAuth2Client; sheetName?: string }): Promise<{ success: boolean; newLeadsAdded: number; duplicatesSkipped: number; totalLeads: number; error?: string; notFound?: boolean }>` — the config now carries the caller's authenticated client, and `notFound` is set when the spreadsheet is gone.

- [ ] **Step 1: Take the auth client from the caller**

In `src/lib/googleSheets.ts`:

Replace the imports and the local `getGoogleSheetsClient` with:

```typescript
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { BusinessLead } from "./scraperApi";
```

Delete the `GoogleSheetsConfig` interface's old shape and replace it with:

```typescript
export interface GoogleSheetsConfig {
  spreadsheetId: string;
  auth: OAuth2Client;
  sheetName?: string;
}
```

Inside `appendLeadsToSheet`, replace the `const sheets = getGoogleSheetsClient();` line and the destructuring below it with:

```typescript
    const { spreadsheetId, auth, sheetName = "Leads" } = config;
    const sheets = google.sheets({ version: "v4", auth });
```

There is no module-level credential any more — every call is made as the user who owns the sheet.

Delete the entire `ensureSheetExists` function and its call. Provisioning guarantees the tab and headers exist, so re-checking on every save costs two API calls for nothing.

- [ ] **Step 2: Narrow the dedupe read**

Replace the existing-data block inside `appendLeadsToSheet` — the `values.get` on `${sheetName}!A2:E` and the `rowToLead` mapping — with a two-column, bounded read. `createLeadKey` reads only name and website, so fetching phones and timestamps is wasted bandwidth:

```typescript
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const rowCount =
      metadata.data.sheets?.find((s) => s.properties?.title === sheetName)
        ?.properties?.gridProperties?.rowCount ?? 0;

    const firstRow = Math.max(2, rowCount - 4999);

    const existingDataResponse = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [`${sheetName}!A${firstRow}:A`, `${sheetName}!D${firstRow}:D`],
    });

    const names = existingDataResponse.data.valueRanges?.[0]?.values ?? [];
    const websites = existingDataResponse.data.valueRanges?.[1]?.values ?? [];

    const existingKeys = new Set(
      names.map((row, index) =>
        createLeadKey({
          name: row?.[0] || undefined,
          website: websites[index]?.[0] || undefined,
        })
      )
    );
```

`rowCount` is the grid height rather than the filled-row count, so this is an upper bound on the dedupe window — it may read fewer than 5,000 populated rows, never more than the sheet holds. Bounding the read is the point; exact counting is not.

Delete the `rowToLead` function — nothing calls it now. Replace the `totalLeads` calculation, which referenced the deleted `existingLeads`:

```typescript
    const totalLeads = existingKeys.size + uniqueNewLeads.length;
```

The `uniqueNewLeads` filter between these blocks already uses `existingKeys` and needs no change.

- [ ] **Step 3: Report a deleted spreadsheet distinctly**

In the `catch` block of `appendLeadsToSheet`, before the existing return, detect a 404 so the caller can reprovision:

```typescript
    const notFound =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 404;

    return {
      success: false,
      newLeadsAdded: 0,
      duplicatesSkipped: 0,
      totalLeads: 0,
      notFound,
      error:
        error instanceof Error
          ? error.message
          : "Failed to append leads to Google Sheets",
    };
```

Add `notFound?: boolean;` to the function's declared return type.

- [ ] **Step 4: Resolve the sheet and the credentials from the session**

Replace the whole body of `src/app/api/save-to-sheets/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendLeadsToSheet } from "@/lib/googleSheets";
import { provisionSheetForUser } from "@/lib/sheetProvisioning";
import { getUserGoogleClient, GoogleAuthError } from "@/lib/googleClient";
import { BusinessLead } from "@/lib/scraperApi";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leads } = await request.json();

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: "Invalid request: leads array is required" },
        { status: 400 }
      );
    }

    const user = { id: session.user.id, email: session.user.email };

    let spreadsheetId = (
      await prisma.user.findUnique({
        where: { id: user.id },
        select: { spreadsheetId: true },
      })
    )?.spreadsheetId;

    if (!spreadsheetId) {
      spreadsheetId = await provisionSheetForUser(user);
    }

    const authClient = await getUserGoogleClient(user.id);

    let result = await appendLeadsToSheet(leads as BusinessLead[], {
      spreadsheetId,
      auth: authClient,
    });

    if (result.notFound) {
      await prisma.user.update({
        where: { id: user.id },
        data: { spreadsheetId: null },
      });

      spreadsheetId = await provisionSheetForUser(user);
      result = await appendLeadsToSheet(leads as BusinessLead[], {
        spreadsheetId,
        auth: authClient,
      });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to save leads to Google Sheets" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully saved ${result.newLeadsAdded} new leads to Google Sheets`,
      data: {
        newLeadsAdded: result.newLeadsAdded,
        duplicatesSkipped: result.duplicatesSkipped,
        totalLeads: result.totalLeads,
        spreadsheetId,
      },
    });
  } catch (error) {
    console.error("Error in save-to-sheets API:", error);

    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
```

The reprovision-on-404 path matters more than it looks: users delete sheets, and without it every later save fails permanently.

- [ ] **Step 5: Remove the dead service account variables**

The service account is gone from the design — Google policy blocks creating keys for it. Delete `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, and `GOOGLE_SHEETS_CREDENTIALS`, and their comment blocks, from `.env.example` and from `.env.local`. Confirm nothing references them:

```bash
grep -rn "GOOGLE_SHEETS_SPREADSHEET_ID\|GOOGLE_SHEETS_CREDENTIALS\|GOOGLE_SHEETS_SHEET_NAME" src/ .env.example
```

Expected: no output.

- [ ] **Step 6: Verify the build**

```bash
npx tsc --noEmit && npx next build
```

Expected: both pass.

- [ ] **Step 7: Verify saving, deduping, and recovery (needs a browser)**

Signed in at http://localhost:3000, in the devtools console:

```javascript
await (await fetch("/api/save-to-sheets", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ leads: [{ name: "Test Co", emails: ["a@b.com"], phones: ["123"], website: "https://test.co" }] })
})).json()
```

Expected: `newLeadsAdded: 1`, and one row in the sheet.

Run the identical call again. Expected: `newLeadsAdded: 0, duplicatesSkipped: 1`, still one row.

Delete the spreadsheet in Drive and empty the trash, then run it once more. Expected: it succeeds, a new `Leads — <email>` appears in your Drive, and `spreadsheetId` in Prisma Studio has changed.

Sign out and run it again. Expected: `{"error":"Unauthorized"}`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/googleSheets.ts src/app/api/save-to-sheets/route.ts .env.example
git commit -m "feat: save leads to the signed-in user's own spreadsheet"
```

---

### Task 5: Scrape token endpoint

**Repo:** `leads-scraper`

**Files:**
- Create: `src/lib/scrapeToken.ts`
- Create: `src/app/api/scrape-token/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `auth` from `@/auth`.
- Produces:
  - `MAX_LEADS_PER_RUN: number` (60) from `@/lib/scrapeToken`.
  - `POST /api/scrape-token` → `{ token: string; maxLeads: number }` or `{ error }` with status 401/500.
  - Token claims: `{ userId: string, maxLeads: number, exp: number }`, HS256, 10 minute expiry.

- [ ] **Step 1: Install the JWT library**

```bash
npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

- [ ] **Step 2: Generate the shared secret**

```bash
openssl rand -base64 32
```

Add to `.env.local`. The identical value goes into the backend in Task 6 — this is the one secret both services share.

```
SCRAPE_TOKEN_SECRET=<the generated value>
```

- [ ] **Step 3: Write the token module**

Create `src/lib/scrapeToken.ts`:

```typescript
import jwt from "jsonwebtoken";

export const MAX_LEADS_PER_RUN = 60;
export const TOKEN_TTL_SECONDS = 600;

export function signScrapeToken(userId: string): string {
  const secret = process.env.SCRAPE_TOKEN_SECRET;

  if (!secret) {
    throw new Error("SCRAPE_TOKEN_SECRET environment variable is not set");
  }

  return jwt.sign({ userId, maxLeads: MAX_LEADS_PER_RUN }, secret, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}
```

The 10 minute lifetime outlives a full 60-lead run — six batches plus the 5-8 second delays between them — so one token covers an entire session without a refresh.

- [ ] **Step 4: Write the route**

Create `src/app/api/scrape-token/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { MAX_LEADS_PER_RUN, signScrapeToken } from "@/lib/scrapeToken";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      token: signScrapeToken(session.user.id),
      maxLeads: MAX_LEADS_PER_RUN,
    });
  } catch (error) {
    console.error("Failed to sign scrape token:", error);

    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Verify**

Signed in, in the devtools console:

```javascript
await (await fetch("/api/scrape-token", { method: "POST" })).json()
```

Expected: `{ token: "eyJ...", maxLeads: 60 }`.

Decode the payload to confirm the claims — this also demonstrates that the browser can read but not forge them:

```javascript
JSON.parse(atob((await (await fetch("/api/scrape-token", {method:"POST"})).json()).token.split(".")[1]))
```

Expected: `{ userId: "...", maxLeads: 60, iat: ..., exp: ... }` with `exp - iat === 600`.

Sign out and repeat the first call. Expected: `{"error":"Unauthorized"}`.

- [ ] **Step 6: Document the variable**

Add to `.env.example`:

```
# ===========================================
# REQUIRED: Scrape token (shared with the backend)
# ===========================================
# openssl rand -base64 32
# The backend must have this EXACT same value. Never prefix with NEXT_PUBLIC_.
SCRAPE_TOKEN_SECRET=
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/scrapeToken.ts src/app/api/scrape-token .env.example package.json package-lock.json
git commit -m "feat: mint short-lived scrape tokens for authenticated users"
```

---

### Task 6: Backend token verification

**Repo:** `leads-scraper-backend`

**Files:**
- Create: `src/middleware/auth.js`
- Modify: `index.js`
- Modify: `src/routes/index.js`
- Modify: `src/controllers/scrapeController.js:27`
- Create: `.env.example`

**Interfaces:**
- Consumes: tokens produced by Task 5 — claims `{ userId, maxLeads, exp }`, HS256, secret `SCRAPE_TOKEN_SECRET`.
- Produces: `requireScrapeToken(req, res, next)` — Express middleware setting `req.user = { userId, maxLeads }`.

- [ ] **Step 1: Install the JWT library**

```bash
npm install jsonwebtoken
```

- [ ] **Step 2: Set the environment variables**

Create `.env` in the backend repo (already gitignored). `SCRAPE_TOKEN_SECRET` must be character-for-character identical to the frontend's:

```
SCRAPE_TOKEN_SECRET=<the same value generated in Task 5>
CORS_ORIGIN=http://localhost:3000
```

Install a loader so `npm run dev` picks them up:

```bash
npm install dotenv
```

Add as the first line of `index.js`, above every other require:

```javascript
require("dotenv").config();
```

Render injects environment variables directly, so this only affects local development.

- [ ] **Step 3: Write the middleware**

Create `src/middleware/auth.js`:

```javascript
const jwt = require("jsonwebtoken");

/**
 * Verifies the short-lived scrape token minted by the frontend.
 *
 * The browser calls this API directly — a scrape runs for minutes and cannot be
 * proxied through a serverless function — so the request carries a signed token
 * rather than a session cookie or a shared secret.
 */
function requireScrapeToken(req, res, next) {
  const secret = process.env.SCRAPE_TOKEN_SECRET;

  if (!secret) {
    console.error("SCRAPE_TOKEN_SECRET is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const claims = jwt.verify(token, secret);

    req.user = { userId: claims.userId, maxLeads: claims.maxLeads };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireScrapeToken };
```

- [ ] **Step 4: Protect the scrape route only**

In `src/routes/index.js`, add the import:

```javascript
const { requireScrapeToken } = require("../middleware/auth");
```

and change the scrape route to:

```javascript
router.get("/scrape", requireScrapeToken, handleScrape);
```

Leave `/` and `/health` open. The uptime ping that keeps the Render free instance awake hits `/health` and has no token.

- [ ] **Step 5: Restrict CORS**

In `index.js`, replace `app.use(cors());` with:

```javascript
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
```

- [ ] **Step 6: Clamp the requested limit**

In `src/controllers/scrapeController.js`, replace line 27:

```javascript
  const limit = parseInt(req.query.limit) || MAX_SEARCH_RESULTS;
```

with:

```javascript
  const requestedLimit = parseInt(req.query.limit) || MAX_SEARCH_RESULTS;
  const limit = Math.min(
    requestedLimit,
    MAX_SEARCH_RESULTS,
    req.user?.maxLeads ?? MAX_SEARCH_RESULTS
  );
```

The query string is client-controlled, so a hand-edited `limit=5000` would otherwise run a 5,000-result scrape on a 512 MB instance.

- [ ] **Step 7: Document the variables**

Create `.env.example`:

```
# Must be byte-identical to the frontend's SCRAPE_TOKEN_SECRET
# openssl rand -base64 32
SCRAPE_TOKEN_SECRET=

# Comma-separated list of allowed browser origins
CORS_ORIGIN=http://localhost:3000
```

- [ ] **Step 8: Verify rejection and acceptance**

```bash
npm run dev
```

No token:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/scrape?query=test"
```

Expected: `401`.

Garbage token:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer not.a.token" "http://localhost:3001/scrape?query=test"
```

Expected: `401`.

Health check still open:

```bash
curl -s http://localhost:3001/health
```

Expected: `{"status":"ok","timestamp":"..."}`.

Valid token — with the frontend dev server also running and signed in, get one from the browser console (`await (await fetch("/api/scrape-token",{method:"POST"})).json()`), then:

```bash
curl -s "http://localhost:3001/scrape?query=calgary+dentists&limit=2" -H "Authorization: Bearer <paste token>" | head -c 200
```

Expected: a scrape actually runs (takes 30+ seconds) and returns JSON with a `results` array.

- [ ] **Step 9: Commit**

```bash
git add src/middleware/auth.js src/routes/index.js src/controllers/scrapeController.js index.js .env.example package.json package-lock.json
git commit -m "feat: require a signed scrape token and restrict CORS"
```

---

### Task 7: Frontend sends the token

**Repo:** `leads-scraper`

**Files:**
- Modify: `src/lib/scraperApi.ts`

**Interfaces:**
- Consumes: `POST /api/scrape-token` from Task 5; the backend's Bearer requirement from Task 6.
- Produces:
  - `scrapeBusinesses(query: string, start: number, limit: number, token: string): Promise<ScrapeResponse>` — now requires a token.
  - `fetchScrapeToken(): Promise<string>`.
  - `scrapeBusinessesBatch(query, totalLeads, onProgress?, onBatchSaved?)` — signature gains an optional `onBatchSaved` callback, invoked with each batch's leads as they arrive.

- [ ] **Step 1: Add the token fetcher**

At the top of `src/lib/scraperApi.ts`, below the existing interfaces, add:

```typescript
export type BatchSavedCallback = (leads: BusinessLead[]) => Promise<void>;

export async function fetchScrapeToken(): Promise<string> {
  const response = await fetch("/api/scrape-token", { method: "POST" });

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "You are signed out. Sign in again to scrape."
        : "Could not get a scrape token"
    );
  }

  const data = await response.json();

  return data.token;
}
```

- [ ] **Step 2: Send the token on each scrape**

Change the `scrapeBusinesses` signature to take a token, and send it. Replace the signature and the `fetch` call:

```typescript
export async function scrapeBusinesses(
  query: string,
  start: number = 0,
  limit: number = 10,
  token: string
): Promise<ScrapeResponse> {
```

```typescript
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
```

Also delete the three `console.log` debugging calls in that function (`"=== SCRAPER API RESPONSE DEBUG ==="` and the two below it) — they dump every response to the console of a now multi-user app.

- [ ] **Step 3: Fetch one token per run and save per batch**

In `scrapeBusinessesBatch`, add the parameter:

```typescript
export async function scrapeBusinessesBatch(
  query: string,
  totalLeads: number,
  onProgress?: ProgressCallback,
  onBatchSaved?: BatchSavedCallback
): Promise<ScrapeResponse> {
```

After the `totalLeads > 60` guard and before `const batchSize = 10;`, get the token once — a 10 minute lifetime covers the whole run:

```typescript
  let token: string;

  try {
    token = await fetchScrapeToken();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Could not authenticate",
    };
  }
```

Change the call inside the loop to pass it:

```typescript
      const response = await scrapeBusinesses(query, start, limit, token);
```

Immediately after `allResults.push(...response.data);` inside the success branch, save this batch:

```typescript
        if (onBatchSaved) {
          try {
            await onBatchSaved(response.data);
          } catch (saveError) {
            console.error(`Failed to save batch ${i + 1}:`, saveError);
          }
        }
```

Saving per batch rather than once at the end means a closed tab loses one batch instead of the whole run.

- [ ] **Step 4: Verify**

This task's caller changes land in Task 8, so verify by type-check only:

```bash
npx tsc --noEmit
```

Expected: errors **only** in `src/app/page.tsx`, complaining that `scrapeBusinesses` expects 4 arguments. That is the expected temporary breakage; Task 8 fixes it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraperApi.ts
git commit -m "feat: authenticate scrape requests and save each batch as it lands"
```

---

### Task 8: Sign-in gate and sheet link

**Repo:** `leads-scraper`

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `useSession`, `signIn`, `signOut` from `next-auth/react`; `scrapeBusinesses`, `scrapeBusinessesBatch`, `fetchScrapeToken` from `@/lib/scraperApi`; `POST /api/provision-sheet`.
- Produces: the finished UI. No exports consumed by later tasks.

- [ ] **Step 1: Add state for the sheet**

Inside `Home`, alongside the existing `useState` calls, add:

```typescript
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
```

- [ ] **Step 2: Add a save helper and the provisioning retry**

Above `handleScrape`, add:

```typescript
  const saveLeads = async (leads: BusinessLead[]) => {
    const response = await fetch("/api/save-to-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads }),
    });

    const data = await response.json();

    if (data.success) {
      setSpreadsheetId(data.data.spreadsheetId);
      setSheetsStatus(
        `✅ Saved to your sheet: ${data.data.newLeadsAdded} new, ${data.data.duplicatesSkipped} duplicates skipped`
      );
    } else {
      setSheetsStatus(`⚠️ Google Sheets: ${data.error}`);
    }
  };

  const handleProvision = async () => {
    setProvisioning(true);

    try {
      const response = await fetch("/api/provision-sheet", { method: "POST" });
      const data = await response.json();

      if (data.spreadsheetId) {
        setSpreadsheetId(data.spreadsheetId);
        setSheetsStatus(null);
      } else {
        setSheetsStatus(`⚠️ Could not create your sheet: ${data.error}`);
      }
    } finally {
      setProvisioning(false);
    }
  };
```

- [ ] **Step 3: Rewrite the scrape handler to use them**

Replace the body of `handleScrape`'s `try` block — from `let response;` through the end of the inner Google Sheets `try`/`catch` — with:

```typescript
      let response;

      if (totalLeads > 10) {
        response = await scrapeBusinessesBatch(
          query,
          totalLeads,
          (progress) => setBatchProgress(progress),
          saveLeads
        );
      } else {
        const token = await fetchScrapeToken();
        response = await scrapeBusinesses(query, 0, totalLeads, token);

        if (response.success && response.data) {
          await saveLeads(response.data);
        }
      }

      if (response.success && response.data) {
        setResults(response.data);
        setBatchProgress(null);
      } else {
        setError(response.error || "Failed to scrape businesses");
      }
```

The batch path saves inside the loop through the callback; the single-batch path saves once, after. Neither waits until every batch finishes.

- [ ] **Step 4: Gate the page**

Replace the temporary sign-in bar from Task 2 with the real gate. Immediately after the `const { data: session, status } = useSession();` line — update that line to destructure `status` as well — add an early return above the main `return (`:

```typescript
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-4xl font-bold">Leads Scraper</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Sign in with Google. We&apos;ll create a spreadsheet for you and save
          every lead you scrape straight into it.
        </p>
        <button
          onClick={() => signIn("google")}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-lg transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }
```

- [ ] **Step 5: Show the account bar with the sheet link**

Replace the temporary bar from Task 2 with:

```tsx
<div className="flex flex-wrap justify-end items-center gap-4 mb-6 text-sm">
  {spreadsheetId ? (
    <a
      href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
    >
      Your leads sheet →
    </a>
  ) : (
    <button
      onClick={handleProvision}
      disabled={provisioning}
      className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
    >
      {provisioning ? "Setting up…" : "Set up your sheet"}
    </button>
  )}
  <span className="text-gray-500 dark:text-gray-400">{session.user?.email}</span>
  <button
    onClick={() => signOut()}
    className="text-gray-500 dark:text-gray-400 hover:underline"
  >
    Sign out
  </button>
</div>
```

`spreadsheetId` is null until the first save returns it, so a returning user sees "Set up your sheet" until then. Clicking it is harmless — `provisionSheetForUser` is idempotent and returns the existing id.

- [ ] **Step 6: Verify the build**

```bash
npx tsc --noEmit && npx next build
```

Expected: no type errors, build succeeds. If lint fails on an apostrophe, escape it as `&apos;` — the same rule that broke this file before.

- [ ] **Step 7: Verify the full flow**

With both dev servers running (`npm run dev` in each repo), open http://localhost:3000 in a **private window**:

1. Signed out → the gate, no scrape UI.
2. Sign in with a second Google account → the app appears.
3. Check that account's **My Drive** → `Leads — <that email>`, owned by them.
4. Scrape `calgary dentists` with Number of Leads = 5. Expected: results appear, status says leads were saved, "Your leads sheet →" links to a sheet containing them.
5. Scrape the same query again. Expected: duplicates skipped, no new rows.
6. Sign out, sign back in with your **first** account, scrape. Expected: rows land in the first account's sheet, and the second account's sheet is untouched.

Step 6 is the one that proves multi-tenancy actually works.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: gate the app behind sign-in and link each user to their sheet"
```

---

### Task 9: Deploy

**Repos:** both

**Files:**
- Modify: `leads-scraper/package.json`
- Modify: `leads-scraper/README.md`
- Modify: `leads-scraper-backend/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a running deployment.

- [ ] **Step 1: Make migrations run on deploy**

Vercel builds do not run migrations, and `@prisma/client` needs generating against the schema on every build. In `leads-scraper/package.json`, change the build script:

```json
    "build": "prisma generate && prisma migrate deploy && next build --turbopack",
```

- [ ] **Step 2: Deploy the backend**

Push, then in the Render dashboard for the backend service set environment variables:

- `SCRAPE_TOKEN_SECRET` — the value from Task 5
- `CORS_ORIGIN` — leave as `http://localhost:3000` for now; corrected in step 5

Deploy, then confirm it is alive and closed:

```bash
curl -s https://<your-backend>.onrender.com/health
curl -s -o /dev/null -w "%{http_code}\n" "https://<your-backend>.onrender.com/scrape?query=test"
```

Expected: health returns `{"status":"ok",...}`; scrape returns `401`.

- [ ] **Step 3: Deploy the frontend**

In the Vercel project, set:

- `DATABASE_URL` — the Neon pooled string
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `SCRAPE_TOKEN_SECRET` — identical to the backend's
- `NEXT_PUBLIC_SCRAPER_API_URL` — the Render URL from step 2

Confirm none of `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, or `GOOGLE_SHEETS_CREDENTIALS` is present — this design has no service account. Deploy, and copy the resulting domain.

- [ ] **Step 4: Add the production redirect URI and publish the consent screen**

In Google Cloud Console → Credentials → your OAuth client → Authorized redirect URIs, add:

```
https://<your-vercel-domain>/api/auth/callback/google
```

Sign-in fails with `redirect_uri_mismatch` until this is saved.

Then decide the consent screen's audience. While it stays in **Testing**, only accounts listed under Test users can sign in — everyone else gets `Error 403: access_denied`, capped at 100 users. Because `drive.file` is a non-sensitive scope, **Publish app** requires no Google verification review. Publish it if real clients will sign in; leave it in Testing while only you and your test accounts use it.

- [ ] **Step 5: Point CORS at the real domain**

In Render, set `CORS_ORIGIN` to `https://<your-vercel-domain>` and redeploy the backend.

- [ ] **Step 6: Run the production smoke check**

From the spec, against the live domain:

1. Sign in with a second Google account.
2. The sheet appears in that account's **My Drive**, owned by them.
3. Scrape 10 leads; rows land in that sheet.
4. Scrape the same query again; duplicates are skipped.
5. `curl` the Render `/scrape` URL with no token; expect `401`.

Expect the first scrape after an idle period to hang ~50 seconds — the Render free instance sleeps after 15 minutes and cold-starts.

- [ ] **Step 7: Update both READMEs**

Both currently describe a single hard-coded spreadsheet. Update the setup sections to describe: signing in with Google, the sheet being created automatically, and the environment variables from `.env.example` in each repo. Remove every mention of `GOOGLE_SHEETS_SPREADSHEET_ID`.

- [ ] **Step 8: Commit**

```bash
git add package.json README.md
git commit -m "chore: run migrations on deploy and document the multi-user setup"
```

In the backend repo:

```bash
git add README.md
git commit -m "chore: document scrape token and CORS configuration"
```

---

## Notes for the implementer

**Keeping the backend awake.** The Render free instance sleeps after 15 minutes idle, making the first scrape wait ~50 seconds. A free cron ping (cron-job.org) hitting `/health` every 14 minutes uses about 730 of the 750 monthly instance hours. Optional, and deliberately not part of any task.

**Deferred by the spec, do not build:** proxy support for scraping, a durable job queue, billing, quotas, and usage history. The `maxLeads` claim in the scrape token is the hook a future per-user cap would use.
