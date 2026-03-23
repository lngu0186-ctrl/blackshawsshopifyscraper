# Blackshaws Pharmacy Product Intelligence Platform — Audit (Phase 1)

_Date:_ 2026-03-24  
_Auditor:_ OpenClaw

## Scope

This audit covers:

- Existing GitHub repo: `blackshawsshopifyscraper`
- Live Lovable deployment: `https://blackshawsshopifyscraper.lovable.app`
- Current Supabase schema and live table population
- Existing Chemist Warehouse desktop scraper build and source tree
- Current routing, UX truthfulness, scrape flow, diagnostics, and data integrity posture

No code changes were made before this audit document.

---

## Executive Summary

The current system is **not greenfield**, but it is also **not yet a reliable product intelligence platform**. It is best described as a **partially working Lovable/Supabase prototype** with some useful assets already in place:

- a working auth-gated web app shell,
- a real `stores` table with live records,
- a real `scraped_products` table with thousands of rows,
- several edge functions for validation/scraping/auth,
- a newer Chemist Warehouse CSV import workflow,
- a separate Chemist Warehouse desktop app codebase that is structurally much stronger than the current Lovable scraper layer.

However, several important parts are currently misleading, incomplete, or architecturally mismatched with the stated vision:

1. **The web app has no first-class Stores page route** even though the UI implies one.
2. **Dashboard navigation is misleading** — known issue confirmed: **“View all stores” routes to `/products`**, not a stores index.
3. **The scraping story is fragmented** across UI claims, edge functions, and historical/product tables.
4. **Diagnostics are present but not yet first-class enough** for reliable store-level failure triage.
5. **Current schema is product-scrape centric, not canonical-product centric**.
6. **Current CW integration is CSV-import oriented in the web app**, while the desktop app already has a more suitable resumable category/job architecture.
7. **The platform currently mixes real data and optimistic states** — some stores show as active/valid while producing little or no usable catalog output.

The repo should be **repaired and extended**, not replaced wholesale. The best path is a **hybrid architecture**:

- keep Lovable + Supabase for UI, review, catalog, exports, and visibility,
- introduce a proper `/backend` FastAPI service,
- reuse ideas and code from the Chemist Warehouse desktop app rather than rebuilding CW scraping from scratch in the frontend.

---

## Assets Confirmed

### Repo
- Present locally at: `/Users/hughn78/.openclaw/workspace/blackshawsshopifyscraper`
- Recent commits show active iteration, especially on CW import and runtime fixes.

### Live app
- Reachable and login/session functional.
- Logged-in UI confirmed under account `newblackshawsroadpharmacy@gmail.com`.

### Chemist Warehouse desktop app
- Present locally at: `/Users/hughn78/.openclaw/workspace/chemistwarehouse_desktop_app`
- Build artifacts exist under `/build` and `/dist`.
- Source code also exists under `/src/cw_scraper_app`, which is much more useful than inspecting build artifacts alone.

### Local data directory
- Present at: `/Users/hughn78/Price Data`
- Not yet processed during this audit phase.

---

## Credentials / Config Discovery

Per instruction, credentials were not hardcoded and were located from existing project files/runtime.

### Found
- Supabase project URL and client config are present in repo config files.
- Supabase frontend credentials are present in repo environment/config files.
- Live authenticated session data is also present in the running web app session.

### Documented source locations
- `blackshawsshopifyscraper/.env`
- `blackshawsshopifyscraper/src/lib/supabase.ts`
- `blackshawsshopifyscraper/supabase/config.toml`

### Important note
A **service-role based local backend integration is not yet implemented** in the repo structure being audited. The planned backend should source its own Supabase service credentials from environment/config at runtime and never expose them to the frontend.

---

## Live App Audit

## Observed navigation structure
Sidebar currently exposes:

- Dashboard
- Products
- Price Changes
- Exports
- Diagnostics
- Scraping Audit
- CW Import
- Settings

### Missing from navigation vs target vision
The current app does **not** yet expose dedicated first-class pages for:

