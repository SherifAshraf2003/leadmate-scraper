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
| 📊 **Batch Scraping**            | Scrape up to 100+ leads at once              |
| 📧 **Contact Extraction**        | Get emails, phone numbers, and websites      |
| 📱 **Responsive Design**         | Works on desktop, tablet, and mobile         |
| 🌙 **Dark Mode**                 | Easy on the eyes with automatic theme        |
| 📋 **Google Sheets Integration** | Auto-save leads with duplicate detection     |
| 💾 **Export Options**            | Download results as CSV or JSON              |
| ⚡ **Real-time Progress**        | See live scraping progress                   |

---

## 🚀 Quick Start

> **Important:** This frontend requires the backend server to be running. Follow all steps in order!

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

# 3. Create your environment file
cp .env.example .env.local
# Edit .env.local and set: NEXT_PUBLIC_SCRAPER_API_URL=http://localhost:3001

# 4. Start the frontend
npm run dev

# 5. Open http://localhost:3000 in your browser
```

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

Open `.env.local` in any text editor and update it:

```env
# Backend API URL - Point to your running backend
NEXT_PUBLIC_SCRAPER_API_URL=http://localhost:3001

# Google Sheets Integration (optional - see GOOGLE_SHEETS_SETUP.md)
# GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
# GOOGLE_SHEETS_SHEET_NAME=Leads
# GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account",...}'
```

> 💡 **Tip:** For local development, you only need to set `NEXT_PUBLIC_SCRAPER_API_URL`

#### 2.6 Start the Frontend

```bash
npm run dev
```

You should see:

```
  ▲ Next.js 15.x.x (Turbopack)
  - Local:        http://localhost:3000
```

#### 2.7 Open in Browser

Open your web browser and go to: **http://localhost:3000**

🎉 **Congratulations! You're all set up!**

---

## ⚙️ Configuration

### Environment Variables

Create a `.env.local` file in the root directory with these variables:

| Variable                       | Required | Description                                 | Example                                        |
| ------------------------------ | -------- | ------------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SCRAPER_API_URL`  | ✅ Yes   | URL where your backend is running           | `http://localhost:3001`                        |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ❌ No    | Your Google Sheets ID for auto-saving leads | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms` |
| `GOOGLE_SHEETS_SHEET_NAME`     | ❌ No    | Name of the sheet tab (default: "Leads")    | `Leads`                                        |
| `GOOGLE_SHEETS_CREDENTIALS`    | ❌ No    | Google service account JSON (one line)      | `'{"type":"service_account",...}'`             |

### Google Sheets Integration (Optional)

Want leads automatically saved to a Google Sheet? See the detailed guide:
📄 [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)

---

## 🎮 Usage

### Basic Usage

1. **Enter a search query** in the search box
   - Example: `"dentists in Calgary"` or `"restaurants in New York"`
2. **Set the number of leads** you want (10-100+)

3. **Click "Scrape"** or press Enter

4. **Wait for results** (may take 30-60 seconds depending on quantity)

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
| Start with 10-20 leads to test         | Request 100+ leads initially    |
| Wait for one search to complete        | Start multiple searches at once |

---

## 📁 Project Structure

```
leads-scraper/
├── 📁 src/
│   ├── 📁 app/
│   │   ├── 📁 api/
│   │   │   └── 📁 save-to-sheets/
│   │   │       └── route.ts          # Google Sheets API endpoint
│   │   ├── layout.tsx                # Root layout with metadata
│   │   ├── page.tsx                  # Main scraper UI
│   │   └── globals.css               # Global styles
│   └── 📁 lib/
│       ├── scraperApi.ts             # API client for backend
│       └── googleSheets.ts           # Google Sheets integration
├── 📁 public/                        # Static assets
├── .env.example                      # Environment template
├── .env.local                        # Your local config (create this)
├── GOOGLE_SHEETS_SETUP.md           # Google Sheets guide
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
4. **Configure Environment Variables**
   - Click "Environment Variables"
   - Add: `NEXT_PUBLIC_SCRAPER_API_URL` = Your deployed backend URL
   - (Optional) Add Google Sheets variables
5. **Deploy!** Click "Deploy" and wait ~2 minutes

### Deploy Backend to Render (Free)

Your backend needs to be deployed too! Follow the instructions in the backend repository.

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
| [Google APIs](https://googleapis.dev/)        | Google Sheets integration       |

---

## 📄 License

This project is licensed under the MIT License - feel free to use it for personal or commercial projects!

---

<div align="center">

**Made with ❤️ by [SherifAshraf2003](https://github.com/SherifAshraf2003)**

⭐ Star this repo if you found it helpful!

</div>
