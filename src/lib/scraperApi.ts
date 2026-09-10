export interface BusinessLead {
  name?: string;
  emails?: string[];
  website?: string;
  phones?: string[];
  /** True only when a dialable WhatsApp number was found, not merely a link. */
  hasWhatsApp?: boolean;
  whatsappLink?: string | null;
  /** The number itself, in +<digits> form, or national form when no country code was present. */
  whatsappNumber?: string | null;
  /** Which signal found it: "maps" | "link" | "widget" | "iframe" | "html" | "text". */
  whatsappSource?: string | null;
}

export interface ScrapeResponse {
  success: boolean;
  data?: BusinessLead[];
  error?: string;
  partial?: boolean;
  /**
   * The run stopped because the account's daily lead cap was reached. The UI
   * shows this as a hard error rather than a generic failure, because unlike a
   * flaky batch it will not resolve by retrying before the UTC reset.
   */
  limitReached?: boolean;
}

/** A grant of daily allowance, plus the token that spends it. */
export interface ScrapeTokenGrant {
  token: string;
  /** Leads this token authorises — may be less than was requested. */
  maxLeads: number;
  /** Daily allowance left after this grant. */
  remaining: number;
}

/** A /api/scrape-token failure that kept the HTTP status, so callers can branch on it. */
export class ScrapeTokenError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScrapeTokenError";
    this.status = status;
  }
}

export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  totalLeads: number;
  delay?: number;
  /** Daily allowance left after the batch's token was minted. */
  remaining?: number;
}

export type ProgressCallback = (progress: BatchProgress) => void;

export type BatchSavedCallback = (leads: BusinessLead[]) => Promise<void>;

/**
 * Mints a scrape token, debiting `requested` leads from the daily allowance.
 *
 * The returned `maxLeads` can be smaller than `requested` when the allowance
 * is nearly spent — callers must scrape `maxLeads`, not what they asked for.
 */
export async function fetchScrapeToken(
  requested: number
): Promise<ScrapeTokenGrant> {
  const response = await fetch("/api/scrape-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requested }),
  });

  if (!response.ok) {
    // 401, 429 and 500 need different advice. 401 is the user's session;
    // retrying after signing in works. 429 is the daily cap, and the server
    // already wrote a message naming the actual limit and the reset time, so
    // pass it through verbatim — a generic string here would throw away the
    // only two facts the user needs. 500 means /api/scrape-token could not
    // sign the token at all — in practice a missing SCRAPE_TOKEN_SECRET on
    // the server — which no amount of retrying by the user will fix, so say
    // so instead of sending everyone into a retry loop against a permanently
    // broken deploy.
    let serverMessage: string | undefined;

    if (response.status === 429) {
      try {
        serverMessage = (await response.json())?.error;
      } catch {
        serverMessage = undefined;
      }
    }

    throw new ScrapeTokenError(
      response.status === 401
        ? "You are signed out. Sign in again to scrape."
        : response.status === 429
        ? serverMessage ??
          "You have reached your daily lead limit. It resets at midnight UTC."
        : response.status >= 500
        ? "The server is not configured correctly and cannot authorize scraping. This is not something retrying will fix — please contact support."
        : "Could not get a scrape token",
      response.status
    );
  }

  const data = await response.json();

  if (typeof data.token !== "string") {
    throw new ScrapeTokenError("Could not get a scrape token", response.status);
  }

  return {
    token: data.token,
    maxLeads: typeof data.maxLeads === "number" ? data.maxLeads : requested,
    remaining: typeof data.remaining === "number" ? data.remaining : 0,
  };
}

/**
 * Fetches business leads from the backend scraper API
 * @param query - Search query (e.g., "Calgary dentists")
 * @param start - Starting index for pagination (default: 0)
 * @param limit - Number of results to fetch (default: 10)
 * @param token - Bearer token authenticating this request
 * @returns Promise with scraped business data
 */
