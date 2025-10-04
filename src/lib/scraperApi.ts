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

/**
 * Fetches business leads from the backend scraper API
 * @param query - Search query (e.g., "Calgary dentists")
 * @returns Promise with scraped business data
 */
export async function scrapeBusinesses(query: string): Promise<ScrapeResponse> {
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
    const url = `${backendUrl}/scrape?query=${encodeURIComponent(query)}`;

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
