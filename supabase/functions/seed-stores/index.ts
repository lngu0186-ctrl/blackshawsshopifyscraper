import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STARTER_STORES = [
  { name: 'Alchemy Pharmacy', url: 'https://alchemypharmacy.com.au/' },
  { name: 'Total Pharmacy', url: 'https://www.totalpharmacy.com.au/' },
  { name: 'Tugun Compounding Pharmacy', url: 'https://www.tuguncompounding.com.au/' },
  { name: 'Mäesi Apothecary', url: 'https://www.maesiapothecary.com.au/' },
  { name: 'URTH Apothecary', url: 'https://urthapothecary.com.au/' },
  { name: 'Enki Apothecary', url: 'https://enki.au/' },
  { name: 'Padbury Pharmacy', url: 'https://www.padburypharmacy.com.au/' },
  { name: 'Wandong Pharmacy', url: 'https://wandongpharmacy.com.au/' },
  { name: "Cate's Chemist", url: 'https://cateschemist.com/' },
  { name: "Scown's Pharmacy", url: 'https://scownspharmacy.com.au/' },
  { name: 'Corner Chemist', url: 'https://cornerchemist.com.au/' },
  { name: 'Specialist Clinic Pharmacy', url: 'https://specialistclinicpharmacy.com.au/' },
  { name: 'The Compounding Pharmacy', url: 'https://thecompoundingpharmacy.com.au/' },
  { name: 'Compounding Pharmacy of Australia', url: 'https://compoundingpharmacyaustralia.com/' },
  { name: "Heathershaw's Compounding Pharmacy", url: 'https://heathershawscompounding.com.au/' },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUrl(url: string): string {
  let u = url.trim().toLowerCase();
  if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders,
    });
  }
  const userId = claimsData.claims.sub;

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const store of STARTER_STORES) {
    const normalized = normalizeUrl(store.url);
    const slug = slugify(store.name);
    let hostname = '';
    try { hostname = new URL(normalized).hostname; } catch {}

    const { error } = await supabase.from('stores').upsert({
      user_id: userId,
      name: store.name,
      url: store.url,
      normalized_url: normalized,
      myshopify_domain: hostname,
      enabled: true,
      validation_status: 'valid',
    }, { onConflict: 'user_id,normalized_url', ignoreDuplicates: true });

    if (error) {
      skipped.push(store.name);
    } else {
      inserted.push(store.name);
    }
  }

  return new Response(JSON.stringify({ inserted, skipped, total: STARTER_STORES.length }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
