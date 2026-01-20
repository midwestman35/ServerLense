# Vercel Serverless Implementation Plan

## Executive Summary

This document outlines the implementation plan for migrating NocLense from client-side processing to Vercel serverless architecture. The migration will move log parsing, storage, and querying to serverless functions while maintaining the existing React UI.

**Key Design Decision**: **Files are NOT stored long-term**. Uploaded files are:
- Temporarily stored in Vercel Blob Storage for parsing only
- Deleted immediately after parsing completes
- Deleted when 'Clear' is used or session terminates
- Only parsed log data is stored in Postgres database

**Timeline**: 2 weeks  
**Complexity**: Medium  
**Risk**: Low (can deploy incrementally)

---

## Codebase Review

### Current Architecture Analysis

#### 1. **Parser Module** (`src/utils/parser.ts`)
**Current State:**
- ✅ Well-structured, supports multiple formats (Original, ISO, Datadog CSV, Homer SIP)
- ✅ Already has streaming support for large files
- ✅ Handles IndexedDB integration
- ⚠️ Uses browser `File` API
- ⚠️ Direct IndexedDB writes

**Refactoring Needed:**
- Convert `File` API to Node.js `fs` or Vercel Blob
- Remove IndexedDB writes, return parsed logs instead
- Adapt streaming to work with Vercel Blob URLs
- Keep all parsing logic (minimal changes)

**Complexity**: Low-Medium (mostly API adaptations)

#### 2. **FileUploader Component** (`src/components/FileUploader.tsx`)
**Current State:**
- ✅ Handles file validation
- ✅ Shows progress indicators
- ✅ Memory warnings
- ⚠️ Calls `parseLogFile()` directly
- ⚠️ Manages IndexedDB mode

**Refactoring Needed:**
- Replace `parseLogFile()` call with API upload
- Upload file to `/api/parse` endpoint
- Handle streaming progress from server
- Remove IndexedDB mode logic

**Complexity**: Low (mostly replacing function calls)

#### 3. **LogContext** (`src/contexts/LogContext.tsx`)
**Current State:**
- ✅ Comprehensive state management
- ✅ Filtering, sorting, correlation logic
- ⚠️ Manages `logs` array in memory
- ⚠️ Uses IndexedDB for large files
- ⚠️ Computes correlation data from logs

**Refactoring Needed:**
- Replace `logs` state with API calls
- Fetch logs from `/api/logs` endpoint
- Fetch correlation data from `/api/counts` endpoint
- Implement pagination/virtual scrolling with API
- Remove IndexedDB dependencies

**Complexity**: Medium (significant refactoring of data fetching)

#### 4. **IndexedDB Manager** (`src/utils/indexedDB.ts`)
**Current State:**
- ✅ Well-structured database wrapper
- ✅ Efficient querying methods
- ⚠️ Browser-specific API

**Refactoring Needed:**
- **Remove entirely** (replaced by Vercel Postgres)
- Replace all `dbManager` calls with API calls
- Update components that use IndexedDB

**Complexity**: Medium (many call sites to update)

#### 5. **Components Using Logs**
**Files Affected:**
- `LogViewer.tsx` - Displays logs (needs API pagination)
- `TimelineScrubber.tsx` - Timeline visualization (needs API data)
- `CorrelationSidebar.tsx` - Correlation filters (needs API counts)
- `CallFlowViewer.tsx` - Call flow visualization (needs API data)

**Refactoring Needed:**
- Update to use API endpoints instead of direct log access
- Implement proper loading states
- Handle pagination for large datasets

**Complexity**: Medium (UI updates + API integration)

---

## Refactoring Outline

### Phase 1: Backend Setup (Days 1-3)

