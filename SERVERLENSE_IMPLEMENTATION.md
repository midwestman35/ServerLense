# ServerLense Implementation Plan

## Overview

ServerLense is a server-side fork of NocLense that leverages server compute resources to handle large log files (800MB+) efficiently. This document outlines the implementation plan for three key features:

1. **Server-Side Log Parsing** - Parse logs on the server instead of in the browser
2. **Server-Side Database** - Store logs in PostgreSQL/SQLite instead of IndexedDB
3. **Pre-Computed Aggregations** - Pre-calculate counts, correlations, and timeline data

---

## Option 1: Server-Side Log Parsing

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │  POST   │   Express    │  Parse  │   Parser    │
│  (Client)   │ ──────> │   Server     │ ──────> │  (Worker)   │
│             │  File   │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ Store
                              ▼
                        ┌──────────────┐
                        │   Database    │
                        │  (PostgreSQL) │
                        └──────────────┘
```

### Implementation Steps

#### 1.1 Backend Setup (Day 1)

**Option A: Express Server (Traditional)**
```javascript
// server/index.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { parseLogFile } = require('./parser');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB max
});

app.post('/api/parse', upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    const result = await parseLogFile(file.path);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

**Option B: Vercel Serverless Functions (Recommended)**
```typescript
// api/parse.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { put, del } from '@vercel/blob';
import { parseLogFile } from '../lib/parser';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let blobUrl: string | null = null;

  try {
    const file = req.body.file; // File from FormData
    
    // Upload to Vercel Blob Storage (temporary - for parsing only)
    const blob = await put(`temp/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });
    blobUrl = blob.url;

    // Parse file (stream from blob URL)
    const result = await parseLogFile(blob.url);
    
    // IMPORTANT: Delete blob file immediately after parsing
    // Files are not stored long-term - only parsed and stored in Postgres
    await del(blob.url);
    
    res.json({ success: true, data: result });
  } catch (error) {
    // Cleanup blob on error
    if (blobUrl) {
      await del(blobUrl).catch(() => {}); // Ignore cleanup errors
    }
    res.status(500).json({ error: error.message });
  }
}

// For large files, use chunked upload:
// api/parse-chunked.ts
export const config = {
  maxDuration: 300, // 5 minutes (Enterprise plan)
  maxBodySize: '100mb', // Pro/Enterprise plan
};
```

**Dependencies**

**Option A: Traditional Server**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "pg": "^8.11.0",
    "better-sqlite3": "^9.0.0"
  }
}
```

**Option B: Vercel Serverless (Recommended)**
```json
{
  "dependencies": {
    "@vercel/node": "^3.0.0",
    "@vercel/postgres": "^0.5.0",
    "@vercel/blob": "^0.10.0"
  },
  "devDependencies": {
    "@vercel/types": "^1.0.0",
    "typescript": "^5.3.3"
  }
}
```

#### 1.2 Port Parser to Node.js (Day 1-2)

**Adapt existing parser.ts**
- Convert TypeScript to JavaScript (or use ts-node)
- Remove browser-specific APIs (File API → fs)
- Add streaming support for large files
- Use worker threads for parallel parsing

**Key Changes:**
```javascript
// server/parser.js
const fs = require('fs');
const { Worker } = require('worker_threads');

async function parseLogFile(filePath) {
  const fileStream = fs.createReadStream(filePath, { 
    highWaterMark: 2 * 1024 * 1024 // 2MB chunks
  });
  
  const logs = [];
  let buffer = '';
  
  for await (const chunk of fileStream) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const log = parseLogLine(line);
      if (log) logs.push(log);
    }
  }
  
  return logs;
}
```

#### 1.3 Streaming Response (Day 2)

**Stream parsed logs back to client**
```javascript
app.post('/api/parse-stream', upload.single('file'), async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  const parser = parseLogFileStream(req.file.path);
  
  res.write('[');
  let first = true;
  
  for await (const log of parser) {
    if (!first) res.write(',');
    res.write(JSON.stringify(log));
    first = false;
  }
  
  res.write(']');
  res.end();
});
```

#### 1.4 Client Integration (Day 2-3)