- Stores
- Categories
- Imports (generic, beyond CW-specific import)
- Review Queue
- Manual Curation
- Price Intelligence (current “Price Changes” is narrower)
- Chemist Warehouse Scraper control panel

---

## Confirmed broken / misleading UX

### 1. “View all stores” is broken/misleading
Confirmed in code:

- `src/pages/Dashboard.tsx` links **“View all stores →”** to `/products`
- there is **no `/stores` route** in `src/App.tsx`
- there is only a store detail route: `/stores/:id`

This means the UI implies a stores index page that does not exist.

### 2. Dashboard overstates operational readiness
The dashboard presents operational cards and store progress summaries, but the actual system is still missing:

- a backend service,
- stable end-to-end scrape diagnostics,
- canonical product matching,
- review workflow for uncertain records,
- trustworthy store health semantics.

Several summary cards/routes currently act more like prototype shortcuts than truthful operational controls.

### 3. Stores surface is buried in the sidebar, not a proper page
The sidebar contains an expandable store list (`STORES (3/25)` observed live) and store detail links, but there is no dedicated stores management/index page. This creates a mismatch between app structure and user expectations.

### 4. CW Import is present, but general import architecture is not
The app currently includes a CW import workflow and history/review pages, but not the broader import management UX required by the product vision.

---

## Current Route Inventory

From `src/App.tsx`, currently implemented notable routes include:

- `/` → dashboard
- `/products`
- `/diagnostics`
- `/scraping-audit`
- `/stores/:id`
- `/cw-import`
- `/cw-import/history`
- `/cw-import/:jobId`

### Notable absence
- No `/stores`
- No `/imports`
- No `/categories`
- No `/review-queue`
- No `/manual-curation`
- No `/price-intelligence` as a dedicated surface
- No `/settings/backend` style backend connectivity workflow

---

## Supabase Schema Audit — Current State

The current schema is not yet aligned to the requested canonical-product architecture.

### Main live/current tables identified during audit
The live app and repo currently rely on a schema centered around:

- `stores`
- `scraped_products`
- `scrape_runs`
- `scrape_run_stores`
- `scraper_events`
- `variant_price_history`
- `cw_import_jobs`
- `cw_import_rows`
- related auth/export/runtime support tables

### Schema character
Current schema is oriented around:

- store validation,
- scrape execution,
- scraped product rows,
- event logging,
- CW CSV import staging.

It is **not yet centered on one canonical product per barcode** with append-only source records and reviewable match decisions.

---

## Live Data Quality Snapshot

### Stores
Live app shows ~25 seeded/managed stores, but only a small subset show product counts in the sidebar. This strongly suggests a gap between:

- store registry / qualification state,
- store runtime success,
- enriched product persistence.

### Products
The live dashboard reports **5,250 discovered** products, indicating scraping/import has populated data. However, current product rows are still store-scrape centric and not yet canonicalized.

### Known concern
The presence of product counts on only some stores, combined with prototype-grade store status fields, indicates likely cases of:

- zero-product stores,
- partially scraped stores,
- validated-but-not-productive stores,
- incomplete enrichment.

This matches the requested reliability investigation targets.

---

## Scraping Reliability Investigation

## Current scraper architecture in web app
The web app currently relies on frontend-triggered Supabase edge functions and direct Supabase table updates.

Relevant functions observed:

- `validate-store`
- `detect-platforms`
- `scrape-store`

### What this means
The current approach is lightweight and easy to prototype, but it is not ideal for:

- long-running jobs,
- resumable jobs,
- authenticated session-heavy scraping,
- high-volume extraction,
- reliable per-request retry control,
- local file ingestion,
- future desktop packaging.

This is one of the strongest reasons to move heavy scraping into a dedicated local backend.

---

## Reliability findings

### 1. False-valid states are structurally possible
The `stores` flow contains separate fields such as:

- validation status,
- platform detection,
- scrapeability score,
- auth status,
- enabled/store status,