#### 1.1 Project Structure Setup
```
serverlense/
├── api/                    # Vercel serverless functions
│   ├── parse.ts           # File parsing endpoint (deletes blob after parsing)
│   ├── parse-chunked.ts   # Chunked upload handler (deletes blob after parsing)
│   ├── logs/
│   │   ├── index.ts       # GET /api/logs (query)
│   │   └── [id].ts        # GET /api/logs/:id
│   ├── counts/
│   │   └── index.ts       # GET /api/counts (correlation)
│   ├── timeline/
│   │   └── index.ts       # GET /api/timeline (aggregated)
│   └── clear/
│       └── index.ts       # POST /api/clear (deletes all blobs + logs)
├── lib/                    # Shared server-side code
│   ├── parser.ts          # Ported parser (Node.js compatible)
│   ├── db.ts              # Vercel Postgres client
│   ├── blob.ts            # Vercel Blob client (with cleanup helpers)
│   └── types.ts           # Shared types
├── src/                    # Existing React frontend (minimal changes)
└── vercel.json            # Vercel configuration
```

**File Storage Policy:**
- Files uploaded to `temp/` prefix in Blob Storage
- Deleted immediately after parsing
- Deleted on `/api/clear` call
- **No long-term file storage** - only parsed logs in Postgres

#### 1.2 Port Parser to Node.js
**Tasks:**
- [ ] Copy `src/utils/parser.ts` to `lib/parser.ts`
- [ ] Replace `File` API with `fs` or fetch from Blob URL
- [ ] Remove IndexedDB writes
- [ ] Return parsed logs array instead
- [ ] Keep all parsing logic intact
- [ ] Add streaming support for Blob URLs

**Key Changes:**
```typescript
// Before (client-side)
export const parseLogFile = async (file: File, ...) => {
  const text = await file.text();
  // ... parse ...
  await dbManager.addLogs(logs); // IndexedDB
  return logs;
}

// After (serverless)
export const parseLogFile = async (blobUrl: string, ...) => {
  const response = await fetch(blobUrl);
  const text = await response.text();
  // ... parse (same logic) ...
  return logs; // Return for database insert
}
```

#### 1.3 Set Up Vercel Postgres
**Tasks:**
- [ ] Create database schema (migration script)
- [ ] Set up connection pooling
- [ ] Create indexes for performance
- [ ] Test connection

**Schema:**
```sql
CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  raw_timestamp VARCHAR(255),
  level VARCHAR(10) NOT NULL,
  component VARCHAR(255),
  display_component VARCHAR(255),
  message TEXT,
  display_message TEXT,
  payload TEXT,
  type VARCHAR(50),
  is_sip BOOLEAN DEFAULT FALSE,
  sip_method VARCHAR(255),
  file_name VARCHAR(255),
  file_color VARCHAR(7),
  call_id VARCHAR(255),
  report_id VARCHAR(255),
  operator_id VARCHAR(255),
  extension_id VARCHAR(255),
  station_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_file_name ON logs(file_name);
CREATE INDEX idx_logs_call_id ON logs(call_id);
CREATE INDEX idx_logs_component ON logs(component);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_is_sip ON logs(is_sip);
-- Full-text search
CREATE INDEX idx_logs_message_fts ON logs USING GIN(to_tsvector('english', message || ' ' || COALESCE(payload, '')));
```

#### 1.4 Create API Endpoints
**Tasks:**
- [ ] `/api/parse` - File upload and parsing
- [ ] `/api/logs` - Query logs with filters
- [ ] `/api/counts` - Get correlation counts
- [ ] `/api/timeline` - Get timeline aggregates
- [ ] `/api/clear` - Clear all logs

---

### Phase 2: Frontend Refactoring (Days 4-7)

#### 2.1 Create API Client Module
**New File:** `src/api/client.ts`
```typescript
const API_BASE = '/api';

export async function uploadLogFile(file: File, onProgress?: (progress: number) => void) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}

export async function getLogs(filters: any, offset: number, limit: number) {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
    ...filters
  });
  
  const response = await fetch(`${API_BASE}/logs?${params}`);
  return response.json();
}

export async function getCorrelationCounts(type: string) {
  const response = await fetch(`${API_BASE}/counts?type=${type}`);
  return response.json();
}

export async function clearAllLogs() {
  const response = await fetch(`${API_BASE}/clear`, { method: 'POST' });
  return response.json();
}
```

