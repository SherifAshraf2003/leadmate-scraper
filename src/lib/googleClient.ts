import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "./prisma";

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export const RECONNECT =
  "Sign out and sign in again to reconnect your Google account.";

export async function getUserGoogleClient(
  userId: string
): Promise<OAuth2Client> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });

  if (!account?.access_token) {
    throw new GoogleAuthError(`No Google account is linked. ${RECONNECT}`);
  }

  const client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token ?? undefined,
    // 1, not 0 and not undefined: isTokenExpiring() reads
    // `expiryDate ? expiryDate <= now + threshold : false`, so ANY falsy value
    // — including 0 — means "never expires" and skips the refresh entirely.
    // 1 is truthy and safely in the past.
    expiry_date: account.expires_at ? account.expires_at * 1000 : 1,
  });

  let persistTokens: Promise<unknown> | undefined;

  client.on("tokens", (tokens) => {
    persistTokens = prisma.account
      .updateMany({
        where: { userId, provider: "google" },
        data: {
          ...(tokens.access_token
            ? { access_token: tokens.access_token }
            : {}),
          ...(tokens.refresh_token
            ? { refresh_token: tokens.refresh_token }
            : {}),
          ...(tokens.expiry_date
            ? { expires_at: Math.floor(tokens.expiry_date / 1000) }
            : {}),
        },
      })
      .catch((error) => {
        console.error("Failed to persist refreshed Google tokens:", error);
      });
  });

  // 6 minutes: google-auth-library eagerly refreshes internally once a token is within its own
  // DEFAULT_EAGER_REFRESH_THRESHOLD_MILLIS (5 minutes) of expiry. Our pre-refresh margin has to
  // fully cover that window, or a call can slip past this check and hit the library's internal
  // refresh mid-request, surfacing an unwrapped Gaxios/invalid_grant error instead of a
  // GoogleAuthError with reconnect guidance. 6 minutes gives that a small buffer.
  const expiresSoon =
    !account.expires_at || account.expires_at * 1000 - Date.now() < 6 * 60_000;

  if (expiresSoon) {
    if (!account.refresh_token) {
      throw new GoogleAuthError(
        `Google access expired and no refresh token is stored. ${RECONNECT}`
      );
    }

    try {
      await client.getAccessToken();
      await persistTokens;
    } catch (error) {
      console.error("Google token refresh failed:", error);
      throw new GoogleAuthError(`Google access could not be renewed. ${RECONNECT}`);
    }
  }

  return client;
}
