// supabase/functions/commit-cw-import/index.ts
// Server-side commit: reads all resolved rows, upserts into cw_products,
// and marks the job as completed.

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

    // Use service role for commit writes (bypasses RLS for cw_products upserts)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // But use user client to verify auth and RLS on job
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const body = await req.json() as { jobId: string };
    if (!body.jobId) return new Response(JSON.stringify({ error: 'jobId is required' }), { status: 400, headers: corsHeaders });

    // Verify job belongs to user
    const { data: job, error: jobFetchErr } = await supabaseUser
      .from('cw_import_jobs')
      .select('id, status, created_by')
      .eq('id', body.jobId)
      .maybeSingle();

    if (jobFetchErr || !job) return new Response(JSON.stringify({ error: 'Job not found or access denied' }), { status: 404, headers: corsHeaders });
    if (job.status === 'completed') return new Response(JSON.stringify({ error: 'Job already committed' }), { status: 409, headers: corsHeaders });

    // Mark as importing
    await supabaseAdmin.from('cw_import_jobs').update({ status: 'importing' }).eq('id', body.jobId);

    // Load all rows with a resolution_action
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('cw_import_rows')
      .select('*')
      .eq('import_job_id', body.jobId)
      .not('resolution_action', 'is', null);

    if (rowsErr) throw new Error(`Failed to load rows: ${rowsErr.message}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failures: Array<{ row_number: number; error: string }> = [];

    for (const row of rows ?? []) {
      try {
        if (row.resolution_action === 'skip') { skipped++; continue; }

        // Build the product payload
        const productPayload = {
          cw_product_id: row.cw_product_id,
          cw_sku: row.cw_sku,
          cw_slug: row.cw_slug,
          cw_url: row.cw_url,
          name: row.cw_name ?? 'Unknown',
          brand: row.cw_brand,
          price_cents: row.cw_price_cents,
          rrp_cents: row.cw_rrp_cents,
          currency: row.cw_currency ?? 'AUD',
          in_stock: row.cw_in_stock,
          category_path: row.cw_category_path,
          image_url: row.cw_image_url,
          review_rating: row.cw_review_rating,
          review_count: row.cw_review_count,
          cw_source: row.cw_source,
          cw_updated_at: row.cw_updated_at,
          last_imported_at: new Date().toISOString(),
        };

        if (row.resolution_action === 'create') {
          const { error: insErr } = await supabaseAdmin.from('cw_products').insert(productPayload);
          if (insErr) throw new Error(insErr.message);
          created++;
        } else if (row.resolution_action === 'update' || row.resolution_action === 'manual_link') {
          const targetId = row.matched_record_id;
          if (!targetId) throw new Error('update/manual_link requires matched_record_id');

          // Fetch existing to avoid overwriting populated fields
          const { data: existing } = await supabaseAdmin
            .from('cw_products')
            .select('id, name, brand, image_url')
            .eq('id', targetId)
            .maybeSingle();

          const updatePayload: Record<string, unknown> = {
            price_cents: productPayload.price_cents,
            rrp_cents: productPayload.rrp_cents,
            in_stock: productPayload.in_stock,
            cw_updated_at: productPayload.cw_updated_at,
            last_imported_at: productPayload.last_imported_at,
            cw_source: productPayload.cw_source,
          };
          // Only overwrite blank fields
          if (existing && !existing.name) updatePayload['name'] = productPayload.name;
          if (existing && !existing.brand) updatePayload['brand'] = productPayload.brand;
          if (existing && !existing.image_url) updatePayload['image_url'] = productPayload.image_url;

          const { error: upErr } = await supabaseAdmin
            .from('cw_products')
            .update(updatePayload)
            .eq('id', targetId);
          if (upErr) throw new Error(upErr.message);
          updated++;
        }
      } catch (e) {
        failures.push({ row_number: row.row_number, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const finalStatus = failures.length > 0 && created + updated === 0 ? 'failed' : 'completed';

    await supabaseAdmin.from('cw_import_jobs').update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      skipped_rows: skipped,
      error_summary: failures.length > 0 ? `${failures.length} rows failed` : null,
    }).eq('id', body.jobId);

    return new Response(JSON.stringify({ created, updated, skipped, failures, status: finalStatus }), {
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
