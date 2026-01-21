# Troubleshooting HTTP 403 Errors on Large File Uploads

## Quick Commands to Collect Logs

### 1. View Logs via Vercel CLI
```bash
# View logs for specific deployment (requires deployment URL)
npx vercel logs <deployment-url> | grep -i "parse\|error\|403"

# For latest production deployment:
npx vercel logs https://serverlense-jn1gjqrmh-enriques-projects-e2ad103a.vercel.app | grep "\[Parse\]"

# Filter for errors only
npx vercel logs https://serverlense-jn1gjqrmh-enriques-projects-e2ad103a.vercel.app | grep -i "error\|403"

# Get deployment URL first
npx vercel ls
```

### 2. View Logs via Dashboard
1. Go to: https://vercel.com/enriques-projects-e2ad103a/serverlense/deployments
2. Click on latest deployment
3. Click **"Functions"** → **`api/parse.ts`**
4. Click **"Logs"** tab

### 3. Test Locally with Logging
```bash
# Start dev server
npm run dev:vercel

# Watch terminal output - all logs will appear here
# Try uploading a file and watch for errors
```

---

## Common Causes of HTTP 403

### 1. **Vercel Blob Storage Token Missing/Invalid** ⚠️ MOST LIKELY
**Symptoms:**
- HTTP 403 when uploading any file
- Logs show "Blob storage permission error"

**Fix:**
```bash
# Check if token exists
npx vercel env ls production | grep BLOB_READ_WRITE_TOKEN

# If missing, add it:
# 1. Go to Vercel Dashboard → Project → Settings → Environment Variables
# 2. Add BLOB_READ_WRITE_TOKEN with your token value
# 3. Redeploy
```

### 2. **File Size Limit Exceeded**
**Symptoms:**
- HTTP 403 only on large files (>100MB)
- Logs show "File too large"

**Current Limits:**
- Formidable: 100MB (in code)
- Vercel request body: 4.5MB (standard plan)
- We use Blob Storage to bypass request body limit

**Fix:**
- Files must be < 100MB
- Or increase `maxFileSize` in `api/parse.ts`

### 3. **Function Timeout**
**Symptoms:**
- HTTP 503/504 (not 403, but worth checking)
- Large files timeout before completion

**Current Settings:**
- maxDuration: 60 seconds (vercel.json)
- Large files may need more time

### 4. **Memory Limit Exceeded**
**Symptoms:**
- Function crashes
- HTTP 500 errors

**Current Settings:**
- Memory: 2048MB (2GB)
- Should be sufficient for most files

---

## Enhanced Logging Added

The `api/parse.ts` file now includes detailed logging:

✅ Request received logging
✅ Environment variable checks
✅ File size validation logging
✅ Blob upload progress logging
✅ Error details with stack traces
✅ Specific error type detection (403, file size, etc.)

**All logs prefixed with `[Parse]` for easy filtering:**
```bash
npx vercel logs api/parse --output raw | grep "\[Parse\]"
```

---

## Debugging Steps

### Step 1: Check Environment Variables
```bash
# Production
npx vercel env ls production

# Should see:
# BLOB_READ_WRITE_TOKEN
# POSTGRES_URL
```

### Step 2: Test with Small File
```bash
# Upload a small file (<1MB)
# If it works, issue is file-size related
# If it fails, issue is permissions/configuration
```

### Step 3: Check Logs for Specific Error
```bash
# View parse function logs
npx vercel logs api/parse --output raw --since 1h

# Look for:
# - [Parse] ERROR: BLOB_READ_WRITE_TOKEN not set
# - [Parse] ERROR uploading to Blob Storage
# - [Parse] File too large
# - Permission denied
```

### Step 4: Verify Blob Token
1. Go to Vercel Dashboard
2. Project → Settings → Environment Variables
3. Verify `BLOB_READ_WRITE_TOKEN` exists
4. Verify it's set for Production, Preview, Development
5. Redeploy if you just added/changed it

---

## Expected Log Output

### Successful Upload
```
[Parse] Request received: POST /api/parse
[Parse] Parsing multipart form data...
[Parse] Form data parsed successfully
[Parse] Processing file: log.txt (15.23MB)
[Parse] Reading file from disk...
[Parse] File read: 15.23MB
[Parse] Uploading to Vercel Blob Storage...
[Parse] Blob uploaded: https://...
[Parse] Starting to parse file: log.txt (15.23MB)
[Parse] Parsed 1234 log entries, starting database insert...
[Parse] Successfully inserted 1234 logs for file: log.txt
```

### Error Scenario (403)
```
[Parse] Request received: POST /api/parse
[Parse] Parsing multipart form data...
[Parse] Form data parsed successfully
[Parse] Processing file: large.log (45.67MB)
[Parse] Reading file from disk...
[Parse] File read: 45.67MB
[Parse] Uploading to Vercel Blob Storage...
[Parse] ERROR uploading to Blob Storage: [error details]
[Parse] Blob error details: {...}
```

---

## Quick Fix Checklist

- [ ] Verify `BLOB_READ_WRITE_TOKEN` is set in Vercel
- [ ] Check file size is under 100MB
- [ ] View logs to identify specific error
- [ ] Test with small file to isolate issue
- [ ] Redeploy after changing environment variables
- [ ] Check Vercel plan limits (Pro plan needed for 60s timeout)

---

## Need More Help?

1. **Collect logs:** Use commands above
2. **Share error details:** Copy full error from logs
3. **Check dashboard:** Vercel Dashboard → Functions → Logs
4. **Verify config:** Check `vercel.json` and environment variables
