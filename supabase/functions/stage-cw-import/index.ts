// supabase/functions/stage-cw-import/index.ts
// Parses, normalizes, validates and matches a CW price CSV, then creates
// a staging job with all rows ready for operator review.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Normalize helpers (duplicated in edge function — no shared import) ──────

function normalizeText(s: string): string {
  if (!s) return '';
  return s.trim()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00AE\u2122]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[,;:!?#@$^&*=[\]{}|\\<>]/g, '')
    .trim();
}

const normalizeName = (s: string | null) => s ? normalizeText(s) : '';
const normalizeBrand = (s: string | null) => s ? normalizeText(s) : '';
const normalizeSlug = (s: string | null) => s
  ? s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  : '';

// ─── Dice coefficient for fuzzy matching ─────────────────────────────────────

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (str: string) => {
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
  for (const [bg, cnt] of aMap) intersect += Math.min(cnt, bMap.get(bg) ?? 0);
  return (2 * intersect) / (a.length + b.length - 2);
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

interface ValidationError { field: string; message: string; severity: 'error' | 'warning'; }

function parseBoolean(raw: string | undefined): boolean | null {
  if (!raw || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
}

function parseNumeric(raw: string | undefined, field: string, errors: ValidationError[]): number | null {
  if (!raw || raw.trim() === '') return null;
  const n = Number(raw.trim());
  if (isNaN(n)) { errors.push({ field, message: `"${raw}" is not a valid number`, severity: 'error' }); return null; }
  return n;
}

function parseInteger(raw: string | undefined, field: string, errors: ValidationError[]): number | null {
  if (!raw || raw.trim() === '') return null;
  const n = parseInt(raw.trim(), 10);
  if (isNaN(n)) { errors.push({ field, message: `"${raw}" is not a valid integer`, severity: 'error' }); return null; }
  return n;
}

function parseTimestamp(raw: string | undefined, errors: ValidationError[]): string | null {
  if (!raw || raw.trim() === '') return null;
  const d = new Date(raw.trim());
  if (isNaN(d.getTime())) { errors.push({ field: 'updated_at', message: `"${raw}" is not a valid ISO timestamp`, severity: 'error' }); return null; }
  return d.toISOString();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  // Simple CSV parser that handles quoted fields
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(current); current = '';
      } else {
        current += c;
      }
    }
    result.push(current);
    return result;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim(); });
    return row;
  });
}

// ─── Matching ─────────────────────────────────────────────────────────────────

interface MatchResult {
  match_status: 'matched' | 'new' | 'ambiguous' | 'invalid';
  match_method: string | null;
  match_confidence: number;
  matched_record_id: string | null;
  candidate_matches: Array<{ id: string; name: string; brand: string | null; cw_sku: string | null; score: number }>;
}

