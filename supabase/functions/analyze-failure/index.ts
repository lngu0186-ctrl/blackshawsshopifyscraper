// analyze-failure: Uses Lovable AI to explain scrape failures in plain English,
// classify the problem category, and suggest actionable fixes.
// Accepts: { diagnostic_id?, failure_data?, source_key?, stage? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { diagnostic_id, failure_data, source_key, run_summary } = body;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: corsHeaders });
    }

    // Build context from diagnostic row if ID provided
    let context: Record<string, unknown> = failure_data ?? {};
    if (diagnostic_id) {
      const { data: diag } = await supabaseAdmin
        .from('scrape_diagnostics')
        .select('*')
        .eq('id', diagnostic_id)
        .eq('user_id', userId)
        .single();
      if (diag) context = { ...diag };
    }

    // Build prompt based on mode
    let systemPrompt: string;
    let userPrompt: string;

    if (run_summary) {
      // Run-level AI health summary
      systemPrompt = `You are an expert web scraping diagnostics assistant for a pharmacy price intelligence platform.
Analyze scrape run results and provide a concise, actionable health summary.
Respond in JSON with this exact structure:
{
  "summary": "2-3 sentence overview",
  "performing_well": ["store name", ...],
  "failing_badly": ["store name", ...],
  "weakest_fields": ["field name", ...],
  "top_recommendations": [
    {"priority": "high|medium|low", "action": "...", "reason": "..."},
    {"priority": "high|medium|low", "action": "...", "reason": "..."},
    {"priority": "high|medium|low", "action": "...", "reason": "..."}
  ],
  "confidence": 0-100
}`;
      userPrompt = `Analyze this scrape run summary: ${JSON.stringify(run_summary)}`;
    } else {
      // Individual failure analysis
      systemPrompt = `You are an expert web scraping diagnostics assistant for a pharmacy price intelligence platform.
Analyze scrape failure data and provide a clear, actionable diagnosis.
Respond in JSON with this exact structure:
{
  "plain_english": "1-2 sentence plain English explanation",
  "problem_category": "blocked|layout_changed|selector_mismatch|missing_structured_data|js_rendered|parsing_bug|normalization_bug|rate_limited|network_error|unknown",
  "confidence": 0-100,
  "root_cause": "specific technical root cause",
  "fix_suggestion": "specific actionable fix",
  "extraction_strategy": "shopify_json|woo_api|json_ld|html_catalog|hybrid|unsupported",
  "priority": "high|medium|low",
  "quick_wins": ["actionable item", ...]
}`;
      userPrompt = `Analyze this scrape failure:
Source: ${context.source_key ?? source_key ?? 'unknown'}
Stage: ${context.stage ?? 'unknown'}
Status: ${context.status ?? 'failed'}
URL: ${context.url ?? 'N/A'}
HTTP Status: ${context.http_status ?? 'N/A'}
Failure Reason: ${context.failure_reason ?? 'N/A'}
Parser Used: ${context.parser_used ?? 'N/A'}
Selector Used: ${context.selector_used ?? 'N/A'}
Field: ${context.field_name ?? 'N/A'}
Missing Fields: ${JSON.stringify(context.missing_fields ?? [])}
Raw Error: ${context.raw_error ?? 'N/A'}
Retry Count: ${context.retry_count ?? 0}`;
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit reached. Please try again shortly.' }), { status: 429, headers: corsHeaders });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds to your workspace.' }), { status: 402, headers: corsHeaders });
      }
      throw new Error(`AI gateway error: ${await aiRes.text()}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content ?? '{}';
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content); } catch { parsed = { plain_english: content }; }

    // Persist analysis back to the diagnostic row if we have an ID
    if (diagnostic_id) {
      await supabaseAdmin.from('scrape_diagnostics').update({
        ai_analysis: parsed.plain_english as string ?? parsed.summary as string,
        ai_recommendation: parsed.fix_suggestion as string ?? JSON.stringify(parsed.top_recommendations),
      }).eq('id', diagnostic_id);
    }

    return new Response(JSON.stringify({ success: true, analysis: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: any) {
    console.error('analyze-failure error:', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
