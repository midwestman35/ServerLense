# Upgrade Guide: Free Tier to Production

This guide explains how to upgrade from free tier (development/testing) to paid tier (production) for ServerLense.

## Overview

**Good News**: Upgrading from free tier to paid tier is **mostly just a configuration change**. Your code should work the same way - no major refactoring needed.

## What Changes When Upgrading?

### ✅ What Stays the Same (No Code Changes)

- **Database schema**: Same Postgres schema works on all tiers
- **API code**: Same queries, same logic
- **Connection method**: Same Postgres client libraries
- **Environment variables**: Same variable names (`POSTGRES_URL`)
- **Vercel deployment**: Same deployment process

### 🔄 What Changes (Configuration Only)

- **Connection string**: New connection string from upgraded account
- **Environment variables**: Update `POSTGRES_URL` in Vercel dashboard
- **Resource limits**: More storage, compute, and bandwidth
- **Billing**: Start paying for the service

## Step-by-Step Upgrade Process

### Option A: Neon Upgrade

#### Current Setup (Free Tier)
- **Storage**: 3GB
- **Compute**: 0.5GB
- **Cost**: $0/month
- **Connection String**: `postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`

#### Upgrade to Launch Plan ($19/month)
1. **Go to Neon Dashboard** → Billing → Upgrade
2. **Select Launch Plan** ($19/month)
   - 10GB storage
   - 1GB compute
   - Better performance
3. **Get new connection string** (if changed)
   - Go to Project Settings → Connection Details
   - Copy the connection string
4. **Update Vercel environment variable**
   - Vercel Dashboard → Your Project → Settings → Environment Variables
   - Update `POSTGRES_URL` with new connection string
   - Apply to: Production, Preview, Development
5. **Redeploy** (optional - usually not needed if connection string is same)
   ```bash
   vercel --prod
   ```

#### Upgrade to Scale Plan ($69/month)
- **Same process as above**, just select Scale Plan instead
- **Storage**: 50GB
- **Compute**: 4GB
- **Better for**: Larger databases, higher traffic

### Option B: Supabase Upgrade

#### Current Setup (Free Tier)
- **Database**: 500MB
- **Bandwidth**: 2GB/month
- **Cost**: $0/month
- **Connection String**: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

#### Upgrade to Pro Plan ($25/month)
1. **Go to Supabase Dashboard** → Settings → Billing
2. **Select Pro Plan** ($25/month)
   - 8GB database
   - 50GB bandwidth/month
   - Better performance
3. **Connection string usually stays the same** (same project)
   - Verify in Project Settings → Database → Connection String
4. **Update Vercel environment variable** (if connection string changed)
   - Vercel Dashboard → Your Project → Settings → Environment Variables
   - Update `POSTGRES_URL` if needed
5. **Redeploy** (usually not needed)

## Migration Checklist

### Before Upgrading

- [ ] **Backup your database** (if you have production data)
  ```bash
  # Neon: Use pg_dump or Neon's built-in backup
  pg_dump $POSTGRES_URL > backup.sql
  
  # Supabase: Use Supabase dashboard → Database → Backups
  ```

- [ ] **Document current connection string** (for rollback if needed)
- [ ] **Test upgrade in preview/staging** (if possible)
- [ ] **Verify billing information** is set up correctly

### During Upgrade

- [ ] **Upgrade plan** in Neon/Supabase dashboard
- [ ] **Get new connection string** (if provided)
- [ ] **Update Vercel environment variables**
  - Update `POSTGRES_URL` in Production environment
  - Update `POSTGRES_URL` in Preview environment (optional)
  - Keep Development environment on free tier (optional)
- [ ] **Verify connection** using test script:
  ```bash
  npx tsx scripts/test-db.ts
  ```

### After Upgrading

- [ ] **Test API endpoints** to ensure they work
- [ ] **Monitor database usage** in Neon/Supabase dashboard
- [ ] **Check Vercel logs** for any connection errors
- [ ] **Verify performance** improvements (if any)
- [ ] **Update cost tracking** documentation

## Code Considerations

