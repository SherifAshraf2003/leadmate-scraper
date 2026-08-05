import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appendLeadsToSheet } from "@/lib/googleSheets";
import {
  createSheetForUser,
  provisionSheetForUser,
} from "@/lib/sheetProvisioning";
import { getUserGoogleClient, GoogleAuthError, RECONNECT } from "@/lib/googleClient";
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
      // drive.file access can also 404 when the grant is revoked or the file
      // moves out of the app's view, not only on real deletion — the old
      // spreadsheet may still hold the user's full history. Log the discarded
      // id so it's recoverable, and don't touch the DB until the replacement
      // actually exists: create it first, then swap old id -> new id in one
      // write, never clearing to null as a separate, losable step.
      console.warn(
        `Spreadsheet ${spreadsheetId} not found for user ${user.id}; provisioning a replacement`
      );

      const newSpreadsheetId = await createSheetForUser(user);

      await prisma.user.update({
        where: { id: user.id },
        data: { spreadsheetId: newSpreadsheetId },
      });

      spreadsheetId = newSpreadsheetId;
      result = await appendLeadsToSheet(leads as BusinessLead[], {
        spreadsheetId,
        auth: authClient,
      });
    }

    if (result.authFailed) {
      return NextResponse.json(
        { error: `Google access was denied while saving. ${RECONNECT}` },
        { status: 401 }
      );
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