**Update FileUploader.tsx**
```typescript
const handleFiles = async (files: FileList) => {
  const formData = new FormData();
  formData.append('file', files[0]);
  
  const response = await fetch('http://localhost:3000/api/parse', {
    method: 'POST',
    body: formData
  });
  
  const { data } = await response.json();
  setLogs(data);
};
```

### Benefits

- ✅ Parse 800MB+ files in seconds (server has more RAM)
- ✅ No browser crashes or freezes
- ✅ Can use multiple CPU cores for parallel parsing
- ✅ User's device stays responsive
- ✅ Can parse multiple files simultaneously

### Resource Requirements

- **CPU**: 2-4 cores for parsing (more = faster)
- **RAM**: 4-8GB for file handling (depends on file size)
- **Disk**: Temporary storage for uploads (~2x file size)

---

## Option 2: Server-Side Database

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │  Query  │   Express    │  SQL    │ PostgreSQL  │
│  (Client)   │ ──────> │   Server     │ ──────> │  Database   │
│             │  API    │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
```

### Implementation Steps

#### 2.1 Database Schema (Day 1)

**PostgreSQL Schema**
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

-- Indexes for fast queries
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_component ON logs(component);
CREATE INDEX idx_logs_call_id ON logs(call_id);
CREATE INDEX idx_logs_file_name ON logs(file_name);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_is_sip ON logs(is_sip);
CREATE INDEX idx_logs_report_id ON logs(report_id);
CREATE INDEX idx_logs_operator_id ON logs(operator_id);
CREATE INDEX idx_logs_extension_id ON logs(extension_id);
CREATE INDEX idx_logs_station_id ON logs(station_id);

-- Full-text search index
CREATE INDEX idx_logs_message_fts ON logs USING GIN(to_tsvector('english', message || ' ' || COALESCE(payload, '')));
```

#### 2.2 Database API Endpoints (Day 2)

**CRUD Operations**
```javascript
// server/routes/logs.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: 'serverlense',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // connection pool size
});

// Insert logs (batch)
router.post('/logs', async (req, res) => {
  const { logs } = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const values = logs.map(log => 
      `(${log.timestamp}, '${log.level}', '${log.component}', ...)`
    ).join(',');
    
    await client.query(`INSERT INTO logs (...) VALUES ${values}`);
    await client.query('COMMIT');
    
    res.json({ success: true, count: logs.length });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Query logs with filters
router.get('/logs', async (req, res) => {
  const { 
    offset = 0, 
    limit = 1000,
    component,
    callId,
    fileName,
    level,
    isSip,
    search,
    startTime,
    endTime
  } = req.query;
  
  let query = 'SELECT * FROM logs WHERE 1=1';
  const params = [];
  let paramCount = 0;
  
  if (component) {
    paramCount++;
    query += ` AND component = $${paramCount}`;
    params.push(component);
  }
  
  if (callId) {
    paramCount++;
    query += ` AND call_id = $${paramCount}`;
    params.push(callId);
  }
  
  if (fileName) {
    paramCount++;
    query += ` AND file_name = $${paramCount}`;
    params.push(fileName);
  }
  
  if (startTime && endTime) {
    paramCount++;
    query += ` AND timestamp BETWEEN $${paramCount} AND $${paramCount + 1}`;
    params.push(startTime, endTime);
    paramCount++;
  }
  
  if (search) {
    paramCount++;
    query += ` AND to_tsvector('english', message || ' ' || COALESCE(payload, '')) @@ plainto_tsquery('english', $${paramCount})`;
    params.push(search);
  }
  
  query += ` ORDER BY timestamp ASC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  res.json({ logs: result.rows, total: result.rowCount });
});

// Get counts for correlation sidebar
router.get('/logs/counts', async (req, res) => {
  const { type, value } = req.query; // type: 'file', 'callId', etc.
  
  const columnMap = {
    file: 'file_name',
    callId: 'call_id',
    report: 'report_id',
    operator: 'operator_id',
    extension: 'extension_id',
    station: 'station_id'
  };
  
  const column = columnMap[type];
  const query = `SELECT ${column} as value, COUNT(*) as count 
                 FROM logs 
                 WHERE ${column} IS NOT NULL 
                 GROUP BY ${column}`;
  
  const result = await pool.query(query);
  res.json({ counts: result.rows });
});
```

#### 2.3 Client Integration (Day 3)

**Replace IndexedDB calls with API calls**
```typescript
// client/api.ts
const API_BASE = 'http://localhost:3000/api';

