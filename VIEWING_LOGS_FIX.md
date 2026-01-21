# Fix: Viewing Vercel Function Logs

## Issue

The command `npx vercel logs api/parse --follow` doesn't work because:
1. `--follow` is deprecated in newer Vercel CLI versions
2. `vercel logs` doesn't accept a function path directly

## ✅ Correct Ways to View Logs

### Option 1: View All Logs (Then Filter) ⭐ Recommended

```bash
# View all logs and filter for parse function
npx vercel logs | grep -i "parse\|error\|403"

# View raw logs and filter for [Parse] prefix
npx vercel logs --output raw | grep "\[Parse\]"

# View only errors
npx vercel logs --output raw | grep -i "error\|403\|failed"
```

### Option 2: View Logs for Specific Deployment

```bash
# Get your deployment URL from vercel ls or dashboard
npx vercel ls

# View logs for specific deployment
npx vercel inspect <deployment-url> --logs

# Example:
npx vercel inspect serverlense-jn1gjqrmh-enriques-projects-e2ad103a.vercel.app --logs
```

### Option 3: Vercel Dashboard (Easiest) ⭐⭐ BEST OPTION

1. Go to: https://vercel.com/enriques-projects-e2ad103a/serverlense
2. Click **"Deployments"** tab
3. Click on the **latest deployment**
4. Click **"Functions"** tab
5. Click on **`api/parse.ts`**
6. Click **"Logs"** tab

This shows all logs for that specific function with timestamps and filtering options.

---

## Quick Commands Reference

### View Recent Logs
```bash
npx vercel logs --output raw | tail -50
```

### Filter for Parse Function Only
```bash
npx vercel logs --output raw | grep "\[Parse\]"
```

### Watch for Errors Only
```bash
npx vercel logs --output raw | grep -i "error\|403"
```

### View Last Hour
```bash
npx vercel logs --output raw --since 1h | grep "\[Parse\]"
```

---

## Why Dashboard is Best

The Vercel Dashboard provides:
- ✅ Real-time log streaming
- ✅ Filtering by function, log level, search term
- ✅ Timestamps and request IDs
- ✅ Click-through to related requests
- ✅ Better formatting and readability

---

## Troubleshooting

### If `vercel logs` shows nothing:
- Make sure you're in the project directory
- Run `npx vercel link` if not already linked
- Check you're logged in: `npx vercel whoami`

### If logs are empty:
- Trigger a function call (upload a file)
- Logs may take a few seconds to appear
- Check the correct environment (production vs preview)

---

## Recommended Workflow

1. **Open Dashboard:** https://vercel.com/enriques-projects-e2ad103a/serverlense/deployments
2. **Click latest deployment** → **Functions** → **api/parse.ts** → **Logs**
3. **Upload a file** in your browser
4. **Watch logs appear** in real-time in the dashboard

This is the easiest and most reliable way to monitor function logs.
