import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { provisionSheetForUser } from "@/lib/sheetProvisioning";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      // The Prisma adapter's getSessionAndUser returns the whole User row, so
      // spreadsheetId is already loaded here — no extra query. Surfacing it on
      // the session is what lets the UI link straight to an existing sheet on
      // first paint instead of offering "Set up your sheet" to a user who
      // already has one.
      session.user.spreadsheetId = user.spreadsheetId ?? null;
      return session;
    },
  },
  events: {
    // Fires on EVERY sign-in, including a returning user whose Account row
    // already exists. That case is the whole point:
    // @auth/core/lib/actions/callback/handle-login.js:175-199 looks the account
    // up with getUserByAccount and, when there is no active session, creates a
    // Session and returns at :199 — without calling linkAccount or updateUser.
    // The freshly issued access_token / refresh_token / expires_at are simply
    // dropped and the stale Account row survives. With the consent screen in
    // Testing status Google expires refresh tokens after 7 days, so on day 8
    // refresh fails with invalid_grant and "sign out and sign in again" is a
    // lie — signing back in changes nothing. This event is the only hook that
    // both fires on that path and receives the new tokens: it is invoked at
    // @auth/core/lib/actions/callback/index.js:114 with the `account` object
    // built in oauth/callback.js:227-233 (`{ ...tokens, provider, type,
    // providerAccountId }`, with expires_at derived at :205-207).
    async signIn({ account }) {
      if (!account?.provider || !account.providerAccountId) return;

      try {
        await prisma.account.updateMany({
          where: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
          data: {
            ...(account.access_token
              ? { access_token: account.access_token }
              : {}),
            // Google omits refresh_token on some token responses. Writing the
            // absent value through would null out the stored one, which is
            // precisely the permanent lockout this event exists to fix — so a
            // missing refresh_token must never overwrite a stored one.
            ...(account.refresh_token
              ? { refresh_token: account.refresh_token }
              : {}),
            ...(typeof account.expires_at === "number"
              ? { expires_at: account.expires_at }
              : {}),
            ...(account.scope ? { scope: account.scope } : {}),
          },
        });
      } catch (error) {
        // Never fail a sign-in over this. A failed write leaves the user
        // exactly where they were, not worse.
        console.error("Failed to refresh stored Google tokens:", error);
      }
    },

    // Provisioning lives here, NOT in createUser. In handle-login.js the order
    // is createUser(...) -> events.createUser -> linkAccount(...) at :158-161
    // and again at :260-265, so the Account row holding the tokens does not
    // exist yet when createUser fires: getUserGoogleClient's
    // prisma.account.findFirst returns null and provisioning threw
    // GoogleAuthError for 100% of sign-ups. linkAccount (:162 / :265) fires
    // immediately after the row is written, so the tokens are available.
    async linkAccount({ user }) {
      if (!user.id || !user.email) return;

      try {
        // linkAccount also fires when an additional provider is linked to an
        // existing user; provisionSheetForUser's own early return on a stored
        // spreadsheetId keeps that from creating a second sheet.
        await provisionSheetForUser({ id: user.id, email: user.email });
      } catch (error) {
        // Swallowed on purpose: provisioning must never fail a sign-in. Both
        // retry paths (/api/provision-sheet and the on-demand branch in
        // /api/save-to-sheets) still recover from this.
        console.error("Sheet provisioning failed for", user.email, error);
      }
    },
  },
});
