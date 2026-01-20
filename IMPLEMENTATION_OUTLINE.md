# Vercel Serverless Implementation Outline

## Overview

This document provides a high-level outline for implementing ServerLense using Vercel serverless functions. Files are **temporary only** - uploaded, parsed, and immediately deleted. Only parsed log data is stored in Postgres.

---

## Key Design Decisions

### File Storage Policy
- ✅ **Files are NOT stored long-term**
- ✅ Uploaded to Vercel Blob Storage temporarily (for parsing only)
- ✅ Deleted immediately after parsing completes
- ✅ Deleted when 'Clear' is used
- ✅ Deleted on session termination
- ✅ Only parsed log data stored in Postgres database

### Architecture
- **Frontend**: React UI (minimal changes)
- **Backend**: Vercel Serverless Functions
- **Database**: Vercel Postgres
- **Storage**: Vercel Blob (temporary only)

---

## Implementation Phases

### Phase 1: Backend Setup (Days 1-3)

#### Day 1: Project Structure & Database
- [ ] Set up Vercel project structure (`api/`, `lib/` directories)
- [ ] Create Vercel Postgres database
- [ ] Run database schema migration
- [ ] Set up environment variables
- [ ] Test database connection

#### Day 2: Parser Port & API Endpoints
- [ ] Port parser from `src/utils/parser.ts` to `lib/parser.ts`
  - Replace `File` API with fetch from Blob URL
  - Remove IndexedDB writes
  - Return parsed logs array
- [ ] Create `/api/parse.ts` endpoint
  - Accept file upload
  - Upload to Blob Storage (temporary)
  - Call parser
  - Insert logs to Postgres
  - **Delete blob immediately after parsing**
- [ ] Create `/api/logs/index.ts` endpoint
  - Query logs with filters
  - Pagination support
- [ ] Create `/api/counts/index.ts` endpoint
  - Get correlation counts

#### Day 3: Additional Endpoints & Testing
- [ ] Create `/api/timeline/index.ts` endpoint
- [ ] Create `/api/clear/index.ts` endpoint
  - Delete all logs from Postgres
  - **Delete all temporary blob files**
- [ ] Test all endpoints with Postman/curl
- [ ] Performance testing

---

### Phase 2: Frontend Refactoring (Days 4-7)

#### Day 4: API Client & FileUploader
- [ ] Create `src/api/client.ts` module
  - `uploadLogFile()` - Upload and parse
  - `getLogs()` - Query logs
  - `getCorrelationCounts()` - Get counts
  - `clearAllLogs()` - Clear everything
- [ ] Refactor `FileUploader.tsx`
  - Replace `parseLogFile()` with `uploadLogFile()`
  - Remove IndexedDB mode logic
  - Update progress handling
  - Handle API errors

#### Day 5-6: LogContext Refactoring
- [ ] Remove `logs` state array
- [ ] Remove IndexedDB dependencies
- [ ] Add API-based data fetching
- [ ] Implement pagination state
- [ ] Update `filteredLogs` to query API
- [ ] Update correlation data fetching
- [ ] Add loading/error states

#### Day 7: Component Updates
- [ ] Update `LogViewer.tsx` - Use API-loaded logs, pagination
- [ ] Update `CorrelationSidebar.tsx` - Fetch counts from API
- [ ] Update `TimelineScrubber.tsx` - Fetch timeline from API
- [ ] Update `CallFlowViewer.tsx` - Use API data
- [ ] Update `ExportModal.tsx` - Export from API
- [ ] Remove all IndexedDB references

---

### Phase 3: Testing & Deployment (Days 8-10)

#### Day 8: Integration Testing
- [ ] Test file upload flow end-to-end
- [ ] Test log querying with filters
- [ ] Test correlation counts
- [ ] Test timeline aggregation
- [ ] Test Clear functionality
- [ ] Test error handling

#### Day 9: Performance Optimization
- [ ] Optimize database queries
- [ ] Add query caching (if needed)
- [ ] Optimize pagination
- [ ] Test with 800MB+ files
- [ ] Load testing

#### Day 10: Deployment
- [ ] Deploy to Vercel preview
- [ ] Run database migrations
- [ ] Test in preview environment
- [ ] Deploy to production
- [ ] Monitor performance
- [ ] Gather feedback