export async function uploadLogFile(file: File): Promise<number> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    body: formData
  });
  
  const { sessionId } = await response.json();
  return sessionId;
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
  const response = await fetch(`${API_BASE}/logs/counts?type=${type}`);
  return response.json();
}
```

### Benefits

- ✅ No IndexedDB size limits (~2GB browser limit)
- ✅ Faster queries with proper SQL indexes
- ✅ Support for multiple users/sessions
- ✅ Can handle 10GB+ log files
- ✅ Full-text search with PostgreSQL
- ✅ Concurrent queries with connection pooling

### Resource Requirements

- **CPU**: 2-4 cores for query processing
- **RAM**: 4-8GB for PostgreSQL (depends on data size)
- **Disk**: Storage for database (estimate: 2-3x file size)
- **PostgreSQL**: Separate service or Docker container

---

## Option 3: Pre-Computed Aggregations

### Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Parser    │  Store  │   Database   │  Query  │   Express   │
│             │ ──────> │  + Aggregates│ <────── │   Server    │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ Pre-compute
                              ▼
                        ┌──────────────┐
                        │ Aggregations │
                        │   Tables     │
                        └──────────────┘
```

### Implementation Steps

#### 3.1 Aggregation Tables (Day 1)

**Create aggregation tables**
```sql
-- File counts
CREATE TABLE file_counts (
  file_name VARCHAR(255) PRIMARY KEY,
  total_logs INTEGER NOT NULL,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Call ID counts
CREATE TABLE call_id_counts (
  call_id VARCHAR(255) PRIMARY KEY,
  count INTEGER NOT NULL,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Report ID counts
CREATE TABLE report_id_counts (
  report_id VARCHAR(255) PRIMARY KEY,
  count INTEGER NOT NULL,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Timeline aggregates (for faster timeline rendering)
CREATE TABLE timeline_aggregates (
  time_bucket TIMESTAMP NOT NULL,
  file_name VARCHAR(255),
  error_count INTEGER DEFAULT 0,
  sip_request_count INTEGER DEFAULT 0,
  sip_success_count INTEGER DEFAULT 0,
  sip_error_count INTEGER DEFAULT 0,
  PRIMARY KEY (time_bucket, file_name)
);
```

#### 3.2 Update Aggregations During Parsing (Day 2)

**Increment counts as logs are parsed**
```javascript
// server/parser.js
async function parseAndStoreLogs(filePath, sessionId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const fileCounts = new Map();
    const callIdCounts = new Map();
    const reportIdCounts = new Map();
    
    // Parse and count
    for await (const log of parseLogFileStream(filePath)) {
      // Insert log
      await client.query(
        'INSERT INTO logs (...) VALUES (...)',
        [log.timestamp, log.level, ...]
      );
      
      // Update counts
      if (log.fileName) {
        fileCounts.set(log.fileName, (fileCounts.get(log.fileName) || 0) + 1);
      }
      if (log.callId) {
        callIdCounts.set(log.callId, (callIdCounts.get(log.callId) || 0) + 1);
      }
      if (log.reportId) {
        reportIdCounts.set(log.reportId, (reportIdCounts.get(log.reportId) || 0) + 1);
      }
    }
    
    // Update aggregation tables
    for (const [fileName, count] of fileCounts) {
      await client.query(
        `INSERT INTO file_counts (file_name, total_logs) 
         VALUES ($1, $2) 
         ON CONFLICT (file_name) 
         DO UPDATE SET total_logs = file_counts.total_logs + $2`,
        [fileName, count]
      );
    }
    
    // Similar for callIdCounts, reportIdCounts...
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

#### 3.3 Timeline Aggregation (Day 2-3)

**Pre-aggregate timeline data**
```javascript
// Aggregate logs into time buckets (e.g., 1-minute intervals)
async function aggregateTimeline(sessionId) {
  const query = `
    INSERT INTO timeline_aggregates (time_bucket, file_name, error_count, sip_request_count, sip_success_count, sip_error_count)
    SELECT 
      date_trunc('minute', to_timestamp(timestamp / 1000)) as time_bucket,
      file_name,
      COUNT(*) FILTER (WHERE level = 'ERROR') as error_count,
      COUNT(*) FILTER (WHERE is_sip = true AND sip_method IN ('INVITE', 'BYE', 'CANCEL')) as sip_request_count,
      COUNT(*) FILTER (WHERE is_sip = true AND sip_method LIKE '2%') as sip_success_count,
      COUNT(*) FILTER (WHERE is_sip = true AND sip_method LIKE '[456]%') as sip_error_count
    FROM logs
    WHERE session_id = $1
    GROUP BY time_bucket, file_name
  `;
  
  await pool.query(query, [sessionId]);
}
```

#### 3.4 Fast Aggregation Queries (Day 3)

**API endpoints for pre-computed data**
```javascript
// Get file counts (instant - no computation)
router.get('/aggregates/files', async (req, res) => {
  const result = await pool.query('SELECT * FROM file_counts ORDER BY file_name');
  res.json({ files: result.rows });
});

