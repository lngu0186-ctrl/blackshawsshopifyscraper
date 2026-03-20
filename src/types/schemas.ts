import { z } from 'zod';

export const StoreSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  url: z.string().url(),
  normalized_url: z.string(),
  myshopify_domain: z.string().nullable(),
  enabled: z.boolean(),
  validation_status: z.enum(['valid', 'invalid', 'pending']),
  last_scraped_at: z.string().nullable(),
  total_products: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
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
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  total_stores: z.number(),
  completed_stores: z.number(),
  total_products: z.number(),
  total_price_changes: z.number(),
  error_count: z.number(),
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
