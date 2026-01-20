# Vercel Setup Checklist

## Pre-Implementation Setup Requirements

This checklist outlines all steps that must be completed **before** beginning the code refactoring and implementation. Complete these items first to ensure a smooth development process.

---

## ✅ Vercel Account & Project Setup

### 1. Vercel Account
- [ ] **Sign up for Vercel Pro Plan** ($20/month)
  - Required for 60s function timeout
  - Required for 50MB file uploads
  - Required for Vercel Postgres integration
  - [Sign up here](https://vercel.com/pricing)

### 2. Create Vercel Project
- [ ] **Create new Vercel project** for ServerLense
  - Project name: `serverlense` (or your preferred name)
  - Framework: Vite (or Next.js if preferred)
  - Root directory: `/` (or adjust as needed)
  - [Create project](https://vercel.com/new)

### 3. Link Repository
- [ ] **Connect GitHub repository**
  - Repository: `midwestman35/ServerLense`
  - Branch: `main`
  - Auto-deploy: Enabled

---

## ✅ Vercel Postgres Database Setup

### 4. Create Postgres Database
- [ ] **Create Vercel Postgres database**
  - Go to Vercel Dashboard → Storage → Create Database
  - Select "Postgres"
  - Name: `serverlense-db` (or your preferred name)
  - Region: Choose closest to your users
  - [Create database](https://vercel.com/docs/storage/vercel-postgres/quickstart)

### 5. Database Schema Migration
- [ ] **Run initial schema migration**
  ```sql
  -- Create logs table
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
  
  -- Create indexes
  CREATE INDEX idx_logs_timestamp ON logs(timestamp);
  CREATE INDEX idx_logs_file_name ON logs(file_name);
  CREATE INDEX idx_logs_call_id ON logs(call_id);
  CREATE INDEX idx_logs_component ON logs(component);
  CREATE INDEX idx_logs_level ON logs(level);
  CREATE INDEX idx_logs_is_sip ON logs(is_sip);
  CREATE INDEX idx_logs_report_id ON logs(report_id);
  CREATE INDEX idx_logs_operator_id ON logs(operator_id);
  CREATE INDEX idx_logs_extension_id ON logs(extension_id);
  CREATE INDEX idx_logs_station_id ON logs(station_id);
  
  -- Full-text search index
  CREATE INDEX idx_logs_message_fts ON logs USING GIN(
    to_tsvector('english', message || ' ' || COALESCE(payload, ''))
  );
  ```
- [ ] **Verify schema created successfully**
- [ ] **Test database connection**

### 6. Environment Variables
- [ ] **Add Postgres connection string**
  - Variable name: `POSTGRES_URL`
  - Value: Auto-populated by Vercel (from database settings)
  - Add to: Production, Preview, Development environments
  - [How to add env vars](https://vercel.com/docs/projects/environment-variables)

---

## ✅ Vercel Blob Storage Setup

### 7. Create Blob Storage
- [ ] **Create Vercel Blob Storage**
  - Go to Vercel Dashboard → Storage → Create Storage
  - Select "Blob"
  - Name: `serverlense-blob` (or your preferred name)
  - [Create storage](https://vercel.com/docs/storage/vercel-blob/quickstart)

### 8. Blob Storage Token
- [ ] **Get Blob Storage token**
  - Variable name: `BLOB_READ_WRITE_TOKEN`
  - Value: From Blob Storage settings
  - Add to: Production, Preview, Development environments
  - [Get token](https://vercel.com/docs/storage/vercel-blob/quickstart#step-3-get-your-token)

---

## ✅ Vercel CLI Setup

### 9. Install Vercel CLI
- [ ] **Install Vercel CLI globally**
  ```bash
  npm install -g vercel
  ```
- [ ] **Verify installation**
  ```bash
  vercel --version
  ```

### 10. Link Local Project
- [ ] **Link project to Vercel**
  ```bash
  cd C:\Users\EnriqueV\Documents\ServerLense
  vercel link
  ```
- [ ] **Select correct project** when prompted
- [ ] **Verify `.vercel` directory created**

### 11. Environment Variables (Local)
- [ ] **Pull environment variables locally**
  ```bash
  vercel env pull .env.local
  ```
- [ ] **Verify `.env.local` file created** with:
  - `POSTGRES_URL`
  - `BLOB_READ_WRITE_TOKEN`
- [ ] **Add `.env.local` to `.gitignore`** (if not already)

---

## ✅ Project Structure Setup

### 12. Create Directory Structure
- [ ] **Create `api/` directory** (for serverless functions)
  ```bash
  mkdir api
  mkdir api/logs
  mkdir api/counts
  mkdir api/timeline
  mkdir api/clear
  ```
- [ ] **Create `lib/` directory** (for shared server code)
  ```bash
  mkdir lib
  ```

### 13. Install Dependencies
- [ ] **Install Vercel packages**
  ```bash
  npm install @vercel/node @vercel/postgres @vercel/blob
  ```
- [ ] **Install TypeScript types** (if using TypeScript)
  ```bash
  npm install -D @vercel/types
  ```
- [ ] **Verify `package.json` updated**

---

## ✅ Vercel Configuration

### 14. Create `vercel.json`
- [ ] **Create `vercel.json` configuration file**
  ```json
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
- [ ] **Verify configuration syntax**

### 15. Function Configuration
- [ ] **Review function timeout limits**
  - Hobby: 10s (not sufficient)
  - Pro: 60s (sufficient for most files)
  - Enterprise: 300s (for very large files)
- [ ] **Review request body size limits**
  - Hobby: 4.5MB (not sufficient)
  - Pro: 50MB (sufficient for most files)
  - Enterprise: 100MB (for very large files)

---

## ✅ Testing Setup

### 16. Test Database Connection
- [ ] **Create test script** (`scripts/test-db.ts`)
  ```typescript
  import { sql } from '@vercel/postgres';
  
  async function testConnection() {
    try {
      const result = await sql`SELECT NOW()`;
      console.log('Database connected:', result.rows[0]);
    } catch (error) {
      console.error('Database connection failed:', error);
    }
  }
  
  testConnection();
  ```
- [ ] **Run test script**
  ```bash
  npx tsx scripts/test-db.ts
  ```
- [ ] **Verify connection successful**

### 17. Test Blob Storage
- [ ] **Create test script** (`scripts/test-blob.ts`)
  ```typescript
  import { put, del, list } from '@vercel/blob';
  
  async function testBlob() {
    try {
      // Upload test file
      const blob = await put('test.txt', 'Hello World', {
        access: 'public',
      });
      console.log('Blob uploaded:', blob.url);
      
      // Delete test file
      await del(blob.url);
      console.log('Blob deleted successfully');
    } catch (error) {
      console.error('Blob test failed:', error);
    }
  }
  
  testBlob();
  ```
- [ ] **Run test script**
  ```bash
  npx tsx scripts/test-blob.ts
  ```
- [ ] **Verify upload/delete works**

---

## ✅ Development Environment

### 18. Local Development Setup
- [ ] **Install development dependencies**
  ```bash
  npm install -D @types/node typescript tsx
  ```
- [ ] **Create `tsconfig.json`** (if not exists)
- [ ] **Set up local dev script** in `package.json`
  ```json
  {
    "scripts": {
      "dev": "vercel dev",
      "build": "tsc && vite build"
    }
  }
  ```

### 19. Test Local Development
- [ ] **Start local dev server**
  ```bash
  npm run dev
  ```
- [ ] **Verify server starts** on `http://localhost:3000`
- [ ] **Test API endpoint** (create simple test endpoint)
- [ ] **Verify environment variables loaded**

---

## ✅ Monitoring & Analytics

### 20. Set Up Monitoring
- [ ] **Enable Vercel Analytics** (if not already)
  - Go to Project Settings → Analytics
  - Enable Web Analytics
- [ ] **Set up error tracking** (optional)
  - Consider Sentry or similar
  - Configure error reporting

### 21. Set Up Logging
- [ ] **Review Vercel Function Logs**
  - Go to Project → Functions → View Logs
  - Verify logs are accessible
- [ ] **Set up log retention** (if needed)

---

## ✅ Security & Access Control

### 22. Review Security Settings
- [ ] **Review CORS settings** (if needed)
- [ ] **Review rate limiting** (Vercel Pro includes basic rate limiting)
- [ ] **Set up authentication** (if needed for production)
  - Consider Vercel Authentication or custom solution

### 23. API Keys & Secrets
- [ ] **Verify all secrets are in environment variables**
- [ ] **Never commit secrets to git**
- [ ] **Review `.gitignore`** includes:
  - `.env.local`
  - `.env`
  - `.vercel`

---

## ✅ Cost Monitoring

### 24. Set Up Cost Alerts
- [ ] **Review Vercel Pro plan limits**
  - 1TB bandwidth/month
  - Function execution time
  - Storage limits
- [ ] **Set up billing alerts** (if available)
- [ ] **Monitor usage dashboard**

### 25. Estimate Initial Costs
- [ ] **Calculate expected costs**
  - Pro Plan: $20/month
  - Postgres (200GB): ~$20/month
  - Blob Storage (temporary): ~$0-2/month
  - **Total: ~$42/month**
- [ ] **Verify budget approval**

---

## ✅ Documentation & Team Access

### 26. Team Access
- [ ] **Add team members** to Vercel project (if applicable)
- [ ] **Set appropriate permissions**
- [ ] **Share access credentials** (securely)

### 27. Documentation
- [ ] **Document environment setup** for team
- [ ] **Create setup guide** for new developers
- [ ] **Document API endpoints** (Swagger/OpenAPI if preferred)

---

## ✅ Pre-Deployment Checklist

### 28. Verify All Setup Complete
- [ ] **All environment variables set**
- [ ] **Database schema created**
- [ ] **Blob storage configured**
- [ ] **Local development works**
- [ ] **Test endpoints respond**
- [ ] **No errors in Vercel dashboard**

### 29. Create Test Deployment
- [ ] **Deploy to Vercel preview**
  ```bash
  vercel
  ```
- [ ] **Test preview deployment**
- [ ] **Verify API endpoints work**
- [ ] **Test database connection**
- [ ] **Test blob storage**

---

## ✅ Ready to Begin Implementation

### 30. Final Verification
- [ ] **All checklist items completed**
- [ ] **Team has access**
- [ ] **Development environment ready**
- [ ] **Documentation reviewed**
- [ ] **Ready to start Phase 1: Backend Setup**

---

## Quick Reference Commands

```bash
# Install Vercel CLI
npm install -g vercel

# Link project
vercel link

# Pull environment variables
vercel env pull .env.local

# Run local development
vercel dev

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs
```

---

## Troubleshooting

### Common Issues

**Issue: Environment variables not loading**
- Solution: Run `vercel env pull .env.local` and restart dev server

**Issue: Database connection fails**
- Solution: Verify `POSTGRES_URL` is set correctly in Vercel dashboard

**Issue: Blob storage errors**
- Solution: Verify `BLOB_READ_WRITE_TOKEN` is set correctly

**Issue: Function timeout**
- Solution: Upgrade to Pro plan (60s) or Enterprise (300s)

**Issue: File upload size limit**
- Solution: Use chunked uploads or upgrade to Enterprise plan

---

## Next Steps After Setup

Once all checklist items are complete:

1. ✅ **Review** [VERCEL_IMPLEMENTATION_PLAN.md](./VERCEL_IMPLEMENTATION_PLAN.md)
2. ✅ **Start Phase 1**: Backend Setup (Days 1-3)
3. ✅ **Follow** [IMPLEMENTATION_OUTLINE.md](./IMPLEMENTATION_OUTLINE.md)

---

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Postgres Docs](https://vercel.com/docs/storage/vercel-postgres)
- [Vercel Blob Storage Docs](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Support](https://vercel.com/support)

---

**Status**: ⏳ **Ready to Begin** (once all items checked)
