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

## 2026-03-24 — Phase 4k best-known mode in Diagnostics + bulk workflows

### Delivered
- Added `useBestKnownModes` to derive best-known retry modes across multiple stores from recent run history
- Surfaced **Best Mode** into the Diagnostics risk table
- Updated bulk scrape workflow on the Stores page to group selected stores by best-known mode and launch the appropriate retry profile per group automatically
- This extends best-known mode beyond Store Detail and into portfolio-level triage + operational batch actions

### Test results
- `npm run build` completed successfully

### Known limitations
- Best-known mode remains heuristic and inferred from recent run history rather than a persisted manual preference
- Bulk mode grouping currently uses existing retry profiles only (`default`, `smaller_batch`, `slow_pacing`)
- Diagnostics shows the best-known mode, but does not yet support filtering or sorting by that field specifically

## 2026-03-24 — Phase 4j follow recommendation uses best-known mode

### Delivered
- Updated Store Detail **Follow recommendation** action to prefer the store’s derived best-known retry mode when one exists
- Best-known mode now automatically influences the default follow-up behavior for stores with retry history, instead of always falling back to a generic focused retry
- Explicit retry buttons (e.g. slow pacing / smaller batch) remain available as manual overrides

### Test results
- `npm run build` completed successfully

### Known limitations
- Best-known mode is still derived heuristically from recent retry outcomes
- Default follow-recommendation behavior is currently applied on Store Detail only, not yet in Diagnostics or bulk workflows
- The current override mapping supports the existing retry modes, but not future richer profiles yet

## 2026-03-24 — Phase 4i best-known retry mode per store

### Delivered
- Added a derived **best-known mode** per store based on recent retry history outcomes
- Best-known mode scoring now favors:
  - beat-baseline attempts
  - helped attempts
  - completed attempts with stronger page/product deltas
- Surfaced the best-known mode on Store Detail above the retry history list
- This gives operators a quick recommendation for which retry mode appears to work best for a store right now

### Test results
- `npm run build` completed successfully

### Known limitations
- Best-known mode is still heuristic and based on recent observed runs, not a persisted or manually curated operator setting
- The scoring currently uses recent retry history only; it does not yet separate store classes or seasonal behavior patterns
- Best-known mode is surfaced on Store Detail only, not yet rolled into Diagnostics or bulk triage views

## 2026-03-24 — Phase 4h retry history vs previous baseline

### Delivered
- Upgraded store retry history to compare each attempt against the immediately previous baseline run
- Added delta signals for:
  - product count
  - page count
  - collection completion improvement heuristics
- Added **Beat baseline** labeling when a retry improves materially over the previous run (or converts an error baseline into a completed run)
- This makes retry history more decision-grade instead of just a chronological log

### Test results
- `npm run build` completed successfully

### Known limitations
- Baseline comparison currently uses the immediately previous recorded run for the store, not a smarter “best comparable baseline” selector yet
- Improvement scoring is still heuristic and based on currently available counts/statuses
- Retry history remains a Store Detail view, not yet summarized into Diagnostics or portfolio-level reporting

## 2026-03-24 — Phase 4g store-level retry history

### Delivered
- Added `useStoreRetryHistory` to reconstruct recent retry attempts for a store from `scrape_run_stores` + parent `scrape_runs.settings`
- Added Store Detail **Retry History** panel showing recent retry attempts and whether they appeared to help
- Retry history now surfaces:
  - retry mode (`Default`, `Smaller batch`, `Slow pacing`)
  - outcome
  - product/page counts
  - collection completion/failure hints
  - timestamp
- This makes it easier to tell whether slow mode or smaller-batch mode improved outcomes for a given store

### Test results
- `npm run build` completed successfully

### Known limitations
- Retry history is inferred from stored run settings and outcomes rather than a dedicated persisted retry-mode column
- “Helped” is currently heuristic (completed with products/pages) rather than a richer before/after comparison to previous runs
- The panel is currently on Store Detail only; it is not yet surfaced in Diagnostics or batch review views

## 2026-03-24 — Phase 4f specialized retry modes

### Delivered
- Extended store scrape actions to support per-run settings overrides for targeted retry modes
- Added **Retry in smaller batch** action for timeout-fallout stores
  - runs with `maxConcurrentStores: 1`
- Added **Retry with slow pacing** action for retryable HTTP stores
  - runs with slower `interPageDelay`
  - also forces `maxConcurrentStores: 1`
- Updated existing scrape buttons to use the new action payload shape with clearer mode labels in success toasts

### Test results
- `npm run build` completed successfully

### Known limitations
- These retry modes currently override only client-side run settings passed into `scrape-store`; there is not yet a dedicated backend retry policy profile system
- “Smaller batch” is effectively single-store/single-concurrency from the current UI, not a richer queued batch planner yet
- Further gains may still require hosted edge-function deployment so runtime reason codes and pacing behaviors align fully with the latest repo code

## 2026-03-24 — Phase 4e Store Detail recommended actions + quick actions

