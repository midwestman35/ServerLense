# Performance Optimization Plan for Vercel Hardware

## Current Hardware Allocation

### Build Settings
- **4 vCPUs** - Available during build
- **8 GB Memory** - Available during build

### Runtime Settings (Per Function)
- **1 vCPU** - Available per serverless function
- **2 GB Memory** - Available per serverless function
- **Fluid Compute** - Enabled (dynamic scaling)

## Current Performance Bottlenecks

1. **Parser (`/api/parse`)**:
   - Batch size: 100 rows in parallel
   - Sequential batch processing
   - No streaming for large files
   - Memory: Loads entire file into memory

2. **Database Queries**:
   - No connection pooling optimization
   - Sequential query execution
   - No query result caching

3. **API Routes**:
   - Standard query limits (1000 default, 5000 max)
   - No parallel query execution where possible

## Optimization Strategy

### 1. Increase Database Batch Size (High Impact)

**Current**: 100 rows per batch
**Optimized**: 200-300 rows per batch (utilize 1 vCPU + 2GB better)

**Rationale**: With 1 vCPU and 2GB memory, we can handle larger batches. The bottleneck is network I/O, not CPU.

**Implementation**:
```typescript
// api/parse.ts
const BATCH_SIZE = 250; // Increased from 100
```

**Expected Improvement**: 2-3x faster database inserts

---

### 2. Parallel Batch Processing (High Impact)

**Current**: Process batches sequentially
**Optimized**: Process multiple batches in parallel (with limits)

**Rationale**: With 1 vCPU, we can still parallelize I/O-bound operations (database inserts).

**Implementation**:
```typescript
// Process 2-3 batches in parallel
const PARALLEL_BATCHES = 2;
const BATCH_SIZE = 200;

for (let i = 0; i < logs.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
    const parallelBatches = [];
    for (let j = 0; j < PARALLEL_BATCHES && (i + j * BATCH_SIZE) < logs.length; j++) {
        const batch = logs.slice(i + j * BATCH_SIZE, i + (j + 1) * BATCH_SIZE);
        parallelBatches.push(
            Promise.all(batch.map(log => sql`INSERT INTO logs ...`))
        );
    }
    await Promise.all(parallelBatches);
}
```

**Expected Improvement**: 2x faster for large files

---

### 3. Streaming Parser for Large Files (Medium Impact)

**Current**: Load entire file into memory
**Optimized**: Stream file in chunks, parse incrementally

**Rationale**: With 2GB memory limit, streaming prevents OOM errors and allows processing larger files.

**Implementation**:
```typescript
// lib/parser.ts
async function* parseLogFileStreaming(
    blobUrl: string,
    fileName: string,
    fileColor: string,
    chunkSize: number = 5 * 1024 * 1024 // 5MB chunks
): AsyncGenerator<LogEntry[]> {
    const response = await fetch(blobUrl);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let processedBytes = 0;
    const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ''; // Keep incomplete line
        
        // Parse chunk
        const parsed = parseLines(lines, fileName, fileColor);
        yield parsed;
        
        processedBytes += value.length;
    }
    
    // Parse remaining buffer
    if (buffer.trim()) {
        yield parseLines([buffer], fileName, fileColor);
    }
}
```

**Expected Improvement**: 
- Can handle files > 2GB
- Lower memory usage
- Better progress tracking

---

### 4. Optimize Database Queries (Medium Impact)

**Current**: Sequential queries, no caching
**Optimized**: Parallel queries where possible, result caching

**Implementation**:
```typescript
// api/logs/index.ts
// Run count and data queries in parallel
const [countResult, logsResult] = await Promise.all([
    countQuery,
    logsQuery
]);
```

**Expected Improvement**: 30-50% faster query responses

---

### 5. Increase Query Limits (Low Impact, Easy Win)

**Current**: Default 1000, max 5000
**Optimized**: Increase default to 2000, max to 10000

**Rationale**: With 2GB memory, we can handle larger result sets.

**Implementation**:
```typescript
// api/logs/index.ts
const limitNum = Math.min(parseInt(limit as string, 10), 10000); // Increased from 5000
const defaultLimit = 2000; // Increased from 1000
```

**Expected Improvement**: Fewer API calls needed

---

### 6. Connection Pooling Optimization (Low Impact)

**Current**: Neon serverless uses HTTP connections (no traditional pooling)
**Optimized**: Batch multiple operations together

**Note**: Neon serverless already optimizes connections. Focus on batching operations.

---

### 7. Memory-Efficient Parsing (Medium Impact)

**Current**: Creates full log objects in memory
**Optimized**: Stream parsing, process and insert immediately

**Implementation**: Combine streaming parser with immediate batch inserts

**Expected Improvement**: Lower memory usage, can handle larger files

---

## Implementation Priority

### Phase 1: Quick Wins (30 min - 1 hour)
1. ✅ Increase batch size to 250
2. ✅ Increase query limits
3. ✅ Parallel batch processing (2 batches at once)

**Expected Improvement**: 2-3x faster parsing

### Phase 2: Streaming (2-3 hours)
4. ✅ Implement streaming parser
5. ✅ Combine streaming with batch inserts

**Expected Improvement**: Can handle files > 2GB, lower memory usage

### Phase 3: Query Optimization (1 hour)
6. ✅ Parallel query execution
7. ✅ Optimize WHERE clause building

**Expected Improvement**: 30-50% faster queries

---

## Expected Performance Gains

| Optimization | Current | Optimized | Improvement |
|-------------|---------|-----------|-------------|
| Parse 10k logs | ~30s | ~10-15s | 2-3x faster |
| Parse 100k logs | ~5min | ~2-3min | 2-2.5x faster |
| Query response | ~500ms | ~300ms | 40% faster |
| Max file size | ~500MB | >2GB | 4x+ larger |
| Memory usage | ~1.5GB | ~800MB | 50% reduction |

---

## Monitoring

After implementing optimizations, monitor:
- Function execution time (Vercel dashboard)
- Memory usage (Vercel logs)
- Database connection time
- Error rates

Adjust batch sizes based on actual performance.