#### 2.2 Refactor FileUploader
**Changes:**
- Replace `parseLogFile()` import with `uploadLogFile()` from API client
- Remove IndexedDB mode logic
- Update progress handling for server responses
- Handle API errors

**Before:**
```typescript
const parsed = await parseLogFile(file, color, startId, fileProgressCallback, true);
```

**After:**
```typescript
const result = await uploadLogFile(file, fileProgressCallback);
// result: { success: true, count: 12345, sessionId: '...' }
```

#### 2.3 Refactor LogContext
**Major Changes:**
- Remove `logs` state (replace with API calls)
- Remove IndexedDB dependencies
- Add API-based data fetching
- Implement pagination state
- Update `filteredLogs` to query API

**State Changes:**
```typescript
// Before
const [logs, setLogs] = useState<LogEntry[]>([]);
const [indexedDBLogs, setIndexedDBLogs] = useState<LogEntry[]>([]);
const [useIndexedDBMode, setUseIndexedDBMode] = useState(false);

// After
const [currentLogs, setCurrentLogs] = useState<LogEntry[]>([]); // Currently loaded page
const [totalLogCount, setTotalLogCount] = useState<number>(0);
const [loading, setLoading] = useState(false);
```

**Filtered Logs:**
```typescript
// Before: Filters in-memory array
const filteredLogs = useMemo(() => {
  return logs.filter(log => { /* filters */ });
}, [logs, filters]);

// After: Query API with filters
const filteredLogs = useMemo(() => {
  // Trigger API call when filters change
  useEffect(() => {
    loadFilteredLogs(filters);
  }, [filters]);
  return currentLogs;
}, [currentLogs, filters]);
```

#### 2.4 Update Components
**LogViewer.tsx:**
- Update to use `currentLogs` from context
- Add pagination controls
- Handle loading states
- Update virtual scrolling to trigger API loads

**CorrelationSidebar.tsx:**
- Fetch counts from `/api/counts` endpoint
- Remove local computation
- Add loading states

**TimelineScrubber.tsx:**
- Fetch timeline data from `/api/timeline` endpoint
- Remove local aggregation

#### 2.5 Remove IndexedDB Code
**Files to Update:**
- Remove `src/utils/indexedDB.ts` (or keep as deprecated)
- Remove all `dbManager` imports
- Remove IndexedDB initialization code
- Update all components that reference IndexedDB

---

### Phase 3: Testing & Optimization (Days 8-10)

#### 3.1 Testing
- [ ] Unit tests for parser (server-side)
- [ ] Integration tests for API endpoints
- [ ] E2E tests for file upload flow
- [ ] Performance testing with large files
- [ ] Load testing (concurrent users)

#### 3.2 Optimization
- [ ] Implement query caching
- [ ] Optimize database queries
- [ ] Add pagination for large result sets
- [ ] Implement request debouncing
- [ ] Add error retry logic

#### 3.3 Migration Strategy
- [ ] Deploy to Vercel preview environment
- [ ] Test with sample files
- [ ] Gradual rollout (feature flag)
- [ ] Monitor performance
- [ ] Rollback plan if needed

---

## Detailed Refactoring Checklist

### Backend (Serverless Functions)

#### `/api/parse.ts`
- [ ] Accept file upload (FormData)
- [ ] **Temporary**: Upload to Vercel Blob Storage (for parsing only)
- [ ] Call parser with blob URL
- [ ] Batch insert logs to Postgres (1000 at a time)
- [ ] **Delete blob file immediately after parsing** (no long-term storage)
- [ ] Return session ID and count
- [ ] Handle errors gracefully
- [ ] Add progress updates (WebSocket or polling)
- [ ] **Cleanup**: Delete blob on error or completion

#### `/api/logs/index.ts`
- [ ] Accept query parameters (filters, pagination)
- [ ] Build SQL query with filters
- [ ] Execute query with pagination
- [ ] Return logs and total count
- [ ] Support full-text search
- [ ] Optimize with indexes