// Get timeline data (much faster than querying all logs)
router.get('/aggregates/timeline', async (req, res) => {
  const { startTime, endTime, fileName } = req.query;
  
  let query = `
    SELECT * FROM timeline_aggregates 
    WHERE time_bucket BETWEEN $1 AND $2
  `;
  const params = [startTime, endTime];
  
  if (fileName) {
    query += ' AND file_name = $3';
    params.push(fileName);
  }
  
  query += ' ORDER BY time_bucket ASC';
  
  const result = await pool.query(query, params);
  res.json({ timeline: result.rows });
});
```

### Benefits

- ✅ Instant sidebar counts (no computation needed)
- ✅ Pre-aggregated timeline data (render in milliseconds)
- ✅ Faster initial load
- ✅ Reduced database load
- ✅ Can cache aggregation results

### Resource Requirements

- **CPU**: Minimal (only during parsing/aggregation)
- **RAM**: Additional 1-2GB for aggregation tables
- **Disk**: Additional storage for aggregation tables (~10% of log data)

---

## Vercel-Specific Implementation (Recommended)

### Why Vercel?

Since NocLense is already deployed on Vercel, ServerLense can leverage the same platform for seamless integration:

- ✅ **Same Deployment Platform**: Frontend and backend in one project
- ✅ **No Server Management**: Serverless functions handle everything
- ✅ **Automatic Scaling**: Scales to zero when not in use
- ✅ **Built-in CDN**: Edge-optimized API responses
- ✅ **Easy Rollbacks**: Preview deployments and instant rollbacks
- ✅ **Cost-Effective**: $27.50-47.50/month vs $128-215/month for traditional servers

### Vercel Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Platform                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐         ┌──────────────────┐         │
│  │   Frontend   │  API    │ Serverless Func  │         │
│  │  (React)    │ ──────> │  /api/parse      │         │
│  │             │         │  /api/logs       │         │
│  └──────────────┘         └──────────────────┘         │
│                                  │                       │
│                                  │ Query                 │
│                                  ▼                       │
│                          ┌──────────────┐               │
│                          │Vercel Postgres│              │
│                          │  (Managed)    │               │
│                          └──────────────┘               │
│                                  │                       │
│                                  │ Store                 │
│                                  ▼                       │
│                          ┌──────────────┐               │
│                          │Vercel Blob   │               │
│                          │  Storage     │               │
│                          └──────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Vercel Implementation Steps

#### Step 1: Set Up Vercel Project Structure

```
serverlense/
├── api/
│   ├── parse.ts              # Serverless function for parsing
│   ├── parse-chunked.ts      # Chunked upload handler
│   ├── logs/
│   │   ├── index.ts          # GET /api/logs
│   │   └── [id].ts           # GET /api/logs/:id
│   ├── counts/
│   │   └── index.ts          # GET /api/counts
│   └── timeline/
│       └── index.ts          # GET /api/timeline
├── lib/
│   ├── parser.ts             # Ported parser logic
│   ├── db.ts                 # Vercel Postgres client
│   └── blob.ts               # Vercel Blob client
├── public/                   # Static assets (if any)
├── vercel.json              # Vercel configuration
└── package.json
```

#### Step 2: Install Vercel Dependencies

```bash
npm install @vercel/node @vercel/postgres @vercel/blob
npm install -D @vercel/types
```

#### Step 3: Configure Vercel Postgres

```typescript
// lib/db.ts
import { sql } from '@vercel/postgres';