---

## File-by-File Refactoring Summary

### Backend Files (New)

| File | Purpose | Status |
|------|---------|--------|
| `api/parse.ts` | File upload & parsing | ⏳ To Create |
| `api/logs/index.ts` | Query logs endpoint | ⏳ To Create |
| `api/counts/index.ts` | Correlation counts | ⏳ To Create |
| `api/timeline/index.ts` | Timeline data | ⏳ To Create |
| `api/clear/index.ts` | Clear all data | ⏳ To Create |
| `lib/parser.ts` | Ported parser | ⏳ To Create |
| `lib/db.ts` | Postgres client | ⏳ To Create |
| `lib/blob.ts` | Blob utilities | ⏳ To Create |

### Frontend Files (Modify)

| File | Changes Required | Complexity |
|------|----------------|------------|
| `src/api/client.ts` | **NEW** - API client module | Low |
| `src/components/FileUploader.tsx` | Replace parser call with API | Low |
| `src/contexts/LogContext.tsx` | Major refactoring - API calls | High |
| `src/components/LogViewer.tsx` | Pagination, API loading | Medium |
| `src/components/CorrelationSidebar.tsx` | Fetch counts from API | Low |
| `src/components/TimelineScrubber.tsx` | Fetch timeline from API | Medium |
| `src/components/CallFlowViewer.tsx` | Use API data | Low |
| `src/components/export/ExportModal.tsx` | Export from API | Low |

### Files to Remove/Deprecate

| File | Action |
|------|--------|
| `src/utils/indexedDB.ts` | Remove or deprecate |
| IndexedDB references | Remove from all files |

---

## API Endpoints Specification

### POST `/api/parse`
**Purpose**: Upload and parse log file

**Request:**
```typescript
FormData {
  file: File
}
```

**Response:**
```typescript
{
  success: true,
  count: number,        // Number of logs parsed
  sessionId?: string    // Optional session ID
}
```

**Behavior:**
1. Upload file to Blob Storage (`temp/` prefix)
2. Parse file from blob URL
3. Insert logs to Postgres (batch)
4. **Delete blob file immediately**
5. Return count

---

### GET `/api/logs`
**Purpose**: Query logs with filters

**Query Parameters:**
```typescript
{
  offset?: number,        // Pagination offset
  limit?: number,          // Page size (default: 1000)
  component?: string,     // Filter by component
  callId?: string,        // Filter by Call ID
  fileName?: string,      // Filter by file name
  level?: string,         // Filter by level
  isSip?: boolean,        // Filter SIP logs
  search?: string,        // Full-text search
  startTime?: number,     // Timestamp range start
  endTime?: number        // Timestamp range end
}
```

**Response:**
```typescript
{
  logs: LogEntry[],
  total: number,          // Total count matching filters
  offset: number,
  limit: number
}
```

---

### GET `/api/counts`
**Purpose**: Get correlation counts

**Query Parameters:**
```typescript
{
  type: 'file' | 'callId' | 'report' | 'operator' | 'extension' | 'station'
}
```

**Response:**
```typescript
{
  counts: Array<{
    value: string,
    count: number
  }>
}
```

---

### GET `/api/timeline`
**Purpose**: Get aggregated timeline data

**Query Parameters:**
```typescript
{
  startTime: number,
  endTime: number,
  fileName?: string
}
```

**Response:**
```typescript
{
  timeline: Array<{
    timeBucket: number,
    errorCount: number,
    sipRequestCount: number,
    sipSuccessCount: number,
    sipErrorCount: number
  }>
}
```

---

### POST `/api/clear`
**Purpose**: Clear all logs and temporary files

**Response:**
```typescript
{
  success: true,
  deletedLogs: number,
  deletedBlobs: number
}
```

**Behavior:**
1. Delete all logs from Postgres
2. **Delete all blob files** (cleanup temp storage)
3. Return counts

---

## Data Flow

### File Upload Flow
```
1. User selects file
   ↓
2. FileUploader → POST /api/parse (FormData)
   ↓
3. Server: Upload to Blob Storage (temp/)
   ↓
4. Server: Parse file from blob URL
   ↓
5. Server: Insert logs to Postgres (batch)
   ↓
6. Server: Delete blob file ✅
   ↓
7. Server: Return { success: true, count: N }
   ↓
8. Client: Update UI with count
```

