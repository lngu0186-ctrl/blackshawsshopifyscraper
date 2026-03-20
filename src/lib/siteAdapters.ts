// SITE_ADAPTERS is the single source of truth for per-site selector configuration.
// Never hardcode selectors inline in scraper logic — reference only this object.

export type SitePlatform = 'shopify' | 'woocommerce' | 'unknown';

export interface SiteAdapterConfig {
  platform: SitePlatform;
  baseUrl: string;
  sourceName: string;
  priceSelectors: string[];
  wasPriceSelectors: string[];
  titleSelectors: string[];
  imageSelectors: string[];
  descriptionSelectors: string[];
  brandSelectors: string[];
  breadcrumbSelectors: string[];
  categorySelectors: string[];
  skuSelectors: string[];
  stockSelectors: string[];
}

export const SITE_ADAPTERS: Record<string, SiteAdapterConfig> = {
  mr_vitamins: {
    platform: 'shopify',
    baseUrl: 'https://www.mrvitamins.com.au',
    sourceName: 'Mr Vitamins',
    priceSelectors: [
      '.price__sale .price-item--sale',
      '.price__regular .price-item--regular',
      '.price-item',
      '[data-product-price]',
    ],
    wasPriceSelectors: [
      '.price__sale .price-item--regular',
      '.price__compare .price-item',
      'del .price-item',
      's.price-item',
    ],
    titleSelectors: ['.product__title h1', 'h1.title', 'h1.product-single__title'],
    imageSelectors: [
      '.product__media img[src]',
      '.product-single__photo img[src]',
      '.product__media--featured img[src]',
    ],
    descriptionSelectors: ['.product__description', '.rte', '.product-single__description'],
    brandSelectors: ['.product__vendor', '[class*="vendor"]', '.product-meta__vendor'],
    breadcrumbSelectors: ['.breadcrumb li a', 'nav.breadcrumbs a', '.breadcrumbs a'],
    categorySelectors: ['.collection-hero__title', '.page-header__title'],
    skuSelectors: ['.product__sku', '[class*="sku"]', '.variant-sku'],
    stockSelectors: ['.product__inventory', '.inventory-status', '[class*="stock"]'],
  },

  evelyn_faye: {
    platform: 'shopify',
    baseUrl: 'https://www.evelynfaye.com.au',
    sourceName: 'Evelyn Faye Nutrition',
    priceSelectors: [
      '.price__sale .price-item--sale',
      '.price__regular .price-item--regular',
      '.price-item--regular',
      '[data-product-price]',
    ],
    wasPriceSelectors: ['.price__compare .price-item', 'del .price-item', 's .price-item'],
    titleSelectors: ['.product__title h1', 'h1.title', '.product-meta h1'],
    imageSelectors: ['.product__media img[src]', '.product-single__photo img[src]'],
    descriptionSelectors: ['.product__description', '.rte', '.product-single__description'],
    brandSelectors: ['.product__vendor', '.product-meta__vendor'],
    breadcrumbSelectors: ['.breadcrumbs a', '.breadcrumb li a'],
    categorySelectors: ['.collection-hero__title'],
    skuSelectors: ['.variant-sku', '[class*="sku"]'],
    stockSelectors: ['.product__inventory', '[class*="stock"]'],
  },

  gr8_health: {
    platform: 'shopify',
    baseUrl: 'https://gr8health.com.au',
    sourceName: 'Gr8 Health',
    priceSelectors: [
      '.price__sale .price-item--sale',
      '.price__regular .price-item--regular',
      '.product-price',
      '[data-product-price]',
    ],
    wasPriceSelectors: ['.price__compare .price-item', '.was-price', 'del .price'],
    titleSelectors: ['.product__title h1', 'h1.title'],
    imageSelectors: ['.product__media img[src]', '.product-featured-img[src]'],
    descriptionSelectors: ['.product__description', '.rte', '.product-description'],
    brandSelectors: ['.product__vendor', '.product-vendor'],
    breadcrumbSelectors: ['.breadcrumbs a', '.breadcrumb li a'],
    categorySelectors: [],
    skuSelectors: ['[class*="sku"]', '.product-sku'],
    stockSelectors: ['[class*="stock"]', '.product-availability'],
  },

  healthylife: {
    platform: 'shopify',
    baseUrl: 'https://www.healthylife.com.au',
    sourceName: 'Healthylife',
    priceSelectors: [
      '[data-testid="product-price"] .price-item--sale',
      '[data-testid="product-price"] .price-item--regular',
      '.price__sale .price-item--sale',
      '.price__regular .price-item--regular',
      '[data-product-price]',
    ],
    wasPriceSelectors: [
      '[data-testid="product-compare-price"]',
      '.price__compare .price-item',
      'del.price-item',
    ],
    titleSelectors: [
      '[data-testid="product-title"]',
      '.product__title h1',
      'h1[class*="ProductTitle"]',
      'h1.title',
    ],
    imageSelectors: [
      '[data-testid="product-image"] img[src]',
      '.product__media img[src]',
      '.product-image img[src]',
    ],
    descriptionSelectors: [
      '[data-testid="product-description"]',
      '.product__description',
      '.rte',
    ],
    brandSelectors: ['[data-testid="product-brand"]', '.product__vendor'],
    breadcrumbSelectors: ['[data-testid="breadcrumb"] a', '.breadcrumbs a'],
    categorySelectors: [],
    skuSelectors: ['[data-testid="product-sku"]', '[class*="sku"]'],
    stockSelectors: ['[data-testid="availability"]', '[class*="stock"]'],
  },

  wombat_pharmacy: {
    platform: 'unknown',
    baseUrl: 'https://www.wombatpharmacy.com.au',
    sourceName: 'Wombat Pharmacy',
    priceSelectors: [
      '.price-item--sale',
      '.price-item--regular',
      '.product-price',
      '.current-price',
      '[class*="price"]',
    ],
    wasPriceSelectors: ['del [class*="price"]', '.was-price', '.compare-price'],
    titleSelectors: ['h1.product-title', 'h1.title', '.product__title h1', 'h1'],
    imageSelectors: ['.product__media img[src]', '.product-image img[src]', 'img.product-img[src]'],
    descriptionSelectors: ['.product__description', '.product-description', '.rte', '.description'],
    brandSelectors: ['.product__vendor', '.brand-name', '[class*="vendor"]', '[class*="brand"]'],
    breadcrumbSelectors: ['.breadcrumbs a', '.breadcrumb a', 'nav[aria-label="breadcrumb"] a'],
    categorySelectors: [],
    skuSelectors: ['[class*="sku"]', '.product-sku'],
    stockSelectors: ['[class*="stock"]', '.availability', '[class*="inventory"]'],
  },

  david_jones_pharmacy: {
    platform: 'woocommerce',
    baseUrl: 'https://www.davidjonespharmacy.com.au',
    sourceName: 'David Jones Pharmacy',
    priceSelectors: [
      '.price ins .woocommerce-Price-amount',
      '.price .woocommerce-Price-amount',
      'p.price ins bdi',
      'p.price bdi',
    ],
    wasPriceSelectors: [
      '.price del .woocommerce-Price-amount',
      '.price del bdi',
      'p.price del bdi',
    ],
    titleSelectors: ['.product_title h1', 'h1.entry-title', 'h1.product-title'],
    imageSelectors: [
      '.woocommerce-product-gallery__image img[src]',
      '.woocommerce-product-gallery img[src]',
    ],
    descriptionSelectors: [
      '.woocommerce-product-details__short-description',
      '#tab-description',
      '.entry-content',
    ],
    brandSelectors: ['.product_meta .brand a', '.product-brand a', '[class*="brand"] a'],
    breadcrumbSelectors: ['.woocommerce-breadcrumb a', '.breadcrumb a'],
    categorySelectors: ['.posted_in a'],
    skuSelectors: ['.sku', '[class*="sku"]'],
    stockSelectors: ['.stock', '.availability', '[class*="stock"]'],
  },

  super_pharmacy_plus: {
    platform: 'woocommerce',
    baseUrl: 'https://superpharmacyplus.com.au',
    sourceName: 'Super Pharmacy Plus',
    priceSelectors: [
      '.price ins .woocommerce-Price-amount',
      '.price .woocommerce-Price-amount',
      'p.price ins bdi',
      'p.price bdi',
    ],
    wasPriceSelectors: ['.price del .woocommerce-Price-amount', '.price del bdi'],
    titleSelectors: ['.product_title h1', 'h1.entry-title'],
    imageSelectors: [
      '.woocommerce-product-gallery__image img[src]',
      '.woocommerce-product-gallery img[src]',
    ],
    descriptionSelectors: [
      '.woocommerce-product-details__short-description',
      '#tab-description',
    ],
    brandSelectors: ['.product_meta .brand a', '[class*="brand"] a'],
    breadcrumbSelectors: ['.woocommerce-breadcrumb a', '.breadcrumb a'],
    categorySelectors: ['.posted_in a'],
    skuSelectors: ['.sku'],
    stockSelectors: ['.stock', '.availability'],
  },
};

export const SUPPORTED_SOURCE_KEYS = Object.keys(SITE_ADAPTERS);

export function getAdapterByUrl(url: string): [string, SiteAdapterConfig] | null {
  const normalized = url.toLowerCase().replace(/https?:\/\//, '').replace(/\/$/, '');
  for (const [key, adapter] of Object.entries(SITE_ADAPTERS)) {
    const base = adapter.baseUrl.toLowerCase().replace(/https?:\/\//, '').replace(/\/$/, '');
    if (normalized.startsWith(base) || base.startsWith(normalized)) {
      return [key, adapter];
    }
  }
  return null;
}