### Delivered
- Surfaced the diagnostic **recommended action** directly on `StoreDetail`
- Added a highlighted recommendation callout showing the current operational next step for the store
- Added one-click follow-up actions where the recommendation maps cleanly to an existing workflow, including:
  - revalidate now
  - scrape now / follow recommendation
  - inspect diagnostics/auth/blocking evidence
- This brings the recommendation system beyond Diagnostics and into the per-store operational view

### Test results
- `npm run build` completed successfully

### Known limitations
- Quick actions currently map to existing generic revalidate/scrape flows; there is not yet a dedicated “small batch retry” or “slow mode retry” control
- Recommendation actions are still heuristic and not yet aware of operator notes or manual acknowledgements
- Some recommendations still route to diagnostics for deeper inspection rather than executing a fully specialized workflow

## 2026-03-24 — Phase 4d diagnostics recommended actions

### Delivered
- Added explicit **recommended action** output to store diagnostics summaries
- Recommended actions are now derived from the classifier and surfaced directly in the Diagnostics risk table
- This gives each store a clearer operational next step such as:
  - re-run in smaller batch
  - retry with backoff
  - revalidate URL
  - refresh auth
  - inspect blocking/WAF behavior
  - monitor only

### Test results
- `npm run build` completed successfully

### Known limitations
- Recommended actions are currently heuristic/classifier-driven, not yet personalized from richer store history or manual operator notes
- The action text is visible in Diagnostics, but not yet surfaced in Store Detail or as one-click workflow shortcuts
- Hosted behavior will still improve further after new structured event signals are deployed and fresh runs populate them

## 2026-03-24 — Phase 4c diagnostics reason badges + retry counters

### Delivered
- Surfaced retry/timeout diagnostics directly into the Diagnostics store risk table
- Added visible reason badges for:
  - parent/run timeout fallout counts
  - retryable HTTP issue counts
- Added Diagnostics risk filters for the newer statuses:
  - `timeout_fallout`
  - `retryable_http_error`
- Updated Diagnostics risk styling/scoring so these newer operational states are visible and distinct from hard blocked/failing states

### Test results
- `npm run build` completed successfully

### Known limitations
- Badge counts still depend on currently available `scraper_events` and recent event history
- Reason badges improve visibility, but recommended-action text is still implicit rather than explicit in the UI
- Until hosted edge functions are redeployed, live event streams may still contain a mix of structured and legacy text patterns

## 2026-03-24 — Phase 4b structured failure reason codes + retryable HTTP handling

### Delivered
- Improved `scrape-store` failure coding so runtime issues emit cleaner reason codes such as:
  - `parent_timeout`
  - `store_timeout`
  - `collection_timeout`
  - `retryable_http_429`
  - `retryable_http_503`
  - `request_timeout`
  - `network_error`
  - `retry_recovered`
- Added retry/fallback event emission for retryable HTTP and fetch failures so observability is less dependent on free-text messages
- Added explicit retry-recovered event emission when a request succeeds after one or more retries
- Updated diagnostics logic to recognize structured reason codes in addition to legacy text patterns

### Test results
- `npm run build` completed successfully

### Known limitations
- These structured reason codes are implemented in repo code, but hosted behavior depends on Supabase edge-function deployment
- Retry/backoff now emits better signals, but retry policy itself is still fairly simple (bounded backoff only)
- Historical events still contain older free-text patterns until new runs are executed

## 2026-03-24 — Phase 4a timeout fallout classification + truer run summaries

### Delivered
- Improved store diagnostics classifier so **parent-run timeout fallout** is separated from true store failure/blocking
- Added new diagnostic states/signals for:
  - `timeout_fallout`
  - `retryable_http_error`
  - parent timeout counts in the last 7 days
  - retryable HTTP error counts in the last 7 days
- Changed classification priority so a recent successful scrape with products can override stale block suspicion, reducing false “blocked” results for productive stores
- Improved dashboard recent-run summaries to show timeout fallout explicitly alongside store failures, collection failures, and retry/fallback hints
- Added timeout-affected run count to run observability summary

### Test results
- `npm run build` completed successfully

### Known limitations
- Timeout fallout and retryable HTTP signals are inferred from current message text/reason patterns, not yet from dedicated structured columns
- Existing historical data may still contain stale classifications until new runs/diagnostics refresh the store summaries
- 503/429 errors are now separated diagnostically, but retry/backoff logic itself is still a future engine improvement

## 2026-03-24 — Phase 3b manual vendor chunking

### Delivered
- Added `manualChunks` strategy in `vite.config.ts` to separate major dependency families:
  - `react-core`
  - `supabase`
  - `react-query`
  - `ui-vendor`
  - `charts`
  - `export-vendor`
  - fallback `vendor`
- This further reduced the old oversized app shell bundle and made heavy dependencies load in more predictable chunks

### Build impact
- Remaining largest chunk dropped again to ~565 kB minified instead of the previous ~730 kB main app chunk
- Export-related dependencies and charting code now sit in isolated bundles rather than inflating the core app path

