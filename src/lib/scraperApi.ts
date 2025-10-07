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
}

export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  totalLeads: number;
  delay?: number;
}

export type ProgressCallback = (progress: BatchProgress) => void;

/**
 * Fetches business leads from the backend scraper API
 * @param query - Search query (e.g., "Calgary dentists")
 * @param start - Starting index for pagination (default: 0)
 * @param limit - Number of results to fetch (default: 10)
 * @returns Promise with scraped business data
 */
export async function scrapeBusinesses(
  query: string,
  start: number = 0,
  limit: number = 10
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
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Enhanced logging for debugging
    console.log("=== SCRAPER API RESPONSE DEBUG ===");
    console.log("Raw response:", data);
    console.log("Response keys:", Object.keys(data));

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
  onProgress?: ProgressCallback
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

  for (let i = 0; i < numBatches; i++) {
    const start = i * batchSize;
    const limit = batchSize;

    console.log(`Fetching batch ${i + 1}/${numBatches}...`);

    try {
      const response = await scrapeBusinesses(query, start, limit);

      if (response.success && response.data) {
        allResults.push(...response.data);

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

  return {
    success: !errorOccurred || allResults.length > 0,
    data: allResults,
    error: errorOccurred ? "Some batches failed to fetch" : undefined,
  };
}
