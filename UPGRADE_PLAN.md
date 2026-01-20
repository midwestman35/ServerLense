# Security Vulnerability Upgrade Plan

## Current Situation

**18 vulnerabilities** (3 moderate, 15 high)
- Most are in **dev dependencies** (build tools)
- **1 affects production**: `undici` via `@vercel/blob`

## Risk Assessment

### Production Risk: **LOW to MODERATE**

| Vulnerability | Severity | Production Risk | Reason |
|---------------|----------|-----------------|--------|
| `esbuild` | Moderate | **None** | Dev server only |
| `path-to-regexp` | High | **Low** | Build/routing, not user input |
| `tar` | High | **None** | Build-time only |
| `undici` | Moderate | **Moderate** | Used in production via `@vercel/blob` |

## Upgrade Options

### Option 1: Safe Incremental Upgrade (⭐ RECOMMENDED)

**Upgrade to latest 0.x versions (same major version):**

```bash
# Upgrade @vercel/blob to latest 0.x (fixes undici, same major version)
npm install @vercel/blob@0.27.3

# This fixes the production undici vulnerability
# undici: 6.22.0 (vulnerable) → 5.28.4 (fixed)
```

**Benefits:**
- ✅ Fixes production vulnerability (`undici`)
- ✅ Same major version (0.x) - lower risk
- ✅ No breaking changes expected
- ✅ We only use `put()`, `del()`, `list()` (server-side, unaffected by 2.0 breaking changes)

**Current versions:**
- `@vercel/blob`: 0.20.0 → 0.27.3 ✅ **SAFE**

### Option 2: Full Upgrade (Higher Risk, Fixes All)

**Upgrade to latest versions:**

```bash
# Upgrade @vercel/blob to 2.0.0 (major version)
npm install @vercel/blob@2.0.0

# Upgrade @vercel/node to 5.5.25 (fixes all vulnerabilities)
npm install @vercel/node@5.5.25
```

**Current versions:**
- `@vercel/node`: 3.2.29 → 5.5.25
- `@vercel/blob`: 0.20.0 → 2.0.0

**⚠️ Warning**: Major version upgrades may have breaking changes.
**Note**: `@vercel/blob@2.0.0` breaking changes mainly affect client-side `handleUpload`, which we don't use.

### Option 2: Conservative Approach (Safer)

**Upgrade only what's necessary:**

```bash
# Try upgrading @vercel/blob first (may fix undici)
npm install @vercel/blob@^0.22.0

# Keep @vercel/node at 3.x for now
# Most vulnerabilities are dev-only
```

### Option 3: Wait and Monitor

- Most vulnerabilities are in dev dependencies
- Only `undici` affects production (moderate severity)
- Monitor for stable releases
- Upgrade when ready

## Recommended Action Plan

### Phase 1: Safe @vercel/blob Upgrade (⭐ START HERE - Low Risk)

```bash
# Create test branch
git checkout -b upgrade/vercel-blob-safe

# Upgrade @vercel/blob to latest 0.x (fixes undici vulnerability)
npm install @vercel/blob@0.27.3

# Test file upload functionality
npm run build
npm run dev:vercel
# Test: Upload a file and verify it works
# Test: Verify blob deletion works
# Test: Verify clear functionality works

# If successful, commit
git add package.json package-lock.json
git commit -m "security: Upgrade @vercel/blob to 0.27.3 to fix undici vulnerability"
```

**This fixes the production vulnerability with minimal risk.**

### Phase 2: Test @vercel/node Upgrade (Optional - Higher Risk)

**Only do this after Phase 1 is successful and deployed.**

```bash
# Create separate test branch
git checkout -b upgrade/vercel-node

# Upgrade @vercel/node to latest (fixes all dev vulnerabilities)
npm install @vercel/node@5.5.25

# Test build
npm run build

# Test all API routes
npm run dev:vercel
# Test: /api/parse, /api/logs, /api/health, /api/counts, /api/timeline, /api/clear

# Check for breaking changes
# Review Vercel changelog: https://vercel.com/changelog
```

**Note**: This fixes dev/build vulnerabilities. Production is already safe after Phase 1.

### Phase 3: Production Deployment

Only after thorough testing:
1. Merge to main
2. Deploy to production
3. Monitor for issues

## Breaking Changes to Watch For

### @vercel/blob 0.20.0 → 2.0.0

**Potential breaking changes:**
- API method signatures may have changed
- Check: `put()`, `del()`, `list()` methods
- Review: https://github.com/vercel/blob/releases

### @vercel/node 3.0.0 → 4.0.0

**Potential breaking changes:**
- Request/Response handling
- TypeScript types
- Runtime behavior
- Review: Vercel changelog

## Testing Checklist

After upgrading:

- [ ] Build succeeds (`npm run build`)
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] File upload works (`/api/parse`)
- [ ] Log queries work (`/api/logs`)
- [ ] Correlation counts work (`/api/counts`)
- [ ] Timeline works (`/api/timeline`)
- [ ] Health check works (`/api/health`)
- [ ] Clear works (`/api/clear`)
- [ ] No runtime errors in Vercel logs

## Current Status

**Production**: ✅ Functional
**Vulnerabilities**: ⚠️ Documented, mostly dev-only
**Action**: Test upgrades in development

## Immediate Recommendation

**For Production Safety:**
1. ✅ **Document vulnerabilities** (done)
2. ⚠️ **Upgrade `@vercel/blob` to 0.27.3** (fixes production undici vulnerability)
3. 📋 **Test thoroughly** before deploying
4. 🔄 **Consider `@vercel/node` upgrade later** (fixes dev vulnerabilities, lower priority)

**Priority**: 
- **🔴 HIGH**: Upgrade `@vercel/blob` to 0.27.3 (fixes production undici issue, safe upgrade)
- **🟡 MEDIUM**: Upgrade `@vercel/node` to 5.5.25 (fixes dev vulnerabilities, can wait)

## Quick Start: Safe Upgrade

```bash
# 1. Create test branch
git checkout -b security/upgrade-blob

# 2. Upgrade @vercel/blob (fixes production vulnerability)
npm install @vercel/blob@0.27.3

# 3. Test
npm run build
npm run dev:vercel
# Test file upload

# 4. If successful, commit and deploy
git add package.json package-lock.json
git commit -m "security: Upgrade @vercel/blob to 0.27.3 (fixes undici vulnerability)"
git push origin security/upgrade-blob
# Create PR, test, then merge to main
```
