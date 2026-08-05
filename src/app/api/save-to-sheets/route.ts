import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendLeadsToSheet } from "@/lib/googleSheets";
import { provisionSheetForUser } from "@/lib/sheetProvisioning";
import { getUserGoogleClient, GoogleAuthError } from "@/lib/googleClient";
import { BusinessLead } from "@/lib/scraperApi";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leads } = await request.json();

    if (!leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: "Invalid request: leads array is required" },
        { status: 400 }
      );
    }

    const user = { id: session.user.id, email: session.user.email };

    let spreadsheetId = (
      await prisma.user.findUnique({
        where: { id: user.id },
        select: { spreadsheetId: true },
      })
    )?.spreadsheetId;

    if (!spreadsheetId) {
      spreadsheetId = await provisionSheetForUser(user);
    }

    const authClient = await getUserGoogleClient(user.id);

    let result = await appendLeadsToSheet(leads as BusinessLead[], {
      spreadsheetId,
      auth: authClient,
    });

    if (result.notFound) {
      await prisma.user.update({
        where: { id: user.id },
        data: { spreadsheetId: null },
      });

      spreadsheetId = await provisionSheetForUser(user);
      result = await appendLeadsToSheet(leads as BusinessLead[], {
        spreadsheetId,
        auth: authClient,
      });
    }

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
        spreadsheetId,
      },
    });
  } catch (error) {
    console.error("Error in save-to-sheets API:", error);

    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

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
