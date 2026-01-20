# ServerLense

Server-side fork of NocLense that leverages server compute resources to handle large log files (800MB+) efficiently.

## Overview

ServerLense moves log parsing, storage, and analysis from the browser to a dedicated server, enabling:

- ✅ Parse 800MB+ files without browser crashes
- ✅ Store unlimited logs in PostgreSQL (no IndexedDB limits)
- ✅ Pre-compute aggregations for instant sidebar counts
- ✅ Support multiple concurrent users
- ✅ Faster queries with proper SQL indexes

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │  API    │   Express    │  Query  │ PostgreSQL  │
│  (React)    │ ──────> │   Server     │ ──────> │  Database   │
│             │         │              │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ Parse & Store
                              ▼
                        ┌──────────────┐
                        │   Parser     │
                        │  (Worker)    │
                        └──────────────┘
```

## Features

### Option 1: Server-Side Log Parsing
- Upload files to server
- Parse logs server-side (no browser memory limits)
- Stream results back to client
- Use multiple CPU cores for parallel parsing

### Option 2: Server-Side Database
- Store logs in PostgreSQL instead of IndexedDB
- No 2GB browser storage limit
- Fast queries with SQL indexes
- Support for 10GB+ log files

### Option 3: Pre-Computed Aggregations
- Pre-calculate file counts, call IDs, etc.
- Instant sidebar updates
- Pre-aggregated timeline data
- Reduced database load

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (or SQLite for development)
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/midwestman35/ServerLense.git
cd ServerLense

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Set up database
npm run db:migrate

# Start development server
npm run dev
```

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=serverlense
DB_USER=postgres
DB_PASSWORD=your_password

# File Upload
MAX_FILE_SIZE=2147483648  # 2GB in bytes
UPLOAD_DIR=./uploads
```

## Documentation

- [Implementation Plan](./SERVERLENSE_IMPLEMENTATION.md) - Detailed implementation guide
- [Cost Analysis](./COST_ANALYSIS.md) - Infrastructure costs and ROI analysis

## Development Roadmap

### Phase 1: Server-Side Parsing (Week 1)
- [ ] Set up Express server
- [ ] Port parser to Node.js
- [ ] Implement streaming parsing
- [ ] Client integration

### Phase 2: Database Integration (Week 2)
- [ ] Set up PostgreSQL schema
- [ ] Implement API endpoints
- [ ] Migrate client to use API

### Phase 3: Pre-Computed Aggregations (Week 3)
- [ ] Create aggregation tables
- [ ] Implement aggregation logic
- [ ] Optimize queries

## Cost Estimates

| Configuration | Monthly Cost |
|--------------|-------------|
| AWS (t3.xlarge) | $128 |
| Self-Hosted VPS | $48 |
| Full Stack (AWS) | $215 |

See [COST_ANALYSIS.md](./COST_ANALYSIS.md) for detailed breakdown.

## License

Same as NocLense (check parent repository)

## Contributing

This is a fork of NocLense. Contributions welcome!

## Status

🚧 **In Development** - Implementation starting
