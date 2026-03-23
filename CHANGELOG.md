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

## 2026-03-24 — Phase 1c store diagnostics truthfulness

### Delivered
- Added `useStoreDiagnostics` to derive operational store states from:
  - store validation/auth fields
  - recent `scrape_run_stores` outcomes
  - recent `scraper_events`
- Upgraded `/stores` cards to show a truthful diagnostics badge and short reason, instead of only raw validation state
- Added recent issue counts and latest run outcome to the Stores view
- Upgraded store-detail health logic to recognize:
  - auth required
  - blocked/restricted
  - zero-product stores
  - stale stores
  - failing stores
- Added latest issue message and warning counts to the store detail health panel

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Diagnostics are still derived client-side from current tables rather than from a dedicated backend health model
- Latest run lookup is based on the newest `scrape_run_stores` rows available, not a purpose-built per-store health snapshot
- Field-level coverage is still product-centric and not yet split into discovery vs enrichment truth metrics

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
