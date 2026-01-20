# Debugging Guide: Viewing Logs for Server-Side Processing

## Issue: Parsing Stuck at 95%

The progress indicator shows 95% because:
1. **Client-side progress simulation** reaches 95% quickly (artificial progress)
2. **Server is still processing** - parsing file and inserting logs into database
3. **Progress only reaches 100%** when the server responds

## How to View Logs

### 1. Browser Console (Client-Side)
Open browser DevTools (F12) and check:
- **Console tab**: Look for errors or network issues
- **Network tab**: 
  - Find the `/api/parse` request
  - Check if it's still "pending" (means server is processing)
  - Check response time and status code

### 2. Server Logs (Vercel Dev)
If running `vercel dev`, check the terminal where you started it:
```bash
# Look for:
- "Parse error:" messages
- Database connection errors
- Timeout errors
- Function invocation logs
```

### 3. Database Logs
Check your Neon database dashboard:
- Connection issues
- Query performance
- Timeout errors

### 4. Network Tab Debugging
1. Open DevTools → Network tab
2. Filter by "parse"
3. Click on the `/api/parse` request
4. Check:
   - **Status**: Should be 200 when complete, or pending if still processing
   - **Time**: Shows how long the request has been running
   - **Response**: Will show error message if failed

## Root Cause

The server-side code in `api/parse.ts` is inserting logs **one by one** in a loop:
```typescript
for (const log of batch) {
    await sql`INSERT INTO logs ...`; // One insert per log = VERY SLOW
}
```

For a file with 3,000+ logs, this means 3,000+ individual database queries, which can take several minutes.

## Quick Fix

The code should use batch inserts or prepared statements. See the fix in the code changes.