async function matchRow(
  row: Record<string, string | number | boolean | null>,
  allProducts: Array<{ id: string; name: string; brand: string | null; cw_sku: string | null; cw_product_id: string; cw_url: string | null }>,
): Promise<MatchResult> {
  const cw_product_id = row['cw_product_id'] as string | null;
  const cw_sku = row['cw_sku'] as string | null;
  const cw_url = row['cw_url'] as string | null;
  const cw_name = row['cw_name'] as string | null;
  const cw_brand = row['cw_brand'] as string | null;

  if (!cw_url && !cw_product_id) {
    return { match_status: 'invalid', match_method: null, match_confidence: 0, matched_record_id: null, candidate_matches: [] };
  }

  // Exact product_id
  if (cw_product_id) {
    const p = allProducts.find(x => x.cw_product_id === cw_product_id);
    if (p) return { match_status: 'matched', match_method: 'exact_product_id', match_confidence: 1, matched_record_id: p.id, candidate_matches: [{ ...p, score: 1 }] };
  }

  // Exact sku
  if (cw_sku) {
    const p = allProducts.find(x => x.cw_sku === cw_sku);
    if (p) return { match_status: 'matched', match_method: 'exact_sku', match_confidence: 0.97, matched_record_id: p.id, candidate_matches: [{ ...p, score: 0.97 }] };
  }

  // Exact url
  if (cw_url) {
    const p = allProducts.find(x => x.cw_url === cw_url);
    if (p) return { match_status: 'matched', match_method: 'exact_url', match_confidence: 0.95, matched_record_id: p.id, candidate_matches: [{ ...p, score: 0.95 }] };
  }

  // Fuzzy name + brand
  if (cw_name) {
    const normInput = normalizeName(cw_name);
    const normBrandInput = normalizeBrand(cw_brand);
    const scored = allProducts
      .map(p => {
        const ns = diceCoefficient(normInput, normalizeName(p.name));
        const bs = p.brand && normBrandInput ? diceCoefficient(normBrandInput, normalizeBrand(p.brand)) : 0;
        const score = normBrandInput ? ns * 0.7 + bs * 0.3 : ns;
        return { ...p, score };
      })
      .filter(c => c.score >= 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (scored.length === 0) return { match_status: 'new', match_method: null, match_confidence: 0, matched_record_id: null, candidate_matches: [] };
    const top = scored[0];
    if (top.score >= 0.9 && scored.length === 1) return { match_status: 'matched', match_method: 'fuzzy_name_brand', match_confidence: top.score, matched_record_id: top.id, candidate_matches: scored };
    return { match_status: 'ambiguous', match_method: 'fuzzy_name_brand', match_confidence: top.score, matched_record_id: null, candidate_matches: scored };
  }

  return { match_status: 'new', match_method: null, match_confidence: 0, matched_record_id: null, candidate_matches: [] };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { csvText, fileName } = body as { csvText: string; fileName: string };
    if (!csvText || !fileName) {
      return new Response(JSON.stringify({ error: 'csvText and fileName are required' }), { status: 400, headers: corsHeaders });
    }

    // ── Create job record ────────────────────────────────────────────────────
    const { data: job, error: jobErr } = await supabase
      .from('cw_import_jobs')
      .insert({ file_name: fileName, status: 'parsing', created_by: user.id })
      .select('id')
      .single();

    if (jobErr || !job) throw new Error(`Failed to create import job: ${jobErr?.message}`);
    const jobId = job.id;

    // ── Parse CSV ────────────────────────────────────────────────────────────
    const rawRows = parseCSV(csvText);

    // ── Load all existing cw_products for matching (bulk) ───────────────────
    const { data: allProducts } = await supabase
      .from('cw_products')
      .select('id, name, brand, cw_sku, cw_product_id, cw_url')
      .limit(50000);

    const products = allProducts ?? [];

    // ── Process each row ─────────────────────────────────────────────────────
    const processedRows = await Promise.all(rawRows.map(async (raw, idx) => {
      const errors: ValidationError[] = [];

      const cw_url = raw['url']?.trim() || null;
      const cw_product_id = raw['product_id']?.trim() || null;
      if (!cw_url) errors.push({ field: 'url', message: 'missing_required_field: url is required', severity: 'error' });
      if (!cw_product_id) errors.push({ field: 'product_id', message: 'missing_required_field: product_id is required', severity: 'error' });

      const cw_price_cents = parseNumeric(raw['current_price'], 'current_price', errors);
      const cw_rrp_cents = parseNumeric(raw['current_rrp'], 'current_rrp', errors);
      const cw_review_rating_raw = raw['review_rating'] ? parseNumeric(raw['review_rating'], 'review_rating', errors) : null;
      const cw_review_rating = cw_review_rating_raw != null && (cw_review_rating_raw < 0 || cw_review_rating_raw > 5)
        ? (errors.push({ field: 'review_rating', message: `Rating out of range 0–5`, severity: 'error' }), null)
        : cw_review_rating_raw;
      const cw_review_count = parseInteger(raw['review_count'], 'review_count', errors);
      const cw_updated_at = parseTimestamp(raw['updated_at'], errors);

      const cw_name = raw['name']?.trim() || null;
      const cw_brand = raw['brand']?.trim() || null;
      const cw_sku = raw['sku']?.trim() || null;
      const cw_slug = raw['slug']?.trim() || null;

      const parsedRow = {
        cw_url, cw_product_id, cw_sku, cw_slug, cw_name, cw_brand,
        cw_price_cents, cw_rrp_cents,
        cw_currency: raw['currency_code']?.trim() || 'AUD',
        cw_in_stock: parseBoolean(raw['in_stock']),
        cw_category_path: raw['category_path']?.trim() || null,
        cw_image_url: raw['image_url']?.trim() || null,
        cw_review_rating, cw_review_count, cw_source: raw['source']?.trim() || null, cw_updated_at,
      };

      const match = await matchRow({ ...parsedRow }, products);

      return {
        import_job_id: jobId,
        row_number: idx + 1,
        raw_data: raw,
        ...parsedRow,
        normalized_name: normalizeName(cw_name),
        normalized_brand: normalizeBrand(cw_brand),
        normalized_slug: normalizeSlug(cw_slug),
        validation_errors: errors,
        match_status: match.match_status,
        match_method: match.match_method,
        match_confidence: match.match_confidence,
        matched_record_id: match.matched_record_id,
        candidate_matches: match.candidate_matches,
        resolution_action: match.match_status === 'matched' ? 'update'
          : match.match_status === 'new' ? 'create'
          : match.match_status === 'invalid' ? 'skip'
          : null,
      };
    }));

    // ── Bulk insert rows in batches of 500 ───────────────────────────────────
    const BATCH = 500;
    for (let i = 0; i < processedRows.length; i += BATCH) {
      const { error: rowErr } = await supabase.from('cw_import_rows').insert(processedRows.slice(i, i + BATCH));
      if (rowErr) throw new Error(`Row insert failed: ${rowErr.message}`);
    }

    // ── Compute counts ───────────────────────────────────────────────────────
    const counts = {
      total_rows: processedRows.length,
      matched_rows: processedRows.filter(r => r.match_status === 'matched').length,
      new_rows: processedRows.filter(r => r.match_status === 'new').length,
      ambiguous_rows: processedRows.filter(r => r.match_status === 'ambiguous').length,
      invalid_rows: processedRows.filter(r => r.match_status === 'invalid').length,
      skipped_rows: 0,
    };

    // ── Update job to review ─────────────────────────────────────────────────
    await supabase.from('cw_import_jobs').update({ status: 'review', ...counts }).eq('id', jobId);

    return new Response(JSON.stringify({ jobId, counts }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
