# Batch Fetching Guide

## Overview

The Leads Scraper now supports batch fetching with automatic pagination and rate limiting to help you collect larger amounts of leads safely and efficiently.

## Features

### 1. **Automatic Batch Processing**

- Fetches leads in batches of 10
- Automatically switches to batch mode when requesting > 10 leads
- Supports up to 60 leads per session

### 2. **Rate Limiting Protection**

- 5-8 second random delay between batches
- Helps avoid API rate limits
- Makes requests appear more human-like
- Reduces server load

### 3. **Progress Tracking**

- Real-time progress bar
- Current batch indicator (e.g., "Batch 3 of 10")
- Total leads collected counter
- Countdown timer for delays

### 4. **User-Friendly Interface**

- Quick select buttons: 10, 20, 30, 40, 50, 60 leads
- Manual number input with validation (max 60)
- Warning messages for high-volume requests
- Estimated completion time

## How to Use

### Basic Usage

1. Enter your search query (e.g., "Calgary dentists")
2. Select number of leads using:
   - Quick select buttons (10, 20, 30, 40, 50, 60)
   - Or type a custom number (1-60)
3. Click "🔍 Scrape Leads"
4. Wait for the batches to complete

### Example Requests

```javascript
// Single batch (10 leads or less)
Query: "Toronto lawyers"
Number of Leads: 10
→ Fetches immediately, no delays

// Multiple batches (more than 10 leads)
Query: "Calgary dentists"
Number of Leads: 40
→ Fetches 4 batches with 5-8s delays between each
→ Estimated time: ~20 seconds
```

## Rate Limiting Best Practices

### ✅ Recommended Limits

- **Conservative:** 20 leads (safe for most cases)
- **Moderate:** 30-40 leads (with 5-8s delays)
- **Maximum:** 60 leads (use with caution)

### ⏱️ Session Management

- Wait **30-60 minutes** between scraping sessions
- Vary search queries (don't repeat same query immediately)
- Scrape during business hours (9 AM - 5 PM) for more natural patterns

### ❌ Avoid

- Exceeding 100 leads per hour from same IP
- Scraping the same query multiple times in a row
- Running requests during off-hours (looks suspicious)
- Trying to bypass the automatic delays

## Safe Usage Examples

### Session 1

```
Query: "Calgary dentists"
Leads: 40
Wait: 30-60 minutes
```

### Session 2

```
Query: "Toronto dentists"
Leads: 40
Wait: 30-60 minutes
```

### Session 3

```
Query: "Vancouver dentists"
Leads: 40
```

## Technical Details

### API Parameters

The scraper now accepts pagination parameters:

```
GET /scrape?query={query}&start={start}&limit={limit}
```

- `query`: Search term (required)
- `start`: Starting index for pagination (default: 0)
- `limit`: Number of results per batch (default: 10)

### Batch Algorithm

```javascript
// For totalLeads = 40
batchSize = 10
numBatches = Math.ceil(40 / 10) = 4 batches

Batch 1: start=0,  limit=10
Batch 2: start=10, limit=10
Batch 3: start=20, limit=10
Batch 4: start=30, limit=10

Total time: (4-1) × 6.5s average delay = ~20 seconds
```

### Rate Limiting Strategy

- **Delay Range:** 5-8 seconds (randomized)
- **Delay Formula:** `5000 + Math.random() * 3000` ms
- **Average Delay:** 6.5 seconds
- **Applied:** Between all batches (not after the last one)

## For Higher Volumes

If you need to scrape more than 60 leads regularly, consider:

1. **Proxy Rotation Services**

   - Rotate IP addresses between sessions
   - Use residential proxies for better success rates

2. **Distributed Scraping**

   - Spread requests across multiple days
   - Use different search queries
   - Implement IP rotation

3. **Session Scheduling**
   - Schedule scraping during business hours
   - Add longer delays between sessions
   - Monitor for rate limit errors

## Progress Indicators

During batch fetching, you'll see:

1. **Spinner:** Animated loading indicator
2. **Batch Counter:** "Fetching batch X of Y..."
3. **Progress Bar:** Visual percentage completion
4. **Leads Counter:** "N leads collected so far"
5. **Delay Timer:** "⏳ Waiting Xs before next batch..."

## Troubleshooting

### Issue: Rate Limited

**Solution:** Wait 30-60 minutes, then try with fewer leads

### Issue: Slow Performance

**Solution:** This is expected! Delays are intentional for rate limiting

### Issue: Missing Results

**Solution:** Some batches may fail. Check console logs for errors

### Issue: Need More Than 60 Leads

**Solution:** Run multiple sessions with different queries, waiting 30-60 min between each

## Warning Messages

### High Volume Warning (> 30 leads)

Shows:

- Number of batches
- Estimated completion time
- Rate limiting reminder

Example:

```
⚠️ High volume request: This will fetch 6 batches with 5-8 second
delays between requests. Estimated time: ~33 seconds. Consider
waiting 30-60 minutes between sessions to avoid rate limiting.
```

## Code References

### Key Functions

- `scrapeBusinesses(query, start, limit)` - Single batch fetch
- `scrapeBusinessesBatch(query, totalLeads, onProgress)` - Multi-batch fetch
- Progress callback provides real-time updates

### State Management

- `totalLeads` - Number of leads to fetch
- `batchProgress` - Current batch status
- `loading` - Overall loading state
- `results` - Collected leads

## Summary

The batch fetching feature makes it easy to collect larger amounts of leads while staying within API limits. The automatic delays and progress tracking ensure a smooth, safe scraping experience. Always follow the recommended limits and best practices to avoid rate limiting issues.
