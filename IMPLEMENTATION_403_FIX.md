# Implementation: Fix for Vercel 403 Forbidden (4.5MB Limit)

## Problem Identified ✅

**Root Cause:** Vercel has a **hard 4.5MB limit** for serverless function request bodies. Files larger than 4.5MB are rejected **before** reaching the function, resulting in:
- HTTP 403 Forbidden
- No Vercel logs (function never invoked)
- Response: "Forbidden" with error ID

## Solution Implemented ✅

**Client-Side Blob Upload:** Upload files directly from browser to Vercel Blob Storage, bypassing the 4.5MB limit entirely.

### Architecture

```
Old Flow (Broken for >4.5MB):
Browser → POST /api/parse (file in body) → Vercel Function
         ❌ Fails if file > 4.5MB

New Flow (Works for any size):
Browser → GET /api/blob-upload-token → Get upload URL
Browser → Upload directly to Blob Storage → Get blob URL
Browser → POST /api/parse (blobUrl in JSON) → Vercel Function → Parse from blob
         ✅ No size limit (blob handles large files)
```

## Files Changed

### 1. `api/blob-upload-token.ts` (NEW)
- Generates secure upload tokens for client-side blob uploads
- Returns `{ url, token }` for direct browser-to-blob uploads

### 2. `api/parse.ts` (MODIFIED)
- **Dual Mode Support:**
  - **JSON Mode:** Accepts `{ blobUrl, fileName }` (for files > 4.5MB)
  - **Legacy Mode:** Accepts `multipart/form-data` (for files < 4.5MB)
- Detects content type and handles both formats
- Validates 4.5MB limit for legacy mode with clear error message

### 3. `src/api/client.ts` (MODIFIED)
- **Automatic Detection:** Checks file size before upload
- **> 4.5MB:** Uses client-side blob upload flow
- **< 4.5MB:** Uses legacy direct upload (faster for small files)
- Progress tracking for both methods

## How It Works

### For Files > 4.5MB:

1. **Get Upload Token** (`GET /api/blob-upload-token`)
   - Server generates secure upload URL + token
   - Client receives `{ url, token }`

2. **Upload to Blob** (Browser → Vercel Blob Storage)
   - Client uploads file directly using `@vercel/blob/client`
   - Bypasses Vercel serverless function entirely
   - Progress tracked: 20% → 70%

3. **Parse from Blob** (`POST /api/parse` with `{ blobUrl, fileName }`)
   - Server receives blob URL (not file)
   - Downloads from blob, parses, inserts to DB
   - Deletes blob after parsing
   - Progress: 70% → 100%

### For Files < 4.5MB:

- Uses legacy `multipart/form-data` upload (faster, simpler)
- No changes to existing behavior

## Testing

### Test Small File (< 4.5MB):
```bash
# Should use legacy multipart/form-data method
# Should work as before
```

### Test Large File (> 4.5MB):
```bash
# Should automatically use client-side blob upload
# Should bypass 4.5MB limit
# Should show progress: 10% → 20% → 70% → 100%
```

## Error Handling

- **403 Forbidden:** Clear error message directing to use blob upload for large files
- **Token Generation Failure:** Detailed error with troubleshooting steps
- **Blob Upload Failure:** Error propagated with context
- **Parse Failure:** Blob cleaned up automatically

## Benefits

1. ✅ **No Size Limit:** Files of any size can be uploaded
2. ✅ **Backward Compatible:** Small files still use faster direct upload
3. ✅ **Automatic:** Client automatically chooses best method
4. ✅ **Progress Tracking:** Full progress visibility for both methods
5. ✅ **Secure:** Uses Vercel's secure token system

## Deployment Checklist

- [x] Install `@vercel/blob@latest` (already installed)
- [x] Create `api/blob-upload-token.ts`
- [x] Update `api/parse.ts` for dual mode
- [x] Update `src/api/client.ts` for automatic detection
- [ ] Test with small file (< 4.5MB)
- [ ] Test with large file (> 4.5MB)
- [ ] Deploy to Vercel
- [ ] Verify production behavior

## Next Steps

1. **Deploy to Vercel:**
   ```bash
   npm run vercel:deploy
   ```

2. **Test Upload:**
   - Try uploading a file > 4.5MB
   - Should automatically use blob upload
   - Should complete successfully

3. **Monitor Logs:**
   - Check Vercel logs for `[BlobToken]` and `[Parse]` entries
   - Verify blob cleanup after parsing

## Notes

- Blob files are **temporary** - deleted immediately after parsing
- Only parsed logs are stored in PostgreSQL
- No long-term blob storage costs
- Client-side blob upload supports files up to **5TB** (Vercel Blob limit)
