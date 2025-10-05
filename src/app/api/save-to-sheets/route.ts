import { NextRequest, NextResponse } from "next/server";
import { appendLeadsToSheet } from "@/lib/googleSheets";
import { BusinessLead } from "@/lib/scraperApi";

export async function POST(request: NextRequest) {
  try {
    const { leads } = await request.json();

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: "Invalid request: leads array is required" },
        { status: 400 }
      );
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error:
            "Google Sheets is not configured. Please set GOOGLE_SHEETS_SPREADSHEET_ID environment variable.",
        },
        { status: 500 }
      );
    }

    const result = await appendLeadsToSheet(leads as BusinessLead[], {
      spreadsheetId,
      sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || "Leads",
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to save leads to Google Sheets" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully saved ${result.newLeadsAdded} new leads to Google Sheets`,
      data: {
        newLeadsAdded: result.newLeadsAdded,
        duplicatesSkipped: result.duplicatesSkipped,
        totalLeads: result.totalLeads,
      },
    });
  } catch (error) {
    console.error("Error in save-to-sheets API:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
