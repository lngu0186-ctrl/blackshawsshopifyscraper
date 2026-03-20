import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const userId = claimsData.claims.sub;

  const { scrapeRunId } = await req.json();
  if (!scrapeRunId) {
    return new Response(JSON.stringify({ error: 'scrapeRunId required' }), { status: 400, headers: corsHeaders });
  }

  const { error } = await supabase
    .from('scrape_runs')
    .update({ status: 'cancelled' })
    .eq('id', scrapeRunId)
    .eq('user_id', userId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  // Mark all queued/fetching stores as cancelled
  await supabase
    .from('scrape_run_stores')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('scrape_run_id', scrapeRunId)
    .in('status', ['queued', 'fetching']);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
