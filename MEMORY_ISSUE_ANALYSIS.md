# Memory Issue Analysis: Server-Side Out of Memory

## Problem Identified ✅

**Root Cause:** Even though we moved to server-side processing, we're still loading the **entire file into memory** before parsing.

### Current Flow (Memory-Intensive):
```
1. Fetch entire blob file → response.text() → Loads ALL into memory
2. Split entire file → text.split(/\r?\n/) → Creates array of ALL lines
3. Parse ALL lines → Creates ALL LogEntry objects in memory
4. Insert to DB in batches (but all objects already in memory)
```

### Memory Usage Example (100MB file):
- **Blob fetch:** 100MB (entire file string)
- **Lines array:** ~100MB (array of line strings)
- **Parsed objects:** 200-300MB (LogEntry objects, 2-3x expansion)
- **Total:** ~400-500MB per request
- **Vercel limit:** 2048MB (2GB) - but concurrent requests share this!

## Why This Happens

Looking at `lib/parser.ts:510`:
```typescript
const text = await fetchBlobContent(blobUrl);  // ❌ Loads ENTIRE file
// Then:
const lines = text.split(/\r?\n/);  // ❌ Creates array of ALL lines
// Then:
for (let i = 0; i < lines.length; i++) {  // ❌ Processes ALL in memory
    // Creates LogEntry objects...
    parsedLogs.push(entry);  // ❌ All objects stored in memory
}
```

## Solution: Streaming Parser

We need to:
1. **Stream the blob file** in chunks (don't load all at once)
2. **Parse line-by-line** as we read (don't store all lines)
3. **Insert to DB incrementally** (we already batch, but need to parse incrementally)

### New Flow (Memory-Efficient):
```
1. Stream blob file → Read chunks → Process line-by-line
2. Parse each line → Create LogEntry → Insert to DB immediately
3. Clear parsed objects → Continue with next chunk
```

This keeps memory usage constant (~50-100MB) regardless of file size.

## Implementation Plan

1. **Replace `fetchBlobContent`** with streaming version
2. **Parse incrementally** - process lines as we read them
3. **Insert to DB in smaller batches** - don't accumulate all objects
4. **Add memory monitoring** - log memory usage during parsing
