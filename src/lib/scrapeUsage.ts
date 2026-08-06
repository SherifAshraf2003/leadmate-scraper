import { prisma } from "@/lib/prisma";

export interface LeadAllowance {
  /** Leads this call is authorised to scrape. 0 means the cap is exhausted. */
  granted: number;
  /** Allowance left *after* this grant. */
  remaining: number;
  /** The account's `dailyLeadLimit` at the time of the grant. */
  limit: number;
}

/**
 * Midnight UTC for the current day — the `day` key of a `ScrapeUsage` row.
 *
 * The reset boundary is UTC, not the user's local timezone. A user in UTC-7
 * therefore sees their allowance reset at 5pm local. This is deliberate: the
 * `day` column is a bare `DATE` with no timezone attached, and picking UTC
 * keeps the key stable no matter which region the serverless function that
 * writes it happens to run in. The 429 copy says "midnight UTC" out loud so
 * the boundary is never a surprise.
 */
export function todayUtc(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * Claims up to `requested` leads from the user's daily allowance and records
 * the claim, returning how much was actually granted.
 *
 * Grants are best-effort rather than all-or-nothing: with 4 leads left and 10
 * requested you get 4, not an error. `granted: 0` is the "nothing left" signal
 * — this never throws for an exhausted cap.
 *
 * ## Why the explicit row lock
 *
 * The obvious implementation — read usage, compute the grant, `upsert` with
 * `{ increment }`, all inside `$transaction` — does NOT hold the cap, and this
 * was measured rather than assumed. Prisma does compile the upsert to a single
 * native `INSERT ... ON CONFLICT ("userId","day") DO UPDATE SET leads = leads +
 * $n`, so the *write* is atomic. The decision is not: Postgres runs at READ
 * COMMITTED by default, so N concurrent transactions all SELECT the same stale
 * `used` value, all conclude they have room, and all then increment on top of
 * each other. Wrapping the pair in a transaction changes nothing, because
 * READ COMMITTED grants no read-stability. Measured against the live database
 * with 8 concurrent callers requesting 10 each against a limit of 15, that
 * version stored 45, 80 and 80 leads on three runs — up to 5.3x over the cap.
 *
 * Taking `FOR NO KEY UPDATE` on the User row first serialises all mints for
 * one account, so each caller reads usage that already includes every grant
 * before it. Same test, three runs, stored exactly 15 every time.
 *
 * `FOR NO KEY UPDATE` rather than `FOR UPDATE` on purpose: `FOR UPDATE`
 * conflicts with the `FOR KEY SHARE` lock Postgres takes when inserting a row
 * that references this User (a Session at sign-in, or the ScrapeUsage row
 * below), so it would park sign-ins behind an in-flight mint. `FOR NO KEY
 * UPDATE` conflicts only with other writers of this same row, which is exactly
 * the contention we want to serialise.
 *
 * The lock is held for two round trips and released on commit. The app runs
 * serverless behind a pooled Neon connection, so the transaction deliberately
 * does no network I/O beyond those queries — nothing here calls out to Google,
 * the scraper backend, or anything else.
 */
export async function consumeLeadAllowance(
  userId: string,
  requested: number
): Promise<LeadAllowance> {
  const want = Math.max(0, Math.floor(requested));
  const day = todayUtc();

  return prisma.$transaction(async (tx) => {
    // Serialise concurrent mints for this account before reading usage.
    const users = await tx.$queryRaw<{ dailyLeadLimit: number }[]>`
      SELECT "dailyLeadLimit" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE
    `;

    // The session said this user exists; if the row is gone (deleted between
    // the session check and here) there is no allowance to spend.
    if (users.length === 0) {
      return { granted: 0, remaining: 0, limit: 0 };
    }

    const limit = users[0].dailyLeadLimit;

    const usage = await tx.scrapeUsage.findUnique({
      where: { userId_day: { userId, day } },
      select: { leads: true },
    });

    const used = usage?.leads ?? 0;
    const available = Math.max(0, limit - used);
    const granted = Math.min(want, available);

    if (granted > 0) {
      await tx.scrapeUsage.upsert({
        where: { userId_day: { userId, day } },
        update: { leads: { increment: granted } },
        create: { userId, day, leads: granted },
      });
    }

    return { granted, remaining: available - granted, limit };
  });
}
