export interface BusinessLead {
  name?: string;
  emails?: string[];
  website?: string;
  phones?: string[];
}

export interface ScrapeResponse {
  success: boolean;
  data?: BusinessLead[];
  error?: string;
  partial?: boolean;
}

export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  totalLeads: number;
  delay?: number;
}

export type ProgressCallback = (progress: BatchProgress) => void;

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

  if (typeof data.token !== "string") {
    throw new Error("Could not get a scrape token");
  }

  return data.token;
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

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const limit = batchSize;

    console.log(`Fetching batch ${i + 1}/${numBatches}...`);

    // Mint a fresh token for each batch: a full run (up to 6 batches, each
    // ~110-135s) can outlive a single token's lifetime.
    let token: string;

    try {
      token = await fetchScrapeToken();
    } catch (error) {
      authFailureMessage =
        error instanceof Error ? error.message : "Could not authenticate";
      errorOccurred = true;
      break;
    }

    try {
      const response = await scrapeBusinesses(query, start, limit, token);

      if (response.success && response.data) {
        allResults.push(...response.data);

        if (onBatchSaved) {
          try {
            await onBatchSaved(response.data);
          } catch (saveError) {
            console.error(`Failed to save batch ${i + 1}:`, saveError);
            saveFailed = true;
          }
        }

        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            currentBatch: i + 1,
            totalBatches: numBatches,
            totalLeads: allResults.length,
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

  if (authFailureMessage) {
    errorParts.push(authFailureMessage);
  } else if (errorOccurred) {
    errorParts.push("Some batches failed to fetch");
  }

  if (saveFailed) {
    errorParts.push("Some batches failed to save to your spreadsheet");
  }

  return {
    success: !errorOccurred || allResults.length > 0,
    data: allResults,
    partial: errorOccurred || saveFailed,
    error: errorParts.length > 0 ? errorParts.join("; ") : undefined,
  };
}
