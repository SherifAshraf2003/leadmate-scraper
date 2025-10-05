import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { BusinessLead } from "./scraperApi";

// Initialize Google Sheets API
const getGoogleSheetsClient = () => {
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;

  if (!credentials) {
    throw new Error(
      "GOOGLE_SHEETS_CREDENTIALS environment variable is not set"
    );
  }

  const credentialsObj = JSON.parse(credentials);

  const auth = new JWT({
    email: credentialsObj.client_email,
    key: credentialsObj.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
};

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

/**
 * Converts a row array back to a BusinessLead object
 */
const rowToLead = (row: string[]): BusinessLead => {
  return {
    name: row[0] || undefined,
    emails: row[1] ? row[1].split(", ").filter(Boolean) : undefined,
    phones: row[2] ? row[2].split(", ").filter(Boolean) : undefined,
    website: row[3] || undefined,
  };
};

export interface GoogleSheetsConfig {
  spreadsheetId: string;
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
}> {
  try {
    console.log("🔵 Starting appendLeadsToSheet with", leads.length, "leads");
    const sheets = getGoogleSheetsClient();
    const { spreadsheetId, sheetName = "Leads" } = config;

    console.log("🔵 Ensuring sheet exists:", { spreadsheetId, sheetName });
    // Ensure the sheet exists and has headers
    await ensureSheetExists(sheets, spreadsheetId, sheetName);
    console.log("✅ Sheet exists and headers are set");

    // Get existing data
    console.log("🔵 Getting existing data from sheet...");
    const existingDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:E`, // Skip header row
    });

    const existingRows = existingDataResponse.data.values || [];
    console.log("🔵 Found", existingRows.length, "existing rows");
    const existingLeads = existingRows.map(rowToLead);

    // Create a set of existing lead keys for duplicate detection
    const existingKeys = new Set(existingLeads.map(createLeadKey));

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

    const totalLeads = existingLeads.length + uniqueNewLeads.length;

    return {
      success: true,
      newLeadsAdded: uniqueNewLeads.length,
      duplicatesSkipped,
      totalLeads,
    };
  } catch (error) {
    console.error("Error appending leads to Google Sheets:", error);
    return {
      success: false,
      newLeadsAdded: 0,
      duplicatesSkipped: 0,
      totalLeads: 0,
      error:
        error instanceof Error
          ? error.message
          : "Failed to append leads to Google Sheets",
    };
  }
}

/**
 * Ensures the sheet exists with proper headers
 */
async function ensureSheetExists(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  try {
    console.log("🔵 Checking if sheet exists...");
    // Check if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetExists = spreadsheet.data.sheets?.some(
      (sheet) => sheet.properties?.title === sheetName
    );

    console.log("🔵 Sheet exists:", sheetExists);

    // Create sheet if it doesn't exist
    if (!sheetExists) {
      console.log("🔵 Creating new sheet:", sheetName);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
      console.log("✅ Sheet created");
    }

    // Check if headers exist
    console.log("🔵 Checking if headers exist...");
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:E1`,
    });

    const hasHeaders =
      headerResponse.data.values && headerResponse.data.values.length > 0;
    console.log("🔵 Has headers:", hasHeaders);

    // Add headers if they don't exist
    if (!hasHeaders) {
      console.log("🔵 Adding headers to sheet...");
      const updateResult = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:E1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Name", "Emails", "Phones", "Website", "Date Added"]],
        },
      });
      console.log("✅ Headers added:", updateResult.data.updatedCells, "cells");

      // Format headers (bold)
      const sheetId = spreadsheet.data.sheets?.find(
        (sheet) => sheet.properties?.title === sheetName
      )?.properties?.sheetId;

      if (sheetId !== undefined) {
        console.log("🔵 Formatting headers...");
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                  },
                  cell: {
                    userEnteredFormat: {
                      textFormat: {
                        bold: true,
                      },
                      backgroundColor: {
                        red: 0.9,
                        green: 0.9,
                        blue: 0.9,
                      },
                    },
                  },
                  fields: "userEnteredFormat(textFormat,backgroundColor)",
                },
              },
            ],
          },
        });
        console.log("✅ Headers formatted");
      }
    }
  } catch (error) {
    console.error("❌ Error ensuring sheet exists:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw error;
  }
}
