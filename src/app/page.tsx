"use client";

import { useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  scrapeBusinesses,
  scrapeBusinessesBatch,
  fetchScrapeToken,
  type BusinessLead,
  type BatchProgress,
} from "@/lib/scraperApi";

// Download results as CSV
const downloadCSV = (data: BusinessLead[]) => {
  const headers = ["Name", "Email", "Phone", "Website"];
  const csvContent = [
    headers.join(","),
    ...data.map((item) =>
      [
        item.name || "",
        item.emails ? item.emails.join("; ") : "",
        item.phones
          ? item.phones.map((p) => p.replace(/[()]/g, "")).join("; ")
          : "",
        item.website || "",
      ]
        .map((field) => `"${field.replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Download results as JSON
const downloadJSON = (data: BusinessLead[]) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Copy to clipboard
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BusinessLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [totalLeads, setTotalLeads] = useState(10);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(
    null
  );
  const [sheetsStatus, setSheetsStatus] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const { data: session, status } = useSession();
  const savedTotalsRef = useRef({ newLeadsAdded: 0, duplicatesSkipped: 0 });

  // Only holds an id this page learned during *this* session — from a save, a
  // provision, or the 404-replacement swap in /api/save-to-sheets. The
  // authoritative value for a returning user comes from the session, which the
  // `session` callback in src/auth.ts populates straight off the User row.
  // Deriving rather than seeding useState matters because useSession() starts
  // as `loading` with no user: a useState initializer would run once against
  // `undefined` and never see the id arrive, leaving a user with hundreds of
  // saved leads staring at "Set up your sheet" on every page load.
  const [freshSpreadsheetId, setFreshSpreadsheetId] = useState<string | null>(
    null
  );
  const spreadsheetId =
    freshSpreadsheetId ?? session?.user?.spreadsheetId ?? null;

  const saveLeads = async (leads: BusinessLead[]) => {
    const response = await fetch("/api/save-to-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads }),
    });

    const data = await response.json();

    if (data.success) {
      setFreshSpreadsheetId(data.data.spreadsheetId);
      savedTotalsRef.current = {
        newLeadsAdded:
          savedTotalsRef.current.newLeadsAdded + (data.data.newLeadsAdded ?? 0),
        duplicatesSkipped:
          savedTotalsRef.current.duplicatesSkipped +
          (data.data.duplicatesSkipped ?? 0),
      };
      setSheetsStatus(
        `✅ Saved to your sheet: ${savedTotalsRef.current.newLeadsAdded} new, ${savedTotalsRef.current.duplicatesSkipped} duplicates skipped`
      );
    } else {
      const message = data.error || "Failed to save to your spreadsheet";
      setSheetsStatus(`⚠️ Google Sheets: ${message}`);
      throw new Error(message);
    }
  };

  const handleProvision = async () => {
    setProvisioning(true);

    try {
      const response = await fetch("/api/provision-sheet", { method: "POST" });
      const data = await response.json();

      if (data.spreadsheetId) {
        setFreshSpreadsheetId(data.spreadsheetId);
        setSheetsStatus(null);
      } else {
        setSheetsStatus(
          `⚠️ Could not create your sheet: ${data.error || "Unknown error"}`
        );
      }
    } catch (err) {
      setSheetsStatus(
        `⚠️ Could not create your sheet: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setProvisioning(false);
    }
  };

  const handleScrape = async () => {
    if (!query.trim()) {
      setError("Please enter a search query");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setBatchProgress(null);
    setSheetsStatus(null);
    setPartialWarning(null);
    savedTotalsRef.current = { newLeadsAdded: 0, duplicatesSkipped: 0 };

    try {
      let response;

      if (totalLeads > 10) {
        response = await scrapeBusinessesBatch(
          query,
          totalLeads,
          (progress) => setBatchProgress(progress),
          saveLeads
        );
      } else {
        const token = await fetchScrapeToken();
        response = await scrapeBusinesses(query, 0, totalLeads, token);

        if (response.success && response.data) {
          try {
            await saveLeads(response.data);
          } catch (saveError) {
            setPartialWarning(
              saveError instanceof Error
                ? saveError.message
                : "Some leads may not have reached your spreadsheet"
            );
          }
        }
      }

      if (response.success && response.data) {
        setResults(response.data);
        setBatchProgress(null);

        if (response.partial && response.error) {
          setPartialWarning(response.error);
        }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      handleScrape();
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-4xl font-bold">Leads Scraper</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-md">
          Sign in with Google. We&apos;ll create a spreadsheet for you and save
          every lead you scrape straight into it.
        </p>
        <button
          onClick={() => signIn("google")}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-lg transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 sm:py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-end items-center gap-4 mb-6 text-sm">
          {spreadsheetId ? (
            <a
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Your leads sheet →
            </a>
          ) : (
            <button
              onClick={handleProvision}
              disabled={provisioning}
              className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {provisioning ? "Setting up…" : "Set up your sheet"}
            </button>
          )}
          <span className="text-gray-500 dark:text-gray-400">{session.user?.email}</span>
          <button
            onClick={() => signOut()}
            className="text-gray-500 dark:text-gray-400 hover:underline"
          >
            Sign out
          </button>
        </div>
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-2xl mb-6 shadow-lg">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-4">
            Leads Scraper
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Extract business leads from the web with ease
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-2xl p-8 mb-8 border border-gray-200/50 dark:border-gray-700/50">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  id="query"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., Calgary dentists, software companies in Toronto..."
                  className="w-full px-5 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200 shadow-sm"
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col sm:w-40">
                <label
                  htmlFor="totalLeads"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Number of Leads
                </label>
                <input
                  id="totalLeads"
                  type="number"
                  min="1"
                  max="60"
                  value={totalLeads}
                  onChange={(e) =>
                    setTotalLeads(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="px-4 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 shadow-sm"
                  disabled={loading}
                />
              </div>
              <button
                onClick={handleScrape}
                disabled={loading}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all duration-200 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none text-lg"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Scraping...
                  </span>
                ) : (
                  "🔍 Scrape Leads"
                )}
              </button>
            </div>
            {/* Quick select buttons */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 self-center">
                Quick select:
              </span>
              {[10, 20, 30, 40, 50, 60].map((num) => (
                <button
                  key={num}
                  onClick={() => setTotalLeads(num)}
                  disabled={loading}
                  className={`px-3 py-1 text-sm rounded-lg transition-all ${
                    totalLeads === num
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {num}
                </button>
              ))}
            </div>
            {/* Rate limiting info */}
            {totalLeads > 30 && (
              <div className="bg-amber-50/80 dark:bg-amber-900/20 backdrop-blur-sm border border-amber-300 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    <strong>High volume request:</strong> This will fetch{" "}
                    {Math.ceil(totalLeads / 10)} batches with 5-8 second delays
                    between requests. Estimated time: ~
                    {Math.ceil((totalLeads / 10 - 1) * 6.5)} seconds. Consider
                    waiting 30-60 minutes between sessions to avoid rate
                    limiting.
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Best Practices Info */}
        {!loading && !results && !error && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 backdrop-blur-sm border border-blue-200 dark:border-blue-800 rounded-2xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              Rate Limiting Best Practices
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                  ✅ Recommended Limits
                </h4>
                <ul className="space-y-1 text-blue-700 dark:text-blue-400">
                  <li>• Conservative: 20 leads (safe for most cases)</li>
                  <li>• Moderate: 30-40 leads (with delays)</li>
                  <li>• Maximum: 60 leads (use with caution)</li>
                  <li>• Wait 30-60 min between sessions</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                  ⚠️ Avoid
                </h4>
                <ul className="space-y-1 text-blue-700 dark:text-blue-400">
                  <li>• Exceeding 100 leads per hour</li>
                  <li>• Same query multiple times in a row</li>
                  <li>• Running during off-hours (looks suspicious)</li>
                  <li>• Skipping the automatic delays</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <strong>💡 Pro tip:</strong> Batch mode automatically adds 5-8
                second delays between requests to avoid rate limiting and appear
                more human-like.
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl p-12 text-center border border-gray-200/50 dark:border-gray-700/50">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 mb-6"></div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {batchProgress
                ? `Fetching batch ${batchProgress.currentBatch} of ${batchProgress.totalBatches}...`
                : "Searching for leads..."}
            </h3>
            {batchProgress ? (
              <div className="max-w-md mx-auto">
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>
                      {batchProgress.totalLeads} leads collected so far
                    </span>
                    <span>
                      {Math.round(
                        (batchProgress.currentBatch /
                          batchProgress.totalBatches) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300 ease-out"
                      style={{
                        width: `${
                          (batchProgress.currentBatch /
                            batchProgress.totalBatches) *
                          100
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>
                {batchProgress.delay && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ⏳ Waiting {batchProgress.delay}s before next batch (rate
                    limiting)...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">
                This may take a minute. Please be patient.
              </p>
            )}
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50/80 dark:bg-red-900/20 backdrop-blur-sm border-2 border-red-300 dark:border-red-800 rounded-2xl p-6 mb-8 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center">
                  <svg
                    className="h-6 w-6 text-red-600 dark:text-red-400"
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
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-1">
                  Oops! Something went wrong
                </h3>
                <p className="text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Google Sheets Status */}
        {sheetsStatus && !loading && (
          <div
            className={`${
              sheetsStatus.startsWith("✅")
                ? "bg-green-50/80 dark:bg-green-900/20 border-green-300 dark:border-green-800"
                : "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-800"
            } backdrop-blur-sm border-2 rounded-2xl p-4 mb-6 shadow-lg`}
          >
            <p
              className={`text-sm font-medium ${
                sheetsStatus.startsWith("✅")
                  ? "text-green-700 dark:text-green-300"
                  : "text-yellow-700 dark:text-yellow-300"
              }`}
            >
              {sheetsStatus}
            </p>
          </div>
        )}

        {/* Partial Run Warning */}
        {partialWarning && !loading && (
          <div className="bg-amber-50/80 dark:bg-amber-900/20 backdrop-blur-sm border-2 border-amber-300 dark:border-amber-800 rounded-2xl p-4 mb-6 shadow-lg">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-1">
              ⚠️ Partial run
            </p>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {partialWarning}
            </p>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-gray-200/50 dark:border-gray-700/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  ✨ Results
                </h2>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full text-xs font-semibold shadow">
                    {results.length} {results.length === 1 ? "lead" : "leads"}
                  </span>
                  <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-semibold">
                    📞{" "}
                    {
                      results.filter((r) => r.phones && r.phones.length > 0)
                        .length
                    }{" "}
                    phones
                  </span>
                  <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                    ✉️{" "}
                    {
                      results.filter((r) => r.emails && r.emails.length > 0)
                        .length
                    }{" "}
                    emails
                  </span>
                  <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold">
                    🌐 {results.filter((r) => r.website).length} websites
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadCSV(results)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  CSV
                </button>
                <button
                  onClick={() => downloadJSON(results)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg text-sm font-medium flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  JSON
                </button>
              </div>
            </div>

            {/* Warning if no phones found */}
            {results.length > 0 &&
              results.filter((r) => r.phones && r.phones.length > 0).length ===
                0 && (
                <div className="mb-6 bg-amber-50/80 dark:bg-amber-900/20 backdrop-blur-sm border-2 border-amber-300 dark:border-amber-800 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center">
                        <svg
                          className="h-5 w-5 text-amber-600 dark:text-amber-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                        ⚠️ No Phone Numbers Found
                      </h3>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        The scraper didn&apos;t find any phone numbers in the
                        results. This might be because the backend API
                        isn&apos;t returning phone data, or the websites
                        don&apos;t have visible phone numbers. Check the raw
                        JSON below to see what data was returned.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {results.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">😞</div>
                <p className="text-xl text-gray-500 dark:text-gray-400 mb-2">
                  No results found
                </p>
                <p className="text-gray-400 dark:text-gray-500">
                  Try a different query or search term
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((business, index) => {
                  const leadInfo = [
                    business.name && `Name: ${business.name}`,
                    business.emails && `Email: ${business.emails.join(", ")}`,
                    business.phones &&
                      `Phone: ${business.phones
                        .map((p) => p.replace(/[()]/g, ""))
                        .join(", ")}`,
                    business.website && `Website: ${business.website}`,
                  ]
                    .filter(Boolean)
                    .join("\n");

                  return (
                    <div
                      key={index}
                      className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800/50 border-2 border-gray-200 dark:border-gray-600 rounded-xl p-6 hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-500 transition-all duration-200 transform hover:-translate-y-1"
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        {business.name && (
                          <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-start gap-2 flex-1">
                            <span className="text-blue-600 dark:text-blue-400 mt-1">
                              ▸
                            </span>
                            {business.name}
                          </h3>
                        )}
                        <button
                          onClick={() => {
                            copyToClipboard(leadInfo);
                            setCopiedIndex(index);
                            setTimeout(() => setCopiedIndex(null), 2000);
                          }}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
                          title="Copy lead info"
                        >
                          {copiedIndex === index ? (
                            <>
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <div className="space-y-3">
                        {business.emails && business.emails.length > 0 && (
                          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 group">
                            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                              <svg
                                className="w-4 h-4 text-blue-600 dark:text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 flex flex-wrap gap-1">
                              {business.emails.map((email, i) => (
                                <a
                                  key={i}
                                  href={`mailto:${email}`}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline"
                                >
                                  {email}
                                  {i < business.emails!.length - 1 && ","}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {business.phones && business.phones.length > 0 && (
                          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 group">
                            <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-800/50 transition-colors">
                              <svg
                                className="w-4 h-4 text-green-600 dark:text-green-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 flex flex-wrap gap-1">
                              {business.phones.map((phone, i) => (
                                <a
                                  key={i}
                                  href={`tel:${phone}`}
                                  className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium hover:underline"
                                >
                                  {phone.replace(/[()]/g, "")}
                                  {i < business.phones!.length - 1 && ","}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {business.website && (
                          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300 group">
                            <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-800/50 transition-colors">
                              <svg
                                className="w-4 h-4 text-purple-600 dark:text-purple-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                />
                              </svg>
                            </div>
                            <a
                              href={business.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium hover:underline flex-1 truncate"
                            >
                              {business.website}
                            </a>
                          </div>
                        )}

                        {(!business.emails || business.emails.length === 0) &&
                          (!business.phones || business.phones.length === 0) &&
                          !business.website && (
                            <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                              No contact details available
                            </p>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Raw JSON View */}
            <details className="mt-8">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-5 py-3 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-900/50 dark:to-gray-800/50 rounded-xl hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-800 dark:hover:to-gray-700 transition-all shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                🔍 View raw JSON data (for debugging)
              </summary>
              <div className="mt-4 bg-gray-900 dark:bg-black rounded-xl overflow-hidden shadow-inner border border-gray-700">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                  <span className="text-xs font-medium text-gray-400">
                    API Response Data
                  </span>
                  <button
                    onClick={() => {
                      copyToClipboard(JSON.stringify(results, null, 2));
                      setCopiedIndex(-1);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                    className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {copiedIndex === -1 ? (
                      <>
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-6 overflow-x-auto text-xs text-green-400 font-mono max-h-96 overflow-y-auto">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