### No Code Changes Needed For:

✅ **Basic CRUD operations** - Same SQL queries work on all tiers
✅ **Connection pooling** - Neon/Supabase handle this automatically
✅ **Indexes** - Same indexes work on all tiers
✅ **Transactions** - Same transaction logic
✅ **Batch inserts** - Same batch operations

### Potential Considerations:

⚠️ **Rate Limits**: Free tier may have stricter rate limits
   - **Solution**: Upgrade removes these limits
   - **Code**: No changes needed, just works better

⚠️ **Connection Limits**: Free tier may have fewer concurrent connections
   - **Solution**: Paid tiers have more connections
   - **Code**: Connection pooling handles this automatically

⚠️ **Query Timeout**: Free tier may have shorter timeouts
   - **Solution**: Paid tiers have longer timeouts
   - **Code**: No changes needed, just works better

⚠️ **Storage Limits**: Free tier has storage limits
   - **Solution**: Upgrade provides more storage
   - **Code**: No changes needed, just more capacity

## Environment-Specific Configuration

### Recommended Setup:

**Development Environment** (Free Tier)
- Use free tier for local development
- Connection string: `POSTGRES_URL_DEV` (optional)
- Cost: $0/month

**Preview/Staging Environment** (Free Tier or Launch)
- Use free tier or Launch plan
- Connection string: `POSTGRES_URL_PREVIEW` (optional)
- Cost: $0-19/month

**Production Environment** (Launch or Scale)
- Use Launch ($19/month) or Scale ($69/month) plan
- Connection string: `POSTGRES_URL` (production)
- Cost: $19-69/month

### Using Different Tiers Per Environment:

```typescript
// lib/db.ts
const connectionString = process.env.POSTGRES_URL || 
  (process.env.VERCEL_ENV === 'production' 
    ? process.env.POSTGRES_URL_PROD 
    : process.env.POSTGRES_URL_DEV);

// Use connectionString for your database client
```

## Cost Comparison

### Neon Upgrade Path:

| Tier | Storage | Compute | Monthly Cost | Best For |
|------|---------|---------|--------------|----------|
| **Free** | 3GB | 0.5GB | $0 | Development, testing |
| **Launch** | 10GB | 1GB | $19 | Small production (< 10GB) |
| **Scale** | 50GB | 4GB | $69 | Medium production (< 50GB) |
| **Custom** | Custom | Custom | Custom | Large production |

### Supabase Upgrade Path:

| Tier | Database | Bandwidth | Monthly Cost | Best For |
|------|----------|-----------|--------------|----------|
| **Free** | 500MB | 2GB | $0 | Development, testing |
| **Pro** | 8GB | 50GB | $25 | Small-medium production |
| **Team** | 32GB | 250GB | $599 | Large production |

## Rollback Plan

If you need to rollback:

1. **Downgrade plan** in Neon/Supabase dashboard
2. **Restore connection string** to previous value in Vercel
3. **Redeploy** if needed
4. **Restore database backup** if data was lost (unlikely)

## FAQ

### Q: Will my data be lost when upgrading?
**A**: No, upgrading preserves all your data. It's just a plan change.

### Q: Do I need to change my code?
**A**: No, the same code works on all tiers. Just update the connection string.

### Q: Can I use free tier for dev and paid for production?
**A**: Yes! Use different connection strings per environment.

### Q: How long does the upgrade take?
**A**: Usually instant (1-5 minutes). Just update the connection string and redeploy.

### Q: What if I exceed the free tier limits?
**A**: You'll get warnings, then the service may throttle. Upgrade before hitting limits.

### Q: Can I downgrade later?
**A**: Yes, but check provider's downgrade policy. Data is preserved.

## Summary

**Upgrading is simple:**
1. ✅ Upgrade plan in Neon/Supabase dashboard
2. ✅ Update `POSTGRES_URL` environment variable in Vercel
3. ✅ Redeploy (optional - usually not needed)
4. ✅ Done! No code changes required.

**Total time**: 5-10 minutes
**Code changes**: None
**Downtime**: Minimal (just redeploy if needed)
