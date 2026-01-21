# Debugging HTTP 403 Errors - No Logs in Vercel

## Problem
- Browser console shows: `HTTP 403` errors
- Vercel logs show: **Nothing** (function not being invoked)
- This suggests the request is being blocked **before** reaching the serverless function

---

## Possible Causes

### 1. **Vercel Routing Issue** ⚠️ MOST LIKELY
The request might not be routing to `api/parse.ts` correctly.

**Check:**
- Open browser DevTools → **Network** tab
- Upload a file
- Look at the failed request:
  - What URL is it trying to hit?
  - What's the actual HTTP status code?
  - What's the response body?

### 2. **CORS Preflight Failure**
Browser might be blocking the request before it reaches the server.

**Check:**
- Look for OPTIONS requests in Network tab
- Check if CORS headers are present

### 3. **Request Size Limit**
Vercel has a 4.5MB request body limit (standard plan). Large files might be rejected before reaching the function.

**Check:**
- What's the file size?
- Are you uploading multiple files at once?

### 4. **Function Not Deployed**
The function might not exist in the deployment.

**Check:**
- Go to Vercel Dashboard → Deployments → Latest → Functions
- Verify `api/parse.ts` exists

---

## Debugging Steps

### Step 1: Check Network Tab (CRITICAL)
1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Upload a file
4. Find the failed request to `/api/parse`
5. Check:
   - **Request URL**: Should be `https://serverlense.vercel.app/api/parse`
   - **Status Code**: Is it actually 403?
   - **Response Headers**: What do they say?
   - **Response Body**: What's the error message?

### Step 2: Test API Endpoint Directly
```bash
# Test with curl
curl -X POST https://serverlense.vercel.app/api/parse \
  -F "file=@test.log" \
  -v

# Check response headers and status
```

### Step 3: Check Function Exists
```bash
# List functions in deployment
npx vercel inspect <deployment-url> --logs

# Or check dashboard:
# https://vercel.com/enriques-projects-e2ad103a/serverlense/deployments
# → Latest → Functions tab
```

### Step 4: Add More Logging
The code now logs immediately when the function is invoked. If you still see no logs, the function isn't being called.

---

## What to Look For

### In Browser Network Tab:
- **Request URL**: Should match your domain + `/api/parse`
- **Status**: 403, 404, or something else?
- **Response**: Error message or empty?
- **Headers**: CORS headers present?

### In Vercel Logs:
- If you see `[Parse] ===== FUNCTION INVOKED =====`, the function IS being called
- If you see nothing, the function is NOT being called (routing issue)

---

## Quick Test

### Test 1: Health Check
```bash
curl https://serverlense.vercel.app/api/health
```
Should return: `{"status":"ok"}`

### Test 2: Parse Endpoint (Small File)
```bash
# Create a small test file
echo "2024-01-01 10:00:00 INFO Test log entry" > test.log

# Try to upload it
curl -X POST https://serverlense.vercel.app/api/parse \
  -F "file=@test.log" \
  -v
```

### Test 3: Check Function Logs
```bash
# After making a request, immediately check logs
npx vercel logs https://serverlense-jn1gjqrmh-enriques-projects-e2ad103a.vercel.app | grep "\[Parse\]"
```

---

## Expected Behavior

### If Function IS Being Called:
- You'll see logs starting with `[Parse] ===== FUNCTION INVOKED =====`
- Error will be logged with details
- You can trace exactly where it fails

### If Function is NOT Being Called:
- No logs appear in Vercel
- Request fails at routing level
- Check Vercel Dashboard → Functions to see if function exists
- Check Network tab for actual request URL

---

## Next Steps

1. **Check Network Tab** - This will tell us exactly what's happening
2. **Test with curl** - Bypass browser to isolate the issue
3. **Check Vercel Dashboard** - Verify function exists and is deployed
4. **Share Network Tab Details** - Request URL, status, response body

The enhanced logging will help once we confirm the function is being called.
