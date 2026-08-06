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
