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

## 2026-03-24 — Phase 1i runbook actions in Stores + Store Detail

### Delivered
- Added new `useStoreActions` hook for operational store actions:
  - revalidate selected stores against `validate-store`
  - create targeted scrape runs for selected stores
  - run single-store or multi-store scrape actions from the UI
- Upgraded `/stores` into a runbook-friendly control surface:
  - select-all / clear-selection
  - per-store checkbox selection
  - bulk **Revalidate selected**
  - bulk **Scrape selected**
  - per-store action buttons for revalidate, scrape, and diagnostics drill-down
- Upgraded `StoreDetail` with direct operational actions:
  - **Revalidate store**
  - **Scrape now**
  - **Open diagnostics**

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Bulk scrape currently executes selected stores sequentially within one targeted run rather than via a richer job orchestration UI
- These actions depend on the currently deployed Supabase edge functions; if hosted functions lag repo code, runtime behavior may still reflect that
- The runbook markdown exists separately; this phase makes the UI actionable but does not yet write outcomes back into the runbook automatically

## 2026-03-24 — Phase 1h audit truthfulness + legacy URL hardening

### Delivered
- Hardened `scrape-store` to always scrape from the site origin even if older records still have collection-scoped `normalized_url` values
- Updated Scraping Audit copy so it matches the current engine reality:
  - collection traversal is implemented
  - WooCommerce support exists in the main scraper
  - recommendations now focus more on re-validation/re-scrape of legacy stores than already-fixed event-linkage issues
- Updated verification/recommendation wording to reflect current strategy truth more accurately

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Edge-function runtime changes still require Supabase deployment to affect live scraping
- Audit recommendations are more truthful now, but live metrics still depend on running fresh validation/scrapes after deployment
- This pass improves engine robustness for legacy URLs, but does not yet perform automatic bulk re-validation of existing stores

## 2026-03-24 — Phase 1g audit-driven scraper qualification fixes

### Delivered
- Fixed `validate-store` URL normalization so stores added with collection-scoped URLs are normalized back to the site root for full-store scraping
- Fixed WooCommerce strategy naming mismatch in validation (`wc_api` instead of legacy `woocommerce_api`)
- Stopped auth-gated stores from overwriting real scrape strategy with a pseudo-strategy like `password_protected`
- Upgraded validation-time category discovery to prefer real `/collections.json` discovery instead of only probing a few hardcoded collection guesses
- Fixed a Scraping Audit data bug where category counts could be falsely reported as zero because `product_type` was not selected in the audit query

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Supabase edge function changes require deployment to take effect live; a Git push alone updates the repo but not the hosted function runtime
- The audit recommendations panel still contains some historical/static guidance text that may lag behind newer engine fixes
- A full re-scrape is still needed after deployment to materially improve some audit findings in live data

## 2026-03-24 — Phase 1f products page scroll + drawer hardening

### Delivered
- Fixed Products page scrolling by making the page itself a vertical scroll container inside the app shell
- Added a lightweight results summary above the table so the page reads more like a browse-and-inspect workspace
- Hardened `ProductDetailDrawer` against inconsistent data shapes from live product rows:
  - `category_path` may be null/non-array
  - `tags` may be null/string/non-array
  - `missing_fields` may be null/non-array
  - `image_urls` may be null/non-array
  - `product_variants` may be null/non-array
- This prevents row-click crashes caused by calling array methods on non-array values

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Product detail is still a drawer, not a dedicated routed product page yet
- The drawer is now more robust, but the underlying products schema still has mixed historical field shapes
- Further polish is still possible around column resizing, sticky headers, and richer product detail actions

## 2026-03-24 — Phase 1e diagnostics drill-down + cleaner search + success delta

### Delivered
- Split diagnostics search into two separate inputs:
  - **store search** for the risk queue
  - **event evidence search** for raw scraper events
- Added dashboard → diagnostics drill-down links so key KPI cards can open diagnostics with pre-applied filters:
  - failed → severity error
  - auth blocked → auth-required risk view
- Added **last successful scrape** to each store row on the diagnostics risk table
- Added **failure delta** (`failures since last success`) to help spot regressions after a previously good run
- Added diagnostics URL parameter handling so risk/severity/stage/store/date filters can be deep-linked cleanly

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Failure delta is based on `scrape_run_stores` history and current row availability, not a dedicated backend regression model
- Dashboard drill-downs currently cover the main failure/auth cases, but not every KPI card yet
- Search/filter state is URL-seeded but not fully mirrored back into the URL after every local UI change

## 2026-03-24 — Phase 1d diagnostics page becomes store-first risk queue

### Delivered
- Reworked `/diagnostics` from an event-log-first screen into a **store-first diagnostics queue**
- Added ranked per-store risk scoring so the most urgent stores sort to the top by default
- Added store-level filters for risk state and sort mode
- Added an explicit store diagnostics table with:
  - risk state
  - short reason
  - product count
  - 7-day error/warning counts
  - latest run outcome
  - last scraped timestamp
- Kept raw scraper events as a lower **Event Evidence** section instead of the main UX
- Updated page copy to make the purpose operational: triage stores first, inspect events second

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Risk scoring is heuristic and client-derived, not yet backed by a dedicated backend health model
- Search currently spans both store queue text fields and raw event evidence filters using the same query box
- Evidence still reflects `scraper_events` quality; if events are sparse, store triage is only as good as current instrumentation

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