export async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS logs (
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
    )
  `;
  
  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_file_name ON logs(file_name)`;
  // ... more indexes
}

export { sql };
```

#### Step 4: Create Parsing API Endpoint

```typescript
// api/parse.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { parseLogFile } from '../lib/parser';
import { sql } from '../lib/db';

export const config = {
  maxDuration: 60, // 60 seconds (Pro plan)
  maxBodySize: '50mb', // 50MB (Pro plan)
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const file = req.body.file; // From FormData
    
    // Upload to Vercel Blob Storage
    const blob = await put(`logs/${Date.now()}-${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    // Parse file (stream from blob URL)
    const logs = await parseLogFile(blob.url);
    
    // Store in Vercel Postgres (batch insert)
    const values = logs.map(log => 
      `(${log.timestamp}, '${log.level}', '${log.component}', ...)`
    ).join(',');
    
    await sql`INSERT INTO logs (...) VALUES ${sql.unsafe(values)}`;
    
    res.json({ 
      success: true, 
      count: logs.length,
      blobUrl: blob.url 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### Step 5: Create Logs Query API

```typescript
// api/logs/index.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { offset = 0, limit = 1000, component, callId, fileName, search } = req.query;
  
  let query = sql`SELECT * FROM logs WHERE 1=1`;
  const params: any[] = [];
  
  if (component) {
    query = sql`${query} AND component = ${component}`;
  }
  
  if (callId) {
    query = sql`${query} AND call_id = ${callId}`;
  }
  
  if (fileName) {
    query = sql`${query} AND file_name = ${fileName}`;
  }
  
  if (search) {
    query = sql`${query} AND to_tsvector('english', message || ' ' || COALESCE(payload, '')) @@ plainto_tsquery('english', ${search})`;
  }
  
  query = sql`${query} ORDER BY timestamp ASC LIMIT ${limit} OFFSET ${offset}`;
  
  const result = await query;
  res.json({ logs: result.rows, total: result.rowCount });
}
```

#### Step 6: Create Counts API

```typescript
// api/counts/index.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { type } = req.query; // 'file', 'callId', 'report', etc.
  
  const columnMap: Record<string, string> = {
    file: 'file_name',
    callId: 'call_id',
    report: 'report_id',
    operator: 'operator_id',
    extension: 'extension_id',
    station: 'station_id'
  };
  
  const column = columnMap[type as string];
  if (!column) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  
  const result = await sql`
    SELECT ${sql.unsafe(column)} as value, COUNT(*) as count 
    FROM logs 
    WHERE ${sql.unsafe(column)} IS NOT NULL 
    GROUP BY ${sql.unsafe(column)}
    ORDER BY count DESC
  `;
  
  res.json({ counts: result.rows });
}
```

#### Step 7: Update Client to Use Vercel API

```typescript
// client/api.ts
const API_BASE = '/api'; // Same domain, no CORS issues

