export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string | string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
  options: ShopifyOption[];
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
  width?: number;
  height?: number;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  barcode: string | null;
  position: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  grams: number;
  taxable: boolean;
  requires_shipping: boolean;
  fulfillment_service: string;
  inventory_management: string | null;
  inventory_policy: string;
  inventory_quantity: number;
  featured_image: { src: string } | null;
}

export interface ShopifyOption {
  id: number;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}
