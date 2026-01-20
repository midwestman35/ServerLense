# Codebase Review for Vercel Serverless Migration

## Overview

This document provides a detailed review of the NocLense codebase to identify refactoring needs for migrating to Vercel serverless architecture.

**Review Date**: 2026-01-20  
**Codebase Version**: 1.5.0  
**Target Architecture**: Vercel Serverless Functions + Vercel Postgres

---

## Architecture Overview

### Current Architecture (Client-Side)
```
┌─────────────────────────────────────────┐
│           Browser (Client)             │
├─────────────────────────────────────────┤
│  React UI                               │
│  ├── FileUploader (parses files)       │
│  ├── LogContext (manages state)        │
│  ├── LogViewer (displays logs)         │
│  └── Components (filter, search, etc.) │
│                                         │
│  IndexedDB (browser storage)           │
│  ├── Logs storage                      │
│  └── Query interface                   │
└─────────────────────────────────────────┘
```

### Target Architecture (Serverless)
```
┌─────────────────────────────────────────┐
│           Browser (Client)             │
├─────────────────────────────────────────┤
│  React UI (minimal changes)            │
│  ├── FileUploader (uploads to API)    │
│  ├── LogContext (fetches from API)    │
│  └── Components (same UI)              │
└─────────────────────────────────────────┘
              │ HTTP API
              ▼
┌─────────────────────────────────────────┐
│        Vercel Serverless Functions      │
├─────────────────────────────────────────┤
│  /api/parse (file parsing)              │
│  /api/logs (query logs)                 │
│  /api/counts (correlation data)         │
│  /api/timeline (aggregated data)        │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│        Vercel Postgres Database         │
│  └── Logs table with indexes            │
└─────────────────────────────────────────┘
```

---

## File-by-File Review

### 1. Parser Module (`src/utils/parser.ts`)

**Current Implementation:**
- **Lines**: ~1,036 lines
- **Exports**: `parseLogFile`, `parseLogFileStreaming`, `parseLogFileStreamingToIndexedDB`
- **Formats Supported**: Original, ISO, Datadog CSV, Homer SIP
- **Dependencies**: Browser `File` API, IndexedDB

**Key Functions:**
```typescript
parseLogFile(file: File, ...) → LogEntry[] | Metadata
parseLogFileStreaming(file: File, ...) → LogEntry[]
parseLogFileStreamingToIndexedDB(file: File, ...) → number
parseDatadogCSV(text: string, ...) → LogEntry[]
parseHomerText(text: string, ...) → LogEntry[]
```

**Refactoring Required:**

#### 1.1 Remove Browser Dependencies
**Current:**
```typescript
export const parseLogFile = async (file: File, ...) => {
  const text = await file.text(); // Browser File API
  // ...
}
```

**Target:**
```typescript
export const parseLogFile = async (blobUrl: string, ...) => {
  const response = await fetch(blobUrl); // Fetch from Vercel Blob
  const text = await response.text();
  // ... (same parsing logic)
}
```

**Complexity**: Low - Simple API change

#### 1.2 Remove IndexedDB Writes
**Current:**
```typescript
parseLogFileStreamingToIndexedDB(file, ...) {
  // ... parse ...
  await objectStore.add(currentLog); // IndexedDB write
}
```

**Target:**
```typescript
parseLogFileStreaming(blobUrl, ...) {
  // ... parse ...
  return logs; // Return array for batch insert
}
```

**Complexity**: Low - Remove writes, return data

#### 1.3 Keep All Parsing Logic
**No Changes Needed:**
- ✅ All regex patterns
- ✅ Timestamp parsing
- ✅ Log format detection
- ✅ Correlation ID extraction
- ✅ Message cleanup
- ✅ SIP parsing

**Complexity**: None - Logic stays the same

**Estimated Effort**: 4-6 hours

---

### 2. FileUploader Component (`src/components/FileUploader.tsx`)

**Current Implementation:**
- **Lines**: ~233 lines
- **Dependencies**: `parseLogFile`, `dbManager`, `enableIndexedDBMode`
- **Features**: File validation, progress tracking, memory warnings

**Key Code Sections:**
```typescript
// Current: Direct parsing
const parsed = await parseLogFile(file, color, startId, fileProgressCallback, true);

// Current: IndexedDB mode handling
if (result && typeof result === 'object' && 'totalParsed' in result) {
  await enableIndexedDBMode();
}
```

**Refactoring Required:**

#### 2.1 Replace Parser Call with API Upload
**Current:**
```typescript
import { parseLogFile } from '../utils/parser';
const parsed = await parseLogFile(file, ...);
```

**Target:**
```typescript
import { uploadLogFile } from '../api/client';
const result = await uploadLogFile(file, onProgress);
// result: { success: true, count: 12345, sessionId: 'abc123' }
```