export async function uploadLogFile(file: File): Promise<number> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    body: formData
  });
  
  const { count } = await response.json();
  return count;
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
```

#### Step 8: Configure Vercel Project

```json
// vercel.json
{
  "functions": {
    "api/parse.ts": {
      "maxDuration": 60
    },
    "api/parse-chunked.ts": {
      "maxDuration": 300
    }
  },
  "env": {
    "POSTGRES_URL": "@postgres-url",
    "BLOB_READ_WRITE_TOKEN": "@blob-token"
  }
}
```

### Vercel Limitations & Workarounds

**Limitation 1: Function Timeout**
- **Hobby**: 10 seconds
- **Pro**: 60 seconds
- **Enterprise**: 300 seconds

**Workaround**: For files >100MB or parsing >60s:
- Use chunked uploads
- Process in background with Vercel Cron Jobs
- Split parsing into multiple function calls

**Limitation 2: Request Body Size**
- **Hobby**: 4.5MB
- **Pro**: 50MB
- **Enterprise**: 100MB

**Workaround**: 
- Upload to Vercel Blob Storage first
- Pass blob URL to parsing function
- Use chunked uploads for larger files

**Limitation 3: Memory**
- Serverless functions have limited memory
- Large files may cause OOM errors

**Workaround**:
- Stream processing (don't load entire file)
- Process in chunks
- Use Vercel Blob for temporary storage

### Vercel Deployment Steps

1. **Install Vercel CLI**: `npm i -g vercel`
2. **Link Project**: `vercel link`
3. **Add Environment Variables**: `vercel env add POSTGRES_URL`
4. **Deploy**: `vercel --prod`

### Vercel Cost Breakdown

- **Pro Plan**: $20/month (base)
- **Vercel Postgres**: $20/month (200GB)
- **Vercel Blob**: $7.50/month (50GB)
- **Total**: **~$47.50/month**

---

## Combined Implementation Plan

### Option A: Traditional Server (3 weeks)
- **Phase 1**: Server-Side Parsing (Week 1)
- **Phase 2**: Database Integration (Week 2)
- **Phase 3**: Pre-Computed Aggregations (Week 3)

### Option B: Vercel Serverless (2 weeks) - **Recommended**
- **Week 1**: Set up Vercel Postgres, create serverless functions, port parser
- **Week 2**: Implement API endpoints, client integration, testing

**Total Timeline**: 2-3 weeks depending on approach

---

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js (or Vercel Serverless Functions)
- **Database**: PostgreSQL 14+ (or Vercel Postgres)
- **File Upload**: Multer (or Vercel Blob Storage)
- **Parsing**: Ported TypeScript parser to JavaScript

### Frontend
- **Framework**: React (existing)
- **API Client**: Fetch API or Axios
- **State Management**: Existing LogContext (modified for API calls)
- **Deployment**: Vercel (existing)

### Infrastructure Options

#### Option A: Traditional Server (AWS, Azure, GCP, Self-Hosted)
- **Container**: Docker (optional)
- **Process Manager**: PM2 (for production)
- **Reverse Proxy**: Nginx (for production)

#### Option B: Vercel Serverless (Recommended for NocLense Integration)
- **Serverless Functions**: Vercel Functions (Node.js runtime)
- **Database**: Vercel Postgres (managed PostgreSQL)
- **Storage**: Vercel Blob Storage (for file uploads)
- **Edge Functions**: Vercel Edge Functions (for low-latency queries)
- **Deployment**: Same Vercel project as frontend

---

## Migration Path

### From NocLense to ServerLense

1. **Keep existing UI/UX** - No changes to React components
2. **Replace data layer** - Swap IndexedDB calls for API calls
3. **Gradual migration** - Can run both side-by-side initially
4. **Backward compatibility** - Support both client-side and server-side modes

---

## Testing Strategy

### Unit Tests
- Parser functions
- Database queries
- API endpoints

### Integration Tests
- End-to-end parsing → storage → retrieval
- Multi-file uploads
- Concurrent requests

### Performance Tests
- Parse 800MB file in < 30 seconds
- Query 1M logs in < 1 second
- Support 10+ concurrent users

---

## Deployment Considerations

### Development
- Local PostgreSQL instance
- Express dev server
- Hot reload for development

### Production
- PostgreSQL on separate server/container
- Express behind Nginx reverse proxy
- SSL/TLS certificates
- Rate limiting
- File upload size limits
- Session management

---

## Security Considerations

- **File Upload Limits**: Max 2GB per file
- **Rate Limiting**: Prevent abuse
- **Authentication**: Optional user authentication
- **Input Validation**: Sanitize all inputs
- **SQL Injection**: Use parameterized queries
- **CORS**: Configure properly for production

---

## Monitoring & Logging

- **Application Logs**: Winston or Pino
- **Database Monitoring**: pg_stat_statements
- **Performance Metrics**: Response times, query times
- **Error Tracking**: Sentry or similar
- **Health Checks**: `/health` endpoint

---

## Future Enhancements

- **WebSocket Support**: Real-time updates during parsing
- **Background Jobs**: Queue system for large files
- **Caching**: Redis for frequently accessed data
- **CDN**: Serve static assets from CDN
- **Load Balancing**: Multiple server instances
- **Auto-scaling**: Scale based on load
