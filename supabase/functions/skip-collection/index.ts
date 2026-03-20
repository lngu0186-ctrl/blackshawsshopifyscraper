import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  const userId = userData.user.id;

  const { scrapeRunId, storeId } = await req.json();
  if (!scrapeRunId || !storeId) return new Response(JSON.stringify({ error: 'scrapeRunId and storeId required' }), { status: 400, headers: corsHeaders });

  // Set skip_requested flag — the edge function polls this between operations
  const { error } = await supabaseAdmin
    .from('scrape_run_stores')
    .update({ skip_requested: true })
    .eq('scrape_run_id', scrapeRunId)
    .eq('store_id', storeId);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  // Emit operator action event
  await supabaseAdmin.from('scraper_events').insert({
    user_id: userId,
    store_id: storeId,
    run_id: scrapeRunId,
    stage: 'collection_skipped',
    severity: 'info',
    message: 'Operator requested skip of current collection',
    was_operator_action: true,
  });

  return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
