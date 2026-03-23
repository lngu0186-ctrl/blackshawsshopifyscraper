# CHANGELOG

## 2026-03-24 — Phase 1 audit baseline

### Delivered
- Added `/docs/audit.md` with:
  - repo/runtime audit
  - live Lovable app findings
  - current Supabase schema assessment
  - scraping reliability findings
  - Chemist Warehouse desktop app assessment
  - recommended hybrid architecture direction

### Test results
- Live app reachable and authenticated
- Repo inspected locally
- Supabase live tables queried for schema/data audit
- Chemist Warehouse desktop source tree inspected

### Known limitations
- No backend service exists yet
- Current schema remains scrape-row centric rather than canonical-product centric
- Store diagnostics are still not decision-grade

## 2026-03-24 — Phase 1b route truthfulness fix

### Delivered
- Added first-class `Stores` page at `/stores`
- Added sidebar navigation item for `Stores`
- Fixed dashboard `View all stores` link to route to `/stores` instead of `/products`

### Test results
- `npm install` completed successfully
- `npm run build` completed successfully
- Build warnings observed:
  - large JS bundle/chunk size warning
  - dynamic/static import chunking warning for `supabase.ts` and `useAuth.tsx`
  - stale Browserslist data warning

### Known limitations
- Stores page is a first repair, not the final stores management experience
- Store health semantics are still based on existing fields and remain only partially truthful
- Diagnostics/backend connectivity work is still pending
