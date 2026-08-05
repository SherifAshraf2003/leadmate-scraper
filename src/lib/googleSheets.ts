import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { BusinessLead } from "./scraperApi";

/**
 * Creates a unique key for a business lead to identify duplicates
 */
const createLeadKey = (lead: BusinessLead): string => {
  // Use combination of name and website/email/phone to identify duplicates
  const identifier = lead.name?.toLowerCase().trim() || "";
  const contact =
    lead.website?.toLowerCase().trim() ||
    lead.emails?.[0]?.toLowerCase().trim() ||
    lead.phones?.[0]?.replace(/\D/g, "") ||
    "";

  return `${identifier}|${contact}`;
};

/**
 * Converts a BusinessLead to a row array for Google Sheets
 */
const leadToRow = (lead: BusinessLead): string[] => {
  return [
    lead.name || "",
    lead.emails?.join(", ") || "",
    lead.phones?.join(", ") || "",
    lead.website || "",
    new Date().toISOString(), // Timestamp
  ];
};

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  auth: OAuth2Client;
  sheetName?: string;
}

/**
 * Appends business leads to Google Sheets and removes duplicates
 * @param leads - Array of business leads to append
 * @param config - Google Sheets configuration
 * @returns Object with success status and details
 */
export async function appendLeadsToSheet(
  leads: BusinessLead[],
  config: GoogleSheetsConfig
): Promise<{
  success: boolean;
  newLeadsAdded: number;
  duplicatesSkipped: number;
  totalLeads: number;
  error?: string;
  notFound?: boolean;
}> {
  try {
    console.log("🔵 Starting appendLeadsToSheet with", leads.length, "leads");
    const { spreadsheetId, auth, sheetName = "Leads" } = config;
    const sheets = google.sheets({ version: "v4", auth });

    // Get existing data (bounded window for dedupe)
    console.log("🔵 Getting existing data from sheet...");
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const rowCount =
      metadata.data.sheets?.find((s) => s.properties?.title === sheetName)
        ?.properties?.gridProperties?.rowCount ?? 0;

    const firstRow = Math.max(2, rowCount - 4999);

    const existingDataResponse = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [`${sheetName}!A${firstRow}:A`, `${sheetName}!D${firstRow}:D`],
    });

    const names = existingDataResponse.data.valueRanges?.[0]?.values ?? [];
    const websites = existingDataResponse.data.valueRanges?.[1]?.values ?? [];

    const existingKeys = new Set(
      names.map((row, index) =>
        createLeadKey({
          name: row?.[0] || undefined,
          website: websites[index]?.[0] || undefined,
        })
      )
    );
    console.log("🔵 Found", existingKeys.size, "existing keys");

    // Filter out duplicates from new leads
    const uniqueNewLeads = leads.filter((lead) => {
      const key = createLeadKey(lead);
      return !existingKeys.has(key);
    });

    const duplicatesSkipped = leads.length - uniqueNewLeads.length;
    console.log(
      "🔵 Unique new leads:",
      uniqueNewLeads.length,
      "Duplicates:",
      duplicatesSkipped
    );

    // Append new unique leads
    if (uniqueNewLeads.length > 0) {
      const newRows = uniqueNewLeads.map(leadToRow);
      console.log("🔵 Appending", newRows.length, "rows to sheet...");
      console.log("🔵 First row sample:", JSON.stringify(newRows[0]));

      const appendResponse = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:E`,
        valueInputOption: "RAW",
        requestBody: {
          values: newRows,
        },
      });

      console.log("✅ Append successful:", appendResponse.data.updates);
    } else {
      console.log("⚠️ No new unique leads to append");
    }

    const totalLeads = existingKeys.size + uniqueNewLeads.length;

    return {
      success: true,
      newLeadsAdded: uniqueNewLeads.length,
      duplicatesSkipped,
      totalLeads,
    };
  } catch (error) {
    console.error("Error appending leads to Google Sheets:", error);

    const notFound =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 404;

    return {
      success: false,
      newLeadsAdded: 0,
      duplicatesSkipped: 0,
      totalLeads: 0,
      notFound,
      error:
        error instanceof Error
          ? error.message
          : "Failed to append leads to Google Sheets",
    };
  }
}
