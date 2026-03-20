export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      export_runs: {
        Row: {
          changed_only: boolean
          created_at: string
          export_type: string
          id: string
          row_count: number
          scope: string
          store_ids: Json | null
          user_id: string
        }
        Insert: {
          changed_only?: boolean
          created_at?: string
          export_type?: string
          id?: string
          row_count?: number
          scope?: string
          store_ids?: Json | null
          user_id: string
        }
        Update: {
          changed_only?: boolean
          created_at?: string
          export_type?: string
          id?: string
          row_count?: number
          scope?: string
          store_ids?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          created_at: string
          featured_image_url: string | null
          fulfillment_service: string
          grams: number
          id: string
          inventory_policy: string
          inventory_quantity: number | null
          inventory_tracker: string | null
          option1: string | null
          option2: string | null
          option3: string | null
          price: number | null
          product_id: string
          raw_variant: Json | null
          requires_shipping: boolean
          shopify_variant_id: string
          sku: string | null
          store_id: string
          taxable: boolean
          updated_at: string
          user_id: string
          variant_position: number | null
          variant_title: string | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          featured_image_url?: string | null
          fulfillment_service?: string
          grams?: number
          id?: string
          inventory_policy?: string
          inventory_quantity?: number | null
          inventory_tracker?: string | null
          option1?: string | null
          option2?: string | null
          option3?: string | null
          price?: number | null
          product_id: string
          raw_variant?: Json | null
          requires_shipping?: boolean
          shopify_variant_id: string
          sku?: string | null
          store_id: string
          taxable?: boolean
          updated_at?: string
          user_id: string
          variant_position?: number | null
          variant_title?: string | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          featured_image_url?: string | null
          fulfillment_service?: string
          grams?: number
          id?: string
          inventory_policy?: string
          inventory_quantity?: number | null
          inventory_tracker?: string | null
          option1?: string | null
          option2?: string | null
          option3?: string | null
          price?: number | null
          product_id?: string
          raw_variant?: Json | null
          requires_shipping?: boolean
          shopify_variant_id?: string
          sku?: string | null
          store_id?: string
          taxable?: boolean
          updated_at?: string
          user_id?: string
          variant_position?: number | null
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          body_html: string | null
          body_plain: string | null
          compare_at_price_max: number | null
          compare_at_price_min: number | null
          content_hash: string | null
          created_at: string
          first_seen_at: string
          handle: string
          id: string
          images: Json | null
          last_changed_at: string | null
          last_exported_at: string | null
          options: Json | null
          price_max: number | null
          price_min: number | null
          product_type: string | null
          published: boolean
          raw_product: Json | null
          scraped_at: string | null
          shopify_created_at: string | null
          shopify_product_id: string | null
          shopify_published_at: string | null
          shopify_updated_at: string | null
          status: string
          store_handle: string
          store_id: string
          store_name: string
          store_slug: string
          tags: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
          vendor: string | null
        }
        Insert: {
          body_html?: string | null
          body_plain?: string | null
          compare_at_price_max?: number | null
          compare_at_price_min?: number | null
          content_hash?: string | null
          created_at?: string
          first_seen_at?: string
          handle: string
          id?: string
          images?: Json | null
          last_changed_at?: string | null
          last_exported_at?: string | null
          options?: Json | null
          price_max?: number | null
          price_min?: number | null
          product_type?: string | null
          published?: boolean
          raw_product?: Json | null
          scraped_at?: string | null
          shopify_created_at?: string | null
          shopify_product_id?: string | null
          shopify_published_at?: string | null
          shopify_updated_at?: string | null
          status?: string
          store_handle: string
          store_id: string
          store_name: string
          store_slug: string
          tags?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
          vendor?: string | null
        }
        Update: {
          body_html?: string | null
          body_plain?: string | null
          compare_at_price_max?: number | null
          compare_at_price_min?: number | null
          content_hash?: string | null
          created_at?: string
          first_seen_at?: string
          handle?: string
          id?: string
          images?: Json | null
          last_changed_at?: string | null
          last_exported_at?: string | null
          options?: Json | null
          price_max?: number | null
          price_min?: number | null
          product_type?: string | null
          published?: boolean
          raw_product?: Json | null
          scraped_at?: string | null
          shopify_created_at?: string | null
          shopify_product_id?: string | null
          shopify_published_at?: string | null
          shopify_updated_at?: string | null
          status?: string
          store_handle?: string
          store_id?: string
          store_name?: string
          store_slug?: string
          tags?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_logs: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          metadata: Json | null
          scrape_run_id: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          level?: string
          message: string
          metadata?: Json | null
          scrape_run_id: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          level?: string
          message?: string
          metadata?: Json | null
          scrape_run_id?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_logs_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_run_stores: {
        Row: {
          finished_at: string | null
          id: string
          message: string | null
          page_count: number
          price_changes: number
          product_count: number
          scrape_run_id: string
          started_at: string | null
          status: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          message?: string | null
          page_count?: number
          price_changes?: number
          product_count?: number
          scrape_run_id: string
          started_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          message?: string | null
          page_count?: number
          price_changes?: number
          product_count?: number
          scrape_run_id?: string
          started_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_run_stores_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_run_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_runs: {
        Row: {
          completed_stores: number
          created_at: string
          error_count: number
          finished_at: string | null
          id: string
          settings: Json | null
          started_at: string | null
          status: string
          total_price_changes: number
          total_products: number
          total_stores: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_stores?: number
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          settings?: Json | null
          started_at?: string | null
          status?: string
          total_price_changes?: number
          total_products?: number
          total_stores?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_stores?: number
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          settings?: Json | null
          started_at?: string | null
          status?: string
          total_price_changes?: number
          total_products?: number
          total_stores?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_metrics_history: {
        Row: {
          avg_price_min: number | null
          id: string
          price_changes: number
          snapshot_at: string
          store_id: string
          total_products: number
          user_id: string
        }
        Insert: {
          avg_price_min?: number | null
          id?: string
          price_changes?: number
          snapshot_at?: string
          store_id: string
          total_products?: number
          user_id: string
        }
        Update: {
          avg_price_min?: number | null
          id?: string
          price_changes?: number
          snapshot_at?: string
          store_id?: string
          total_products?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_metrics_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          auth_cookie: string | null
          auth_cookie_expires_at: string | null
          auth_email: string | null
          auth_password: string | null
          auth_status: string
          auth_token: string | null
          auth_type: string
          created_at: string
          enabled: boolean
          id: string
          last_auth_attempt_at: string | null
          last_scraped_at: string | null
          myshopify_domain: string | null
          name: string
          normalized_url: string
          requires_auth: boolean
          scrape_strategy: string
          storefront_password: string | null
          storefront_password_hint: string | null
          total_products: number
          updated_at: string
          url: string
          user_id: string
          validation_status: string
        }
        Insert: {
          auth_cookie?: string | null
          auth_cookie_expires_at?: string | null
          auth_email?: string | null
          auth_password?: string | null
          auth_status?: string
          auth_token?: string | null
          auth_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_auth_attempt_at?: string | null
          last_scraped_at?: string | null
          myshopify_domain?: string | null
          name: string
          normalized_url: string
          requires_auth?: boolean
          scrape_strategy?: string
          storefront_password?: string | null
          storefront_password_hint?: string | null
          total_products?: number
          updated_at?: string
          url: string
          user_id: string
          validation_status?: string
        }
        Update: {
          auth_cookie?: string | null
          auth_cookie_expires_at?: string | null
          auth_email?: string | null
          auth_password?: string | null
          auth_status?: string
          auth_token?: string | null
          auth_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_auth_attempt_at?: string | null
          last_scraped_at?: string | null
          myshopify_domain?: string | null
          name?: string
          normalized_url?: string
          requires_auth?: boolean
          scrape_strategy?: string
          storefront_password?: string | null
          storefront_password_hint?: string | null
          total_products?: number
          updated_at?: string
          url?: string
          user_id?: string
          validation_status?: string
        }
        Relationships: []
      }
      variant_price_history: {
        Row: {
          compare_at_price: number | null
          compare_at_price_changed: boolean
          compare_at_price_delta: number | null
          id: string
          previous_compare_at_price: number | null
          previous_price: number | null
          price: number | null
          price_changed: boolean
          price_delta: number | null
          price_delta_pct: number | null
          product_id: string
          recorded_at: string
          scrape_run_id: string | null
          shopify_variant_id: string
          store_handle: string
          store_id: string
          user_id: string
          variant_id: string
          variant_sku: string | null
          variant_title: string | null
        }
        Insert: {
          compare_at_price?: number | null
          compare_at_price_changed?: boolean
          compare_at_price_delta?: number | null
          id?: string
          previous_compare_at_price?: number | null
          previous_price?: number | null
          price?: number | null
          price_changed?: boolean
          price_delta?: number | null
          price_delta_pct?: number | null
          product_id: string
          recorded_at?: string
          scrape_run_id?: string | null
          shopify_variant_id: string
          store_handle: string
          store_id: string
          user_id: string
          variant_id: string
          variant_sku?: string | null
          variant_title?: string | null
        }
        Update: {
          compare_at_price?: number | null
          compare_at_price_changed?: boolean
          compare_at_price_delta?: number | null
          id?: string
          previous_compare_at_price?: number | null
          previous_price?: number | null
          price?: number | null
          price_changed?: boolean
          price_delta?: number | null
          price_delta_pct?: number | null
          product_id?: string
          recorded_at?: string
          scrape_run_id?: string | null
          shopify_variant_id?: string
          store_handle?: string
          store_id?: string
          user_id?: string
          variant_id?: string
          variant_sku?: string | null
          variant_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variant_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_price_history_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_price_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_price_history_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
