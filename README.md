# LeadMate Scraper - Frontend

A Next.js 15 frontend application for scraping business leads from Google Maps. This app provides a clean UI to search for businesses and displays their contact information (emails, phone numbers, websites).

## Features

- 🔍 Simple search interface
- ⚡ Real-time loading states
- 📱 Responsive design with dark mode support
- 🎨 Modern UI with Tailwind CSS
- 🔗 Connects to external scraper API (hosted on Render)
- ✅ Error handling and validation
- 📊 **Google Sheets integration** - Auto-saves leads with duplicate detection
- 💾 Export results as CSV or JSON

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **React**: 19.1.0
- **Styling**: Tailwind CSS v4
- **TypeScript**: Full type safety
- **Deployment**: Vercel (optimized for free tier)

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd leadmate-scraper
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

Create a `.env.local` file in the root directory (see `.env.example` for reference):

```bash
# Backend API
NEXT_PUBLIC_SCRAPER_API_URL=https://YOUR-RENDER-APP.onrender.com

# Google Sheets (optional but recommended)
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEETS_SHEET_NAME=Leads
GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account",...}'
```

Replace `YOUR-RENDER-APP.onrender.com` with your actual Render backend URL.

**For Google Sheets integration**, follow the detailed setup guide in [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md).

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Deployment to Vercel

This project is optimized for Vercel's free tier:

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the project in Vercel
3. Add environment variable:
   - Key: `NEXT_PUBLIC_SCRAPER_API_URL`
   - Value: Your Render backend URL
4. Deploy!

Vercel will automatically detect Next.js and configure everything.

## Project Structure

```
leadmate-scraper/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── save-to-sheets/
│   │   │       └── route.ts       # Google Sheets API endpoint
│   │   ├── layout.tsx             # Root layout with metadata
│   │   ├── page.tsx               # Main scraper UI
│   │   └── globals.css            # Global styles
│   └── lib/
│       ├── scraperApi.ts          # API client for backend scraper
│       └── googleSheets.ts        # Google Sheets integration
├── public/                        # Static assets
├── .env.example                   # Environment variables template
├── GOOGLE_SHEETS_SETUP.md         # Google Sheets setup guide
├── package.json
└── README.md
```

## API Integration

The frontend expects the backend API to expose an endpoint:

```
GET /scrape?query=YOUR_QUERY
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "name": "Business Name",
      "email": "contact@business.com",
      "phone": "+1-234-567-8900",
      "website": "https://business.com",
      "address": "123 Main St, City, State"
    }
  ]
}
```

## Environment Variables

| Variable                       | Description                      | Required |
| ------------------------------ | -------------------------------- | -------- |
| `NEXT_PUBLIC_SCRAPER_API_URL`  | Backend API URL (Render)         | Yes      |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets spreadsheet ID     | No\*     |
| `GOOGLE_SHEETS_SHEET_NAME`     | Sheet name (defaults to "Leads") | No       |
| `GOOGLE_SHEETS_CREDENTIALS`    | Service account JSON credentials | No\*     |

\*Required for Google Sheets integration. See [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md) for setup instructions.

## Usage

1. Enter a search query (e.g., "Calgary dentists")
2. Click "Scrape" or press Enter
3. Wait for results (may take 30-60 seconds)
4. View extracted business leads with contact information
5. Click on emails, phones, or websites to interact with them
6. **Automatic**: Results are saved to your Google Sheet (if configured) with duplicate detection
7. **Export**: Download results as CSV or JSON for offline use

## Notes

- The frontend does NOT run Puppeteer (that's in the backend)
- Scraping can take time - be patient!
- All scraping is done server-side on your Render backend
- This app is optimized for Vercel's free tier (no serverless functions needed)

## License

MIT
