# Known issues and follow-ups

Findings from the multi-user Sheets linking work (August 2026) that were reviewed,
triaged, and deliberately left unfixed. Each one names the failure it causes so you can
decide when it becomes worth addressing. Nothing here blocks normal use.

## Decide before this grows

**No volume cap of any kind.** The OAuth consent screen is Published, so anyone with a
Google account can sign in, get a spreadsheet provisioned in their own Drive, and run
scrapes. There is no rate limit, no concurrency cap, and the `maxLeads` claim in the
scrape token is inert — the backend clamps with
`Math.min(requestedLimit, MAX_SEARCH_RESULTS, maxLeads)` where `MAX_SEARCH_RESULTS` is
15 and `maxLeads` is 60, so the claim can never be the minimum. The clamp is also
per-request against a per-run budget: a token carries no run identity and the backend
keeps no counter, so one token authorises unlimited requests for its ten-minute life.

One signed-in stranger can launch unbounded parallel Chromium instances against a
512 MB Render instance.

Cheapest mitigation is an email allowlist in a `signIn` callback — roughly ten lines,
keeps Published status, and matches the originally intended audience. A real cap needs
a per-user counter in the database checked at token-mint time.

**Provisioning runs inside the OAuth callback.** `events.linkAccount` is awaited before
the session cookie is set, so sheet creation is on the sign-up critical path. It has
60 seconds of headroom, which is enough today, but headroom is not a structural fix.
Provisioning lazily on first use — which `/api/save-to-sheets` already does — and
dropping it from the sign-in path is the better long-term shape.

## Correctness, low impact

**A middle batch's specific save error is lost.** Each batch's save overwrites
`sheetsStatus`, so when batch 3 fails and batch 4 succeeds, the user keeps the generic
amber "Partial run" warning but the specific cause is gone. Conversely, when the *last*
batch fails, its yellow error overwrites the accumulated green totals.

**A renamed `Leads` tab self-heals into a second empty tab.** If a user renames the tab,
the app recreates an empty `Leads` tab alongside the renamed one holding all their
history, and future scrapes append to the new one. Deleting the tab is handled
correctly; renaming is not.

**Google 403 responses are treated as auth failures.** `quotaExceeded` and
`userRateLimitExceeded` also arrive as 403, so a quota problem tells the user to sign
out and sign in again, which will not help. Narrowing on `error.errors[0].reason` would
fix it.

**Mid-run 401 detection matches a substring.** `scraperApi.ts` detects an expired scrape
token by looking for `"401"` inside the error message built from
`` `HTTP error! status: ${response.status}` ``. No lead data can reach that string, so it
is safe today, but reformatting that template silently breaks the detection. A typed
status would be sturdier.

**Rows with an empty column A are skipped during dedupe.** The dedupe pass maps over the
name column, so a row with a blank name but populated contact details drops out of the
comparison set. Google Maps always yields a name, so this is theoretical.

**CSV export does not neutralise formula characters.** `downloadCSV` quotes fields but
leaves leading `=`, `+`, `-`, and `@` intact, so a hostile business name could execute on
open in a spreadsheet app. The Sheets path is safe — every write uses
`valueInputOption: "RAW"` — so CSV download is the only remaining surface.

**`/api/save-to-sheets` accepts an unbounded `leads` array.** It validates that the body
is an array and nothing more.

## Cosmetic and consistency

- `60` is hardcoded in five places (`scrapeToken.ts`, `scraperApi.ts`, and three spots in
  `page.tsx`) and the `maxLeads` the token endpoint returns is fetched and discarded.
- Orphans: `TOKEN_TTL_SECONDS` is exported and never imported; `GoogleSheetsConfig.sheetName`
  is never supplied by a caller; `result.totalLeads` is computed, returned, and never rendered.
- The three API routes return three different success shapes (`{spreadsheetId}`,
  `{success, data}`, `{token, maxLeads}`), so the client tests success three ways.
- `BATCH_FETCHING_GUIDE.md` documents the old `scrapeBusinesses` and
  `scrapeBusinessesBatch` signatures; both changed.
- The backend README still clones `gmaps-scraper` in Quick Start and roots its project
  tree there.
- The frontend README's troubleshooting suggests running the dev server on port 3001,
  which is the backend's port and would break the OAuth redirect URI.
- The `db:*` npm scripts source `.env.local` through the shell, so a `$` or backtick in a
  password would be mangled. `dotenv-cli` would be immune.
- The frontend `.gitignore` covers `.env` and `.env.local` but not `.env.production` or
  `.env.*.local`.

## Never tested

Two things the whole feature rests on that have not been exercised:

1. **Multi-account isolation** — the headline capability. Everything verified so far used
   a single account. Sign in with a second Google account, confirm it gets its own sheet,
   and confirm neither account's leads reach the other's spreadsheet.
2. **Dedupe on a repeat scrape, specifically for leads without a website.** Re-running the
   same query should skip duplicates rather than re-appending them. The website-less case
   is where a Critical bug lived during development, and the original test payload would
   have missed it because every lead in it had a website.
