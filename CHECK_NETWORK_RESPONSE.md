# How to Check the Actual 403 Error

## The Issue

You're seeing minified JavaScript in the Console tab - that's normal (bundled React code).  
**We need to check the Network tab Response to see the actual server error.**

---

## Step-by-Step Instructions

### 1. Open DevTools
- Press `F12` or Right-click → Inspect

### 2. Go to Network Tab
- Click the **"Network"** tab (not Console)

### 3. Upload a File
- Upload a file in your browser
- Watch the Network tab populate

### 4. Find the Failed Request
- Look for a request named **`parse`** 
- It will be **red** (failed)
- Status will show **403** (or another error code)

### 5. Click on the Request
- Click on the `parse` request

### 6. Check the Response Tab
- In the details panel, click **"Response"** tab
- **NOT** the "Console" tab
- **NOT** the "Preview" tab

### 7. Copy the Error Message
- You should see something like:
  ```json
  {"error": "Permission denied", "details": "..."}
  ```
- Or:
  ```json
  {"error": "File too large"}
  ```
- **Copy this exact message**

---

## What to Look For

### In the Response Tab, you might see:

**Option 1: Permission Error**
```json
{
  "error": "Permission denied",
  "details": "Failed to upload file to storage. Check BLOB_READ_WRITE_TOKEN environment variable."
}
```

**Option 2: File Size Error**
```json
{
  "error": "File too large: 150.23MB. Maximum size is 100MB."
}
```

**Option 3: Server Configuration Error**
```json
{
  "error": "Server configuration error: Blob storage token missing"
}
```

**Option 4: Empty Response**
- If you see nothing or just `{}`, the function might not be responding correctly

---

## Also Check These Tabs

### Headers Tab
- **Request URL**: Should be `https://serverlense.vercel.app/api/parse`
- **Status Code**: What's the exact status? (403, 500, 404?)
- **Response Headers**: Any error headers?

### Payload Tab
- **Form Data**: Is the file actually being sent?
- **File size**: What's the size?

---

## After You Find the Error

Share:
1. **Status Code** (from Headers tab)
2. **Response Body** (from Response tab)
3. **File Size** (from Payload tab)

This will tell us exactly what's wrong!

---

## Quick Test

You can also test directly with curl:

```bash
# Create a small test file
echo "2024-01-01 10:00:00 INFO Test log" > test.log

# Upload it
curl -X POST https://serverlense.vercel.app/api/parse \
  -F "file=@test.log" \
  -v

# Check what status code and response you get
```

This bypasses the browser and shows the raw server response.
