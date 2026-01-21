# Vercel Log Collection Guide for Troubleshooting

## Quick Start: View Logs via Vercel CLI

### 1. Install/Link Vercel CLI
```bash
# Use npx (recommended) - no installation needed
npx vercel login
npx vercel link  # Link to your project
```

### 2. View Recent Logs
```bash
# View logs for all functions
npx vercel logs --follow

# View logs for specific function (parse)
npx vercel logs api/parse --follow

# View logs for last 100 lines
npx vercel logs --output raw | tail -100

# View logs with timestamps
npx vercel logs --output raw --since 1h
```

### 3. Filter Logs by Error
```bash
# Filter for errors only
npx vercel logs --output raw | grep -i "error\|403\|failed"

# Filter for parse function errors
npx vercel logs api/parse --output raw | grep -i "error\|403"
```

### 4. View Logs for Specific Deployment
```bash
# List recent deployments
npx vercel ls

# View logs for specific deployment
npx vercel logs <deployment-url>
```

### 5. View Logs via Dashboard (Web UI)
1. Go to: https://vercel.com/enriques-projects-e2ad103a/serverlense
2. Click on **"Deployments"** tab
3. Click on a deployment
4. Click **"Functions"** tab
5. Click on `api/parse.ts`
6. View **"Logs"** tab

---

## Common HTTP 403 Error Causes

### 1. **Vercel Blob Storage Permissions**
- Check `BLOB_READ_WRITE_TOKEN` environment variable
- Verify token has correct permissions in Vercel Dashboard

### 2. **File Size Limits**
- Current limit: 100MB (in `api/parse.ts`)
- Vercel request body limit: 4.5MB (standard)
- Large files must use Blob Storage (which we do)

### 3. **Function Timeout**
- Current maxDuration: 60 seconds
- Large files may exceed timeout

### 4. **Memory Limits**
- Current memory: 2048MB (2GB)
- Check if function is hitting memory limits

---

## Debugging Commands

### View Environment Variables
```bash
# List all environment variables
npx vercel env ls

# Check specific variable
npx vercel env ls | grep BLOB
```

### Test Parse Function Locally
```bash
# Run dev server with logging
npm run dev:vercel

# Monitor logs in terminal
# Upload file and watch for errors
```

### Check Function Configuration
```bash
# View vercel.json config
cat vercel.json

# Check function limits
# api/parse.ts: maxDuration 60s, memory 2048MB
```

---

## Enhanced Logging

The `api/parse.ts` file has been updated with detailed logging:
- File upload start/size
- Blob storage operations
- Parsing progress
- Database insert progress
- Error details with stack traces

---

## Troubleshooting HTTP 403

### Step 1: Check Logs
```bash
npx vercel logs api/parse --output raw | grep -A 10 "403\|Forbidden"
```

### Step 2: Check Blob Token
```bash
npx vercel env ls production | grep BLOB_READ_WRITE_TOKEN
```

### Step 3: Test File Size
- Try uploading a small file (<10MB) - does it work?
- If small files work, issue is likely file size related

### Step 4: Check Function Logs
- Look for memory errors
- Look for timeout errors
- Look for blob storage permission errors

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `npx vercel logs --follow` | Follow logs in real-time |
| `npx vercel logs api/parse` | Logs for parse function only |
| `npx vercel logs --output raw` | Raw log output |
| `npx vercel ls` | List deployments |
| `npx vercel env ls` | List environment variables |

---

## Next Steps

1. ✅ **Enable enhanced logging** (already in code)
2. ✅ **Collect logs** using commands above
3. ✅ **Identify root cause** (Blob token, file size, timeout)
4. ✅ **Fix issue** based on logs
5. ✅ **Deploy fix** to production
