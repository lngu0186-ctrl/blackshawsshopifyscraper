# AU Pharmacy Scout

A Shopify product scraping tool built for Australian pharmacy price intelligence.

## Store Compatibility & Scrape Strategies

### 5-Tier Validation Waterfall

When you add a store, the app runs a tiered discovery probe to determine how to scrape it:

| Tier | Probe | Success Condition | Strategy Set |
|------|-------|-------------------|-------------|
| 1 | `GET /products.json?limit=1` | HTTP 200 + JSON `products` array | `products_json` |
| 2 | `GET /collections/all/products.json?limit=1` and `/collections/frontpage/products.json?limit=1` | First 200 with valid JSON | `collections_json` |
| 3 | `GET /sitemap.xml` | 200 + body contains `/products/` | `sitemap_handles` (restricted) |
| 4 | Any tier returns 401, redirects to `/password`, or HTML contains `action="/password"` | — | `password_protected` (storefront password) |
| 4b | `GET /account/login` returns 200 + `action="/account/login"` | — | `password_protected` (customer account) |
| 5 | All tiers fail | — | `invalid` |

### Why Some Shopify Stores Block /products.json

Shopify store owners can:
- Enable **storefront password protection** (single shared password)
- Require **customer account login** (common for B2B/wholesale)
- Configure their theme or a WAF (Web Application Firewall) to block JSON endpoints
- Use Shopify's "password" theme feature to hide their catalog from non-customers

### How Password Authentication Works

**Storefront Password:**
1. `GET /password` — fetches the form, extracts `authenticity_token`
2. `POST /password` with form fields including the password
3. On success, Shopify sets a `storefront_digest` or `_secure_session_id` cookie
4. That cookie is attached to all subsequent scrape requests server-side
5. Cookie is stored in the database and reused until expired (24h TTL)

**Customer Account Login:**
1. `GET /account/login` — fetches the form, extracts `authenticity_token`
2. `POST /account/login` with `customer[email]` and `customer[password]`
3. On success, a session cookie (`_shopify_y`, `_secure_session_id`) is extracted
4. The app then probes `/products.json` and `/collections/all/products.json` with the cookie to determine which strategy works
5. The resolved strategy is saved to the store record

### Security Model for Stored Credentials

- Credentials are stored in the database (Supabase RLS-protected, user-scoped)
- Passwords are **never returned to the browser** after being saved
- All authentication happens server-side in Edge Functions
- Session cookies are stored as opaque strings and reused for requests
- After 24 hours, the session is considered expired and re-authentication occurs automatically before the next scrape

### Customer Account vs Storefront Password

| | Storefront Password | Customer Account |
|---|---|---|
| Scope | Single password for entire store | Individual account credentials |
| Common use case | Private/coming-soon stores | B2B wholesale, medical |
| Form endpoint | `/password` | `/account/login` |
| Form field | `password` | `customer[email]`, `customer[password]` |
| Cookie type | `storefront_digest` | `_secure_session_id` |

### Known Limitations

1. **Sitemap strategy is significantly slower**: 1 HTTP request per product handle vs 250 products per page with `products_json`. A store with 1,000 products takes ~500 seconds minimum vs ~4 seconds with the standard API.

2. **Session expiry detection**: If a store changes from open to password-protected between scrapes, the next scrape will detect the change (receive a 401/redirect), mark `auth_status = 'expired'`, and surface a UI alert. You'll need to add credentials via the sidebar lock icon.

3. **B2B account approval**: Some stores (e.g. medical cannabis wholesalers) require manual account approval before a login works. The app will surface a failed auth error in that case — you must obtain account access externally first.

4. **Customer account product access**: After successful customer login, the app probes both `products.json` and `collections/all/products.json`. If neither returns products (e.g. the store further restricts even authenticated access), the app falls back to `sitemap_handles` strategy with the session cookie attached.