### Test results
- `npm run build` completed successfully

### Known limitations
- There is still one remaining `vendor` chunk above the warning threshold
- Further gains will likely come from more targeted dependency isolation or replacing especially heavy libraries on non-critical paths
- This pass improves chunk topology, but does not remove dependency weight by itself

## 2026-03-24 — Phase 3a route-level code splitting

### Delivered
- Converted page routes in `App.tsx` to `React.lazy()` + `Suspense` route loading
- Split heavier pages into separate chunks instead of forcing them into the main entry bundle, including:
  - Scraping Audit
  - Canonical Review
  - CW Import pages
  - Products / Store Detail / Diagnostics / Export / Settings
- Added a shared route loader fallback for lazy page transitions

### Build impact
- Main entry chunk dropped significantly from ~1.77 MB to ~730 kB minified
- Heavy route bundles now load separately on navigation instead of up front
- Remaining warning is now concentrated in a few large secondary chunks (notably StoreDetail/export-related code), rather than one oversized main app bundle

### Test results
- `npm run build` completed successfully

### Known limitations
- Some large secondary chunks still remain and could benefit from deeper component-level splitting or manual chunking
- StoreDetail and export-related logic are still comparatively heavy
- This pass improves initial load substantially, but does not yet optimize every hot path equally

## 2026-03-24 — Phase 2d canonical review filters + source detail drawer

### Delivered
- Added Canonical Review filters for:
  - match method
  - confidence band
- Added source-record inspection drawer so a reviewer can inspect canonical vs source detail without leaving the queue
- Added per-row **Inspect source record** action
- Kept bulk review actions and confidence explanation intact while making the queue easier to triage at scale

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Source detail drawer is still a lightweight inspector, not a full edit/merge workbench yet
- Product deep-linking from the drawer is still generic rather than a routed product-detail destination
- Filtering is local to the fetched queue; there are no server-side filtered queries or saved review views yet

## 2026-03-24 — Phase 2c bulk canonical review + confidence explanation

### Delivered
- Upgraded Canonical Review into a real queue workflow:
  - row selection
  - select all / clear selection
  - bulk accept selected
  - bulk reject selected
- Upgraded canonical review mutation logic to support bulk decision updates
- Added explicit confidence guidance to the review page so score ranges are understandable at a glance
- Added per-row confidence explanation text to clarify why a match scored the way it did (barcode, title+brand heuristic, missing hard anchors, etc.)

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Confidence explanation is heuristic/UI-derived from currently stored fields, not yet generated from a persisted scorer trace
- Bulk review acts on current selected queue items only; no advanced filters or saved views yet
- Accept/reject decisions update the junction rows, but do not yet cascade richer canonical status updates across related records

## 2026-03-24 — Phase 2b canonical backfill + review UI + sharper run failure summaries

### Delivered
- Added additive backfill migration from current `products` into canonical groundwork tables:
  - backfills `product_source_records`
  - seeds `canonical_products`
  - creates junction rows in `canonical_product_matches`
- Added first-pass **Canonical Review** UI for reviewing pending/rejected match decisions
- Added `useCanonicalMatches` hook for loading and actioning canonical match queue items
- Added clearer store-level failure visibility to latest run summaries:
  - count of store errors
  - count of collection failures
  - retry/fallback hints inferred from terminal/message state

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- Canonical backfill is migration-based groundwork and has not yet been deployed/applied to the hosted Supabase environment
- Canonical Review is a first-pass queue UI, not a complete merge/conflict-resolution workbench yet
- Retry/fallback hints are currently inferred from stored terminal/message text rather than from a dedicated retry counter field

## 2026-03-24 — Phase 2a run observability + canonical schema groundwork

### Delivered
- Improved scraper control/observability on the current app side:
  - added `useRunObservability` for richer recent-run summaries
  - upgraded dashboard running-state banner with pages visited, collection progress, active store, and latest message
  - upgraded recent-run summary with more truthful run outcomes, completion/failure rate, and average pages-per-run
  - hardened `useScrapeRun` to reset stall timing from `scraper_events` and `last_event_at`, not just legacy logs
- Added additive schema groundwork for a future canonical model via Supabase migration:
  - `canonical_products`
  - `product_source_records`
  - `canonical_product_matches`
- The canonical groundwork uses a junction-table pattern between canonical products and source records, without disrupting the current live `products` table workflow
- Added run-level observability columns to `scrape_runs` for active store, latest message, collection totals, and last-event timestamps

### Test results
- `npm run build` completed successfully
- Existing large bundle/chunk size warning remains

### Known limitations
- The new observability UI assumes the new `scrape_runs` fields will exist after migration deployment; until then, some values will remain blank/zero in live environments
- The canonical schema is groundwork only — current scraping/export flows still operate on existing `products` and related tables
- No automated backfill from current `products` into `product_source_records` / `canonical_product_matches` has been added yet

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
