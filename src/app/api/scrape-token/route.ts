import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { consumeLeadAllowance } from "@/lib/scrapeUsage";
import {
  DEFAULT_LEADS_PER_TOKEN,
  MAX_LEADS_PER_TOKEN,
  scrapeTokenSecret,
  signScrapeToken,
} from "@/lib/scrapeToken";

/**
 * Reads the batch size the client is about to request.
 *
 * This is client-supplied and is never trusted to size the grant: it is
 * clamped to 1..MAX_LEADS_PER_TOKEN, so a hand-rolled `{ requested: 1e9 }`
 * buys 15 leads, not the caller's whole daily cap. A missing, malformed or
 * absent body falls back to the default batch size rather than failing — the
 * body is an optimisation, not a requirement.
 */
async function readRequestedLeads(request: NextRequest): Promise<number> {
  let requested: unknown;

  try {
    const body = await request.json();
    requested = (body as { requested?: unknown })?.requested;
  } catch {
    return DEFAULT_LEADS_PER_TOKEN;
  }

  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_LEADS_PER_TOKEN;
  }

  return Math.min(
    MAX_LEADS_PER_TOKEN,
    Math.max(1, Math.floor(requested))
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = await readRequestedLeads(request);

  try {
    // Fail on a missing secret *before* debiting the allowance. The 500 below
    // is unchanged, but a deploy with no SCRAPE_TOKEN_SECRET would otherwise
    // spend a user's daily leads on tokens it then cannot sign.
    scrapeTokenSecret();

    const { granted, remaining, limit } = await consumeLeadAllowance(
      session.user.id,
      requested
    );

    if (granted === 0) {
      return NextResponse.json(
        {
          error: `Daily limit of ${limit} leads reached. It resets at midnight UTC.`,
          maxLeads: 0,
          remaining: 0,
        },
        { status: 429 }
      );
    }

    return NextResponse.json({
      token: signScrapeToken(session.user.id, granted),
      maxLeads: granted,
      remaining,
    });
  } catch (error) {
    console.error("Failed to sign scrape token:", error);

    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
}
