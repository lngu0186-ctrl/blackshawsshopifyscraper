# Store Revalidation / Rescrape Runbook

_Date:_ 2026-03-24

Purpose: work through legacy/problem stores in a consistent order after the scraper qualification and audit fixes.

## How to use this

For each store:

1. Revalidate the store
2. Run a fresh scrape
3. Review Diagnostics + Scraping Audit
4. Record outcome
5. Decide whether the store is now productive, blocked, auth-gated, stale, zero-product, or still failing

## Per-store checklist

Use this mini-checklist for every store:

- [ ] Revalidated
- [ ] Rescraped
- [ ] Platform confirmed
- [ ] Strategy confirmed
- [ ] Normalized root URL confirmed
- [ ] Product count reviewed
- [ ] Category count reviewed
- [ ] Image missing % reviewed
- [ ] Description missing % reviewed
- [ ] Error/warning counts reviewed
- [ ] Final classification set
- [ ] Notes recorded

Final classification options:
- productive
- auth_required
- blocked
- zero_products
- stale
- failing
- partial_detail

---

## Priority order

### Wave 1 — critical pipeline/detail issues

| Done | Store | Priority | Main issue from audit | Revalidate | Rescrape | Final classification | Notes |
|---|---|---:|---|---|---|---|---|
| [ ] | Michael’s Chemist | 1 | Stuck discovered / zero-confidence pipeline state | [ ] | [ ] |  |  |
| [ ] | ThePharmacy | 2 | Stuck discovered / zero-confidence pipeline state | [ ] | [ ] |  |  |
| [ ] | Mr Vitamins | 3 | Severe detail-fetch gaps (images/descriptions) | [ ] | [ ] |  |  |
| [ ] | Health Masters | 4 | Zero-product / likely failing source | [ ] | [ ] |  |  |

### Wave 2 — likely under-scoped by collection URL / root normalization issues

| Done | Store | Priority | Main issue from audit | Revalidate | Rescrape | Final classification | Notes |
|---|---|---:|---|---|---|---|---|
| [ ] | BellaCorp | 5 | Likely collection-scoped URL / narrow scrape scope | [ ] | [ ] |  |  |
| [ ] | Better Value Pharmacy | 6 | Likely collection-scoped URL / narrow scrape scope | [ ] | [ ] |  |  |

### Wave 3 — zero visible products in current UI

| Done | Store | Priority | Main issue | Revalidate | Rescrape | Final classification | Notes |
|---|---|---:|---|---|---|---|---|
| [ ] | Aussie Pharmacy | 7 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Beta Health | 8 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Cate’s Chemist | 9 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Compounding Pharmacy of Australia | 10 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Corner Chemist | 11 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Heathershaw's Compounding Pharmacy | 12 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | NIM Dispensary | 13 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | PharmAust Manufacturing | 14 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Scown's Pharmacy | 15 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Specialist Clinic Pharmacy | 16 | Zero visible products | [ ] | [ ] |  |  |
| [ ] | Total Pharmacy | 17 | Zero visible products | [ ] | [ ] |  |  |

### Wave 4 — low-count stores to verify for partial coverage vs genuinely small catalogs

| Done | Store | Priority | Current visible count | Revalidate | Rescrape | Final classification | Notes |
|---|---|---:|---:|---|---|---|---|
| [ ] | URTH Apothecary | 18 | 4 | [ ] | [ ] |  |  |
| [ ] | The Compounding Pharmacy | 19 | 6 | [ ] | [ ] |  |  |
| [ ] | Alchemy Pharmacy | 20 | 8 | [ ] | [ ] |  |  |
| [ ] | Mäesi Apothecary | 21 | 20 | [ ] | [ ] |  |  |
| [ ] | Tugun Compounding Pharmacy | 22 | 36 | [ ] | [ ] |  |  |
| [ ] | Enki Apothecary | 23 | 41 | [ ] | [ ] |  |  |
| [ ] | Padbury Pharmacy | 24 | 62 | [ ] | [ ] |  |  |
| [ ] | Wandong Pharmacy | 25 | 71 | [ ] | [ ] |  |  |

---

## What to record per store

For each completed store, capture:

- platform
- strategy
- normalized URL
- total products
- category count
- errors last 7d
- warnings last 7d
- image missing %
- description missing %
- last successful scrape
- failures since success

Suggested note format:

```text
Platform:
Strategy:
Normalized URL:
Products:
Categories:
Errors/Warn:
Img miss %:
Desc miss %:
Last success:
Failure delta:
Decision:
```

## Decision rules

- If product count rises and diagnostics clean up → classify **productive**
- If auth/login is the clear blocker → classify **auth_required**
- If anti-bot or access restriction is clear → classify **blocked**
- If scrape runs but still yields 0 products → classify **zero_products** or **failing**
- If discovery works but detail coverage stays bad → classify **partial_detail**
- If data exists but no recent success → classify **stale**

## Suggested work sequence

1. Michael’s Chemist
2. ThePharmacy
3. Mr Vitamins
4. Health Masters
5. BellaCorp
6. Better Value Pharmacy
7. remaining zero-product stores
8. low-count stores
