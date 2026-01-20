# ServerLense API Testing Guide

## Overview

This guide covers how to test all ServerLense API endpoints locally and in production.

## Prerequisites

- ✅ Vercel CLI installed and logged in
- ✅ Environment variables set in `.env.local`
- ✅ Database schema initialized (`npm run init:db`)
- ✅ Sample log files for testing

---

## Local Testing Setup

### 1. Start Vercel Dev Server

```bash
cd C:\Users\EnriqueV\Documents\ServerLense
vercel dev
```

This will:
- Start a local development server (usually on `http://localhost:3000`)
- Use your `.env.local` environment variables
- Hot-reload on code changes
- Simulate Vercel serverless functions

### 2. Verify Environment Variables

```bash
# Test database connection
npm run test:db
```

Expected output:
```
✅ Database connected successfully!
✅ Logs table exists
Current log entries: 0
```

---

## Testing Individual Endpoints

### 1. Health Check Endpoint

**Test the health endpoint:**

```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-20T18:30:00.000Z",
  "database": {
    "connected": true,
    "current_time": "2026-01-20T18:30:00.000Z",
    "log_count": 0
  }
}
```

---

### 2. Parse Endpoint (File Upload)

**Using curl:**

```bash
curl -X POST http://localhost:3000/api/parse \
  -F "file=@path/to/your/logfile.txt"
```

**Using PowerShell:**

```powershell
$filePath = "C:\path\to\your\logfile.txt"
$uri = "http://localhost:3000/api/parse"

$form = @{
    file = Get-Item -Path $filePath
}

Invoke-RestMethod -Uri $uri -Method Post -Form $form
```

**Expected Response:**
```json
{
  "success": true,
  "count": 12345,
  "fileName": "logfile.txt"
}
```

**Test with different file types:**

```bash
# Standard log file
curl -X POST http://localhost:3000/api/parse -F "file=@sample.log"

# CSV file (Datadog format)
curl -X POST http://localhost:3000/api/parse -F "file=@sample.csv"

# Homer SIP export
curl -X POST http://localhost:3000/api/parse -F "file=@homer-export.txt"
```

---

### 3. Query Logs Endpoint

**Basic query:**

```bash
curl "http://localhost:3000/api/logs?limit=10&offset=0"
```

**With filters:**

```bash
# Filter by component
curl "http://localhost:3000/api/logs?component=ReportProcessor&limit=10"

# Filter by call ID
curl "http://localhost:3000/api/logs?callId=abc123&limit=10"

# Filter by file name
curl "http://localhost:3000/api/logs?fileName=sample.log&limit=10"

# Filter by level
curl "http://localhost:3000/api/logs?level=ERROR&limit=10"

# Filter by SIP logs only
curl "http://localhost:3000/api/logs?isSip=true&limit=10"

# Time range filter
curl "http://localhost:3000/api/logs?startTime=1704067200000&endTime=1704153600000&limit=10"

# Full-text search
curl "http://localhost:3000/api/logs?search=timeout&limit=10"

# Combined filters
curl "http://localhost:3000/api/logs?component=ReportProcessor&level=ERROR&limit=10&offset=0"
```

