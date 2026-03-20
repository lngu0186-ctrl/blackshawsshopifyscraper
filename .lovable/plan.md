
## Problem

The "Extraction Pipeline" panel on the Dashboard shows zeros for:
- Sources Detected
- Categories Discovered
- Detail Pages Enriched
- Prices Extracted
- Images Extracted
- Descriptions Extracted

**Root cause**: `usePipelineStats` queries `scraped_products` exclusively. The pipeline stage metrics (`pipelineStages` array in Dashboard.tsx lines 325–334) reference fields like `pipeline.enriched`, `pipeline.missingPrice` etc., which come back as 0 because `scraped_products.detail_scraped=true AND scrape_status='enriched'` matches 0 rows in this DB, and `scraped_products.price` is also null for most rows.

**The real data** lives in the `products` table (2,626 rows with proper `product_scrape_status` lifecycle values: 2,396 `ready`, 228 `review_required`, 2 `normalized`).

Confirmed counts from the database:
- Sources detected: 24 (stores where store_status != 'unreachable')
- Categories discovered: 222 (distinct product_type in products)
- Products discovered: 2,626
- Detail enriched: 2,398 (product_scrape_status IN detail_fetched/normalized/validated/ready)
- Prices extracted: 2,618 (price_min IS NOT NULL AND > 0)
- Images extracted: 2,458
- Descriptions extracted: 2,409
- Validation complete: 2,396 (validated + ready)
- Export ready: 2,396 (product_scrape_status = 'ready')

---

## What to change

### 1. Extend `usePipelineStats` with a second query block

Add a new `ProductsTableStats` sub-object queried from the `products` table (using paginated fetch or COUNT queries). The existing `scraped_products` stats remain unchanged — they power the 7-cell KPI row which works correctly.

New fields to add to `PipelineStats`:

```
productsTableStats: {
  sourcesDetected: number      // stores where store_status != 'unreachable'
  categoriesDiscovered: number // COUNT DISTINCT product_type in products
  productsDiscovered: number   // products with valid product_scrape_status
  detailEnriched: number       // product_scrape_status IN (detail_fetched, normalized, validated, ready)
  pricesExtracted: number      // price_min IS NOT NULL AND > 0
  imagesExtracted: number      // images IS NOT NULL AND not empty
  descriptionsExtracted: number // body_html IS NOT NULL AND != ''
  validationComplete: number   // product_scrape_status IN (validated, ready)
  exportReady: number          // product_scrape_status = 'ready'
}
```

Use four parallel `head: true` count queries (no row fetching needed — just counts) to avoid loading thousands of rows.

### 2. Update `pipelineStages` in Dashboard.tsx (lines 325–334)

Replace the existing stage definitions that reference `scraped_products`-derived values with the new `productsTableStats` values:

| Stage | Current (broken) | New (correct) |
|---|---|---|
| Sources Detected | `totalStores` | `productsTableStats.sourcesDetected` |
| Categories Discovered | `completedStores` | `productsTableStats.categoriesDiscovered` |
| Products Discovered | `totalScraped` (scraped_products COUNT) | `productsTableStats.productsDiscovered` |
| Detail Pages Enriched | `pipeline.enriched` (0) | `productsTableStats.detailEnriched` |
| Price Extracted | `totalScraped - missingPrice` (wrong base) | `productsTableStats.pricesExtracted` |
| Images Extracted | `totalScraped - missingImage` (wrong base) | `productsTableStats.imagesExtracted` |
| Descriptions Extracted | `totalScraped - missingDescription` | `productsTableStats.descriptionsExtracted` |
| Validation Complete | `readyCount` | `productsTableStats.validationComplete` |

### 3. Fix labels

The pipeline section subtitle currently says "Real-time stage progress" — change to "All-time totals (canonical)" to be honest about what it shows.

For any stage where the count is 0 because it's not tracked (e.g., `categories_discovered` could show a note), the `PipelineRow` component should show "Not tracked" instead of "0 / 0" when total is 0.

### 4. No visual/style changes

Only logic and query changes. The KPI row at the top stays querying `scraped_products` as-is — it's correct for its purpose. Only the pipeline stages panel changes its data source.

---

## Files to change

- `src/hooks/usePipelineStats.ts` — add `productsTableStats` block via parallel COUNT queries
- `src/pages/Dashboard.tsx` — update `pipelineStages` array (lines ~325–334) and subtitle text, update `PipelineRow` to handle untracked state
