# 🎯 Leads Scraper - Frontend

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=for-the-badge&logo=tailwind-css)

**A powerful business lead scraper that extracts contact information from Google Maps**

[Features](#-features) • [Quick Start](#-quick-start) • [Installation](#-installation) • [Usage](#-usage) • [Deployment](#-deployment)

</div>

---

## 📖 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
  - [Step 1: Set Up the Backend](#step-1-set-up-the-backend)
  - [Step 2: Set Up the Frontend](#step-2-set-up-the-frontend)
- [Configuration](#-configuration)
  - [Setting Up Google Sign-In](#setting-up-google-sign-in)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## ✨ Features

| Feature                          | Description                                  |
| -------------------------------- | -------------------------------------------- |
| 🔍 **Smart Search**              | Search for any business type in any location |
| 📊 **Batch Scraping**            | Scrape up to 60 leads per run                |
| 📧 **Contact Extraction**        | Get emails, phone numbers, and websites      |
| 📱 **Responsive Design**         | Works on desktop, tablet, and mobile         |
| 🌙 **Dark Mode**                 | Easy on the eyes with automatic theme        |
| 🔐 **Google Sign-In**            | Sign in with Google; no separate account needed |
| 📋 **Automatic Google Sheet**    | A private spreadsheet is created in your own Drive on first sign-in, with duplicate detection on every scrape |
| 💾 **Export Options**            | Download results as CSV or JSON              |
| ⚡ **Real-time Progress**        | See live scraping progress                   |

---

## 🚀 Quick Start

> **Important:** This frontend requires the backend server to be running, a Postgres database (Neon works well), and a Google OAuth client. Follow all steps in order!

```bash
# 1. Clone and set up the BACKEND first
git clone https://github.com/SherifAshraf2003/leads-scraper-backend.git
cd leads-scraper-backend
npm install
npm run dev

# 2. In a NEW terminal, clone and set up the FRONTEND
git clone https://github.com/SherifAshraf2003/leads-scraper.git
cd leads-scraper
npm install

# 3. Create your environment file and fill in every value
cp .env.example .env.local
# See "Environment Variables" below for what each one needs to be, and
# "Setting Up Google Sign-In" for how to create the OAuth client.

# 4. Apply the database schema
#    (npm run db:migrate, NOT npx prisma migrate deploy — see the note below)
npm run db:migrate

# 5. Start the frontend
npm run dev

# 6. Open http://localhost:3000, and sign in with Google
```

Signing in creates your account row in Postgres and, in the background, a private
spreadsheet named `Leads — <your email>` in your own Google Drive — there is no
shared spreadsheet and no service account involved.

> **Why `npm run db:migrate` and not `npx prisma migrate deploy`?** Next.js
> loads `.env.local`, but the Prisma CLI only ever reads `.env` — it does not
> know `.env.local` exists. Running `npx prisma migrate deploy` directly
> therefore fails with `Environment variable not found: DIRECT_URL`, even
> though `DIRECT_URL` is sitting right there in your `.env.local`. The
> `db:*` scripts in `package.json` source `.env.local` into the environment
> first and then invoke Prisma, so they work with the file the rest of the
> setup tells you to create. Use `npm run db:migrate` (apply migrations),
> `npm run db:status` (see what is pending), and `npm run db:studio` (browse
> the data). These scripts use POSIX shell syntax, so on Windows run them
> from Git Bash or WSL. Nothing on Vercel is affected: there `DATABASE_URL`
> and `DIRECT_URL` are real environment variables, so `npm run build`'s
> `prisma migrate deploy` sees them without any of this.

---

## 📋 Prerequisites

Before you begin, make sure you have the following installed on your computer:

### Required Software

| Software    | Version            | Download Link                       | How to Check         |
| ----------- | ------------------ | ----------------------------------- | -------------------- |
| **Node.js** | 20.0 or higher     | [nodejs.org](https://nodejs.org/)   | Run `node --version` |
| **npm**     | 10.0 or higher     | Comes with Node.js                  | Run `npm --version`  |
| **Git**     | Any recent version | [git-scm.com](https://git-scm.com/) | Run `git --version`  |

### How to Install Node.js (if you don't have it)

<details>
<summary>🪟 Windows</summary>

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the **LTS** version (recommended)
3. Run the installer and follow the prompts
4. Restart your terminal/command prompt
5. Verify installation: `node --version`

</details>

<details>
<summary>🍎 macOS</summary>

**Option 1: Direct Download**

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the **LTS** version
3. Run the installer

**Option 2: Using Homebrew**

```bash
brew install node
```

</details>

<details>
<summary>🐧 Linux</summary>

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

</details>

---

## 📥 Installation

### Step 1: Set Up the Backend

The backend handles all the web scraping. **You must set it up first!**

#### 1.1 Clone the Backend Repository

```bash
git clone https://github.com/SherifAshraf2003/leads-scraper-backend.git
```

#### 1.2 Navigate to the Backend Folder

```bash
cd leads-scraper-backend
```

#### 1.3 Install Backend Dependencies

```bash
npm install
```

#### 1.4 Start the Backend Server

```bash
npm run dev
```

You should see a message like:

```
Server running on http://localhost:3001
```

> ⚠️ **Keep this terminal window open!** The backend needs to stay running.

---

### Step 2: Set Up the Frontend

Open a **new terminal window** (don't close the backend terminal!)

#### 2.1 Clone the Frontend Repository

```bash
git clone https://github.com/SherifAshraf2003/leads-scraper.git
```

#### 2.2 Navigate to the Frontend Folder

```bash
cd leads-scraper
```

#### 2.3 Install Frontend Dependencies

```bash
npm install
```

This will install all required packages. It may take 1-2 minutes.

#### 2.4 Create Your Environment File

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env.local
```

**Windows (Command Prompt):**

```cmd
copy .env.example .env.local
```

**macOS/Linux:**

```bash
cp .env.example .env.local
```

#### 2.5 Configure the Environment File

Open `.env.local` in any text editor and fill in every value. All seven
variables are required — there is no optional subset for local development,
because sign-in, the database, migrations, and the scrape token all depend
on them:

```env
# Backend API URL - Point to your running backend
NEXT_PUBLIC_SCRAPER_API_URL=http://localhost:3001

# Neon Postgres, pooled connection string (hostname contains "-pooler") —
# used for the app's runtime queries
DATABASE_URL=postgresql://user:password@host-pooler.region.aws.neon.tech/db?sslmode=require

# Neon Postgres, UNPOOLED connection string (no "-pooler" in the hostname) —
# used only by Prisma Migrate, which needs a session-level connection for
# its advisory lock that the pooled (PgBouncer transaction-mode) endpoint
# cannot provide
DIRECT_URL=postgresql://user:password@host.region.aws.neon.tech/db?sslmode=require

# Auth.js session encryption key: openssl rand -base64 32
AUTH_SECRET=

# Google Cloud Console -> Credentials -> your OAuth client
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Shared with the backend, byte-identical on both sides: openssl rand -base64 32
SCRAPE_TOKEN_SECRET=
```

See [Setting Up Google Sign-In](#setting-up-google-sign-in) below for how to
create the OAuth client and get `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

#### 2.6 Apply the Database Schema

```bash
npm run db:migrate
```

This creates the `User`, `Account`, `Session`, and `VerificationToken` tables
that Auth.js and the sheet-linking logic use. In production this same migration
step runs automatically as part of `npm run build` (see
[Deployment](#-deployment)).

> ⚠️ **Do not run `npx prisma migrate deploy` directly here.** The Prisma CLI
> reads `.env`; Next.js reads `.env.local`. Since step 2.4 put your values in
> `.env.local`, invoking Prisma directly fails with
> `Environment variable not found: DIRECT_URL`. The `db:migrate` script sources
> `.env.local` into the environment first, then runs the same Prisma command.
> Two companion scripts use the same wrapper:
>
> ```bash
> npm run db:status   # which migrations are applied / pending
> npm run db:studio   # browse your data in Prisma Studio
> ```
>
> They use POSIX shell syntax (`set -a && . ./.env.local && set +a`), so on
> Windows run them from Git Bash or WSL rather than PowerShell or CMD.
> If you would rather not use the scripts, the alternative is to keep a
> separate `.env` containing at least `DATABASE_URL` and `DIRECT_URL` — but do
> not move or rename `.env.local`, since Next.js needs it.

#### 2.7 Start the Frontend

```bash
npm run dev
```

You should see:

```
  ▲ Next.js 15.x.x (Turbopack)
  - Local:        http://localhost:3000
```

#### 2.8 Open in Browser and Sign In

Open your web browser, go to **http://localhost:3000**, and sign in with
Google. The first sign-in creates your user record and provisions your
private spreadsheet in the background.

🎉 **Congratulations! You're all set up!**

---

## ⚙️ Configuration

### Environment Variables

Create a `.env.local` file in the root directory (copy `.env.example` as a
starting point) with these variables. Every one of them is required — none
are optional, because sign-in, the database, and the scrape-token exchange
with the backend all depend on them:

| Variable                      | Required | Description                                                                     | Example                                                                 |
| ------------------------------ | -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SCRAPER_API_URL`  | ✅ Yes   | URL where your backend is running                                                | `http://localhost:3001`                                                 |
| `DATABASE_URL`                 | ✅ Yes   | Neon Postgres **pooled** connection string (hostname contains `-pooler`); used for the app's runtime queries | `postgresql://user:pw@host-pooler.region.aws.neon.tech/db?sslmode=require` |
| `DIRECT_URL`                   | ✅ Yes   | Neon Postgres **unpooled** connection string (no `-pooler` in the hostname); used only by Prisma Migrate, which needs a session-level connection for its advisory lock that the pooled endpoint can't provide | `postgresql://user:pw@host.region.aws.neon.tech/db?sslmode=require` |
| `AUTH_SECRET`                  | ✅ Yes   | Auth.js session encryption key; generate with `openssl rand -base64 32`          | (random string)                                                          |
| `AUTH_GOOGLE_ID`               | ✅ Yes   | OAuth client ID from Google Cloud Console                                        | `1234567890-abc.apps.googleusercontent.com`                             |
| `AUTH_GOOGLE_SECRET`           | ✅ Yes   | OAuth client secret from Google Cloud Console                                    | (secret string)                                                          |
| `SCRAPE_TOKEN_SECRET`          | ✅ Yes   | Signing key for the short-lived scrape token; must be byte-identical to the backend's `SCRAPE_TOKEN_SECRET`, and generated the same way | (random string) |

There is no `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, or
`GOOGLE_SHEETS_CREDENTIALS` variable in this design — see below.

### How Leads Reach Google Sheets

There is no shared spreadsheet and no service account. When a user signs in
for the first time, the app uses that user's own Google credentials (granted
during sign-in, scoped to `drive.file`) to create a spreadsheet named
`Leads — <their email>` directly in **their own Google Drive**, and stores
its id against their account row in Postgres. Every scrape after that appends
rows to that same spreadsheet, skipping any lead whose name combined with its
website already exists in the sheet; if a lead has no website, its name plus
its first email is used instead, and if it has neither website nor email, its
name plus the digits of its first phone number is used. Two different
businesses that happen to share a website (e.g. two franchise locations) are
not treated as duplicates of each other, because the name is part of the key
too. Nothing is ever shared with, or visible to, the app owner's account
or any other user.

### Setting Up Google Sign-In

Every developer or deployment needs its own Google OAuth client — there is no
shared one, and there is no service account or JSON key file involved at all
(a Google Cloud org policy, `iam.disableServiceAccountKeyCreation`, blocks
creating service account keys on this project, which is part of why this
design uses per-user OAuth instead).

1. In [Google Cloud Console](https://console.cloud.google.com/), open (or
   create) a project, then go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**, and choose **Web
   application** as the application type.
3. Under **Authorized redirect URIs**, add one entry per environment you run:
   - Local development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://<your-deployed-domain>/api/auth/callback/google`

   Sign-in fails with `redirect_uri_mismatch` until the exact URI you're
   using is saved here.
4. Copy the generated **Client ID** and **Client secret** into
   `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
5. Go to **APIs & Services → OAuth consent screen** and confirm the scope
   `.../auth/drive.file` (Google Drive, "See, edit, create, and delete only
   the specific Google Drive files you use with this app") is requested —
   the app already requests it in code, but it must be an allowed scope on
   the consent screen.
6. Set the consent screen's **User type** to **External**, and decide its
   publishing status:
   - **Testing** (default): only Google accounts you explicitly add as test
     users can sign in, capped at 100 users. Anyone else gets
     `Error 403: access_denied`.
   - **Published**: any Google account can sign in. Because `drive.file` is
     classified as a non-sensitive scope, publishing this app requires **no**
     Google verification review — click **Publish App** when you're ready
     for real users.

---

## 🎮 Usage

### Basic Usage

1. **Enter a search query** in the search box
   - Example: `"dentists in Calgary"` or `"restaurants in New York"`
2. **Set the number of leads** you want (up to 60 per run; larger runs are rejected)

3. **Click "Scrape"** or press Enter

4. **Wait for results** — a full 60-lead run takes about 11-13 minutes, since
   the frontend fetches in batches of 10 with a delay between each to avoid
   rate limiting; a small run of 10 leads finishes in under 2 minutes

5. **View your leads** with extracted:

   - 📧 Email addresses
   - 📞 Phone numbers
   - 🌐 Websites
   - 📍 Addresses

6. **Export your data** as CSV or JSON

### Tips for Best Results

| ✅ Do                                  | ❌ Don't                        |
| -------------------------------------- | ------------------------------- |
| Be specific: "plumbers in Miami"       | Be vague: "plumbers"            |
| Include location: "lawyers in Toronto" | Skip location                   |
| Start with 10-20 leads to test         | Request more than 60 leads (the app rejects it) |
| Wait for one search to complete        | Start multiple searches at once |

---

## 📁 Project Structure

```
leads-scraper/
├── 📁 prisma/
│   ├── schema.prisma                 # User / Account / Session / VerificationToken models
│   └── 📁 migrations/                # Applied with `prisma migrate deploy`
├── 📁 src/
│   ├── 📁 app/
│   │   ├── 📁 api/
│   │   │   ├── 📁 auth/[...nextauth]/
│   │   │   │   └── route.ts          # Auth.js sign-in/callback handlers
│   │   │   ├── 📁 provision-sheet/
│   │   │   │   └── route.ts          # On-demand retry if sheet creation failed at sign-up
│   │   │   ├── 📁 save-to-sheets/
│   │   │   │   └── route.ts          # Appends a scraped batch to the user's sheet
│   │   │   └── 📁 scrape-token/
│   │   │       └── route.ts          # Mints the short-lived JWT the browser sends to the backend
│   │   ├── layout.tsx                # Root layout with metadata
│   │   ├── page.tsx                  # Main scraper UI
│   │   ├── providers.tsx             # Session provider
│   │   └── globals.css               # Global styles
│   ├── auth.ts                       # Auth.js configuration (Google provider, drive.file scope)
│   └── 📁 lib/
│       ├── scraperApi.ts             # Calls the backend directly with the scrape token
│       ├── scrapeToken.ts            # Signs the HS256 scrape token
│       ├── googleClient.ts           # Builds a Google API client from the signed-in user's tokens
│       ├── sheetProvisioning.ts      # Creates the user's spreadsheet in their own Drive
│       ├── googleSheets.ts           # Reads/writes rows in the user's spreadsheet
│       └── prisma.ts                 # Prisma client singleton
├── 📁 public/                        # Static assets
├── .env.example                      # Environment template
├── .env.local                        # Your local config (create this)
├── package.json                      # Dependencies
└── README.md                         # This file
```

---

## 🌐 Deployment

### Deploy to Vercel (Recommended - Free)

1. **Push your code to GitHub**

2. **Go to [vercel.com](https://vercel.com)** and sign up/login

3. **Import your repository**
   - Click "New Project"
   - Select your GitHub repository
4. **Configure Environment Variables** — set every variable listed under
   [Environment Variables](#environment-variables) above:
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `SCRAPE_TOKEN_SECRET`, and
   `NEXT_PUBLIC_SCRAPER_API_URL` (your deployed backend's URL).
   `DIRECT_URL` is required, not optional — the build fails outright without
   it (see the warning below). Confirm none of
   `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, or
   `GOOGLE_SHEETS_CREDENTIALS` is present — this design has no service
   account and does not use them.
5. **Deploy!** The build runs `prisma generate && prisma migrate deploy && next build --turbopack`,
   so pending migrations are applied automatically on every deploy — there is
   no separate migration step to run by hand. Wait ~2 minutes.
6. **Add the production redirect URI.** Once you have the resulting Vercel
   domain, go back to Google Cloud Console → Credentials → your OAuth client,
   and add `https://<your-vercel-domain>/api/auth/callback/google` under
   Authorized redirect URIs. Sign-in fails with `redirect_uri_mismatch` until
   this is saved. See [Setting Up Google Sign-In](#setting-up-google-sign-in).

> ⚠️ **`DIRECT_URL` and preview deployments.** Because `prisma migrate deploy`
> runs as part of `npm run build`, and Vercel runs that same build for every
> **preview** deployment (not just production), every preview build also runs
> migrations against whatever database `DIRECT_URL` points at. If `DIRECT_URL`
> is shared across environments, opening a pull request can migrate your
> production database. Point preview environments' `DIRECT_URL` (and
> `DATABASE_URL`) at a separate Neon branch database, or move the migration
> step out of the build script once this becomes a problem in practice.

### Deploy Backend to Render (Free)

Your backend needs to be deployed too! Follow the instructions in the backend
repository's README, in particular setting `SCRAPE_TOKEN_SECRET` (byte-identical
to the frontend's) and `CORS_ORIGIN` (your Vercel domain) on the Render service.

Once deployed, update your frontend's `NEXT_PUBLIC_SCRAPER_API_URL` to your Render URL:

```
https://your-backend-name.onrender.com
```

---

## 🔧 Troubleshooting

### Common Issues & Solutions

<details>
<summary>❌ "Cannot connect to backend" or "Network Error"</summary>

**Cause:** The backend server is not running.

**Solution:**

1. Open a terminal in the backend folder
2. Run `npm run dev`
3. Make sure you see "Server running on http://localhost:3001"
4. Check that `.env.local` has `NEXT_PUBLIC_SCRAPER_API_URL=http://localhost:3001`

</details>

<details>
<summary>❌ "npm install" fails with errors</summary>

**Cause:** Node.js version might be too old.

**Solution:**

1. Check your Node version: `node --version`
2. If it's below v20, update Node.js from [nodejs.org](https://nodejs.org/)
3. Delete `node_modules` folder and `package-lock.json`
4. Run `npm install` again

</details>

<details>
<summary>❌ "Port 3000 is already in use"</summary>

**Cause:** Another application is using port 3000.

**Solution:**

```bash
# Windows - Find and kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F

# macOS/Linux
lsof -i :3000
kill -9 <PID_NUMBER>

# Or simply use a different port
npm run dev -- -p 3001
```

</details>

<details>
<summary>❌ Scraping takes forever or times out</summary>

**Cause:** Scraping many leads takes time, or the backend might be sleeping (on free Render tier).

**Solution:**

1. Start with fewer leads (10-20) to test
2. If using Render free tier, the first request "wakes up" the server (wait 30 seconds)
3. Check the backend terminal for any error messages

</details>

<details>
<summary>❌ No results returned</summary>

**Cause:** The search query might not have any matching businesses.

**Solution:**

1. Try a more common search: "restaurants in New York"
2. Check the backend terminal for errors
3. Make sure the backend is running

</details>

### Still Having Issues?

1. 📋 Check the browser console (F12 → Console tab) for errors
2. 📋 Check the terminal where your servers are running
3. 🔄 Try restarting both frontend and backend servers
4. 🗑️ Delete `node_modules` and run `npm install` again

---

## 🛠️ Tech Stack

| Technology                                    | Purpose                         |
| --------------------------------------------- | ------------------------------- |
| [Next.js 15](https://nextjs.org/)             | React framework with App Router |
| [React 19](https://react.dev/)                | UI library                      |
| [TypeScript](https://www.typescriptlang.org/) | Type safety                     |
| [Tailwind CSS 4](https://tailwindcss.com/)    | Styling                         |
| [Auth.js v5](https://authjs.dev/)             | Google sign-in                  |
| [Prisma](https://www.prisma.io/) + [Neon](https://neon.tech/) | Per-user data in Postgres |
| [Google APIs](https://googleapis.dev/)        | Per-user Google Sheets creation and writes |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | Signs/verifies the short-lived scrape token |

---

## 📄 License

This project is licensed under the MIT License - feel free to use it for personal or commercial projects!

---

<div align="center">

**Made with ❤️ by [SherifAshraf2003](https://github.com/SherifAshraf2003)**

⭐ Star this repo if you found it helpful!

</div>
