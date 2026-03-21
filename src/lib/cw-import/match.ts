import type { SupabaseClient } from '@supabase/supabase-js';
import type { CWParsedRow } from './parser';
import { normalizeName, normalizeBrand, diceCoefficient } from './normalize';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CWMatchCandidate {
  id: string;
  name: string;
  brand: string | null;
  cw_sku: string | null;
  score: number;
}

export interface CWMatchResult {
  match_status: 'matched' | 'new' | 'ambiguous' | 'invalid' | 'skipped';
  match_method: string | null;
  match_confidence: number;
  matched_record_id: string | null;
  candidate_matches: CWMatchCandidate[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIDENT_THRESHOLD = 0.9;
const FUZZY_MIN_SCORE = 0.55;

// ─── Main matcher ─────────────────────────────────────────────────────────────

export async function matchCWRow(
  row: CWParsedRow,
  supabase: SupabaseClient,
): Promise<CWMatchResult> {
  // Invalid if required fields missing
  if (!row.cw_url && !row.cw_product_id) {
    return {
      match_status: 'invalid',
      match_method: null,
      match_confidence: 0,
      matched_record_id: null,
      candidate_matches: [],
    };
  }

  // ── Priority 1: Exact cw_product_id ─────────────────────────────────────
  if (row.cw_product_id) {
    const { data } = await supabase
      .from('cw_products')
      .select('id, name, brand, cw_sku')
      .eq('cw_product_id', row.cw_product_id)
      .maybeSingle();

    if (data) {
      return {
        match_status: 'matched',
        match_method: 'exact_product_id',
        match_confidence: 1,
        matched_record_id: data.id,
        candidate_matches: [{ id: data.id, name: data.name, brand: data.brand, cw_sku: data.cw_sku, score: 1 }],
      };
    }
  }

  // ── Priority 2: Exact cw_sku ─────────────────────────────────────────────
  if (row.cw_sku) {
    const { data } = await supabase
      .from('cw_products')
      .select('id, name, brand, cw_sku')
      .eq('cw_sku', row.cw_sku)
      .maybeSingle();

    if (data) {
      return {
        match_status: 'matched',
        match_method: 'exact_sku',
        match_confidence: 0.97,
        matched_record_id: data.id,
        candidate_matches: [{ id: data.id, name: data.name, brand: data.brand, cw_sku: data.cw_sku, score: 0.97 }],
      };
    }
  }

  // ── Priority 3: Exact cw_url ─────────────────────────────────────────────
  if (row.cw_url) {
    const { data } = await supabase
      .from('cw_products')
      .select('id, name, brand, cw_sku')
      .eq('cw_url', row.cw_url)
      .maybeSingle();

    if (data) {
      return {
        match_status: 'matched',
        match_method: 'exact_url',
        match_confidence: 0.95,
        matched_record_id: data.id,
        candidate_matches: [{ id: data.id, name: data.name, brand: data.brand, cw_sku: data.cw_sku, score: 0.95 }],
      };
    }
  }

  // ── Priority 4: Normalized name exact match ──────────────────────────────
  const normName = row.cw_name ? normalizeName(row.cw_name) : null;
  if (normName) {
    const { data: nameMatches } = await supabase
      .from('cw_products')
      .select('id, name, brand, cw_sku')
      .ilike('name', row.cw_name ?? '')
      .limit(5);

    if (nameMatches && nameMatches.length === 1) {
      const candidate = nameMatches[0];
      const score = 0.92;
      return {
        match_status: 'matched',
        match_method: 'exact_name',
        match_confidence: score,
        matched_record_id: candidate.id,
        candidate_matches: [{ id: candidate.id, name: candidate.name, brand: candidate.brand, cw_sku: candidate.cw_sku, score }],
      };
    }
  }

  // ── Priority 5: Fuzzy name + brand similarity ────────────────────────────
  if (normName) {
    // Pull all products and score locally (suitable for moderate dataset sizes)
    const { data: allProducts } = await supabase
      .from('cw_products')
      .select('id, name, brand, cw_sku')
      .limit(5000);

    if (allProducts && allProducts.length > 0) {
      const normInputBrand = row.cw_brand ? normalizeBrand(row.cw_brand) : null;

      const scored: CWMatchCandidate[] = allProducts
        .map((p) => {
          const pNormName = normalizeName(p.name);
          const pNormBrand = p.brand ? normalizeBrand(p.brand) : null;
          const nameSim = diceCoefficient(normName, pNormName);
          const brandSim =
            normInputBrand && pNormBrand
              ? diceCoefficient(normInputBrand, pNormBrand)
              : 0;
          const score = normInputBrand
            ? nameSim * 0.7 + brandSim * 0.3
            : nameSim;
          return { id: p.id, name: p.name, brand: p.brand, cw_sku: p.cw_sku, score };
        })
        .filter((c) => c.score >= FUZZY_MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (scored.length === 0) {
        return {
          match_status: 'new',
          match_method: null,
          match_confidence: 0,
          matched_record_id: null,
          candidate_matches: [],
        };
      }

      const top = scored[0];

      if (top.score >= CONFIDENT_THRESHOLD && scored.length === 1) {
        return {
          match_status: 'matched',
          match_method: 'fuzzy_name_brand',
          match_confidence: top.score,
          matched_record_id: top.id,
          candidate_matches: scored,
        };
      }

      // Multiple candidates or single below threshold → ambiguous
      return {
        match_status: 'ambiguous',
        match_method: 'fuzzy_name_brand',
        match_confidence: top.score,
        matched_record_id: null,
        candidate_matches: scored,
      };
    }
  }

  // No match
  return {
    match_status: 'new',
    match_method: null,
    match_confidence: 0,
    matched_record_id: null,
    candidate_matches: [],
  };
}