#### `/api/counts/index.ts`
- [ ] Accept type parameter (file, callId, etc.)
- [ ] Query Postgres for counts
- [ ] Return formatted counts
- [ ] Cache results (optional)

#### `/api/timeline/index.ts`
- [ ] Accept time range and filters
- [ ] Query aggregated timeline data
- [ ] Return formatted timeline events
- [ ] Support zoom levels

#### `/api/clear/index.ts`
- [ ] Delete all logs from Postgres
- [ ] **Delete all temporary blob files** (cleanup uploaded files)
- [ ] Return success status
- [ ] **Note**: Files are temporary - deleted after parsing or on clear

### Frontend (React Components)

#### API Client (`src/api/client.ts`)
- [ ] Create uploadLogFile function
- [ ] Create getLogs function
- [ ] Create getCorrelationCounts function
- [ ] Create getTimelineData function
- [ ] Create clearAllLogs function
- [ ] Add error handling
- [ ] Add retry logic
- [ ] Add request cancellation

#### FileUploader Component
- [ ] Replace parseLogFile with uploadLogFile
- [ ] Update progress handling
- [ ] Remove IndexedDB mode logic
- [ ] Update error messages
- [ ] Handle API errors

#### LogContext
- [ ] Remove logs state
- [ ] Remove IndexedDB state
- [ ] Add API-based data fetching
- [ ] Implement pagination
- [ ] Update filteredLogs to use API
- [ ] Update correlation data fetching
- [ ] Add loading states
- [ ] Add error states

#### LogViewer Component
- [ ] Update to use API-loaded logs
- [ ] Add pagination controls
- [ ] Handle loading states
- [ ] Update virtual scrolling
- [ ] Trigger API loads on scroll

#### CorrelationSidebar Component
- [ ] Fetch counts from API
- [ ] Remove local computation
- [ ] Add loading states
- [ ] Handle API errors

#### TimelineScrubber Component
- [ ] Fetch timeline from API
- [ ] Remove local aggregation
- [ ] Add loading states

#### Other Components
- [ ] Update CallFlowViewer
- [ ] Update ExportModal
- [ ] Update FilterBar
- [ ] Remove all IndexedDB references

---

## Migration Strategy

### Option 1: Big Bang (Not Recommended)
- Deploy everything at once
- High risk
- Hard to debug issues

### Option 2: Incremental (Recommended)
**Week 1:**
- Deploy backend API endpoints
- Keep frontend using IndexedDB
- Test API endpoints independently

**Week 2:**
- Migrate FileUploader to use API
- Keep LogViewer using IndexedDB (dual mode)
- Test file upload flow

**Week 3:**
- Migrate LogViewer to use API
- Remove IndexedDB code
- Full serverless deployment

### Option 3: Feature Flag (Safest)
- Add feature flag: `USE_SERVERLESS_API`
- Deploy both implementations
- Toggle via environment variable
- Gradual rollout to users

---

## Risk Assessment

### High Risk Areas
1. **Parser Migration** - Complex logic, many edge cases
   - **Mitigation**: Extensive testing, keep original as backup
   
2. **Large File Handling** - Vercel function timeout limits
   - **Mitigation**: Chunked uploads, background processing
   
3. **Data Migration** - Existing IndexedDB data
   - **Mitigation**: Export/import tool, or start fresh

### Medium Risk Areas
1. **Performance** - API latency vs local IndexedDB
   - **Mitigation**: Caching, pagination, edge functions
   
2. **Error Handling** - Network failures, API errors
   - **Mitigation**: Retry logic, error boundaries, fallbacks

### Low Risk Areas
1. **UI Components** - Mostly display logic
   - **Mitigation**: Minimal changes, easy to revert

---

## Performance Considerations

### Current Performance (Client-Side)
- **Parsing**: 800MB file = ~30-60 seconds (browser)
- **Filtering**: Instant (in-memory)
- **Rendering**: Fast (virtual scrolling)