**Expected Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "timestamp": 1704067200000,
      "rawTimestamp": "01/01/2024, 12:00:00 AM",
      "level": "ERROR",
      "component": "ReportProcessor",
      "displayComponent": "ReportProcessor",
      "message": "Failed to process report",
      "displayMessage": "Failed to process report",
      "payload": "",
      "type": "LOG",
      "isSip": false,
      "sipMethod": null,
      "fileName": "sample.log",
      "fileColor": "#3b82f6",
      "callId": null,
      "reportId": null,
      "operatorId": null,
      "extensionId": null,
      "stationId": null
    }
  ],
  "total": 12345,
  "offset": 0,
  "limit": 10
}
```

---

### 4. Correlation Counts Endpoint

**Get file counts:**

```bash
curl "http://localhost:3000/api/counts?type=file"
```

**Get call ID counts:**

```bash
curl "http://localhost:3000/api/counts?type=callId"
```

**Get report counts:**

```bash
curl "http://localhost:3000/api/counts?type=report"
```

**Get operator counts:**

```bash
curl "http://localhost:3000/api/counts?type=operator"
```

**Get extension counts:**

```bash
curl "http://localhost:3000/api/counts?type=extension"
```

**Get station counts:**

```bash
curl "http://localhost:3000/api/counts?type=station"
```

**Expected Response:**
```json
{
  "counts": [
    { "value": "sample.log", "count": 5000 },
    { "value": "another.log", "count": 3000 }
  ]
}
```

---

### 5. Timeline Endpoint

**Get timeline data:**

```bash
curl "http://localhost:3000/api/timeline?startTime=1704067200000&endTime=1704153600000"
```

**With file filter:**

```bash
curl "http://localhost:3000/api/timeline?startTime=1704067200000&endTime=1704153600000&fileName=sample.log"
```

**With custom bucket size (60 seconds):**

```bash
curl "http://localhost:3000/api/timeline?startTime=1704067200000&endTime=1704153600000&bucketSize=60"
```

**Expected Response:**
```json
{
  "timeline": [
    {
      "timeBucket": 1704067200000,
      "errorCount": 5,
      "sipRequestCount": 10,
      "sipSuccessCount": 8,
      "sipErrorCount": 2
    },
    {
      "timeBucket": 1704067260000,
      "errorCount": 3,
      "sipRequestCount": 15,
      "sipSuccessCount": 12,
      "sipErrorCount": 3
    }
  ]
}
```

---

### 6. Clear Endpoint

**Clear all logs and blobs:**

```bash
curl -X POST http://localhost:3000/api/clear
```

**Expected Response:**
```json
{
  "success": true,
  "deletedLogs": 12345,
  "deletedBlobs": 2
}
```

**⚠️ Warning:** This deletes ALL logs and temporary blob files!

---

## Automated Testing Scripts

### Test Script 1: Basic Flow Test

Create `scripts/test-api.ts`:

```typescript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function testHealth() {
    console.log('Testing health endpoint...');
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    console.log('✅ Health check:', data);
    return data;
}

async function testParse(filePath: string) {
    console.log(`Testing parse endpoint with ${filePath}...`);
    // Note: This requires FormData, which is complex in Node.js
    // Use curl or Postman for file uploads
    console.log('⚠️  Use curl or Postman for file upload testing');
}

async function testLogs() {
    console.log('Testing logs endpoint...');
    const response = await fetch(`${API_BASE}/api/logs?limit=5`);
    const data = await response.json();
    console.log('✅ Logs query:', {
        total: data.total,
        returned: data.logs.length,
        firstLog: data.logs[0]?.message?.substring(0, 50)
    });
    return data;
}

async function testCounts() {
    console.log('Testing counts endpoint...');
    const response = await fetch(`${API_BASE}/api/counts?type=file`);
    const data = await response.json();
    console.log('✅ File counts:', data.counts.length, 'files');
    return data;
}

async function testTimeline() {
    console.log('Testing timeline endpoint...');
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const response = await fetch(
        `${API_BASE}/api/timeline?startTime=${oneHourAgo}&endTime=${now}`
    );
    const data = await response.json();
    console.log('✅ Timeline:', data.timeline.length, 'buckets');
    return data;
}