**Complexity**: Low - Simple function replacement

#### 2.2 Remove IndexedDB Logic
**Remove:**
- `enableIndexedDBMode` import
- IndexedDB mode detection
- IndexedDB-specific error handling

**Complexity**: Low - Remove code

#### 2.3 Update Progress Handling
**Current:** Progress from parser (client-side)
**Target:** Progress from API (server-side)

**Options:**
1. **Polling**: Poll `/api/parse/status/:sessionId`
2. **WebSocket**: Real-time progress updates
3. **Chunked Response**: Stream progress in response

**Recommendation**: Start with polling, upgrade to WebSocket if needed

**Complexity**: Medium - Need to implement progress tracking

**Estimated Effort**: 6-8 hours

---

### 3. LogContext (`src/contexts/LogContext.tsx`)

**Current Implementation:**
- **Lines**: ~886 lines
- **State Management**: Comprehensive React context
- **Dependencies**: IndexedDB, in-memory arrays

**Key State Variables:**
```typescript
const [logs, setLogs] = useState<LogEntry[]>([]);
const [indexedDBLogs, setIndexedDBLogs] = useState<LogEntry[]>([]);
const [useIndexedDBMode, setUseIndexedDBMode] = useState(false);
const [totalLogCount, setTotalLogCount] = useState(0);
```

**Refactoring Required:**

#### 3.1 Replace Logs State with API Calls
**Current:**
```typescript
const [logs, setLogs] = useState<LogEntry[]>([]);
// Logs stored in memory or IndexedDB
```

**Target:**
```typescript
const [currentLogs, setCurrentLogs] = useState<LogEntry[]>([]); // Current page
const [totalLogCount, setTotalLogCount] = useState<number>(0);
const [loading, setLoading] = useState(false);

// Fetch logs from API
useEffect(() => {
  loadLogsFromAPI(filters, offset, limit);
}, [filters, offset, limit]);
```

**Complexity**: High - Significant refactoring

#### 3.2 Refactor Filtered Logs
**Current:**
```typescript
const filteredLogs = useMemo(() => {
  return logs.filter(log => {
    // Apply filters in-memory
    if (filterText && !log.message.includes(filterText)) return false;
    // ... more filters
  });
}, [logs, filters]);
```

**Target:**
```typescript
const filteredLogs = useMemo(() => {
  // Trigger API call when filters change
  useEffect(() => {
    const loadFiltered = async () => {
      const result = await getLogs(filters, 0, 1000);
      setCurrentLogs(result.logs);
    };
    loadFiltered();
  }, [filters]);
  
  return currentLogs; // Return API-loaded logs
}, [currentLogs, filters]);
```

**Complexity**: High - Change from sync to async

#### 3.3 Refactor Correlation Data
**Current:**
```typescript
const { correlationData, correlationCounts } = useMemo(() => {
  // Compute from logs array
  logs.forEach(log => {
    if (log.callId) callIds.add(log.callId);
    // ...
  });
}, [logs]);
```

**Target:**
```typescript
const [correlationData, setCorrelationData] = useState({...});
const [correlationCounts, setCorrelationCounts] = useState({});

useEffect(() => {
  const loadCorrelation = async () => {
    const counts = await getCorrelationCounts('callId');
    setCorrelationCounts(counts);
  };
  loadCorrelation();
}, []);
```

**Complexity**: Medium - Change to async loading

#### 3.4 Remove IndexedDB Dependencies
**Remove:**
- `import { dbManager } from '../utils/indexedDB'`
- All `dbManager` calls
- IndexedDB initialization
- IndexedDB mode state

**Complexity**: Medium - Many call sites

**Estimated Effort**: 16-20 hours

---

### 4. IndexedDB Manager (`src/utils/indexedDB.ts`)

**Current Implementation:**
- **Lines**: ~510 lines
- **Purpose**: Browser IndexedDB wrapper
- **Methods**: `addLogs`, `getLogs`, `getLogsFiltered`, `getUniqueValues`, etc.

**Refactoring Required:**

#### 4.1 Remove Entire File
**Action**: Delete or deprecate
**Reason**: Replaced by Vercel Postgres + API

**Alternative**: Keep as reference, mark as deprecated

**Complexity**: Low - Just remove

#### 4.2 Replace All Call Sites
**Files Using IndexedDB:**
- `LogContext.tsx` - Multiple calls
- `FileUploader.tsx` - Mode detection
- `parser.ts` - Direct writes

**Replace with:**
- API client calls
- Remove IndexedDB imports

**Complexity**: Medium - Find and replace

**Estimated Effort**: 4-6 hours (finding and replacing)

---

### 5. LogViewer Component (`src/components/LogViewer.tsx`)

