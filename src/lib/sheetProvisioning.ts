import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "./prisma";
import { getUserGoogleClient } from "./googleClient";

export const LEAD_HEADERS = [
  "Name",
  "Emails",
  "Phones",
  "Website",
  "Date Added",
  // Appended rather than inserted so the columns of sheets provisioned
  // before WhatsApp capture existed do not shift under their data.
  "WhatsApp",
  "WhatsApp Source",
];

/**
 * Last column letter the header row occupies, derived from LEAD_HEADERS so
 * that adding a column does not require finding every hardcoded A1:E1 range.
 * Correct while LEAD_HEADERS stays within 26 columns, which the two-letter
 * case would otherwise need to handle.
 */
export const LEAD_LAST_COLUMN = String.fromCharCode(
  "A".charCodeAt(0) + LEAD_HEADERS.length - 1
);

/**
 * Creates a new spreadsheet with the Leads tab and headers in the user's
 * Drive. Pure creation only — does not read or write the database, so
 * callers control exactly when (and whether) the returned id is persisted.
 *
 * Pass `client` when the caller already holds a client for this user (a
 * request that both provisions and appends needs exactly one), so the account
 * lookup and any token refresh happen once per request instead of per call.
 */
export async function createSheetForUser(
  user: {
    id: string;
    email: string;
  },
  client?: OAuth2Client
): Promise<string> {
  const authClient = client ?? (await getUserGoogleClient(user.id));
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `Leads — ${user.email}` },
      sheets: [{ properties: { title: "Leads" } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;
  const sheetId = created.data.sheets?.[0]?.properties?.sheetId;

  if (!spreadsheetId || sheetId === undefined || sheetId === null) {
    throw new Error("Sheets API did not return a spreadsheet id");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Leads!A1:${LEAD_LAST_COLUMN}1`,
    valueInputOption: "RAW",
    requestBody: { values: [LEAD_HEADERS] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    },
  });

  return spreadsheetId;
}

export async function provisionSheetForUser(
  user: {
    id: string;
    email: string;
  },
  client?: OAuth2Client
): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { spreadsheetId: true },
  });

  if (existing?.spreadsheetId) {
    return existing.spreadsheetId;
  }

  const spreadsheetId = await createSheetForUser(user, client);

  // Conditional write: guards against a concurrent caller (the linkAccount event, the retry route,
  // and Task 4's on-demand path can all race) that read spreadsheetId === null at the same time
  // and also created a sheet. Only the first writer's id gets stored; the loser's sheet is
  // orphaned in Drive but the database stays consistent and every caller converges on one id.
  const updated = await prisma.user.updateMany({
    where: { id: user.id, spreadsheetId: null },
    data: { spreadsheetId },
  });

  if (updated.count === 0) {
    const winner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { spreadsheetId: true },
    });

    if (winner?.spreadsheetId) {
      return winner.spreadsheetId;
    }
  }

  return spreadsheetId;
}
