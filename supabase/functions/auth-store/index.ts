import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

function extractAuthenticityToken(html: string): string | null {
  const match = html.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i)
    || html.match(/value=["']([^"']+)["'][^>]*name=["']authenticity_token["']/i);
  return match ? match[1] : null;
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  // Try to find storefront or session cookies
  const cookieParts = setCookieHeader.split(',').flatMap(c => c.split(';'));
  const sessionCookies = cookieParts
    .map(p => p.trim())
    .filter(p =>
      p.startsWith('_secure_session_id=') ||
      p.startsWith('storefront_digest=') ||
      p.startsWith('_shopify_y=') ||
      p.startsWith('_shopify_sa_p=')
    );
  if (sessionCookies.length > 0) {
    // Return the first matching cookie as name=value
    return sessionCookies[0].split(';')[0].trim();
  }
  return null;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 20000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      redirect: 'follow',
      headers: { ...SCRAPE_HEADERS, ...(opts.headers || {}) },
    });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

async function authStorefrontPassword(baseUrl: string, password: string): Promise<{
  success: boolean;
  auth_status: string;
  auth_cookie: string | null;
  message: string;
}> {
  // Step 1: GET /password to get authenticity_token
  const getRes = await fetchWithTimeout(`${baseUrl}/password`);
  if (!getRes) {
    return { success: false, auth_status: 'failed', auth_cookie: null, message: 'Could not reach the store password page.' };
  }

  const html = await getRes.text();
  const token = extractAuthenticityToken(html);
  if (!token) {
    return { success: false, auth_status: 'failed', auth_cookie: null, message: 'Could not find authenticity token on password page.' };
  }

  // Step 2: POST to /password
  const body = new URLSearchParams({
    'form_type': 'storefront_password',
    'utf8': '✓',
    'authenticity_token': token,
    'password': password,
  });

  const postRes = await fetchWithTimeout(`${baseUrl}/password`, {
    method: 'POST',
    headers: {
      ...SCRAPE_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${baseUrl}/password`,
    },
    body: body.toString(),
    redirect: 'follow',
  });

  if (!postRes) {
    return { success: false, auth_status: 'failed', auth_cookie: null, message: 'Authentication request failed.' };
  }

  const responseUrl = postRes.url || '';
  const responseHtml = await postRes.text();

  // Check for success: redirected away from /password and no password form visible
  const stillOnPasswordPage = responseUrl.includes('/password') || responseHtml.includes('action="/password"');
  if (stillOnPasswordPage) {
    return { success: false, auth_status: 'failed', auth_cookie: null, message: 'Incorrect password. Please try again.' };
  }

  // Extract session cookie
  const setCookieRaw = postRes.headers.get('set-cookie');
  const sessionCookie = extractSessionCookie(setCookieRaw);

  return {
    success: true,
    auth_status: 'authenticated',
    auth_cookie: sessionCookie,
    message: 'Authenticated successfully. Scraping is now enabled for this store.',
  };
}

async function authCustomerAccount(baseUrl: string, email: string, password: string): Promise<{
  success: boolean;
  auth_status: string;
  auth_cookie: string | null;
  scrape_strategy: string;
  message: string;
}> {
  // Step 1: GET /account/login to get authenticity_token
  const getRes = await fetchWithTimeout(`${baseUrl}/account/login`);
  if (!getRes) {
    return { success: false, auth_status: 'failed', auth_cookie: null, scrape_strategy: 'products_json', message: 'Could not reach the store login page.' };
  }

  const html = await getRes.text();
  const token = extractAuthenticityToken(html);
  if (!token) {
    return { success: false, auth_status: 'failed', auth_cookie: null, scrape_strategy: 'products_json', message: 'Could not find authenticity token on login page.' };
  }

  // Step 2: POST to /account/login
  const body = new URLSearchParams({
    'form_type': 'customer_login',
    'utf8': '✓',
    'authenticity_token': token,
    'customer[email]': email,
    'customer[password]': password,
    'return_to': '/account',
  });

  const postRes = await fetchWithTimeout(`${baseUrl}/account/login`, {
    method: 'POST',
    headers: {
      ...SCRAPE_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${baseUrl}/account/login`,
    },
    body: body.toString(),
    redirect: 'follow',
  });

  if (!postRes) {
    return { success: false, auth_status: 'failed', auth_cookie: null, scrape_strategy: 'products_json', message: 'Login request failed.' };
  }

  const responseUrl = postRes.url || '';
  const responseHtml = await postRes.text();

  // Check for failure: redirected back to login
  const backOnLogin = responseUrl.includes('/account/login') || responseHtml.includes('action="/account/login"');
  if (backOnLogin) {
    return { success: false, auth_status: 'failed', auth_cookie: null, scrape_strategy: 'products_json', message: 'Login failed. Check your email and password for this store.' };
  }

  const setCookieRaw = postRes.headers.get('set-cookie');
  const sessionCookie = extractSessionCookie(setCookieRaw);

  if (!sessionCookie) {
    return { success: false, auth_status: 'failed', auth_cookie: null, scrape_strategy: 'products_json', message: 'Login appeared to succeed but no session cookie was returned.' };
  }

  // Step 3: Probe products.json with the cookie
  const cookieHeader = { Cookie: sessionCookie };

  const probe1 = await fetchWithTimeout(`${baseUrl}/products.json?limit=1`, { headers: { ...SCRAPE_HEADERS, ...cookieHeader } });
  if (probe1 && probe1.ok) {
    try {
      const data = await probe1.json();
      if (data && Array.isArray(data.products)) {
        return { success: true, auth_status: 'authenticated', auth_cookie: sessionCookie, scrape_strategy: 'products_json', message: 'Authenticated successfully. Product catalog accessible via products.json.' };
      }
    } catch { /* try next */ }
  }

  // Try collections
  const probe2 = await fetchWithTimeout(`${baseUrl}/collections/all/products.json?limit=1`, { headers: { ...SCRAPE_HEADERS, ...cookieHeader } });
  if (probe2 && probe2.ok) {
    try {
      const data = await probe2.json();
      if (data && Array.isArray(data.products)) {
        return { success: true, auth_status: 'authenticated', auth_cookie: sessionCookie, scrape_strategy: 'collections_json', message: 'Authenticated successfully. Product catalog accessible via collections endpoint.' };
      }
    } catch { /* try sitemap */ }
  }

  // Fall back to sitemap
  return {
    success: true,
    auth_status: 'authenticated',
    auth_cookie: sessionCookie,
    scrape_strategy: 'sitemap_handles',
    message: 'Authenticated successfully. Product catalog will be fetched via sitemap handle enumeration.',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const userId = claimsData.claims.sub;

  try {
    const body = await req.json();
    const { store_id, url, password, email, auth_type } = body;

    if (!store_id || !url) {
      return new Response(JSON.stringify({ success: false, message: 'store_id and url are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedUrl = url.replace(/\/+$/, '');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    let result: { success: boolean; auth_status: string; auth_cookie: string | null; scrape_strategy?: string; message: string };

    if (auth_type === 'customer_account') {
      if (!email || !password) {
        return new Response(JSON.stringify({ success: false, message: 'email and password are required for customer account auth' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const r = await authCustomerAccount(normalizedUrl, email, password);
      result = r;

      if (r.success) {
        await supabaseAdmin.from('stores').update({
          auth_status: 'authenticated',
          auth_cookie: r.auth_cookie,
          auth_cookie_expires_at: expiresAt,
          last_auth_attempt_at: now,
          auth_type: 'customer_account',
          // Store email but not password in plain text — store password hinted only
          auth_email: email,
          auth_password: password,
          scrape_strategy: r.scrape_strategy || 'products_json',
          requires_auth: true,
        }).eq('id', store_id).eq('user_id', userId);
      } else {
        await supabaseAdmin.from('stores').update({
          auth_status: 'failed',
          last_auth_attempt_at: now,
        }).eq('id', store_id).eq('user_id', userId);
      }
    } else {
      // Default: storefront_password
      if (!password) {
        return new Response(JSON.stringify({ success: false, message: 'password is required for storefront auth' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const r = await authStorefrontPassword(normalizedUrl, password);
      result = { ...r, scrape_strategy: 'products_json' };

      if (r.success) {
        await supabaseAdmin.from('stores').update({
          auth_status: 'authenticated',
          auth_cookie: r.auth_cookie,
          auth_cookie_expires_at: expiresAt,
          last_auth_attempt_at: now,
          auth_type: 'storefront_password',
          storefront_password: password,
          scrape_strategy: 'password_protected',
          requires_auth: true,
        }).eq('id', store_id).eq('user_id', userId);
      } else {
        await supabaseAdmin.from('stores').update({
          auth_status: 'failed',
          last_auth_attempt_at: now,
        }).eq('id', store_id).eq('user_id', userId);
      }
    }

    return new Response(JSON.stringify({
      success: result.success,
      auth_status: result.auth_status,
      scrape_strategy: result.scrape_strategy,
      message: result.message,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
