# Quick Monitoring Commands

## Deployed Successfully ✅

**Production URL:** https://serverlense.vercel.app  
**Deployment ID:** 6SFACQZNaMB3f39fhafk7FiFXwfJ  
**Date:** $(date)

---

## Real-Time Log Monitoring

### Watch logs as they happen:
```bash
npx vercel logs api/parse --follow
```

This will show all logs from the parse function in real-time. All logs are prefixed with `[Parse]` for easy identification.

---

## Filter for Errors

### View only errors:
```bash
npx vercel logs api/parse --output raw | grep -i "error\|403\|failed"
```

### View parse logs only:
```bash
npx vercel logs api/parse --output raw | grep "\[Parse\]"
```

---

## View Recent Logs

### Last 100 lines:
```bash
npx vercel logs --output raw | tail -100
```

### Last hour:
```bash
npx vercel logs --output raw --since 1h
```

---

## Monitor Specific Deployment

### View logs for this deployment:
```bash
npx vercel inspect serverlense-jn1gjqrmh-enriques-projects-e2ad103a.vercel.app --logs
```

---

## Expected Log Format

When you upload a file, you should see logs like:

```
[Parse] Request received: POST /api/parse
[Parse] Parsing multipart form data...
[Parse] Form data parsed successfully
[Parse] Processing file: log.txt (15.23MB)
[Parse] Reading file from disk...
[Parse] File read: 15.23MB
[Parse] Uploading to Vercel Blob Storage...
[Parse] Blob uploaded successfully: https://...
[Parse] Starting to parse file: log.txt (15.23MB)
[Parse] Parsed 1234 log entries, starting database insert...
[Parse] Inserted 1000/1234 logs...
[Parse] Successfully inserted 1234 logs for file: log.txt
```

If there's a 403 error, you'll see:
```
[Parse] ERROR uploading to Blob Storage: [error details]
[Parse] Blob error details: {...}
```

---

## Quick Test

1. **Open the app:** https://serverlense.vercel.app
2. **Start monitoring logs:**
   ```bash
   npx vercel logs api/parse --follow
   ```
3. **Upload a file** in the browser
4. **Watch the logs** in the terminal

---

## Troubleshooting

If you see `ERROR: BLOB_READ_WRITE_TOKEN not set`:
- Check environment variables: `npx vercel env ls production | grep BLOB`
- Add token in Vercel Dashboard → Settings → Environment Variables
- Redeploy after adding

If you see 403 errors:
- Check the detailed error in logs
- Verify blob token is set and valid
- Check file size (max 100MB)
