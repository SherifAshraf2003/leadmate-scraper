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