async function runTests() {
    try {
        await testHealth();
        await testLogs();
        await testCounts();
        await testTimeline();
        console.log('\n✅ All tests passed!');
    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTests();
```

---

## Testing with Postman

### Import Collection

1. **Create a new Postman collection** named "ServerLense API"

2. **Add requests:**

   - **Health Check**
     - Method: GET
     - URL: `http://localhost:3000/api/health`

   - **Parse File**
     - Method: POST
     - URL: `http://localhost:3000/api/parse`
     - Body: form-data
     - Key: `file` (type: File)
     - Value: Select a log file

   - **Query Logs**
     - Method: GET
     - URL: `http://localhost:3000/api/logs`
     - Params:
       - `limit`: 10
       - `offset`: 0
       - `component`: (optional)
       - `level`: (optional)

   - **Get Counts**
     - Method: GET
     - URL: `http://localhost:3000/api/counts`
     - Params:
       - `type`: file

   - **Get Timeline**
     - Method: GET
     - URL: `http://localhost:3000/api/timeline`
     - Params:
       - `startTime`: 1704067200000
       - `endTime`: 1704153600000

   - **Clear All**
     - Method: POST
     - URL: `http://localhost:3000/api/clear`

---

## Testing Workflow

### Complete End-to-End Test

1. **Start dev server:**
   ```bash
   vercel dev
   ```

2. **Verify health:**
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Upload a test file:**
   ```bash
   curl -X POST http://localhost:3000/api/parse -F "file=@test/sample.log"
   ```

4. **Query logs:**
   ```bash
   curl "http://localhost:3000/api/logs?limit=10"
   ```

5. **Get counts:**
   ```bash
   curl "http://localhost:3000/api/counts?type=file"
   ```

6. **Get timeline:**
   ```bash
   curl "http://localhost:3000/api/timeline?startTime=0&endTime=$(date +%s)000"
   ```

7. **Clear (optional):**
   ```bash
   curl -X POST http://localhost:3000/api/clear
   ```

---

## Testing Large Files

### Test with 100MB+ File

```bash
# Create a large test file (if needed)
# Note: This is just an example - use your actual log files

# Upload large file
curl -X POST http://localhost:3000/api/parse \
  -F "file=@large-file.log" \
  --max-time 120
```

**Monitor progress:**
- Check Vercel dev server logs
- Watch for memory usage
- Verify blob cleanup after parsing

---

## Production Testing

### Deploy to Vercel Preview

```bash
# Deploy to preview
vercel

# Get preview URL (e.g., https://serverlense-xxx.vercel.app)
# Test endpoints using preview URL instead of localhost:3000
```

### Test Production Endpoints

Replace `localhost:3000` with your Vercel deployment URL:

```bash
curl https://your-project.vercel.app/api/health
curl -X POST https://your-project.vercel.app/api/parse -F "file=@sample.log"
```

---

## Troubleshooting

### Common Issues

1. **"POSTGRES_URL environment variable is not set"**
   - Solution: Check `.env.local` file exists and has `POSTGRES_URL`
   - Run: `npm run test:db` to verify

2. **"Failed to fetch blob"**
   - Solution: Check blob URL is accessible
   - Verify `BLOB_READ_WRITE_TOKEN` is set

3. **"No logs found in file"**
   - Solution: Check file format matches supported formats
   - Verify file is not empty

4. **Database connection errors**
   - Solution: Run `npm run init:db` to initialize schema
   - Check Neon dashboard for connection issues

5. **Function timeout**
   - Solution: Large files may exceed 60s timeout
   - Consider chunked upload for very large files

---

## Performance Testing

### Load Test with Apache Bench

```bash
# Install Apache Bench (if not installed)
# Windows: Download from Apache website
# Mac: brew install httpd
# Linux: apt-get install apache2-utils

# Test query endpoint
ab -n 100 -c 10 http://localhost:3000/api/logs?limit=10

# Test counts endpoint
ab -n 100 -c 10 http://localhost:3000/api/counts?type=file
```

### Monitor Performance

- Check response times
- Monitor database query performance
- Watch for memory leaks
- Verify blob cleanup

---

## Next Steps

After testing:
1. ✅ Verify all endpoints work correctly
2. ✅ Test with various file formats
3. ✅ Test error handling
4. ✅ Verify blob cleanup
5. ✅ Check database performance
6. ✅ Proceed to Phase 2 (Frontend Integration)
