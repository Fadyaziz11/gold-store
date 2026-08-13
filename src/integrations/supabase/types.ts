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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          branch_id: string
          check_in_at: string
          check_out_at: string | null
          created_at: string
          device: string | null
          employee_id: string
          id: string
          in_lat: number
          in_lng: number
          out_lat: number | null
          out_lng: number | null
        }
        Insert: {
          branch_id: string
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          device?: string | null
          employee_id: string
          id?: string
          in_lat: number
          in_lng: number
          out_lat?: number | null
          out_lng?: number | null
        }
        Update: {
          branch_id?: string
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          device?: string | null
          employee_id?: string
          id?: string
          in_lat?: number
          in_lng?: number
          out_lat?: number | null
          out_lng?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          radius_m: number
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          radius_m?: number
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          radius_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      daily_closings: {
        Row: {
          actual_cash: number
          admin_notes: string | null
          advances_branch: number
          attendance_id: string | null
          branch_id: string
          cash_sales: number
          closing_date: string
          created_at: string
          difference: number
          edited_at: string | null
          edited_by: string | null
          employee_id: string
          expected_cash: number
          expenses_total: number
          id: string
          instapay_sales: number
          net_total: number
          notes: string | null
          other_cash_out: number
          other_transfer_sales: number
          rejection_reason: string | null
          reopened_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          shift_end: string | null
          shift_start: string | null
          status: Database["public"]["Enums"]["closing_status"]
          supplier_cash_total: number
          supplier_total: number
          total_sales: number
          transfer_sales: number
          transfer_total: number
          updated_at: string
          wallet_sales: number
        }
        Insert: {
          actual_cash: number
          admin_notes?: string | null
          advances_branch?: number
          attendance_id?: string | null
          branch_id: string
          cash_sales?: number
          closing_date?: string
          created_at?: string
          difference?: number
          edited_at?: string | null
          edited_by?: string | null
          employee_id: string
          expected_cash?: number
          expenses_total?: number
          id?: string
          instapay_sales?: number
          net_total?: number
          notes?: string | null
          other_cash_out?: number
          other_transfer_sales?: number
          rejection_reason?: string | null
          reopened_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_end?: string | null
          shift_start?: string | null
          status?: Database["public"]["Enums"]["closing_status"]
          supplier_cash_total?: number
          supplier_total?: number
          total_sales?: number
          transfer_sales?: number
          transfer_total?: number
          updated_at?: string
          wallet_sales?: number
        }
        Update: {
          actual_cash?: number
          admin_notes?: string | null
          advances_branch?: number
          attendance_id?: string | null
          branch_id?: string
          cash_sales?: number
          closing_date?: string
          created_at?: string
          difference?: number
          edited_at?: string | null
          edited_by?: string | null
          employee_id?: string
          expected_cash?: number
          expenses_total?: number
          id?: string
          instapay_sales?: number
          net_total?: number
          notes?: string | null
          other_cash_out?: number
          other_transfer_sales?: number
          rejection_reason?: string | null
          reopened_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_end?: string | null
          shift_start?: string | null
          status?: Database["public"]["Enums"]["closing_status"]
          supplier_cash_total?: number
          supplier_total?: number
          total_sales?: number
          transfer_sales?: number
          transfer_total?: number
          updated_at?: string
          wallet_sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_closings_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          kind: string
          period: string
          reason: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          kind: string
          period: string
          reason: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          kind?: string
          period?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attendance_id: string | null
          branch_id: string
          category_id: string | null
          created_at: string
          description: string | null
          employee_id: string
          id: string
          payment_method: Database["public"]["Enums"]["pay_method"]
          proof_path: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["txn_status"]
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          branch_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          payment_method?: Database["public"]["Enums"]["pay_method"]
          proof_path?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          branch_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["pay_method"]
          proof_path?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
        }
        Relationships: [
          {
            foreignKeyName: "expenses_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          approved_by: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          destination: string | null
          direction: Database["public"]["Enums"]["ledger_dir"]
          employee_id: string | null
          id: string
          notes: string | null
          related_id: string | null
          related_table: string | null
          source: string | null
          txn_type: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          direction: Database["public"]["Enums"]["ledger_dir"]
          employee_id?: string | null
          id?: string
          notes?: string | null
          related_id?: string | null
          related_table?: string | null
          source?: string | null
          txn_type: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          destination?: string | null
          direction?: Database["public"]["Enums"]["ledger_dir"]
          employee_id?: string | null
          id?: string
          notes?: string | null
          related_id?: string | null
          related_table?: string | null
          source?: string | null
          txn_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payroll: {
        Row: {
          advances: number
          base_salary: number
          bonuses: number
          commissions: number
          created_at: string
          created_by: string | null
          deductions: number
          employee_id: string
          id: string
          net_salary: number
          paid_amount: number
          paid_at: string | null
          period: string
          status: Database["public"]["Enums"]["payroll_status"]
        }
        Insert: {
          advances?: number
          base_salary?: number
          bonuses?: number
          commissions?: number
          created_at?: string
          created_by?: string | null
          deductions?: number
          employee_id: string
          id?: string
          net_salary?: number
          paid_amount?: number
          paid_at?: string | null
          period: string
          status?: Database["public"]["Enums"]["payroll_status"]
        }
        Update: {
          advances?: number
          base_salary?: number
          bonuses?: number
          commissions?: number
          created_at?: string
          created_by?: string | null
          deductions?: number
          employee_id?: string
          id?: string
          net_salary?: number
          paid_amount?: number
          paid_at?: string | null
          period?: string
          status?: Database["public"]["Enums"]["payroll_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          advance_pct: number
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          salary: number
        }
        Insert: {
          active?: boolean
          advance_pct?: number
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          salary?: number
        }
        Update: {
          active?: boolean
          advance_pct?: number
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_advances: {
        Row: {
          amount: number
          approved_by: string | null
          branch_id: string | null
          created_at: string
          employee_id: string
          id: string
          paid_at: string | null
          reason: string | null
          rejection_reason: string | null
          source: Database["public"]["Enums"]["advance_source"]
          status: Database["public"]["Enums"]["advance_status"]
        }
        Insert: {
          amount: number
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          paid_at?: string | null
          reason?: string | null
          rejection_reason?: string | null
          source?: Database["public"]["Enums"]["advance_source"]
          status?: Database["public"]["Enums"]["advance_status"]
        }
        Update: {
          amount?: number
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          paid_at?: string | null
          reason?: string | null
          rejection_reason?: string | null
          source?: Database["public"]["Enums"]["advance_source"]
          status?: Database["public"]["Enums"]["advance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "salary_advances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["pay_method"]
        }
        Insert: {
          amount: number
          branch_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          payment_method: Database["public"]["Enums"]["pay_method"]
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["pay_method"]
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attendance_id: string | null
          branch_id: string
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["pay_method"]
          proof_path: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["txn_status"]
          supplier_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          branch_id: string
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["pay_method"]
          proof_path?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
          supplier_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          branch_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["pay_method"]
          proof_path?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attendance_id: string | null
          branch_id: string
          created_at: string
          customer_ref: string | null
          employee_id: string
          id: string
          method: string
          notes: string | null
          proof_path: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["txn_status"]
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          branch_id: string
          created_at?: string
          customer_ref?: string | null
          employee_id: string
          id?: string
          method?: string
          notes?: string | null
          proof_path: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attendance_id?: string | null
          branch_id?: string
          created_at?: string
          customer_ref?: string | null
          employee_id?: string
          id?: string
          method?: string
          notes?: string | null
          proof_path?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
        }
        Relationships: [
          {
            foreignKeyName: "transfers_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_settlements: {
        Row: {
          amount: number
          approved_at: string
          approved_by: string | null
          branch_id: string
          closing_id: string
          created_at: string
          employee_id: string
          id: string
          ledger_id: string | null
          reversal_ledger_id: string | null
          settlement_type: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string
          approved_by?: string | null
          branch_id: string
          closing_id: string
          created_at?: string
          employee_id: string
          id?: string
          ledger_id?: string | null
          reversal_ledger_id?: string | null
          settlement_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string
          approved_by?: string | null
          branch_id?: string
          closing_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          ledger_id?: string | null
          reversal_ledger_id?: string | null
          settlement_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_settlements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_settlements_closing_id_fkey"
            columns: ["closing_id"]
            isOneToOne: false
            referencedRelation: "daily_closings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_settlements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_settlements_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_settlements_reversal_ledger_id_fkey"
            columns: ["reversal_ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      branch_day_summary: {
        Args: { _branch: string; _date: string }
        Returns: Json
      }
      closing_compute: {
        Args: {
          _actual: number
          _att: string
          _branch: string
          _cash: number
          _date: string
        }
        Returns: Json
      }
      create_closing_settlement: {
        Args: { _closing: string }
        Returns: undefined
      }
      employee_payout: {
        Args: { _amount: number; _employee: string; _reason: string }
        Returns: string
      }
      employee_salary_summary: {
        Args: { _employee: string; _period: string }
        Returns: Json
      }
      gps_distance_m: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      my_branch: { Args: never; Returns: string }
      notify_admins: {
        Args: { _body: string; _link: string; _title: string }
        Returns: undefined
      }
      notify_user: {
        Args: { _body: string; _link: string; _title: string; _user: string }
        Returns: undefined
      }
      post_ledger: {
        Args: {
          _amount: number
          _approver: string
          _branch: string
          _dest: string
          _dir: Database["public"]["Enums"]["ledger_dir"]
          _employee: string
          _notes: string
          _rel: string
          _source: string
          _table: string
          _type: string
        }
        Returns: undefined
      }
      reset_all_data: { Args: { _password: string }; Returns: string }
      reverse_closing_settlement: {
        Args: { _closing: string; _reason: string }
        Returns: undefined
      }
      shift_summary: { Args: { _att: string }; Returns: Json }
      supplier_receipt: {
        Args: { _amount: number; _notes: string; _supplier: string }
        Returns: string
      }
      treasury_balance: { Args: never; Returns: number }
      treasury_manual: {
        Args: {
          _amount: number
          _dir: Database["public"]["Enums"]["ledger_dir"]
          _reason: string
        }
        Returns: string
      }
      write_audit: {
        Args: {
          _action: string
          _entity: string
          _entity_id: string
          _new: Json
          _old: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      advance_source: "treasury" | "branch"
      advance_status: "pending" | "approved" | "rejected" | "paid"
      app_role: "admin" | "employee"
      closing_status: "pending" | "approved" | "rejected" | "correction"
      ledger_dir: "in" | "out"
      pay_method: "cash" | "transfer"
      payroll_status: "pending" | "paid"
      txn_status: "pending" | "approved" | "rejected"
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
      advance_source: ["treasury", "branch"],
      advance_status: ["pending", "approved", "rejected", "paid"],
      app_role: ["admin", "employee"],
      closing_status: ["pending", "approved", "rejected", "correction"],
      ledger_dir: ["in", "out"],
      pay_method: ["cash", "transfer"],
      payroll_status: ["pending", "paid"],
      txn_status: ["pending", "approved", "rejected"],
    },
  },
} as const
