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

  // Conditional write: guards against a concurrent caller (createUser event, the retry route,
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
