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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      price_history: {
        Row: {
          created_at: string
          id: string
          price_change_absolute: number | null
          price_change_percent: number | null
          price_trend: string | null
          product_code: string | null
          product_name_normalized: string
          purchase_date: string
          supermarket_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          price_change_absolute?: number | null
          price_change_percent?: number | null
          price_trend?: string | null
          product_code?: string | null
          product_name_normalized: string
          purchase_date: string
          supermarket_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          price_change_absolute?: number | null
          price_change_percent?: number | null
          price_trend?: string | null
          product_code?: string | null
          product_name_normalized?: string
          purchase_date?: string
          supermarket_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_supermarket_id_fkey"
            columns: ["supermarket_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          aliases: string[] | null
          avg_price: number | null
          canonical_name: string
          category: string | null
          cheapest_supermarket_id: string | null
          created_at: string
          id: string
          is_essential: boolean | null
          last_purchased_at: string | null
          max_price: number | null
          min_price: number | null
          product_code: string | null
          purchase_frequency_days: number | null
          times_purchased: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[] | null
          avg_price?: number | null
          canonical_name: string
          category?: string | null
          cheapest_supermarket_id?: string | null
          created_at?: string
          id?: string
          is_essential?: boolean | null
          last_purchased_at?: string | null
          max_price?: number | null
          min_price?: number | null
          product_code?: string | null
          purchase_frequency_days?: number | null
          times_purchased?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[] | null
          avg_price?: number | null
          canonical_name?: string
          category?: string | null
          cheapest_supermarket_id?: string | null
          created_at?: string
          id?: string
          is_essential?: boolean | null
          last_purchased_at?: string | null
          max_price?: number | null
          min_price?: number | null
          product_code?: string | null
          purchase_frequency_days?: number | null
          times_purchased?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_cheapest_supermarket_id_fkey"
            columns: ["cheapest_supermarket_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          product_code: string | null
          product_name: string
          product_name_normalized: string
          purchase_date: string
          quantity: number
          receipt_id: string
          supermarket_id: string | null
          total_price: number
          unit: string | null
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_code?: string | null
          product_name: string
          product_name_normalized: string
          purchase_date: string
          quantity?: number
          receipt_id: string
          supermarket_id?: string | null
          total_price?: number
          unit?: string | null
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_code?: string | null
          product_name?: string
          product_name_normalized?: string
          purchase_date?: string
          quantity?: number
          receipt_id?: string
          supermarket_id?: string | null
          total_price?: number
          unit?: string | null
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supermarket_id_fkey"
            columns: ["supermarket_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          access_key: string
          created_at: string
          id: string
          item_count: number | null
          payment_method: string | null
          purchase_date: string
          qr_code_url: string | null
          raw_html: string | null
          supermarket_id: string | null
          total_amount: number
          total_discount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_key: string
          created_at?: string
          id?: string
          item_count?: number | null
          payment_method?: string | null
          purchase_date: string
          qr_code_url?: string | null
          raw_html?: string | null
          supermarket_id?: string | null
          total_amount?: number
          total_discount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_key?: string
          created_at?: string
          id?: string
          item_count?: number | null
          payment_method?: string | null
          purchase_date?: string
          qr_code_url?: string | null
          raw_html?: string | null
          supermarket_id?: string | null
          total_amount?: number
          total_discount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_supermarket_id_fkey"
            columns: ["supermarket_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          created_at: string
          estimated_price: number | null
          id: string
          is_checked: boolean | null
          note: string | null
          priority: string | null
          product_catalog_id: string | null
          product_name: string
          quantity: number | null
          shopping_list_id: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_price?: number | null
          id?: string
          is_checked?: boolean | null
          note?: string | null
          priority?: string | null
          product_catalog_id?: string | null
          product_name: string
          quantity?: number | null
          shopping_list_id: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_price?: number | null
          id?: string
          is_checked?: boolean | null
          note?: string | null
          priority?: string | null
          product_catalog_id?: string | null
          product_name?: string
          quantity?: number | null
          shopping_list_id?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_product_catalog_id_fkey"
            columns: ["product_catalog_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          frequency_days: number | null
          id: string
          is_active: boolean | null
          name: string
          planned_date: string | null
          target_supermarket_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency_days?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          planned_date?: string | null
          target_supermarket_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency_days?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          planned_date?: string | null
          target_supermarket_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_target_supermarket_id_fkey"
            columns: ["target_supermarket_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id"]
          },
        ]
      }
      supermarkets: {
        Row: {
          address: string | null
          brand_color: string | null
          city: string | null
          cnpj: string
          created_at: string
          id: string
          is_favorite: boolean | null
          logo_url: string | null
          name: string
          neighborhood: string | null
          notes: string | null
          state: string | null
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          cnpj: string
          created_at?: string
          id?: string
          is_favorite?: boolean | null
          logo_url?: string | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          state?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          cnpj?: string
          created_at?: string
          id?: string
          is_favorite?: boolean | null
          logo_url?: string | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          state?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      price_comparison_view: {
        Row: {
          avg_price: number | null
          avg_price_30d: number | null
          avg_price_90d: number | null
          brand_color: string | null
          last_price: number | null
          last_purchase_date: string | null
          logo_url: string | null
          max_price: number | null
          min_price: number | null
          product_code: string | null
          product_name_normalized: string | null
          supermarket_id: string | null
          supermarket_name: string | null
          times_purchased: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_supermarket_id_fkey"
            columns: ["supermarket_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_price_comparison: {
        Args: { search_term?: string }
        Returns: {
          avg_price: number
          avg_price_30d: number
          avg_price_90d: number
          brand_color: string
          last_price: number
          last_purchase_date: string
          logo_url: string
          max_price: number
          min_price: number
          product_code: string
          product_name_normalized: string
          supermarket_id: string
          supermarket_name: string
          times_purchased: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