But there is no evidence yet that these are strongly coupled to actual observed product extraction success over time.

Result: a store can look “connected”, “validated”, or “enabled” while still yielding little or no useful catalog output.

### 2. Product discovery and product enrichment are not clearly separated everywhere
Current architecture appears to discover products and persist scrape rows, but the diagnostics needed to prove field-level enrichment coverage are not yet first-class.

This makes it easy to overcount “success” based on discovery while still failing on:

- barcode,
- descriptions,
- images,
- availability,
- variant detail,
- category lineage.

### 3. Silent or underexplained failures remain likely
There is logging via `scraper_events`, `scrape_runs`, and related tables/pages, which is good. But current diagnostics are still insufficiently opinionated for store operators.

Missing or weak areas include:

- per-request retry history surfaced to UI,
- raw failure snippets surfaced consistently,
- field-level extraction completeness summaries,
- explicit auth success vs auth failure vs extraction failure separation,
- last known successful strategy and last known failure strategy side-by-side.

### 4. Retry/backoff/session handling is not yet a platform-level capability
The target system requires:

- session reuse,
- per-store auth handling,
- resumability,
- anti-blocking policy,
- clear blocked-state semantics.

Current web-edge-function architecture is not the right long-term home for that complexity.

### 5. Store-level observability is not yet operationally sufficient
There is diagnostic scaffolding, but not enough to answer, at a glance:

- why did this store fail,
- which strategy was attempted,
- what HTTP/page/auth result occurred,
- how many products were discovered vs enriched,
- what changed since last successful run.

---

## Diagnostics Audit

## What exists now
The app already contains:

- a Diagnostics page,
- a Scraping Audit page,
- scraper event tables,
- run/store tracking tables.

That is a strong starting point.

## What is missing for “first-class diagnostics”
The requested diagnostics standard is stricter than current implementation. Missing/incomplete items include:

- explicit platform detection result per run,
- strategy chosen per run and per store,
- explicit auth-needed/auth-succeeded/auth-failed lifecycle,
- category discovery counts,
- product discovery vs enrichment counts,
- field-level coverage summaries,
- retry history per request,
- sampled raw response bodies/snippets on failure,
- last success timestamp per store shown as a core operational signal.

## Conclusion
Diagnostics are **partially implemented but not yet decision-grade**.

---

## Current Product Data Model vs Target Vision

## Current reality
The frontend product experience is built primarily around `scraped_products` rows and review/export metadata.

This supports:

- browsing scraped rows,
- some review states,
- exports,
- confidence scores,
- source URLs and store names.

## Architectural mismatch
The requested target architecture requires:

- one canonical `products` record per barcode,
- append-only `product_source_records`,
- separate `product_matches`,
- historical `price_history`,
- review queue for uncertain matching,
- barcode provenance and trust hierarchy.

That model does **not yet exist** in the current Lovable schema.

## Implication
A non-destructive schema refactor and migration layer will be required. Current data can likely be preserved, but the model needs to be reoriented.

---

## Chemist Warehouse Integration Audit

## Current web-app CW implementation
The Lovable app already includes CW import pages and CW import tables. Based on route structure and recent commits, this is currently focused on **CSV import / review**, not a full category-driven scraper control plane.

## Existing desktop app assessment
The separate `chemistwarehouse_desktop_app` is much closer to the desired execution model.

### Observed strengths
The desktop app already contains:

- PySide6 UI
- SQLite + SQLAlchemy schema
- resumable `scrape_jobs` and `job_items`
- `CategoryService`
- `ScrapeService`
- `DiagnosticsService`
- `ExportService`
- barcode enrichment hooks
- category-first workflow
- product/source/price history concepts

### Important source observations
`src/cw_scraper_app/main.py` wires together services including:

- `CategoryService`
- `JobService`
- `ScrapeService`
- `DiagnosticsService`
- `ProductBrowserService`
- `BarcodeEnrichmentService`

`src/cw_scraper_app/scraper/adapter.py` includes:

