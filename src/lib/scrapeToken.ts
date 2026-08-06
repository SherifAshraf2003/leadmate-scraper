import jwt from "jsonwebtoken";

export const MAX_LEADS_PER_RUN = 60;
export const TOKEN_TTL_SECONDS = 600;

/**
 * Ceiling on the leads a single token may authorise. The backend clamps with
 * `Math.min(requestedLimit, MAX_SEARCH_RESULTS, req.user?.maxLeads)` where its
 * `MAX_SEARCH_RESULTS` is 15, so asking for more than 15 in one token can
 * never buy more than 15 — it would only burn daily allowance that the run
 * cannot spend.
 */
export const MAX_LEADS_PER_TOKEN = 15;

/** Leads a token authorises when the caller does not say. Matches `batchSize`. */
export const DEFAULT_LEADS_PER_TOKEN = 10;

export function scrapeTokenSecret(): string {
  const secret = process.env.SCRAPE_TOKEN_SECRET;

  if (!secret) {
    throw new Error("SCRAPE_TOKEN_SECRET environment variable is not set");
  }

  return secret;
}

/**
 * Signs a scrape token.
 *
 * `maxLeads` is the claim the backend clamps the run against. It used to be the
 * constant `MAX_LEADS_PER_RUN` (60), which sat above the backend's own limit of
 * 15 and so never bound anything. It is now the allowance actually granted to
 * this batch by `consumeLeadAllowance`, which makes the claim load-bearing:
 * a token can only ever spend leads that were already debited.
 */
export function signScrapeToken(userId: string, maxLeads: number): string {
  return jwt.sign({ userId, maxLeads }, scrapeTokenSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}
