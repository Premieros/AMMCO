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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branch_daily_metrics: {
        Row: {
          batch_id: string
          bonuses_value: number
          branch_id: string
          business_date: string
          cash_in: number
          cash_out: number
          closing_cash: number
          closing_receivables: number
          collections: number
          damages_value: number
          discounts: number
          expenses: number
          gifts_value: number
          gross_sales: number
          id: number
          inventory_value: number
          net_sales: number
          opening_receivables: number
          raw_payload: Json
          returns_value: number
        }
        Insert: {
          batch_id: string
          bonuses_value?: number
          branch_id: string
          business_date: string
          cash_in?: number
          cash_out?: number
          closing_cash?: number
          closing_receivables?: number
          collections?: number
          damages_value?: number
          discounts?: number
          expenses?: number
          gifts_value?: number
          gross_sales?: number
          id?: number
          inventory_value?: number
          net_sales?: number
          opening_receivables?: number
          raw_payload?: Json
          returns_value?: number
        }
        Update: {
          batch_id?: string
          bonuses_value?: number
          branch_id?: string
          business_date?: string
          cash_in?: number
          cash_out?: number
          closing_cash?: number
          closing_receivables?: number
          collections?: number
          damages_value?: number
          discounts?: number
          expenses?: number
          gifts_value?: number
          gross_sales?: number
          id?: number
          inventory_value?: number
          net_sales?: number
          opening_receivables?: number
          raw_payload?: Json
          returns_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_daily_metrics_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_daily_metrics_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_entries: {
        Row: {
          account_code: string | null
          amount: number
          batch_id: string
          branch_id: string
          category: string | null
          description: string | null
          direction: string
          entry_date: string
          id: number
          raw_payload: Json
          running_balance: number | null
        }
        Insert: {
          account_code?: string | null
          amount: number
          batch_id: string
          branch_id: string
          category?: string | null
          description?: string | null
          direction: string
          entry_date: string
          id?: number
          raw_payload?: Json
          running_balance?: number | null
        }
        Update: {
          account_code?: string | null
          amount?: number
          batch_id?: string
          branch_id?: string
          category?: string | null
          description?: string | null
          direction?: string
          entry_date?: string
          id?: number
          raw_payload?: Json
          running_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_visits: {
        Row: {
          address: string | null
          balance_amount: number
          batch_id: string
          branch_id: string
          customer_name: string
          governorate: string | null
          id: number
          invoice_amount: number
          paid_amount: number
          payment_type: string | null
          phone: string | null
          price_list: string | null
          raw_payload: Json
          rep_name: string | null
          visit_date: string
        }
        Insert: {
          address?: string | null
          balance_amount?: number
          batch_id: string
          branch_id: string
          customer_name: string
          governorate?: string | null
          id?: number
          invoice_amount?: number
          paid_amount?: number
          payment_type?: string | null
          phone?: string | null
          price_list?: string | null
          raw_payload?: Json
          rep_name?: string | null
          visit_date: string
        }
        Update: {
          address?: string | null
          balance_amount?: number
          batch_id?: string
          branch_id?: string
          customer_name?: string
          governorate?: string | null
          id?: number
          invoice_amount?: number
          paid_amount?: number
          payment_type?: string | null
          phone?: string | null
          price_list?: string | null
          raw_payload?: Json
          rep_name?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_visits_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_visits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          failure_message: string | null
          file_sha256: string
          file_size_bytes: number | null
          id: string
          metadata: Json
          organization_id: string
          original_file_name: string
          period_end: string
          period_start: string
          replaces_batch_id: string | null
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          validated_at: string | null
          version: number
          workbook_schema_version: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          failure_message?: string | null
          file_sha256: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json
          organization_id: string
          original_file_name: string
          period_end: string
          period_start: string
          replaces_batch_id?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          validated_at?: string | null
          version: number
          workbook_schema_version?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          failure_message?: string | null
          file_sha256?: string
          file_size_bytes?: number | null
          id?: string
          metadata?: Json
          organization_id?: string
          original_file_name?: string
          period_end?: string
          period_start?: string
          replaces_batch_id?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          validated_at?: string | null
          version?: number
          workbook_schema_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_replaces_batch_id_fkey"
            columns: ["replaces_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_raw_rows: {
        Row: {
          batch_id: string
          created_at: string
          id: number
          row_number: number
          row_payload: Json
          sheet_name: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: number
          row_number: number
          row_payload: Json
          sheet_name: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: number
          row_number?: number
          row_payload?: Json
          sheet_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_raw_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sheets: {
        Row: {
          batch_id: string
          column_count: number | null
          id: number
          metadata: Json
          row_count: number | null
          sheet_index: number
          sheet_name: string
          source_checksum: string | null
        }
        Insert: {
          batch_id: string
          column_count?: number | null
          id?: number
          metadata?: Json
          row_count?: number | null
          sheet_index: number
          sheet_name: string
          source_checksum?: string | null
        }
        Update: {
          batch_id?: string
          column_count?: number | null
          id?: number
          metadata?: Json
          row_count?: number | null
          sheet_index?: number
          sheet_name?: string
          source_checksum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_sheets_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_validation_issues: {
        Row: {
          batch_id: string
          cell_ref: string | null
          code: string
          created_at: string
          id: number
          message: string
          raw_value: Json | null
          row_number: number | null
          severity: Database["public"]["Enums"]["issue_severity"]
          sheet_name: string | null
        }
        Insert: {
          batch_id: string
          cell_ref?: string | null
          code: string
          created_at?: string
          id?: number
          message: string
          raw_value?: Json | null
          row_number?: number | null
          severity: Database["public"]["Enums"]["issue_severity"]
          sheet_name?: string | null
        }
        Update: {
          batch_id?: string
          cell_ref?: string | null
          code?: string
          created_at?: string
          id?: number
          message?: string
          raw_value?: Json | null
          row_number?: number | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          sheet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_validation_issues_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          actual_qty: number | null
          batch_id: string
          book_qty: number | null
          branch_id: string
          count_date: string
          id: number
          location_label: string
          location_type: string
          product_id: string | null
          product_name: string
          raw_payload: Json
          unit_value: number | null
          variance_qty: number | null
          variance_value: number | null
        }
        Insert: {
          actual_qty?: number | null
          batch_id: string
          book_qty?: number | null
          branch_id: string
          count_date: string
          id?: number
          location_label: string
          location_type: string
          product_id?: string | null
          product_name: string
          raw_payload?: Json
          unit_value?: number | null
          variance_qty?: number | null
          variance_value?: number | null
        }
        Update: {
          actual_qty?: number | null
          batch_id?: string
          book_qty?: number | null
          branch_id?: string
          count_date?: string
          id?: number
          location_label?: string
          location_type?: string
          product_id?: string | null
          product_name?: string
          raw_payload?: Json
          unit_value?: number | null
          variance_qty?: number | null
          variance_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_daily: {
        Row: {
          adjustments_qty: number
          batch_id: string
          bonus_qty: number
          branch_id: string
          business_date: string
          closing_qty: number
          closing_value: number | null
          damages_qty: number
          gifts_qty: number
          id: number
          incoming_branches_qty: number
          incoming_factory_qty: number
          opening_qty: number
          outgoing_branches_qty: number
          product_id: string | null
          product_name: string
          raw_payload: Json
          return_factory_qty: number
          sales_qty: number
          unit_value: number | null
        }
        Insert: {
          adjustments_qty?: number
          batch_id: string
          bonus_qty?: number
          branch_id: string
          business_date: string
          closing_qty?: number
          closing_value?: number | null
          damages_qty?: number
          gifts_qty?: number
          id?: number
          incoming_branches_qty?: number
          incoming_factory_qty?: number
          opening_qty?: number
          outgoing_branches_qty?: number
          product_id?: string | null
          product_name: string
          raw_payload?: Json
          return_factory_qty?: number
          sales_qty?: number
          unit_value?: number | null
        }
        Update: {
          adjustments_qty?: number
          batch_id?: string
          bonus_qty?: number
          branch_id?: string
          business_date?: string
          closing_qty?: number
          closing_value?: number | null
          damages_qty?: number
          gifts_qty?: number
          id?: number
          incoming_branches_qty?: number
          incoming_factory_qty?: number
          opening_qty?: number
          outgoing_branches_qty?: number
          product_id?: string | null
          product_name?: string
          raw_payload?: Json
          return_factory_qty?: number
          sales_qty?: number
          unit_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_daily_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_daily_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_daily_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          carton_price: number | null
          category: string | null
          created_at: string
          first_seen_batch_id: string | null
          flavor: string | null
          id: string
          is_active: boolean
          last_seen_batch_id: string | null
          model: string | null
          name: string
          organization_id: string
          pack_description: string | null
          pack_price: number | null
          packs_per_carton: number | null
          raw_payload: Json
          retail_price: number | null
          source_product_key: string
          units_per_pack: number | null
          updated_at: string
          wholesale_price: number | null
        }
        Insert: {
          barcode?: string | null
          carton_price?: number | null
          category?: string | null
          created_at?: string
          first_seen_batch_id?: string | null
          flavor?: string | null
          id?: string
          is_active?: boolean
          last_seen_batch_id?: string | null
          model?: string | null
          name: string
          organization_id: string
          pack_description?: string | null
          pack_price?: number | null
          packs_per_carton?: number | null
          raw_payload?: Json
          retail_price?: number | null
          source_product_key: string
          units_per_pack?: number | null
          updated_at?: string
          wholesale_price?: number | null
        }
        Update: {
          barcode?: string | null
          carton_price?: number | null
          category?: string | null
          created_at?: string
          first_seen_batch_id?: string | null
          flavor?: string | null
          id?: string
          is_active?: boolean
          last_seen_batch_id?: string | null
          model?: string | null
          name?: string
          organization_id?: string
          pack_description?: string | null
          pack_price?: number | null
          packs_per_carton?: number | null
          raw_payload?: Json
          retail_price?: number | null
          source_product_key?: string
          units_per_pack?: number | null
          updated_at?: string
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_first_seen_batch_id_fkey"
            columns: ["first_seen_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_last_seen_batch_id_fkey"
            columns: ["last_seen_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          is_active?: boolean
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_rep_daily: {
        Row: {
          batch_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          collection_rate: number | null
          collections: number
          discounts: number
          id: number
          opening_balance: number
          raw_payload: Json
          rep_name: string
          sales: number
        }
        Insert: {
          batch_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          collection_rate?: number | null
          collections?: number
          discounts?: number
          id?: number
          opening_balance?: number
          raw_payload?: Json
          rep_name: string
          sales?: number
        }
        Update: {
          batch_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          collection_rate?: number | null
          collections?: number
          discounts?: number
          id?: number
          opening_balance?: number
          raw_payload?: Json
          rep_name?: string
          sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_rep_daily_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_rep_daily_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_access: {
        Row: {
          branch_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_access_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      vehicle_daily: {
        Row: {
          batch_id: string
          branch_id: string
          business_date: string
          closing_odometer: number | null
          driver_name: string | null
          fuel_expense: number
          id: number
          maintenance_expense: number
          opening_odometer: number | null
          other_expense: number
          raw_payload: Json
          rep_name: string | null
          sales: number
          total_expense: number
          vehicle_label: string | null
        }
        Insert: {
          batch_id: string
          branch_id: string
          business_date: string
          closing_odometer?: number | null
          driver_name?: string | null
          fuel_expense?: number
          id?: number
          maintenance_expense?: number
          opening_odometer?: number | null
          other_expense?: number
          raw_payload?: Json
          rep_name?: string | null
          sales?: number
          total_expense?: number
          vehicle_label?: string | null
        }
        Update: {
          batch_id?: string
          branch_id?: string
          business_date?: string
          closing_odometer?: number | null
          driver_name?: string | null
          fuel_expense?: number
          id?: number
          maintenance_expense?: number
          opening_odometer?: number | null
          other_expense?: number
          raw_payload?: Json
          rep_name?: string | null
          sales?: number
          total_expense?: number
          vehicle_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_daily_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_daily_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_branch_daily_kpis: {
        Row: {
          batch_id: string | null
          bonuses_value: number | null
          branch_id: string | null
          branch_name: string | null
          business_date: string | null
          cash_in: number | null
          cash_out: number | null
          closing_cash: number | null
          closing_receivables: number | null
          collections: number | null
          damages_value: number | null
          discounts: number | null
          expenses: number | null
          gifts_value: number | null
          gross_sales: number | null
          inventory_value: number | null
          net_sales: number | null
          opening_receivables: number | null
          returns_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_daily_metrics_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_daily_metrics_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "analyst" | "branch_user"
      import_status:
        | "uploaded"
        | "processing"
        | "validated"
        | "approved"
        | "rejected"
        | "failed"
        | "superseded"
      issue_severity: "info" | "warning" | "error"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "analyst", "branch_user"],
      import_status: [
        "uploaded",
        "processing",
        "validated",
        "approved",
        "rejected",
        "failed",
        "superseded",
      ],
      issue_severity: ["info", "warning", "error"],
    },
  },
} as const