**Current Implementation:**
- **Lines**: ~283 lines
- **Dependencies**: `filteredLogs` from context
- **Features**: Virtual scrolling, log display

**Key Code:**
```typescript
const { filteredLogs, ... } = useLogContext();
const rowVirtualizer = useVirtualizer({
  count: filteredLogs.length,
  // ...
});
```

**Refactoring Required:**

#### 5.1 Update to Use API-Loaded Logs
**Current:** Uses `filteredLogs` array directly
**Target:** Uses `currentLogs` from API

**Changes:**
- Update virtualizer count to `totalLogCount`
- Load more logs when scrolling near end
- Handle loading states

**Complexity**: Medium - Pagination logic

#### 5.2 Add Pagination
**Current:** All logs in memory
**Target:** Load pages as needed

**Implementation:**
```typescript
const loadMoreLogs = async () => {
  if (loading || hasMore) return;
  const nextPage = await getLogs(filters, currentOffset, pageSize);
  setCurrentLogs([...currentLogs, ...nextPage.logs]);
};
```

**Complexity**: Medium - Pagination state management

**Estimated Effort**: 8-10 hours

---

### 6. CorrelationSidebar Component (`src/components/CorrelationSidebar.tsx`)

**Current Implementation:**
- **Dependencies**: `correlationData`, `correlationCounts` from context
- **Features**: Filter by Call ID, Report ID, etc.

**Refactoring Required:**

#### 6.1 Fetch Counts from API
**Current:** Computed from logs array
**Target:** Fetched from `/api/counts`

**Changes:**
- Add loading state
- Fetch on mount
- Refresh when filters change

**Complexity**: Low - Simple API call

**Estimated Effort**: 4-6 hours

---

### 7. TimelineScrubber Component (`src/components/TimelineScrubber.tsx`)

**Current Implementation:**
- **Dependencies**: `logs`, `filteredLogs` from context
- **Features**: Timeline visualization

**Refactoring Required:**

#### 7.1 Fetch Timeline from API
**Current:** Computes from logs array
**Target:** Fetches from `/api/timeline`

**Changes:**
- Replace local aggregation with API call
- Add loading state
- Handle time range changes

**Complexity**: Medium - API integration

**Estimated Effort**: 6-8 hours

---

### 8. Other Components

#### CallFlowViewer (`src/components/CallFlowViewer.tsx`)
- **Changes**: Fetch call flow data from API
- **Complexity**: Low
- **Effort**: 4 hours

#### ExportModal (`src/components/export/ExportModal.tsx`)
- **Changes**: Export from API instead of local array
- **Complexity**: Low
- **Effort**: 4 hours

#### FilterBar (`src/components/FilterBar.tsx`)
- **Changes**: Minimal (just triggers API calls)
- **Complexity**: Low
- **Effort**: 2 hours

---

## Dependencies Analysis

### Current Dependencies (Client-Side)
```json
{
  "dependencies": {
    "@tanstack/react-virtual": "^3.13.13",  // Keep
    "@vercel/analytics": "^1.6.1",          // Keep
    "react": "^19.2.0",                     // Keep
    "react-dom": "^19.2.0",                 // Keep
    "date-fns": "^4.1.0",                   // Keep
    "lucide-react": "^0.556.0"              // Keep
  }
}
```

### New Dependencies (Serverless)
```json
{
  "dependencies": {
    "@vercel/node": "^3.0.0",               // NEW
    "@vercel/postgres": "^0.5.0",           // NEW
    "@vercel/blob": "^0.10.0"               // NEW
  }
}
```

### Dependencies to Remove
- None (IndexedDB was browser-native, no npm package)

---

## Code Complexity Analysis

### High Complexity (Requires Careful Refactoring)

1. **LogContext** - Core state management
   - **Risk**: Breaking filtering/searching
   - **Mitigation**: Extensive testing, feature flags

2. **Parser** - Complex parsing logic
   - **Risk**: Breaking log format support
   - **Mitigation**: Keep all parsing logic, only change I/O

3. **LogViewer** - Virtual scrolling + pagination
   - **Risk**: Performance degradation
   - **Mitigation**: Careful pagination implementation

### Medium Complexity

1. **FileUploader** - Progress tracking
2. **TimelineScrubber** - Timeline aggregation
3. **CorrelationSidebar** - Count fetching

### Low Complexity

1. **FilterBar** - Just triggers API calls
2. **ExportModal** - Simple API call
3. **Other UI components** - Minimal changes

---

## Breaking Changes

### API Changes
- `parseLogFile()` → `uploadLogFile()` (different signature)
- `logs` array → API calls (async)
- `filteredLogs` → API queries (async)

