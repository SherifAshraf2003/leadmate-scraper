import { google } from "googleapis";
import { prisma } from "./prisma";
import { getUserGoogleClient } from "./googleClient";

export const LEAD_HEADERS = ["Name", "Emails", "Phones", "Website", "Date Added"];

export async function provisionSheetForUser(user: {
  id: string;
  email: string;
}): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { spreadsheetId: true },
  });

  if (existing?.spreadsheetId) {
    return existing.spreadsheetId;
  }

  const authClient = await getUserGoogleClient(user.id);
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
    range: "Leads!A1:E1",
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

  await prisma.user.update({
    where: { id: user.id },
    data: { spreadsheetId },
  });

  return spreadsheetId;
}