- category discovery,
- category page URL extraction,
- product URL discovery,
- product payload fetching,
- HTML + JSON-LD + `__NEXT_DATA__` parsing,
- Algolia enrichment,
- internal barcode lookup support,
- optional Playwright fallback.

`src/cw_scraper_app/services/scrape_service.py` includes:

- resumable job item claiming,
- category expansion into product tasks,
- product resolution and source linking,
- price history inserts,
- failure logging.

### Key limitation
It is currently implemented as a **desktop app with local SQLite state**, not a Supabase-writing backend service.

### Audit conclusion
This desktop codebase should **inform and seed the FastAPI backend**, not be ignored. It already solves many of the hard CW workflow problems more cleanly than the current Lovable-side approach.

---

## Desktop Migration Suitability

The requested future desktop packaging requirement is valid.

### Current risk areas
The present Lovable app is naturally browser-centric. Any frontend code that assumes browser-only APIs or frontend-managed long-running jobs will create friction for desktop packaging later.

### Recommended stance
- keep the web frontend thin,
- move scraping/import/export heavy logic into `/backend`,
- let the frontend become a control plane,
- annotate browser-only assumptions with `// DESKTOP-MIGRATION:` as implementation proceeds.

This aligns with both maintainability and future desktop packaging.

---

## Immediate Repair Priorities (Phase 1b / 1c)

### P0
1. Add a real **Stores page** and correct all store navigation.
2. Fix misleading dashboard/store summary links.
3. Make store status cards truthful: distinguish seeded / validated / scraped / productive / blocked.
4. Add backend connectivity status concept to Settings + app shell.

### P1
5. Upgrade diagnostics to per-store, per-run, decision-grade visibility.
6. Normalize scrape outcomes into explicit categories:
   - auth failure
   - blocked
   - extraction partial
   - extraction failed
   - zero products
   - success
7. Expose last success timestamp and last failure reason prominently.

### P2
8. Introduce `/backend` FastAPI service and move heavy scrape logic there.
9. Reuse Chemist Warehouse desktop logic for category/job/resume patterns.
10. Begin non-destructive schema refactor toward canonical products and source records.

---

## Recommendation: Repair vs Rewrite

### Recommendation
**Repair and extend. Do not rebuild from scratch.**

### Why
- The repo already has useful auth, routing, product browsing, export, diagnostics, and CW import work.
- The current Supabase dataset has real operational value and should be preserved.
- The separate CW desktop app contains reusable architecture for resumable scraping.
- Full rewrite would discard too much working knowledge and delay delivery.

### What should be replaced
Not the whole app — but the **heavy scrape execution model** should be replaced with a proper backend service.

---

## Proposed Target Architecture

### Layer 1 — Lovable + Supabase
Use for:

- catalog UI
- stores UI
- diagnostics UI
- review queue
- product curation
- imports review/commit
- exports control/download
- backend health and job monitoring

### Layer 2 — Local FastAPI backend on Mac mini
Use for:

- Chemist Warehouse scraping
- heavy/high-volume competitor scraping
- authenticated/session-backed scraping
- resumable jobs
- local file ingestion from `/Users/hughn78/Price Data`
- export generation
- direct Supabase writes using backend-held credentials

### Integration note
This is the cleanest path that preserves the current web app while making scraping reliable enough for the stated product vision.

---

## Phase 1 Exit Criteria

Before moving beyond Phase 1, the following should be completed:

- [ ] real Stores page exists
- [ ] broken/misleading routes fixed
- [ ] audit-backed list of false-valid states documented in code and UI
- [ ] diagnostics expanded to store/run truthfulness
- [ ] backend skeleton added under `/backend`
- [ ] architecture document created describing hybrid design and migration rationale

---

## Notes for Next Phase

When implementing subsequent phases:

- prefer non-destructive migrations,
- preserve existing tables until migration/compatibility paths exist,
- do not trust scraped barcodes over file-imported/supplier barcodes,
- move scraping state out of frontend orchestration,
- reuse CW desktop app logic where it saves time and improves reliability.
