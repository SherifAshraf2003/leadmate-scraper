# Google Sheets Integration Setup Guide

This guide will walk you through setting up Google Sheets integration for your LeadMate Scraper application.

## Prerequisites

- A Google account
- A Google Sheets spreadsheet where you want to store the leads

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on "Select a project" at the top
3. Click "New Project"
4. Enter a project name (e.g., "LeadMate Scraper")
5. Click "Create"

## Step 2: Enable Google Sheets API

1. In your Google Cloud Console, ensure your new project is selected
2. Go to "APIs & Services" > "Library"
3. Search for "Google Sheets API"
4. Click on it and press "Enable"

## Step 3: Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Enter a service account name (e.g., "leadmate-sheets-service")
4. Click "Create and Continue"
5. Skip the optional steps and click "Done"

## Step 4: Create and Download Service Account Key

1. In "APIs & Services" > "Credentials", find your newly created service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" as the key type
6. Click "Create"
7. A JSON file will be downloaded to your computer - **keep this file secure!**

## Step 5: Share Your Google Sheet with the Service Account

1. Open the downloaded JSON file and find the `client_email` field
2. Copy the email address (it looks like: `leadmate-sheets-service@your-project.iam.gserviceaccount.com`)
3. Open your Google Sheets spreadsheet
4. Click "Share" in the top right
5. Paste the service account email
6. Give it "Editor" permissions
7. Uncheck "Notify people" (since it's a service account)
8. Click "Share"

## Step 6: Get Your Spreadsheet ID

1. Open your Google Sheets spreadsheet
2. Look at the URL in your browser
3. The URL format is: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
4. Copy the `SPREADSHEET_ID` part

## Step 7: Configure Environment Variables

1. Create a `.env.local` file in your project root (copy from `.env.example`)
2. Set the following environment variables:

```env
# Your Google Sheets Spreadsheet ID
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here

# Optional: Sheet name (defaults to "Leads")
GOOGLE_SHEETS_SHEET_NAME=Leads

# Your Google Service Account Credentials
# Copy the ENTIRE contents of the downloaded JSON file and put it on one line
GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://accounts.google.com/o/oauth2/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
```

**Important:** The `GOOGLE_SHEETS_CREDENTIALS` should be the entire JSON content as a single-line string, wrapped in single quotes.

## Step 8: Test the Integration

1. Start your Next.js development server: `npm run dev`
2. Run a scrape query
3. Check your Google Sheet - new leads should be automatically added!
4. Try running the same query again - duplicates should be skipped

## How It Works

### Duplicate Detection

The system identifies duplicates using a combination of:

- Business name (case-insensitive)
- Primary contact info (website, email, or phone)

### Data Structure

Your Google Sheet will have the following columns:

- **Name**: Business name
- **Emails**: Comma-separated email addresses
- **Phones**: Comma-separated phone numbers
- **Website**: Business website URL
- **Date Added**: Timestamp when the lead was added

### Automatic Features

- ✅ **Auto-creates sheet**: If the specified sheet doesn't exist, it will be created automatically
- ✅ **Auto-adds headers**: Headers are added automatically with formatting
- ✅ **Duplicate removal**: Duplicates are detected and skipped
- ✅ **Status notifications**: You'll see confirmation messages in the UI

## Troubleshooting

### "GOOGLE_SHEETS_CREDENTIALS environment variable is not set"

- Make sure your `.env.local` file exists and has the correct variable names
- Restart your Next.js dev server after adding environment variables

### "Error appending leads to Google Sheets"

- Verify that you shared the spreadsheet with your service account email
- Check that the service account has "Editor" permissions
- Ensure the spreadsheet ID is correct

### "Invalid credentials"

- Verify that your JSON credentials are valid
- Make sure the entire JSON is on one line in your `.env.local` file
- Check for any extra spaces or line breaks

### Permission Denied

- Ensure you've shared the Google Sheet with the service account email
- Give the service account "Editor" permissions (not just "Viewer")

## Security Notes

⚠️ **Important Security Information:**

1. **Never commit your `.env.local` file to version control**
2. The `.env.local` file is already in `.gitignore` by default
3. Keep your service account JSON file secure
4. Don't share your credentials in public repositories
5. If credentials are compromised, delete the key in Google Cloud Console and create a new one

## Need Help?

If you encounter any issues:

1. Check the browser console for error messages
2. Check the terminal where your Next.js server is running
3. Verify all environment variables are set correctly
4. Ensure the Google Sheets API is enabled in your Google Cloud project
