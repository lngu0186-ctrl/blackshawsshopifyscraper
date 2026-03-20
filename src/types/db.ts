export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          url: string;
          normalized_url: string;
          myshopify_domain: string | null;
          enabled: boolean;
          validation_status: string;
          last_scraped_at: string | null;
          total_products: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['stores']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['stores']['Insert']>;
      };
      products: {
        Row: {
          id: string;
          user_id: string;
          store_id: string;
          store_name: string;
          store_slug: string;
          handle: string;
          store_handle: string;
          title: string;
          body_html: string | null;
          body_plain: string | null;
          vendor: string | null;
          product_type: string | null;
          tags: string | null;
          published: boolean;
          status: string;
          url: string | null;
          images: Json;
          options: Json;
          raw_product: Json;
          price_min: number | null;
          price_max: number | null;
          compare_at_price_min: number | null;
          compare_at_price_max: number | null;
          shopify_product_id: string | null;
          shopify_created_at: string | null;
          shopify_updated_at: string | null;
          shopify_published_at: string | null;
          scraped_at: string | null;
          content_hash: string | null;
          first_seen_at: string;
          last_changed_at: string | null;
          last_exported_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['products']['Row']> & { user_id: string; store_id: string; store_name: string; store_slug: string; handle: string; store_handle: string; title: string };
        Update: Partial<Database['public']['Tables']['products']['Row']>;
      };
      product_variants: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          store_id: string;
          shopify_variant_id: string;
          variant_position: number | null;
          variant_title: string | null;
          sku: string | null;
          barcode: string | null;
          option1: string | null;
          option2: string | null;
          option3: string | null;
          price: number | null;
          compare_at_price: number | null;
          grams: number;
          taxable: boolean;
          requires_shipping: boolean;
          fulfillment_service: string;
          inventory_policy: string;
          inventory_tracker: string | null;
          inventory_quantity: number | null;
          featured_image_url: string | null;
          raw_variant: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['product_variants']['Row']> & { user_id: string; product_id: string; store_id: string; shopify_variant_id: string };
        Update: Partial<Database['public']['Tables']['product_variants']['Row']>;
      };
      scrape_runs: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          started_at: string | null;
          finished_at: string | null;
          total_stores: number;
          completed_stores: number;
          total_products: number;
          total_price_changes: number;
          error_count: number;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['scrape_runs']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['scrape_runs']['Row']>;
      };
      scrape_run_stores: {
        Row: {
          id: string;
          scrape_run_id: string;
          user_id: string;
          store_id: string;
          status: string;
          page_count: number;
          product_count: number;
          price_changes: number;
          message: string | null;
          started_at: string | null;
          finished_at: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['scrape_run_stores']['Row']> & { scrape_run_id: string; user_id: string; store_id: string };
        Update: Partial<Database['public']['Tables']['scrape_run_stores']['Row']>;
      };
      scrape_logs: {
        Row: {
          id: number;
          scrape_run_id: string;
          user_id: string;
          store_id: string | null;
          level: string;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['scrape_logs']['Row'], 'id'>;
        Update: Partial<Database['public']['Tables']['scrape_logs']['Row']>;
      };
      variant_price_history: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          variant_id: string;
          store_id: string;
          store_handle: string;
          shopify_variant_id: string;
          variant_sku: string | null;
          variant_title: string | null;
          price: number | null;
          compare_at_price: number | null;
          previous_price: number | null;
          previous_compare_at_price: number | null;
          price_delta: number | null;
          price_delta_pct: number | null;
          compare_at_price_delta: number | null;
          price_changed: boolean;
          compare_at_price_changed: boolean;
          recorded_at: string;
          scrape_run_id: string | null;
        };
        Insert: Partial<Database['public']['Tables']['variant_price_history']['Row']> & { user_id: string; product_id: string; variant_id: string; store_id: string; store_handle: string; shopify_variant_id: string };
        Update: Partial<Database['public']['Tables']['variant_price_history']['Row']>;
      };
      export_runs: {
        Row: {
          id: string;
          user_id: string;
          scope: string;
          store_ids: Json;
          changed_only: boolean;
          export_type: string;
          row_count: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['export_runs']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['export_runs']['Row']>;
      };
      store_metrics_history: {
        Row: {
          id: string;
          user_id: string;
          store_id: string;
          snapshot_at: string;
          total_products: number;
          price_changes: number;
          avg_price_min: number | null;
        };
        Insert: Partial<Database['public']['Tables']['store_metrics_history']['Row']> & { user_id: string; store_id: string };
        Update: Partial<Database['public']['Tables']['store_metrics_history']['Row']>;
      };
    };
  };
}
