import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { BusinessLead } from "./scraperApi";
import { LEAD_HEADERS } from "./sheetProvisioning";

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
  authFailed?: boolean;
}> {
  try {
    console.log("🔵 Starting appendLeadsToSheet with", leads.length, "leads");
    const { spreadsheetId, auth, sheetName = "Leads" } = config;
    const sheets = google.sheets({ version: "v4", auth });

    // Get existing data (bounded window for dedupe)
    console.log("🔵 Getting existing data from sheet...");
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetMeta = metadata.data.sheets?.find(
      (s) => s.properties?.title === sheetName
    );

    let existingKeys: Set<string>;

    if (!sheetMeta) {
      // The tab was renamed or deleted out from under us, but the spreadsheet
      // itself still exists. Recreate the tab and headers rather than 500ing
      // forever — provisioning's job, done inline since there's nothing to
      // dedupe against in a tab that doesn't exist yet.
      console.log(
        `⚠️ Sheet tab "${sheetName}" not found — recreating it`
      );
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:E1`,
        valueInputOption: "RAW",
        requestBody: { values: [LEAD_HEADERS] },
      });
      existingKeys = new Set();
    } else {
      const rowCount = sheetMeta.properties?.gridProperties?.rowCount ?? 0;
      const firstRow = Math.max(2, rowCount - 4999);

      const existingDataResponse = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: [
          `${sheetName}!A${firstRow}:A`,
          `${sheetName}!B${firstRow}:B`,
          `${sheetName}!C${firstRow}:C`,
          `${sheetName}!D${firstRow}:D`,
        ],
      });

      const names = existingDataResponse.data.valueRanges?.[0]?.values ?? [];
      const emails = existingDataResponse.data.valueRanges?.[1]?.values ?? [];
      const phones = existingDataResponse.data.valueRanges?.[2]?.values ?? [];
      const websites = existingDataResponse.data.valueRanges?.[3]?.values ?? [];

      existingKeys = new Set(
        names.map((row, index) =>
          createLeadKey({
            name: row?.[0] || undefined,
            emails: emails[index]?.[0]
              ? emails[index][0].split(", ").filter(Boolean)
              : undefined,
            phones: phones[index]?.[0]
              ? phones[index][0].split(", ").filter(Boolean)
              : undefined,
            website: websites[index]?.[0] || undefined,
          })
        )
      );
    }
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

    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: number }).code
        : undefined;

    const notFound = errorCode === 404;
    const authFailed = errorCode === 401 || errorCode === 403;

    return {
      success: false,
      newLeadsAdded: 0,
      duplicatesSkipped: 0,
      totalLeads: 0,
      notFound,
      authFailed,
      error:
        error instanceof Error
          ? error.message
          : "Failed to append leads to Google Sheets",
    };
  }
}
