// supabase/functions/resolve-cw-row/index.ts
// Updates a single staged import row with operator resolution.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const body = await req.json() as {
      rowId: string;
      resolution_action: 'update' | 'create' | 'skip' | 'manual_link';
      matched_record_id?: string | null;
      match_status?: string;
    };

    if (!body.rowId || !body.resolution_action) {
      return new Response(JSON.stringify({ error: 'rowId and resolution_action are required' }), { status: 400, headers: corsHeaders });
    }

    // Verify the row belongs to this user (via RLS)
    const { data: existing, error: fetchErr } = await supabase
      .from('cw_import_rows')
      .select('id, import_job_id')
      .eq('id', body.rowId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return new Response(JSON.stringify({ error: 'Row not found or access denied' }), { status: 404, headers: corsHeaders });
    }

    const updates: Record<string, unknown> = {
      resolution_action: body.resolution_action,
      resolved_at: new Date().toISOString(),
    };

    if (body.matched_record_id !== undefined) updates['matched_record_id'] = body.matched_record_id;
    if (body.match_status !== undefined) updates['match_status'] = body.match_status;
    if (body.resolution_action === 'manual_link' && body.matched_record_id) updates['match_status'] = 'matched';
    if (body.resolution_action === 'skip') updates['match_status'] = 'skipped';

    const { error: updateErr } = await supabase
      .from('cw_import_rows')
      .update(updates)
      .eq('id', body.rowId);

    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

    return new Response(JSON.stringify({ success: true }), {
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