### State Changes
- Remove `logs` state
- Remove `indexedDBLogs` state
- Remove `useIndexedDBMode` state
- Add `currentLogs` state
- Add `loading` state

### Component Props Changes
- Components receiving `logs` prop → Receive `currentLogs` + `loadMore`
- Components using `filteredLogs` → Use API-loaded logs

---

## Migration Risks

### High Risk
1. **Data Loss** - If migration fails, IndexedDB data might be lost
   - **Mitigation**: Export tool before migration

2. **Performance Regression** - API calls slower than local IndexedDB
   - **Mitigation**: Caching, pagination, edge functions

3. **Breaking Changes** - Components might break with async data
   - **Mitigation**: Feature flags, gradual rollout

### Medium Risk
1. **Parser Bugs** - Porting might introduce bugs
   - **Mitigation**: Extensive testing, keep original as backup

2. **Timeout Issues** - Large files might timeout
   - **Mitigation**: Chunked uploads, background processing

### Low Risk
1. **UI Changes** - Minimal UI changes needed
2. **Dependency Issues** - No major dependency conflicts

---

## Testing Strategy

### Unit Tests
- [ ] Parser functions (all formats)
- [ ] API endpoint handlers
- [ ] Database queries
- [ ] Utility functions

### Integration Tests
- [ ] File upload → parse → store
- [ ] Query logs with filters
- [ ] Correlation counts
- [ ] Timeline aggregation

### E2E Tests
- [ ] Upload 800MB file
- [ ] Filter by component
- [ ] Search by text
- [ ] View timeline
- [ ] Clear logs

### Performance Tests
- [ ] Parse 800MB in < 60s
- [ ] Query 1M logs in < 1s
- [ ] Support 10+ concurrent users

---

## Refactoring Priority

### Phase 1: Critical Path (Must Have)
1. ✅ Parser port to Node.js
2. ✅ API endpoints creation
3. ✅ Database setup
4. ✅ FileUploader refactoring
5. ✅ LogContext refactoring

### Phase 2: Important (Should Have)
6. ✅ LogViewer pagination
7. ✅ CorrelationSidebar API integration
8. ✅ TimelineScrubber API integration

### Phase 3: Nice to Have (Can Wait)
9. ⏳ ExportModal API integration
10. ⏳ CallFlowViewer API integration
11. ⏳ Performance optimizations
12. ⏳ Caching layer

---

## Estimated Effort Summary

| Component | Complexity | Hours | Risk |
|-----------|-----------|-------|------|
| Parser Port | Low-Medium | 4-6 | Low |
| API Endpoints | Medium | 12-16 | Medium |
| Database Setup | Low | 4-6 | Low |
| FileUploader | Low-Medium | 6-8 | Low |
| LogContext | High | 16-20 | High |
| LogViewer | Medium | 8-10 | Medium |
| CorrelationSidebar | Low | 4-6 | Low |
| TimelineScrubber | Medium | 6-8 | Medium |
| Other Components | Low | 8-10 | Low |
| Testing | Medium | 12-16 | Medium |
| **Total** | | **80-106 hours** | |

**Timeline**: 2 weeks (80-100 hours) with 1 developer

---

## Recommendations

### 1. Start with Backend
- Set up API endpoints first
- Test independently before frontend changes
- Use Postman/curl for testing

### 2. Incremental Migration
- Migrate FileUploader first (isolated)
- Then LogContext (core)
- Then components (dependent)

### 3. Feature Flags
- Deploy both implementations
- Toggle via environment variable
- Gradual rollout

### 4. Extensive Testing
- Test each component after refactoring
- Don't move to next until current works
- Keep original code as backup

### 5. Performance Monitoring
- Monitor API response times
- Track database query performance
- Optimize slow queries early

---

## Success Criteria

### Functional
- ✅ All log formats parse correctly
- ✅ All filters work as before
- ✅ Search functionality works
- ✅ Timeline displays correctly
- ✅ Correlation sidebar shows counts

### Performance
- ✅ Parse 800MB file in < 60s
- ✅ Query logs in < 500ms
- ✅ UI remains responsive
- ✅ No browser crashes

### Reliability
- ✅ 99.9% uptime
- ✅ Graceful error handling
- ✅ Proper loading states
- ✅ Retry logic for failures

---

## Next Steps

1. **Review this document** with team
2. **Set up Vercel project** and database
3. **Create API client module** (`src/api/client.ts`)
4. **Start Phase 1** - Backend implementation
5. **Daily progress updates**

---

## Questions to Resolve

1. **Data Migration**: Export existing IndexedDB data or start fresh?
2. **File Size Limits**: Maximum file size to support?
3. **Progress Updates**: Polling or WebSocket?
4. **Caching Strategy**: Client-side cache or server-side?
5. **Error Handling**: Retry logic, fallback behavior?
