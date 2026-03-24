import { z } from 'zod';

export const StoreSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  url: z.string().url(),
  normalized_url: z.string(),
  myshopify_domain: z.string().nullable(),
  enabled: z.boolean(),
  validation_status: z.enum(['valid', 'restricted', 'password_protected', 'invalid', 'unchecked']),
  scrape_strategy: z.string().default('products_json'),
  requires_auth: z.boolean().default(false),
  auth_type: z.string().default('none'),
  auth_status: z.string().default('none'),
  auth_cookie: z.string().nullable().optional(),
  auth_cookie_expires_at: z.string().nullable().optional(),
  last_auth_attempt_at: z.string().nullable().optional(),
  storefront_password_hint: z.string().nullable().optional(),
  auth_email: z.string().nullable().optional(),
  last_scraped_at: z.string().nullable(),
  total_products: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  preferred_retry_mode: z.enum(['auto', 'default', 'smaller_batch', 'slow_pacing']).default('auto').optional(),
});
export type Store = z.infer<typeof StoreSchema>;

export const AddStoreSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  url: z.string().url('Please enter a valid URL').min(1, 'URL is required'),
});
export type AddStoreForm = z.infer<typeof AddStoreSchema>;

export const ScrapeRunSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  run_status: z.string().optional().default('queued'),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  total_stores: z.number(),
  completed_stores: z.number(),
  total_products: z.number(),
  total_price_changes: z.number(),
  error_count: z.number(),
  pages_visited: z.number().optional().default(0),
  active_store_id: z.string().uuid().nullable().optional(),
  active_store_name: z.string().nullable().optional(),
  latest_message: z.string().nullable().optional(),
  collections_total: z.number().optional().default(0),
  collections_completed: z.number().optional().default(0),
  collections_failed: z.number().optional().default(0),
  collections_skipped: z.number().optional().default(0),
  last_event_at: z.string().nullable().optional(),
  last_success_at: z.string().nullable().optional(),
  settings: z.any(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ScrapeRun = z.infer<typeof ScrapeRunSchema>;

export const ScrapeRunStoreSchema = z.object({
  id: z.string().uuid(),
  scrape_run_id: z.string().uuid(),
  user_id: z.string().uuid(),
  store_id: z.string().uuid(),
  status: z.enum(['queued', 'fetching', 'completed', 'error', 'cancelled']),
  page_count: z.number(),
  product_count: z.number(),
  price_changes: z.number(),
  message: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  updated_at: z.string(),
});
export type ScrapeRunStore = z.infer<typeof ScrapeRunStoreSchema>;

export const ScrapeLogSchema = z.object({
  id: z.number(),
  scrape_run_id: z.string().uuid(),
  user_id: z.string().uuid(),
  store_id: z.string().uuid().nullable(),
  level: z.enum(['info', 'warn', 'error', 'price_change']),
  message: z.string(),
  metadata: z.any(),
  created_at: z.string(),
});
export type ScrapeLog = z.infer<typeof ScrapeLogSchema>;

export const SettingsSchema = z.object({
  interPageDelay: z.number().min(0).max(5000).default(500),
  maxConcurrentStores: z.number().min(1).max(5).default(3),
  maxProductsPerStore: z.number().min(0).default(0),
  defaultExportScope: z.enum(['all', 'selected', 'single']).default('all'),
  googleShoppingCondition: z.boolean().default(false),
  userAgent: z.string().default('Mozilla/5.0 (compatible; AUPharmacyScout/1.0)'),
  tierTimeout: z.number().min(5).max(120).default(30),
  reAuthBeforeEachScrape: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const ProductFilterSchema = z.object({
  search: z.string().optional(),
  storeId: z.string().uuid().optional(),
  productType: z.string().optional(),
  vendor: z.string().optional(),
  hasPriceChanges: z.boolean().optional(),
  changedSinceExport: z.boolean().optional(),
  newSinceFirstScrape: z.boolean().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  page: z.number().default(1),
  pageSize: z.number().default(50),
  sortBy: z.string().default('scraped_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type ProductFilter = z.infer<typeof ProductFilterSchema>;
