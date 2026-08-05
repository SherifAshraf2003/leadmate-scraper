import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { provisionSheetForUser } from "@/lib/sheetProvisioning";
import { GoogleAuthError } from "@/lib/googleClient";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const spreadsheetId = await provisionSheetForUser({
      id: session.user.id,
      email: session.user.email,
    });

    return NextResponse.json({ spreadsheetId });
  } catch (error) {
    console.error("Provisioning failed:", error);

    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to provision sheet",
      },
      { status: 500 }
    );
  }
}
