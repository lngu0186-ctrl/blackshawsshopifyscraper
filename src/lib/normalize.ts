/**
 * normalize.ts — Field normalization utilities.
 * Used in UI display to show clean, consistent values without losing raw data.
 */

/** Convert "VITAMINS", "vitamins", "vItAmInS" → "Vitamins" */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/** Normalize vendor/brand display — consistent title case, strip extra whitespace */
export function normalizeVendor(vendor: string | null | undefined): string {
  if (!vendor) return '';
  return toTitleCase(vendor.replace(/\s+/g, ' ').trim());
}

/** Normalize category display */
export function normalizeCategory(category: string | null | undefined): string {
  if (!category) return '';
  return toTitleCase(category.replace(/\s+/g, ' ').trim());
}

/** Normalize product title — trim and fix obvious ALL_CAPS or all-lowercase */
export function normalizeTitle(title: string | null | undefined): string {
  if (!title) return '';
  const trimmed = title.trim();
  // If ALL CAPS (likely raw), convert to title case
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return toTitleCase(trimmed);
  }
  return trimmed;
}

/** Format price with AUD symbol */
export function formatAUD(price: number | null | undefined): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
}

/** Confidence tier label */
export function confidenceTier(score: number): 'enriched' | 'review' | 'partial' {
  if (score >= 90) return 'enriched';
  if (score >= 60) return 'review';
  return 'partial';
}

export function confidenceTierLabel(score: number): string {
  if (score >= 90) return 'Shopify Ready';
  if (score >= 60) return 'Review Required';
  return 'Partial / Raw';
}

export function confidenceTierColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
}
