# Quick Debug Steps for 403 Errors

## The Problem
- Browser shows 403 errors
- Vercel shows NO logs
- **This means the function isn't being called**

---

## Step 1: Check Browser Network Tab ⭐ CRITICAL

1. Open DevTools (F12)
2. Go to **Network** tab
3. Upload a file
4. Find the request to `/api/parse`
5. **Click on it** and check:
   - **Status Code**: Is it 403? 404? Something else?
   - **Request URL**: What's the full URL?
   - **Response**: What does the response body say?
   - **Headers**: Check Response Headers tab

**Share these details** - they'll tell us exactly what's wrong.

---

## Step 2: Test Endpoint Directly (Bypass Browser)

```bash
# Test health endpoint first
curl https://serverlense.vercel.app/api/health

# Should return: {"status":"ok"}

# Test parse endpoint with small file
echo "2024-01-01 10:00:00 INFO Test" > test.log
curl -X POST https://serverlense.vercel.app/api/parse \
  -F "file=@test.log" \
  -v

# Check what status code you get
```

---

## Step 3: Check Vercel Dashboard

1. Go to: https://vercel.com/enriques-projects-e2ad103a/serverlense/deployments
2. Click **latest deployment**
3. Click **Functions** tab
4. **Verify `api/parse.ts` exists**
5. Click on it → **Logs** tab
6. Try uploading a file and watch for logs

---

## Step 4: Deploy Enhanced Logging

I've added logging that runs **immediately** when the function is called. After deploying:

```bash
# Deploy
npm run vercel:deploy

# Then test and check logs
npx vercel logs <deployment-url> | grep "\[Parse\]"
```

If you see `[Parse] ===== FUNCTION INVOKED =====`, the function IS being called.
If you see nothing, the function is NOT being called (routing issue).

---

## Most Likely Causes

### 1. **Request Size Limit** (If uploading large files)
- Vercel standard plan: 4.5MB request body limit
- Large files get rejected BEFORE reaching function
- **Solution**: Files must be < 4.5MB OR use Blob Storage (which we do, but upload might still fail)

### 2. **Function Not Deployed**
- Check Vercel Dashboard → Functions
- Verify `api/parse.ts` exists

### 3. **Routing Issue**
- Request URL might be wrong
- Check Network tab for actual URL being called

### 4. **CORS Preflight Failure**
- Browser blocks request before it reaches server
- Check Network tab for OPTIONS request

---

## What to Share

Please share:
1. **Network Tab Details**:
   - Request URL
   - Status Code
   - Response Body
   - Response Headers

2. **File Size**: How big are the files you're uploading?

3. **curl Test Results**: What does `curl` return?

This will help us pinpoint the exact issue.
