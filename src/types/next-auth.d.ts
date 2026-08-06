import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /**
       * The id of this user's own spreadsheet, or null if one has not been
       * provisioned yet. Carried on the session so the UI can link to an
       * existing sheet on first paint rather than assuming every page load
       * starts from "no sheet".
       */
      spreadsheetId: string | null;
    } & DefaultSession["user"];
  }
}

// Augmented on @auth/core rather than the `next-auth/adapters` re-export:
// next-auth/adapters.d.ts is only `export type * from "@auth/core/adapters"`,
// so it declares no interface of its own for TypeScript to merge into.
declare module "@auth/core/adapters" {
  interface AdapterUser {
    /**
     * Column on the Prisma `User` model. The adapter's `getSessionAndUser`
     * returns the whole row, so this is already populated when the `session`
     * callback runs — reading it there costs no extra query.
     */
    spreadsheetId: string | null;
  }
}