export async function scrapeBusinesses(
  query: string,
  start: number = 0,
  limit: number = 10,
  token: string
): Promise<ScrapeResponse> {
  if (!query.trim()) {
    return {
      success: false,
      error: "Query cannot be empty",
    };
  }

  try {
    // Replace with your actual Render backend URL
    const backendUrl =
      process.env.NEXT_PUBLIC_SCRAPER_API_URL || "http://localhost:3001";
    const url = `${backendUrl}/scrape?query=${encodeURIComponent(
      query
    )}&start=${start}&limit=${limit}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Try multiple possible data locations
    const leads = data.results;

    // Ensure we're returning an array
    const normalizedLeads = Array.isArray(leads) ? leads : [leads];

    return {
      success: true,
      data: normalizedLeads,
    };
  } catch (error) {
    console.error("Scraper API error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch data from scraper API",
    };
  }
}

/**
 * Fetches multiple batches of business leads with pagination and rate limiting
 * @param query - Search query (e.g., "Calgary dentists")
 * @param totalLeads - Total number of leads to fetch
 * @param onProgress - Optional callback to track progress
 * @returns Promise with all scraped business data
 */
export async function scrapeBusinessesBatch(
  query: string,
  totalLeads: number,
  onProgress?: ProgressCallback,
  onBatchSaved?: BatchSavedCallback
): Promise<ScrapeResponse> {
  if (!query.trim()) {
    return {
      success: false,
      error: "Query cannot be empty",
    };
  }

  if (totalLeads <= 0) {
    return {
      success: false,
      error: "Total leads must be greater than 0",
    };
  }

  if (totalLeads > 60) {
    return {
      success: false,
      error: "Maximum 60 leads per session to avoid rate limiting",
    };
  }

  const batchSize = 10;
  const numBatches = Math.ceil(totalLeads / batchSize);
  const allResults: BusinessLead[] = [];
  let errorOccurred = false;
  let saveFailed = false;
  let authFailureMessage: string | undefined;
  let limitReachedMessage: string | undefined;

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;

    console.log(`Fetching batch ${i + 1}/${numBatches}...`);

    // Mint a fresh token for each batch: a full run (up to 6 batches, each
    // ~110-135s) can outlive a single token's lifetime. Each mint also debits
    // the account's daily allowance, so a batch can be granted less than it
    // asked for — or nothing at all.
    let grant: ScrapeTokenGrant;

    try {
      grant = await fetchScrapeToken(batchSize);
    } catch (error) {
      if (error instanceof ScrapeTokenError && error.status === 429) {
        // The daily cap ran out mid-run. Stop, exactly as the scrape-401 and
        // save-failure breaks do: every remaining batch would be refused the
        // same way, and nothing about waiting ~2 minutes per batch changes
        // that before the UTC reset. Everything collected so far is already in
        // allResults and is still returned and downloadable.
        limitReachedMessage = error.message;
        errorOccurred = true;
        break;
      }

      authFailureMessage =
        error instanceof Error ? error.message : "Could not authenticate";
      errorOccurred = true;
      break;
    }

    // Ask the backend for exactly what was paid for. A partial grant near the
    // cap would otherwise request a full batch and scrape leads the allowance
    // never covered.
    const limit = Math.min(batchSize, grant.maxLeads);

    try {
      const response = await scrapeBusinesses(query, start, limit, grant.token);

      if (response.success && response.data) {
        allResults.push(...response.data);

        if (onBatchSaved) {
          try {
            await onBatchSaved(response.data);
          } catch (saveError) {
            console.error(`Failed to save batch ${i + 1}:`, saveError);
            saveFailed = true;
            // Stop, exactly as the scrape-401 break below does. A save failure
            // is effectively never transient — a revoked Drive grant, an
            // expired refresh token, a dead spreadsheet — so continuing would
            // spend ~2 minutes scraping each remaining batch only to fail to
            // save every one of them. Everything collected so far is already
            // in allResults and is still returned and downloadable.
            break;
          }
        }

        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            currentBatch: i + 1,
            totalBatches: numBatches,
            totalLeads: allResults.length,
            remaining: grant.remaining,
          });
        }
      } else {
        console.error(`Error in batch ${i + 1}:`, response.error);
        errorOccurred = true;

        if (response.error?.includes("401")) {
          // The token was rejected mid-run; further batches cannot succeed.
          authFailureMessage = "You are signed out. Sign in again to scrape.";
          break;
        }
      }

      // Add 5-8 second delay between API calls (except for last batch)
      if (i < numBatches - 1) {
        const delay = 5000 + Math.random() * 3000; // 5-8 seconds
        console.log(
          `Waiting ${Math.round(delay / 1000)}s before next request...`
        );

        // Call progress callback with delay info
        if (onProgress) {
          onProgress({
            currentBatch: i + 1,
            totalBatches: numBatches,
            totalLeads: allResults.length,
            delay: Math.round(delay / 1000),
            remaining: grant.remaining,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`Error fetching batch ${i + 1}:`, error);
      errorOccurred = true;
    }
  }

  const errorParts: string[] = [];

  if (limitReachedMessage) {
    errorParts.push(
      `${limitReachedMessage} The run stopped early because your daily lead limit was reached. The ${allResults.length} leads fetched before that point are shown below and can still be downloaded.`
    );
  } else if (authFailureMessage) {
    errorParts.push(authFailureMessage);
  } else if (errorOccurred) {
    errorParts.push("Some batches failed to fetch");
  }

  if (saveFailed) {
    errorParts.push(
      "Saving to your spreadsheet failed, so the run stopped early. The leads fetched before that point are shown below and can still be downloaded."
    );
  }

  return {
    success: !errorOccurred || allResults.length > 0,
    data: allResults,
    partial: errorOccurred || saveFailed,
    limitReached: limitReachedMessage !== undefined,
    error: errorParts.length > 0 ? errorParts.join("; ") : undefined,
  };
}
