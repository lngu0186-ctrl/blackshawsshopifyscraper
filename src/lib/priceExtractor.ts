// Price extraction with strict priority ordering and safe parsing.
// Never exports price = 0 or NaN. Handles sale/was price pairs correctly.

export interface PriceResult {
  price: number | null;
  was_price: number | null;
  price_text: string;
  source: string; // debug: which source yielded the price
  tags: string[]; // e.g. ["from_price"]
}

// Strip currency symbols, commas, non-breaking spaces; return parsed float or null
export function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Remove everything except digits, dot, comma
  let cleaned = '';
  for (const ch of String(raw)) {
    if ((ch >= '0' && ch <= '9') || ch === '.' || ch === ',') cleaned += ch;
  }
  if (cleaned.length === 0) return null;
  // European comma decimal: "12,99" at end → "12.99"
  cleaned = cleaned.replace(/,(\d{2})$/, '.$1');
  // Remove remaining commas (thousand separators)
  cleaned = cleaned.replace(/,/g, '');
  const value = parseFloat(cleaned);
  if (isNaN(value) || value <= 0) return null;
  return value;
}

// Reject "save $X", "save X%" patterns — these are not product prices
function isSavingsString(s: string): boolean {
  return /save\s*[$]|\bsave\s+\d|discount|off\b/i.test(s);
}

// Detect "from $X" pattern
function isFromPrice(s: string): boolean {
  return /^from\s*[$]?/i.test(s.trim());
}

interface PriceSource {
  value: string | null | undefined;
  label: string;
}

/**
 * Extract price and was_price from an ordered list of sources.
 * Priority: JSON-LD > meta > __NEXT_DATA__ > DOM > fallback
 */
export function extractPriceFromSources(sources: PriceSource[]): PriceResult {
  const result: PriceResult = {
    price: null,
    was_price: null,
    price_text: '',
    source: '',
    tags: [],
  };

  for (const src of sources) {
    if (!src.value) continue;
    const raw = String(src.value).trim();
    if (isSavingsString(raw)) continue;

    const parsed = parsePrice(raw);
    if (parsed === null) continue;

    if (result.price === null) {
      result.price = parsed;
      result.price_text = raw;
      result.source = src.label;
      if (isFromPrice(raw)) result.tags.push('from_price');
    } else if (result.was_price === null && parsed !== result.price) {
      // Second valid price — higher = was_price
      if (parsed > result.price) {
        result.was_price = parsed;
      } else {
        // Current price is actually higher — swap (sale price found first)
        result.was_price = result.price;
        result.price = parsed;
      }
    }

    if (result.price !== null && result.was_price !== null) break;
  }

  return result;
}

/**
 * Extract price data from parsed JSON-LD product object.
 */
export function extractPriceFromJsonLd(jsonLd: Record<string, unknown>): Partial<PriceResult> {
  const offers = jsonLd['offers'] as any;
  if (!offers) return {};

  // offers may be a single object or an array
  const offerList: any[] = Array.isArray(offers) ? offers : [offers];

  // Find lowest "InStock" offer price
  let minPrice: number | null = null;
  let regularPrice: number | null = null;

  for (const offer of offerList) {
    const p = parsePrice(String(offer.price ?? offer.lowPrice ?? ''));
    if (p === null) continue;
    const availability = String(offer.availability ?? '').toLowerCase();
    if (availability.includes('instock') || availability === '') {
      if (minPrice === null || p < minPrice) minPrice = p;
    }
    if (regularPrice === null) regularPrice = p;
  }

  const price = minPrice ?? regularPrice;
  const highPrice = parsePrice(String(offerList[0]?.highPrice ?? ''));
  const was_price = highPrice && price && highPrice > price ? highPrice : null;

  return {
    price,
    was_price,
    price_text: offerList[0]?.price ? String(offerList[0].price) : '',
    source: 'json_ld',
  };
}

/**
 * Merge two PriceResult objects. JSON-LD always wins over DOM.
 * Never overwrites a good price with null.
 */
export function mergePriceResults(primary: Partial<PriceResult>, fallback: Partial<PriceResult>): PriceResult {
  // Sanity check: if primary and fallback prices disagree by >10%, log but trust primary
  const p1 = primary.price ?? null;
  const p2 = fallback.price ?? null;
  let finalPrice = p1 ?? p2;
  if (p1 !== null && p2 !== null && Math.abs(p1 - p2) / Math.max(p1, p2) > 0.1) {
    // Use primary (JSON-LD is more reliable), keep fallback as debug note
    finalPrice = p1;
  }

  return {
    price: finalPrice,
    was_price: primary.was_price ?? fallback.was_price ?? null,
    price_text: primary.price_text ?? fallback.price_text ?? '',
    source: primary.source ?? fallback.source ?? '',
    tags: [...(primary.tags ?? []), ...(fallback.tags ?? [])],
  };
}
