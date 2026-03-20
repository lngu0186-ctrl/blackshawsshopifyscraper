// Confidence scoring for scraped products.
// Determines export eligibility tier:
//   90–100 → "enriched"  → Shopify Ready
//   60–89  → "partial"   → Review Required
//   0–59   → "failed"    → Raw only

export interface ScrapedProductForScoring {
  title?: string | null;
  price?: number | null;
  image_url?: string | null;
  description_html?: string | null;
  source_url?: string | null;
  brand?: string | null;
  category?: string | null;
  detail_scraped?: boolean;
}

export const CONFIDENCE_WEIGHTS: Record<string, number> = {
  title: 20,
  price: 25,       // highest weight — export is useless without price
  image_url: 15,
  description_html: 15,
  source_url: 10,
  brand: 5,
  category: 5,
  detail_scraped: 5,
};

export interface ConfidenceResult {
  score: number;
  missing_fields: string[];
  scrape_status: 'enriched' | 'partial' | 'failed';
}

function isPopulated(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (typeof val === 'boolean') return val === true;
  if (typeof val === 'number') return !isNaN(val) && val > 0;
  return true;
}

export function calculateConfidence(product: ScrapedProductForScoring): ConfidenceResult {
  let score = 0;
  const missing_fields: string[] = [];

  for (const [field, weight] of Object.entries(CONFIDENCE_WEIGHTS)) {
    const val = product[field as keyof ScrapedProductForScoring];
    if (isPopulated(val)) {
      score += weight;
    } else {
      missing_fields.push(field);
    }
  }

  let scrape_status: 'enriched' | 'partial' | 'failed';
  if (score >= 90) scrape_status = 'enriched';
  else if (score >= 60) scrape_status = 'partial';
  else scrape_status = 'failed';

  return { score, missing_fields, scrape_status };
}