### Log Query Flow
```
1. User applies filter
   ↓
2. LogContext → GET /api/logs?filter=...
   ↓
3. Server: Query Postgres with filters
   ↓
4. Server: Return logs + total count
   ↓
5. Client: Update LogViewer with results
```

### Clear Flow
```
1. User clicks Clear
   ↓
2. App → POST /api/clear
   ↓
3. Server: DELETE FROM logs
   ↓
4. Server: Delete all blob files ✅
   ↓
5. Server: Return success
   ↓
6. Client: Reset UI state
```

---

## Critical Implementation Details

### File Cleanup Strategy

**After Parsing:**
```typescript
try {
  const blob = await put(`temp/${Date.now()}-${file.name}`, file);
  const logs = await parseLogFile(blob.url);
  await insertLogsToPostgres(logs);
  await del(blob.url); // ✅ Delete immediately
} catch (error) {
  await del(blob.url).catch(() => {}); // ✅ Cleanup on error
  throw error;
}
```

**On Clear:**
```typescript
// Delete all logs
await sql`DELETE FROM logs`;

// Delete all temporary blob files
const blobs = await list({ prefix: 'temp/' });
await Promise.all(blobs.blobs.map(b => del(b.url)));
```

**Session Termination:**
- Option 1: Cron job to clean up old temp files (if any remain)
- Option 2: Client-side cleanup on page unload
- Option 3: TTL on blob storage (if supported)

---

## Testing Checklist

### Backend Tests
- [ ] Parse 800MB file successfully
- [ ] Delete blob after parsing
- [ ] Handle parsing errors (cleanup blob)
- [ ] Query logs with all filter types
- [ ] Pagination works correctly
- [ ] Clear deletes logs and blobs
- [ ] Full-text search works

### Frontend Tests
- [ ] Upload file shows progress
- [ ] Logs load from API
- [ ] Filters trigger API calls
- [ ] Pagination loads more logs
- [ ] Correlation sidebar shows counts
- [ ] Timeline displays correctly
- [ ] Clear button works
- [ ] Error handling displays properly

### Integration Tests
- [ ] Upload → Parse → Query flow
- [ ] Filter → Query → Display flow
- [ ] Clear → Reset flow
- [ ] Multiple file uploads
- [ ] Concurrent requests

### Performance Tests
- [ ] Parse 800MB in < 60s
- [ ] Query 1M logs in < 1s
- [ ] Support 10+ concurrent users
- [ ] No memory leaks

---

## Risk Mitigation

### High Risk: Parser Migration
- **Risk**: Breaking log format support
- **Mitigation**: Keep all parsing logic, only change I/O layer

### Medium Risk: Performance
- **Risk**: API calls slower than IndexedDB
- **Mitigation**: Caching, pagination, edge functions

### Low Risk: File Cleanup
- **Risk**: Blobs not deleted (costs)
- **Mitigation**: Always use try/finally, cleanup on error

---

## Success Criteria

### Functional
- ✅ All log formats parse correctly
- ✅ All filters work
- ✅ Files deleted after parsing
- ✅ Clear deletes everything
- ✅ No files stored long-term

### Performance
- ✅ Parse 800MB in < 60s
- ✅ Query logs in < 500ms
- ✅ UI remains responsive

### Cost
- ✅ Blob Storage: < $2/month (temporary only)
- ✅ Total: ~$25-42/month (Vercel Pro)

---

## Next Steps

1. **Review this outline** with team
2. **Set up Vercel project** and database
3. **Start Phase 1** - Backend implementation
4. **Daily standups** to track progress
5. **Weekly reviews** to adjust plan

---

## Questions to Resolve

1. **Session Management**: How to track sessions? (for cleanup)
2. **Progress Updates**: Polling or WebSocket?
3. **Error Recovery**: Retry logic for failed uploads?
4. **File Size Limits**: Maximum file size to support?
5. **Concurrent Uploads**: Support multiple files simultaneously?

---

## Resources

- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel Blob Storage](https://vercel.com/docs/storage/vercel-blob)
- [Implementation Plan](./VERCEL_IMPLEMENTATION_PLAN.md)
- [Codebase Review](./CODEBASE_REVIEW.md)