### Expected Performance (Serverless)
- **Parsing**: 800MB file = ~20-40 seconds (server has more CPU/RAM)
- **Filtering**: 100-500ms (database query)
- **Rendering**: Fast (same virtual scrolling)

### Optimization Strategies
1. **Caching**: Cache frequently accessed queries
2. **Pagination**: Load only visible logs
3. **Edge Functions**: Use for low-latency queries
4. **Connection Pooling**: Reuse database connections
5. **Batch Operations**: Insert logs in batches

---

## Testing Plan

### Unit Tests
- [ ] Parser functions (all formats)
- [ ] API endpoint handlers
- [ ] Database queries
- [ ] Utility functions

### Integration Tests
- [ ] File upload → parse → store flow
- [ ] Query logs with filters
- [ ] Correlation counts calculation
- [ ] Timeline aggregation

### E2E Tests
- [ ] Upload large file (800MB+)
- [ ] Filter logs by component
- [ ] Search logs by text
- [ ] View timeline
- [ ] Clear all logs

### Performance Tests
- [ ] Parse 800MB file in < 60s
- [ ] Query 1M logs in < 1s
- [ ] Support 10+ concurrent users
- [ ] Handle 100+ requests/second

---

## Deployment Checklist

### Pre-Deployment
- [ ] Set up Vercel Postgres database
- [ ] Configure environment variables
- [ ] Set up Vercel Blob Storage
- [ ] Create database schema
- [ ] Test API endpoints locally
- [ ] Set up monitoring/analytics

### Deployment
- [ ] Deploy to Vercel preview
- [ ] Run database migrations
- [ ] Test file upload
- [ ] Test log queries
- [ ] Monitor error rates
- [ ] Check performance metrics

### Post-Deployment
- [ ] Monitor API usage
- [ ] Check database performance
- [ ] Review error logs
- [ ] Gather user feedback
- [ ] Optimize slow queries

---

## Rollback Plan

If issues arise:

1. **Immediate Rollback**: Revert to previous deployment
2. **Feature Flag**: Disable serverless API, use IndexedDB
3. **Partial Rollback**: Keep API for parsing, use IndexedDB for storage
4. **Data Export**: Export logs from Postgres before rollback

---

## Success Metrics

### Performance Metrics
- ✅ Parse 800MB file in < 60 seconds
- ✅ Query logs in < 500ms
- ✅ Support 10+ concurrent users
- ✅ 99.9% uptime

### User Experience Metrics
- ✅ No browser crashes
- ✅ Responsive UI (< 100ms interactions)
- ✅ Fast initial load (< 2 seconds)
- ✅ Smooth scrolling

### Business Metrics
- ✅ Cost: < $50/month (Vercel Pro)
- ✅ Reduced support tickets (no crashes)
- ✅ Increased user satisfaction

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|-----------------|
| **Phase 1: Backend** | Days 1-3 | API endpoints, parser port, database setup |
| **Phase 2: Frontend** | Days 4-7 | API client, component refactoring |
| **Phase 3: Testing** | Days 8-10 | Testing, optimization, deployment |
| **Total** | **2 weeks** | Full serverless implementation |

---

## Next Steps

1. **Review this plan** with team
2. **Set up Vercel project** and database
3. **Start Phase 1** - Backend setup
4. **Daily standups** to track progress
5. **Weekly reviews** to adjust plan

---

## Questions & Decisions Needed

1. **Data Migration**: Migrate existing IndexedDB data or start fresh?
2. **File Size Limits**: What's the maximum file size to support?
3. **Concurrent Users**: Expected number of simultaneous users?
4. **Retention Policy**: How long to keep logs in database?
5. **Backup Strategy**: Daily backups? Point-in-time recovery?

---

## Resources

- [Vercel Serverless Functions Docs](https://vercel.com/docs/functions)
- [Vercel Postgres Docs](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel Blob Storage Docs](https://vercel.com/docs/storage/vercel-blob)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
