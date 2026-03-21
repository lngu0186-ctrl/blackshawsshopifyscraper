import Papa from 'papaparse';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CWParsedRow {
  // CSV raw
  cw_url: string | null;
  cw_product_id: string | null;
  cw_sku: string | null;
  cw_slug: string | null;
  cw_name: string | null;
  cw_brand: string | null;
  /** Raw cents value from CSV (e.g. 549.00 = $5.49 AUD) */
  cw_price_cents: number | null;
  /** Raw cents value from CSV */
  cw_rrp_cents: number | null;
  cw_currency: string | null;
  cw_in_stock: boolean | null;
  cw_category_path: string | null;
  cw_image_url: string | null;
  cw_review_rating: number | null;
  cw_review_count: number | null;
  cw_source: string | null;
  cw_updated_at: string | null; // ISO string
  // Internal
  raw_data: Record<string, string>;
  validation_errors: ValidationError[];
}

// ─── Price display helper ────────────────────────────────────────────────────

/**
 * Converts a cents value (e.g. 549.00) to an AUD display string (e.g. "$5.49").
 * Returns "—" for null/zero.
 */
export function centsToAUD(cents: number | null | undefined): string {
  if (cents == null || isNaN(cents)) return '—';
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(dollars);
}

// ─── Field parsers ───────────────────────────────────────────────────────────

function parseBoolean(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
}

function parseNumeric(
  raw: string | undefined,
  field: string,
  errors: ValidationError[],
): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw.trim());
  if (isNaN(n)) {
    errors.push({ field, message: `"${raw}" is not a valid number`, severity: 'error' });
    return null;
  }
  return n;
}

function parseInteger(
  raw: string | undefined,
  field: string,
  errors: ValidationError[],
): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = parseInt(raw.trim(), 10);
  if (isNaN(n)) {
    errors.push({ field, message: `"${raw}" is not a valid integer`, severity: 'error' });
    return null;
  }
  return n;
}

function parseRating(
  raw: string | undefined,
  errors: ValidationError[],
): number | null {
  const n = parseNumeric(raw, 'review_rating', errors);
  if (n == null) return null;
  if (n < 0 || n > 5) {
    errors.push({ field: 'review_rating', message: `Rating ${n} is out of range 0–5`, severity: 'error' });
    return null;
  }
  return n;
}

function parseTimestamp(
  raw: string | undefined,
  errors: ValidationError[],
): string | null {
  if (raw == null || raw.trim() === '') return null;
  const d = new Date(raw.trim());
  if (isNaN(d.getTime())) {
    errors.push({ field: 'updated_at', message: `"${raw}" is not a valid ISO timestamp`, severity: 'error' });
    return null;
  }
  return d.toISOString();
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseCWPriceCSV(file: File): Promise<CWParsedRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows: CWParsedRow[] = results.data.map((raw, idx) => {
          const errors: ValidationError[] = [];

          // Required field checks
          const cw_url = raw['url']?.trim() || null;
          const cw_product_id = raw['product_id']?.trim() || null;
          if (!cw_url) {
            errors.push({ field: 'url', message: 'missing_required_field: url is required', severity: 'error' });
          }
          if (!cw_product_id) {
            errors.push({ field: 'product_id', message: 'missing_required_field: product_id is required', severity: 'error' });
          }

          // Prices in cents
          const cw_price_cents = parseNumeric(raw['current_price'], 'current_price', errors);
          const cw_rrp_cents = parseNumeric(raw['current_rrp'], 'current_rrp', errors);

          // Rating
          const cw_review_rating = parseRating(raw['review_rating'], errors);
          const cw_review_count = parseInteger(raw['review_count'], 'review_count', errors);

          // Timestamp
          const cw_updated_at = parseTimestamp(raw['updated_at'], errors);

          return {
            cw_url,
            cw_product_id,
            cw_sku: raw['sku']?.trim() || null,
            cw_slug: raw['slug']?.trim() || null,
            cw_name: raw['name']?.trim() || null,
            cw_brand: raw['brand']?.trim() || null,
            cw_price_cents,
            cw_rrp_cents,
            cw_currency: raw['currency_code']?.trim() || 'AUD',
            cw_in_stock: parseBoolean(raw['in_stock']),
            cw_category_path: raw['category_path']?.trim() || null,
            cw_image_url: raw['image_url']?.trim() || null,
            cw_review_rating,
            cw_review_count,
            cw_source: raw['source']?.trim() || null,
            cw_updated_at,
            raw_data: raw,
            validation_errors: errors,
          } satisfies CWParsedRow;
        });

        resolve(rows);
      },
      error(err) {
        reject(new Error(`CSV parse error: ${err.message}`));
      },
    });
  });
}
