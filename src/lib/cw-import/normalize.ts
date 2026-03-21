// ─── Known acronyms / dosage units to preserve ────────────────────────────────
const PRESERVE_PATTERNS = [
  /\b(nmn|nad|coq10|dha|epa|dhea|gaba|hgh|b12|b6|d3|k2|c|e|a|b)\b/gi,
  /\b\d+(\.\d+)?\s*(mg|mcg|ug|g|ml|l|iu|mmol|%|x)\b/gi, // dosages
  /\b\d+\s*(pack|tab|tabs|cap|caps|caplet|caplets|tablet|tablets|capsule|capsules|softgel|softgels|sachet|sachets|piece|pieces|pk)\b/gi, // pack sizes
];

/**
 * Applies title-case but preserves known acronyms and pharmaceutical dosages.
 */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalizes a raw text string for matching purposes:
 * - Lowercase + trim
 * - Collapse repeated whitespace
 * - Normalize Unicode quotes and dashes to ASCII
 * - Remove low-value punctuation
 * - Preserves dosages, pack sizes, acronyms, percentages
 */
export function normalizeText(s: string): string {
  if (!s) return '';

  return s
    .trim()
    // Unicode normalizations
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // smart double quotes
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')             // en-dash, em-dash, minus → hyphen
    .replace(/[\u00AE\u2122]/g, '')                          // strip ® and ™
    // Lowercase
    .toLowerCase()
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    // Remove low-value punctuation (but keep parens, slashes, hyphens, dosage chars)
    .replace(/[,;:!?#@$^&*=[\]{}|\\<>]/g, '')
    .trim();
}

/**
 * Normalizes a product name for matching.
 * Strips trailing whitespace but preserves pack sizes and dosages.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return normalizeText(name);
}

/**
 * Normalizes a brand name for matching.
 */
export function normalizeBrand(brand: string | null | undefined): string {
  if (!brand) return '';
  return normalizeText(brand);
}

/**
 * Normalizes a URL slug for matching.
 */
export function normalizeSlug(slug: string | null | undefined): string {
  if (!slug) return '';
  return slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Simple string similarity score using Dice coefficient on bigrams.
 * Returns 0.0 – 1.0.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (str: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.substring(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };

  const aMap = bigrams(a);
  const bMap = bigrams(b);
  let intersect = 0;

  for (const [bg, cnt] of aMap) {
    const bCnt = bMap.get(bg) ?? 0;
    intersect += Math.min(cnt, bCnt);
  }

  return (2 * intersect) / (a.length + b.length - 2);
}
