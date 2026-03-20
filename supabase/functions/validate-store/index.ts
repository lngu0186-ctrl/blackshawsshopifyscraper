import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ valid: false, error: 'URL is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize URL
    let normalized = url.trim().toLowerCase();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    normalized = normalized.replace(/\/+$/, '');

    const probeUrl = `${normalized}/products.json?limit=1`;

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      response = await fetch(probeUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'AUPharmacyScout/1.0' },
      });
      clearTimeout(timeout);
    } catch (err) {
      return new Response(JSON.stringify({
        valid: false,
        normalized_url: normalized,
        error: 'This URL does not appear to expose a public Shopify products.json endpoint.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!response.ok) {
      return new Response(JSON.stringify({
        valid: false,
        normalized_url: normalized,
        error: 'This URL does not appear to expose a public Shopify products.json endpoint.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      return new Response(JSON.stringify({
        valid: false,
        normalized_url: normalized,
        error: 'This URL does not appear to expose a public Shopify products.json endpoint.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!data || !Array.isArray(data.products)) {
      return new Response(JSON.stringify({
        valid: false,
        normalized_url: normalized,
        error: 'This URL does not appear to expose a public Shopify products.json endpoint.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Try to detect myshopify domain from Link header or response
    const linkHeader = response.headers.get('link') || '';
    let myshopifyDomain: string | null = null;
    try {
      const urlObj = new URL(normalized);
      myshopifyDomain = urlObj.hostname;
    } catch {}

    return new Response(JSON.stringify({
      valid: true,
      normalized_url: normalized,
      myshopify_domain: myshopifyDomain,
      product_count_sample: data.products.length,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
