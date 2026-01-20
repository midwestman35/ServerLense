# Vercel Function Logs & Monitoring Guide

## Where to View Function Logs

### Option 1: Vercel Dashboard (Web UI) - Recommended

1. **Go to Vercel Dashboard:**
   - Navigate to: https://vercel.com/dashboard
   - Select your project: `serverlense` (or `enriques-projects-e2ad103a/serverlense`)

2. **View Function Logs:**
   - Click on your project
   - Go to **"Deployments"** tab
   - Click on a specific deployment
   - Click **"Functions"** tab (or scroll to Functions section)
   - Click on any function (e.g., `api/parse.ts`)
   - View logs, execution time, memory usage, and errors

3. **Real-Time Logs:**
   - Go to **"Logs"** tab in your project
   - Filter by function name (e.g., `api/parse`)
   - See real-time logs as requests come in

4. **Analytics:**
   - Go to **"Analytics"** tab
   - View function execution times, invocations, errors
   - See performance metrics over time

### Option 2: Vercel CLI

```bash
# View logs for a specific deployment
npx vercel logs [deployment-url]

# View real-time logs
npx vercel logs --follow

# View logs for a specific function
npx vercel logs --function api/parse

# View logs with filters
npx vercel logs --since 1h
```

### Option 3: Vercel Dashboard - Function Details

1. **Project Dashboard → Functions Tab:**
   - Shows all serverless functions
   - Click on a function to see:
     - Execution count
     - Average execution time
     - Error rate
     - Memory usage
     - Invocation graph

2. **Deployment → Function Details:**
   - Click on a deployment
   - Scroll to "Functions" section
   - Click on function name
   - See detailed logs for that deployment

## What to Look For

### Performance Metrics

1. **Execution Time:**
   - Look for `Duration` in logs
   - Should see times like: `Duration: 2.34s`
   - Compare before/after optimizations

2. **Memory Usage:**
   - Look for `Memory Used` in logs
   - Should see: `Memory Used: 512 MB` (or similar)
   - Should stay under 2GB limit

3. **Function Invocations:**
   - Count of how many times function was called
   - Success vs error rates

### Log Messages

Our code includes helpful log messages:

```
[Parse] Starting to parse file: filename.log (5.23MB)
[Parse] Parsed 5422 log entries, starting database insert...
[Parse] Inserted 1000/5422 logs...
[Parse] Inserted 2000/5422 logs...
[Parse] Successfully inserted 5422 logs for file: filename.log
```

### Error Monitoring

- Check for errors in logs
- Look for timeout errors (should be rare with 60s limit)
- Check for memory errors (should be rare with 2GB)

## Quick Access URLs

Based on your project setup:

- **Dashboard**: https://vercel.com/enriques-projects-e2ad103a/serverlense
- **Deployments**: https://vercel.com/enriques-projects-e2ad103a/serverlense/deployments
- **Logs**: https://vercel.com/enriques-projects-e2ad103a/serverlense/logs
- **Analytics**: https://vercel.com/enriques-projects-e2ad103a/serverlense/analytics

## Monitoring Best Practices

1. **After Deployment:**
   - Check logs immediately after deploying
   - Test file upload and verify logs appear
   - Monitor execution times for first few requests

2. **Performance Monitoring:**
   - Compare execution times before/after optimizations
   - Watch for any regressions
   - Monitor memory usage patterns

3. **Error Tracking:**
   - Set up alerts for function errors (if available)
   - Monitor error rates
   - Check for timeout issues

## Example Log Output

When you upload a file, you should see logs like:

```
[Parse] Starting to parse file: log-2025-12-20.txt (10.5MB)
[Parse] Parsed 5422 log entries, starting database insert...
[Parse] Inserted 1000/5422 logs...
[Parse] Inserted 2000/5422 logs...
[Parse] Inserted 3000/5422 logs...
[Parse] Inserted 4000/5422 logs...
[Parse] Inserted 5000/5422 logs...
[Parse] Successfully inserted 5422 logs for file: log-2025-12-20.txt
Duration: 8.45s
Memory Used: 512 MB
```

## Troubleshooting

### If logs don't appear:
1. Make sure you're looking at the correct deployment (latest)
2. Check that the function was actually invoked
3. Verify environment variables are set correctly

### If execution times are high:
1. Check database connection time
2. Look for slow queries
3. Monitor memory usage (may indicate GC pauses)
4. Check for network latency

### If memory usage is high:
1. Review batch sizes (may need to reduce)
2. Check for memory leaks
3. Monitor over time to see patterns
