"use client";

import { useState } from "react";
import { scrapeBusinesses, type BusinessLead } from "@/lib/scraperApi";

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BusinessLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScrape = async () => {
    if (!query.trim()) {
      setError("Please enter a search query");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await scrapeBusinesses(query);

      if (response.success && response.data) {
        setResults(response.data);
      } else {
        setError(response.error || "Failed to scrape businesses");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      handleScrape();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            LeadMate Scraper
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Extract business leads from Google Maps
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter search query (e.g., Calgary dentists)"
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              disabled={loading}
            />
            <button
              onClick={handleScrape}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
            >
              {loading ? "Scraping..." : "Scrape"}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">
              Searching for leads... This may take a minute.
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Results
              </h2>
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
                {results.length} {results.length === 1 ? "lead" : "leads"}
              </span>
            </div>

            {results.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No results found. Try a different query.
              </p>
            ) : (
              <div className="space-y-4">
                {results.map((business, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    {business.name && (
                      <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                        {business.name}
                      </h3>
                    )}
                    <div className="space-y-1 text-sm">
                      {business.email && (
                        <div className="flex items-center text-gray-700 dark:text-gray-300">
                          <span className="font-medium w-20">Email:</span>
                          <a
                            href={`mailto:${business.email}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {business.email}
                          </a>
                        </div>
                      )}
                      {business.phone && (
                        <div className="flex items-center text-gray-700 dark:text-gray-300">
                          <span className="font-medium w-20">Phone:</span>
                          <a
                            href={`tel:${business.phone}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {business.phone}
                          </a>
                        </div>
                      )}
                      {business.website && (
                        <div className="flex items-center text-gray-700 dark:text-gray-300">
                          <span className="font-medium w-20">Website:</span>
                          <a
                            href={business.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {business.website}
                          </a>
                        </div>
                      )}
                      {business.address && (
                        <div className="flex items-center text-gray-700 dark:text-gray-300">
                          <span className="font-medium w-20">Address:</span>
                          <span>{business.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Raw JSON View */}
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                View raw JSON
              </summary>
              <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-x-auto text-xs">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
