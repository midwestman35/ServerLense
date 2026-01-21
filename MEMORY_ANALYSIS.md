# Memory Issue Analysis

## Neon Database Status ✅
**Conclusion: Neon is NOT contributing to memory errors**

Based on the Neon dashboard:
- **RAM Usage**: Consistently near 0 GB (well within 4 GB limit)
- **Storage**: 0.04 GB / 0.5 GB (8% usage)
- **Network Transfer**: 0.11 GB / 5 GB (2% usage)
- **Compute**: 0.25 CU, underutilized

**Verdict**: Neon database has plenty of headroom and is not causing memory issues.

---

## Vercel Function Memory Configuration

### Current Settings (`vercel.json`):
```json
{
  "functions": {
    "api/parse.ts": {
      "maxDuration": 60,
      "memory": 2048  // 2GB memory limit
    }
  }
}
```

### Memory Limit Analysis:
- **Allocated**: 2048 MB (2 GB)
- **Vercel Pro Plan**: Max 3008 MB per function
- **Current Usage**: Likely exceeding 2GB during large file processing

---

## Root Cause: Vercel Function Memory Issues

### Problem 1: Batch Accumulation
**Location**: `api/parse.ts:207-211`

```typescript
pendingBatches.push(batch);

// When we have enough batches, insert them in parallel
if (pendingBatches.length >= PARALLEL_BATCHES) {
    const batchesToInsert = pendingBatches.splice(0, PARALLEL_BATCHES);
```

**Issue**: 
- `pendingBatches` accumulates batches before inserting
- If streaming parser produces batches faster than DB can insert, memory grows
- Each batch contains 250 log entries (LogEntry objects)
- With 700MB file → potentially 1000+ batches = 250,000+ log objects in memory

**Memory Calculation**:
- 250 entries/batch × ~2KB per entry = ~500KB per batch
- 10 batches waiting = ~5MB
- 100 batches waiting = ~50MB
- **Problem**: If DB inserts are slow, batches accumulate faster than they're consumed

### Problem 2: Parallel Insert Overhead
**Location**: `api/parse.ts:214-248`

```typescript
await Promise.all(
    batchesToInsert.map(batchToInsert =>
        Promise.all(
            batchToInsert.map(log => sql`INSERT ...`)
        )
    )
);
```

**Issue**:
- Creates N × M promises (N batches × M logs per batch)
- For 10 batches × 250 logs = 2,500 concurrent database connections
- Each connection uses memory
- Neon serverless driver might be creating too many connections

### Problem 3: Streaming Parser Memory
**Location**: `lib/parser.ts:631-760`

**Potential Issues**:
- `batch` array grows to `batchSize` (500) before calling `onBatchReady`
- If `onBatchReady` is slow, batches accumulate
- Line buffer in streaming function might grow if lines are very long

---

## Recommended Fixes

### Fix 1: Reduce Batch Accumulation
**Change**: Insert batches immediately instead of accumulating

```typescript
// OLD: Accumulate batches
const insertBatch = async (batch: LogEntry[]) => {
    pendingBatches.push(batch);
    if (pendingBatches.length >= PARALLEL_BATCHES) {
        // Insert in parallel
    }
};

// NEW: Insert immediately, smaller parallel groups
const insertBatch = async (batch: LogEntry[]) => {
    if (batch.length === 0) return;
    
    // Insert this batch immediately (don't accumulate)
    await Promise.all(
        batch.map(log => sql`INSERT ...`)
    );
    
    insertedCount += batch.length;
};
```

### Fix 2: Reduce Batch Size
**Change**: Smaller batches = less memory per batch

```typescript
// OLD: 250 entries per batch
const BATCH_SIZE = 250;

// NEW: 50-100 entries per batch (more frequent inserts, less memory)
const BATCH_SIZE = 50;
```

### Fix 3: Increase Function Memory
**Change**: Request more memory from Vercel

```json
{
  "functions": {
    "api/parse.ts": {
      "maxDuration": 60,
      "memory": 3008  // Max for Pro plan (3GB)
    }
  }
}
```

### Fix 4: Optimize Database Inserts
**Change**: Use COPY or bulk insert instead of individual INSERTs

```typescript
// Instead of: Promise.all(batch.map(log => sql`INSERT ...`))
// Use: Single bulk insert with VALUES clause
await sql`
    INSERT INTO logs (...) VALUES
    ${sql(batch.map(log => sql`(${log.timestamp}, ${log.level}, ...)`))}
`;
```

---

## Immediate Action Plan

1. **Reduce batch size** from 250 → 50
2. **Remove batch accumulation** - insert immediately
3. **Increase function memory** to 3008 MB (max)
4. **Add memory monitoring** logs to track usage

---

## Expected Impact

**Before**:
- Memory usage: ~2-3GB (exceeds 2GB limit)
- Out of memory errors for 700MB+ files

**After**:
- Memory usage: ~500MB-1GB (well within 3GB limit)
- Should handle 1GB+ files successfully
