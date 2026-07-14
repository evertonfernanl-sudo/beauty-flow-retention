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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          path: string | null
          slug: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          path?: string | null
          slug?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          path?: string | null
          slug?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          cancellation_reason: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          end_datetime: string
          id: string
          notes: string | null
          price: number
          professional_id: string | null
          service_id: string | null
          source: Database["public"]["Enums"]["appointment_source"]
          start_datetime: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          client_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          end_datetime: string
          id?: string
          notes?: string | null
          price?: number
          professional_id?: string | null
          service_id?: string | null
          source?: Database["public"]["Enums"]["appointment_source"]
          start_datetime: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          end_datetime?: string
          id?: string
          notes?: string | null
          price?: number
          professional_id?: string | null
          service_id?: string | null
          source?: Database["public"]["Enums"]["appointment_source"]
          start_datetime?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_sent_at: string | null
          message_body: string
          name: string
          segment: string
          sent_count: number
          template_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_sent_at?: string | null
          message_body: string
          name: string
          segment: string
          sent_count?: number
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_sent_at?: string | null
          message_body?: string
          name?: string
          segment?: string
          sent_count?: number
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_behavior_profiles: {
        Row: {
          average_recurrence_days: number | null
          average_ticket: number
          client_id: string
          company_id: string
          last_transaction_at: string | null
          lifetime_value: number
          preferred_offering_id: string | null
          preferred_offering_label: string | null
          preferred_payment_method: string | null
          transactions_count: number
          updated_at: string
        }
        Insert: {
          average_recurrence_days?: number | null
          average_ticket?: number
          client_id: string
          company_id: string
          last_transaction_at?: string | null
          lifetime_value?: number
          preferred_offering_id?: string | null
          preferred_offering_label?: string | null
          preferred_payment_method?: string | null
          transactions_count?: number
          updated_at?: string
        }
        Update: {
          average_recurrence_days?: number | null
          average_ticket?: number
          client_id?: string
          company_id?: string
          last_transaction_at?: string | null
          lifetime_value?: number
          preferred_offering_id?: string | null
          preferred_offering_label?: string | null
          preferred_payment_method?: string | null
          transactions_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_behavior_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_behavior_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_behavior_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_behavior_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          channel: Database["public"]["Enums"]["contact_channel"]
          client_id: string
          company_id: string
          contacted_at: string
          created_at: string
          id: string
          notes: string | null
          result: Database["public"]["Enums"]["contact_result"] | null
          user_id: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["contact_channel"]
          client_id: string
          company_id: string
          contacted_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["contact_result"] | null
          user_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["contact_channel"]
          client_id?: string
          company_id?: string
          contacted_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["contact_result"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "client_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      clients: {
        Row: {
          appointments_count: number
          birthday: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          instagram: string | null
          last_visit: string | null
          name: string
          next_return: string | null
          normalized_name: string | null
          notes: string | null
          phone: string | null
          phone_api: string | null
          phone_original: string | null
          phone2: string | null
          profession: string | null
          status: Database["public"]["Enums"]["client_status"]
          total_spent: number
          updated_at: string
        }
        Insert: {
          appointments_count?: number
          birthday?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          last_visit?: string | null
          name: string
          next_return?: string | null
          normalized_name?: string | null
          notes?: string | null
          phone?: string | null
          phone_api?: string | null
          phone_original?: string | null
          phone2?: string | null
          profession?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          total_spent?: number
          updated_at?: string
        }
        Update: {
          appointments_count?: number
          birthday?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          last_visit?: string | null
          name?: string
          next_return?: string | null
          normalized_name?: string | null
          notes?: string | null
          phone?: string | null
          phone_api?: string | null
          phone_original?: string | null
          phone2?: string | null
          profession?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          address: string | null
          business_hours: Json
          city: string | null
          created_at: string
          email: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          monthly_revenue_goal: number
          name: string
          onboarding_completed: boolean
          phone: string | null
          plan: Database["public"]["Enums"]["company_plan"]
          preferences: Json
          slug: string | null
          state: string | null
          trial_ends_at: string | null
          updated_at: string
          vertical: Database["public"]["Enums"]["business_vertical"]
          whatsapp: string | null
          whatsapp_template: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          business_hours?: Json
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          monthly_revenue_goal?: number
          name: string
          onboarding_completed?: boolean
          phone?: string | null
          plan?: Database["public"]["Enums"]["company_plan"]
          preferences?: Json
          slug?: string | null
          state?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          vertical?: Database["public"]["Enums"]["business_vertical"]
          whatsapp?: string | null
          whatsapp_template?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          business_hours?: Json
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          monthly_revenue_goal?: number
          name?: string
          onboarding_completed?: boolean
          phone?: string | null
          plan?: Database["public"]["Enums"]["company_plan"]
          preferences?: Json
          slug?: string | null
          state?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          vertical?: Database["public"]["Enums"]["business_vertical"]
          whatsapp?: string | null
          whatsapp_template?: string | null
        }
        Relationships: []
      }
      company_features: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          enabled: boolean
          feature: string
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          feature: string
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          feature?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          account_source: string | null
          amount: number
          appointment_id: string | null
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_personal: boolean
          payment_method: string | null
          provider_id: string | null
          revenue_type: string | null
          status: string
          transaction_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          account_source?: string | null
          amount: number
          appointment_id?: string | null
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          payment_method?: string | null
          provider_id?: string | null
          revenue_type?: string | null
          status?: string
          transaction_date?: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          account_source?: string | null
          amount?: number
          appointment_id?: string | null
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          payment_method?: string | null
          provider_id?: string | null
          revenue_type?: string | null
          status?: string
          transaction_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "financial_transactions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      import_errors: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          import_id: string
          message: string
          row_id: string | null
          suggestion: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          import_id: string
          message: string
          row_id?: string | null
          suggestion?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          import_id?: string
          message?: string
          row_id?: string | null
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_errors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_errors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_errors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_errors_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_errors_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      import_knowledge_base: {
        Row: {
          auto_approved: boolean
          company_id: string
          confidence: number
          corrections: number
          created_at: string
          hits: number
          id: string
          last_used_at: string
          mapped_entity_id: string | null
          mapped_entity_type: string | null
          mapped_label: string | null
          pattern_type: Database["public"]["Enums"]["import_pattern_type"]
          pattern_value: string
          updated_at: string
        }
        Insert: {
          auto_approved?: boolean
          company_id: string
          confidence?: number
          corrections?: number
          created_at?: string
          hits?: number
          id?: string
          last_used_at?: string
          mapped_entity_id?: string | null
          mapped_entity_type?: string | null
          mapped_label?: string | null
          pattern_type: Database["public"]["Enums"]["import_pattern_type"]
          pattern_value: string
          updated_at?: string
        }
        Update: {
          auto_approved?: boolean
          company_id?: string
          confidence?: number
          corrections?: number
          created_at?: string
          hits?: number
          id?: string
          last_used_at?: string
          mapped_entity_id?: string | null
          mapped_entity_type?: string | null
          mapped_label?: string | null
          pattern_type?: Database["public"]["Enums"]["import_pattern_type"]
          pattern_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_knowledge_base_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_knowledge_base_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_knowledge_base_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      import_matches: {
        Row: {
          action: string | null
          company_id: string
          confidence: number
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          import_id: string
          reason: string | null
          row_id: string
        }
        Insert: {
          action?: string | null
          company_id: string
          confidence?: number
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          import_id: string
          reason?: string | null
          row_id: string
        }
        Update: {
          action?: string | null
          company_id?: string
          confidence?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          import_id?: string
          reason?: string | null
          row_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_matches_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_matches_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          action_taken: string | null
          amount: number | null
          appointment_id: string | null
          client_name: string | null
          client_phone: string | null
          client_phone2: string | null
          company_id: string
          confidence: number
          created_at: string
          description: string | null
          id: string
          import_id: string
          notes: string | null
          occurred_at: string | null
          parsed: Json
          payment_method: string | null
          raw: Json
          resolved_client_id: string | null
          resolved_offering_id: string | null
          resolved_offering_kind: string | null
          row_index: number
          status: Database["public"]["Enums"]["import_row_status"]
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          amount?: number | null
          appointment_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_phone2?: string | null
          company_id: string
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          import_id: string
          notes?: string | null
          occurred_at?: string | null
          parsed?: Json
          payment_method?: string | null
          raw?: Json
          resolved_client_id?: string | null
          resolved_offering_id?: string | null
          resolved_offering_kind?: string | null
          row_index: number
          status?: Database["public"]["Enums"]["import_row_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          amount?: number | null
          appointment_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_phone2?: string | null
          company_id?: string
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          import_id?: string
          notes?: string | null
          occurred_at?: string | null
          parsed?: Json
          payment_method?: string | null
          raw?: Json
          resolved_client_id?: string | null
          resolved_offering_id?: string | null
          resolved_offering_kind?: string | null
          row_index?: number
          status?: Database["public"]["Enums"]["import_row_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          appointments_created: number
          clients_created: number
          clients_matched: number
          company_id: string
          created_at: string
          created_by: string | null
          filename: string
          finished_at: string | null
          id: string
          last_error: string | null
          options: Json
          revenue_identified: number
          rows_failed: number
          rows_matched: number
          rows_review: number
          rows_total: number
          size_bytes: number | null
          source: Database["public"]["Enums"]["import_source"]
          started_at: string | null
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          transactions_created: number
          updated_at: string
        }
        Insert: {
          appointments_created?: number
          clients_created?: number
          clients_matched?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          filename: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          options?: Json
          revenue_identified?: number
          rows_failed?: number
          rows_matched?: number
          rows_review?: number
          rows_total?: number
          size_bytes?: number | null
          source: Database["public"]["Enums"]["import_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          transactions_created?: number
          updated_at?: string
        }
        Update: {
          appointments_created?: number
          clients_created?: number
          clients_matched?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          filename?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          options?: Json
          revenue_identified?: number
          rows_failed?: number
          rows_matched?: number
          rows_review?: number
          rows_total?: number
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["import_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          transactions_created?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      integrations: {
        Row: {
          company_id: string
          config: Json
          connected_at: string | null
          created_at: string
          id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json
          connected_at?: string | null
          created_at?: string
          id?: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json
          connected_at?: string | null
          created_at?: string
          id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          due_date: string
          gateway: string | null
          gateway_invoice_id: string | null
          id: string
          number: string
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          due_date?: string
          gateway?: string | null
          gateway_invoice_id?: string | null
          id?: string
          number: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          due_date?: string
          gateway?: string | null
          gateway_invoice_id?: string | null
          id?: string
          number?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          company_id: string | null
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          scheduled_at: string
          started_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      message_logs: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"]
          client_id: string
          company_id: string
          created_at: string
          event: Database["public"]["Enums"]["message_event_type"]
          id: string
          metadata: Json
          queue_id: string | null
          template_id: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["message_channel"]
          client_id: string
          company_id: string
          created_at?: string
          event: Database["public"]["Enums"]["message_event_type"]
          id?: string
          metadata?: Json
          queue_id?: string | null
          template_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"]
          client_id?: string
          company_id?: string
          created_at?: string
          event?: Database["public"]["Enums"]["message_event_type"]
          id?: string
          metadata?: Json
          queue_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_logs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "message_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"]
          client_id: string
          company_id: string
          converted_at: string | null
          created_at: string
          id: string
          offset_days: number
          opportunity_id: string | null
          priority: number
          recovered_value: number | null
          rendered_body: string
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["message_queue_status"]
          template_id: string | null
          type: Database["public"]["Enums"]["message_type"]
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["message_channel"]
          client_id: string
          company_id: string
          converted_at?: string | null
          created_at?: string
          id?: string
          offset_days?: number
          opportunity_id?: string | null
          priority?: number
          recovered_value?: number | null
          rendered_body: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_queue_status"]
          template_id?: string | null
          type: Database["public"]["Enums"]["message_type"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"]
          client_id?: string
          company_id?: string
          converted_at?: string | null
          created_at?: string
          id?: string
          offset_days?: number
          opportunity_id?: string | null
          priority?: number
          recovered_value?: number | null
          rendered_body?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_queue_status"]
          template_id?: string | null
          type?: Database["public"]["Enums"]["message_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_queue_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "recovery_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          active: boolean
          body: string
          cadence_offsets: number[]
          category: string
          channel: Database["public"]["Enums"]["message_channel"]
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          type: Database["public"]["Enums"]["message_type"]
          updated_at: string
          variables: string[]
        }
        Insert: {
          active?: boolean
          body: string
          cadence_offsets?: number[]
          category?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          type?: Database["public"]["Enums"]["message_type"]
          updated_at?: string
          variables?: string[]
        }
        Update: {
          active?: boolean
          body?: string
          cadence_offsets?: number[]
          category?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          type?: Database["public"]["Enums"]["message_type"]
          updated_at?: string
          variables?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      offering_behavior_profiles: {
        Row: {
          average_price: number
          average_recurrence_days: number | null
          company_id: string
          conversion_rate: number | null
          frequency: number
          id: string
          offering_id: string
          offering_kind: string
          updated_at: string
        }
        Insert: {
          average_price?: number
          average_recurrence_days?: number | null
          company_id: string
          conversion_rate?: number | null
          frequency?: number
          id?: string
          offering_id: string
          offering_kind: string
          updated_at?: string
        }
        Update: {
          average_price?: number
          average_recurrence_days?: number | null
          company_id?: string
          conversion_rate?: number | null
          frequency?: number
          id?: string
          offering_id?: string
          offering_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "offering_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      payment_behavior_profiles: {
        Row: {
          company_id: string
          hits: number
          id: string
          payment_method: string
          share: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          hits?: number
          id?: string
          payment_method: string
          share?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          hits?: number
          id?: string
          payment_method?: string
          share?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payment_behavior_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          features: Json
          id: string
          max_clients: number | null
          max_users: number | null
          monthly_price: number
          name: string
          sort_order: number
          updated_at: string
          yearly_price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          features?: Json
          id: string
          max_clients?: number | null
          max_users?: number | null
          monthly_price?: number
          name: string
          sort_order?: number
          updated_at?: string
          yearly_price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          max_clients?: number | null
          max_users?: number | null
          monthly_price?: number
          name?: string
          sort_order?: number
          updated_at?: string
          yearly_price?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          active: boolean
          color: string
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          specialty: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          color?: string
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          color?: string
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "professionals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      providers: {
        Row: {
          address: string | null
          client_id: string | null
          company_id: string
          created_at: string
          document: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          document?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          document?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      recovery_opportunities: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          classification: Database["public"]["Enums"]["return_class"]
          client_id: string
          company_id: string
          converted_at: string | null
          created_at: string
          days_late: number
          expected_return_date: string
          id: string
          last_contact_at: string | null
          potential_value: number
          recovered_value: number | null
          score: number
          service_id: string | null
          status: Database["public"]["Enums"]["recovery_status"]
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          classification?: Database["public"]["Enums"]["return_class"]
          client_id: string
          company_id: string
          converted_at?: string | null
          created_at?: string
          days_late?: number
          expected_return_date: string
          id?: string
          last_contact_at?: string | null
          potential_value?: number
          recovered_value?: number | null
          score?: number
          service_id?: string | null
          status?: Database["public"]["Enums"]["recovery_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          classification?: Database["public"]["Enums"]["return_class"]
          client_id?: string
          company_id?: string
          converted_at?: string | null
          created_at?: string
          days_late?: number
          expected_return_date?: string
          id?: string
          last_contact_at?: string | null
          potential_value?: number
          recovered_value?: number | null
          score?: number
          service_id?: string | null
          status?: Database["public"]["Enums"]["recovery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_opportunities_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "recovery_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "recovery_opportunities_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_tasks: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          opportunity_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "recovery_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "recovery_tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "recovery_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      return_opportunities: {
        Row: {
          client_id: string
          company_id: string
          contacted: boolean
          contacted_at: string | null
          converted: boolean
          converted_at: string | null
          created_at: string
          days_late: number
          estimated_value: number
          expected_return_date: string
          id: string
          service_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          company_id: string
          contacted?: boolean
          contacted_at?: string | null
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          days_late?: number
          estimated_value?: number
          expected_return_date: string
          id?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_id?: string
          contacted?: boolean
          contacted_at?: string | null
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          days_late?: number
          estimated_value?: number
          expected_return_date?: string
          id?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "return_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "return_opportunities_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_opportunities_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          billing_cycle_days: number | null
          category: string | null
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          kind: Database["public"]["Enums"]["offering_kind"]
          name: string
          price: number
          return_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_cycle_days?: number | null
          category?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          kind?: Database["public"]["Enums"]["offering_kind"]
          name: string
          price?: number
          return_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_cycle_days?: number | null
          category?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          kind?: Database["public"]["Enums"]["offering_kind"]
          name?: string
          price?: number
          return_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          billing_cycle: string
          canceled_at: string | null
          cancellation_reason: string | null
          company_id: string
          created_at: string
          current_period_end: string
          current_period_start: string
          gateway: string | null
          gateway_subscription_id: string | null
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          canceled_at?: string | null
          cancellation_reason?: string | null
          company_id: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          gateway?: string | null
          gateway_subscription_id?: string | null
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          canceled_at?: string | null
          cancellation_reason?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          gateway?: string | null
          gateway_subscription_id?: string | null
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          permissions?: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v3_audit_log: {
        Row: {
          algorithm_version: string | null
          company_id: string
          created_at: string
          event: string
          id: string
          import_id: string | null
          input: Json | null
          output: Json | null
          reason: string
          responsavel: string
          row_id: string | null
          stage: string
        }
        Insert: {
          algorithm_version?: string | null
          company_id: string
          created_at?: string
          event: string
          id?: string
          import_id?: string | null
          input?: Json | null
          output?: Json | null
          reason: string
          responsavel?: string
          row_id?: string | null
          stage: string
        }
        Update: {
          algorithm_version?: string | null
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          import_id?: string | null
          input?: Json | null
          output?: Json | null
          reason?: string
          responsavel?: string
          row_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_audit_log_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "v3_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_audit_log_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "v3_import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_audit_log_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "v3_row_audit"
            referencedColumns: ["row_id"]
          },
        ]
      }
      v3_financial_transactions: {
        Row: {
          amount: number
          category: string | null
          client_id: string | null
          company_id: string
          created_at: string
          description: string
          engine: string
          id: string
          is_personal: boolean
          notes: string | null
          revenue_type: string | null
          service_id: string | null
          status: string
          transaction_date: string
          type: string
          updated_at: string
          v3_row_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          description: string
          engine?: string
          id?: string
          is_personal?: boolean
          notes?: string | null
          revenue_type?: string | null
          service_id?: string | null
          status?: string
          transaction_date: string
          type: string
          updated_at?: string
          v3_row_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          description?: string
          engine?: string
          id?: string
          is_personal?: boolean
          notes?: string | null
          revenue_type?: string | null
          service_id?: string | null
          status?: string
          transaction_date?: string
          type?: string
          updated_at?: string
          v3_row_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_v3_row_id_fkey"
            columns: ["v3_row_id"]
            isOneToOne: false
            referencedRelation: "v3_import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_financial_transactions_v3_row_id_fkey"
            columns: ["v3_row_id"]
            isOneToOne: false
            referencedRelation: "v3_row_audit"
            referencedColumns: ["row_id"]
          },
        ]
      }
      v3_import_rows: {
        Row: {
          applied_result: Json | null
          audit_trace: Json | null
          block_debug: Json | null
          canonical: Json
          classification_confidence: number | null
          company_id: string
          confidence: number
          confidence_level: string | null
          created_at: string
          duplicate_of: string[] | null
          id: string
          import_id: string
          origin_lines: Json | null
          original_snapshot: Json
          possible_duplicate: boolean | null
          processing_metadata: Json
          protected_fields: string[]
          reason: string | null
          resolved_client_id: string | null
          resolved_service_id: string | null
          row_index: number
          rule_applied: string | null
          status: string
          suggestions: Json
          updated_at: string
        }
        Insert: {
          applied_result?: Json | null
          audit_trace?: Json | null
          block_debug?: Json | null
          canonical: Json
          classification_confidence?: number | null
          company_id: string
          confidence?: number
          confidence_level?: string | null
          created_at?: string
          duplicate_of?: string[] | null
          id?: string
          import_id: string
          origin_lines?: Json | null
          original_snapshot: Json
          possible_duplicate?: boolean | null
          processing_metadata?: Json
          protected_fields?: string[]
          reason?: string | null
          resolved_client_id?: string | null
          resolved_service_id?: string | null
          row_index: number
          rule_applied?: string | null
          status?: string
          suggestions?: Json
          updated_at?: string
        }
        Update: {
          applied_result?: Json | null
          audit_trace?: Json | null
          block_debug?: Json | null
          canonical?: Json
          classification_confidence?: number | null
          company_id?: string
          confidence?: number
          confidence_level?: string | null
          created_at?: string
          duplicate_of?: string[] | null
          id?: string
          import_id?: string
          origin_lines?: Json | null
          original_snapshot?: Json
          possible_duplicate?: boolean | null
          processing_metadata?: Json
          protected_fields?: string[]
          reason?: string | null
          resolved_client_id?: string | null
          resolved_service_id?: string | null
          row_index?: number
          rule_applied?: string | null
          status?: string
          suggestions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "v3_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "birthday_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "top_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "vip_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_resolved_service_id_fkey"
            columns: ["resolved_service_id"]
            isOneToOne: false
            referencedRelation: "service_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_resolved_service_id_fkey"
            columns: ["resolved_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_imports: {
        Row: {
          administrative_lines_discarded: number | null
          ambiguous_rows: number | null
          audit_summary: Json | null
          audit_version: string | null
          balance_delta: number | null
          balance_lines_captured: number | null
          balance_valid: boolean | null
          blocks_appended: number | null
          blocks_created: number | null
          blocks_crossing_pages: number | null
          blocks_marked_ambiguous: number | null
          charset: string | null
          company_id: string
          created_at: string
          created_by: string | null
          dates_explicit: number | null
          dates_inherited: number | null
          dates_missing: number | null
          expense_count: number | null
          failed_rows: number | null
          file_hash: string | null
          filename: string
          final_state: string | null
          finished_at: string | null
          footer_lines_discarded: number | null
          homologation_status: string | null
          id: string
          income_count: number | null
          institutional_lines_discarded: number | null
          last_error: string | null
          layout_equivalence_failures: number | null
          lines_into_finalize: number | null
          lines_out_finalize: number | null
          metadata_lines_discarded: number | null
          ntieb_version: string | null
          ocr_confidence: number | null
          pages_extracted: number | null
          pages_reusing_previous_layout: number | null
          pages_with_adjusted_layout: number | null
          pages_with_detected_header: number | null
          pages_with_unresolved_layout: number | null
          parser_version: string | null
          physical_lines_extracted: number | null
          possible_mega_blocks: number | null
          processing_ms: number | null
          repeated_headers_removed: number | null
          review_rows: number | null
          rows_approved: number | null
          rows_failed: number | null
          rows_gate_failed: number | null
          rows_gate_passed: number | null
          rows_persisted: number | null
          rows_review: number | null
          saldo_final: number | null
          saldo_inicial: number | null
          size_bytes: number
          source: string
          status: string
          storage_path: string
          summary_lines_captured: number | null
          temporal_conflicts: number | null
          total_entradas_extrato: number | null
          total_lines_captured: number | null
          total_rows: number | null
          total_saidas_extrato: number | null
          transaction_candidate_rows: number | null
          updated_at: string
          very_low_confidence_count: number | null
        }
        Insert: {
          administrative_lines_discarded?: number | null
          ambiguous_rows?: number | null
          audit_summary?: Json | null
          audit_version?: string | null
          balance_delta?: number | null
          balance_lines_captured?: number | null
          balance_valid?: boolean | null
          blocks_appended?: number | null
          blocks_created?: number | null
          blocks_crossing_pages?: number | null
          blocks_marked_ambiguous?: number | null
          charset?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          dates_explicit?: number | null
          dates_inherited?: number | null
          dates_missing?: number | null
          expense_count?: number | null
          failed_rows?: number | null
          file_hash?: string | null
          filename: string
          final_state?: string | null
          finished_at?: string | null
          footer_lines_discarded?: number | null
          homologation_status?: string | null
          id?: string
          income_count?: number | null
          institutional_lines_discarded?: number | null
          last_error?: string | null
          layout_equivalence_failures?: number | null
          lines_into_finalize?: number | null
          lines_out_finalize?: number | null
          metadata_lines_discarded?: number | null
          ntieb_version?: string | null
          ocr_confidence?: number | null
          pages_extracted?: number | null
          pages_reusing_previous_layout?: number | null
          pages_with_adjusted_layout?: number | null
          pages_with_detected_header?: number | null
          pages_with_unresolved_layout?: number | null
          parser_version?: string | null
          physical_lines_extracted?: number | null
          possible_mega_blocks?: number | null
          processing_ms?: number | null
          repeated_headers_removed?: number | null
          review_rows?: number | null
          rows_approved?: number | null
          rows_failed?: number | null
          rows_gate_failed?: number | null
          rows_gate_passed?: number | null
          rows_persisted?: number | null
          rows_review?: number | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          size_bytes?: number
          source: string
          status?: string
          storage_path: string
          summary_lines_captured?: number | null
          temporal_conflicts?: number | null
          total_entradas_extrato?: number | null
          total_lines_captured?: number | null
          total_rows?: number | null
          total_saidas_extrato?: number | null
          transaction_candidate_rows?: number | null
          updated_at?: string
          very_low_confidence_count?: number | null
        }
        Update: {
          administrative_lines_discarded?: number | null
          ambiguous_rows?: number | null
          audit_summary?: Json | null
          audit_version?: string | null
          balance_delta?: number | null
          balance_lines_captured?: number | null
          balance_valid?: boolean | null
          blocks_appended?: number | null
          blocks_created?: number | null
          blocks_crossing_pages?: number | null
          blocks_marked_ambiguous?: number | null
          charset?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          dates_explicit?: number | null
          dates_inherited?: number | null
          dates_missing?: number | null
          expense_count?: number | null
          failed_rows?: number | null
          file_hash?: string | null
          filename?: string
          final_state?: string | null
          finished_at?: string | null
          footer_lines_discarded?: number | null
          homologation_status?: string | null
          id?: string
          income_count?: number | null
          institutional_lines_discarded?: number | null
          last_error?: string | null
          layout_equivalence_failures?: number | null
          lines_into_finalize?: number | null
          lines_out_finalize?: number | null
          metadata_lines_discarded?: number | null
          ntieb_version?: string | null
          ocr_confidence?: number | null
          pages_extracted?: number | null
          pages_reusing_previous_layout?: number | null
          pages_with_adjusted_layout?: number | null
          pages_with_detected_header?: number | null
          pages_with_unresolved_layout?: number | null
          parser_version?: string | null
          physical_lines_extracted?: number | null
          possible_mega_blocks?: number | null
          processing_ms?: number | null
          repeated_headers_removed?: number | null
          review_rows?: number | null
          rows_approved?: number | null
          rows_failed?: number | null
          rows_gate_failed?: number | null
          rows_gate_passed?: number | null
          rows_persisted?: number | null
          rows_review?: number | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          size_bytes?: number
          source?: string
          status?: string
          storage_path?: string
          summary_lines_captured?: number | null
          temporal_conflicts?: number | null
          total_entradas_extrato?: number | null
          total_lines_captured?: number | null
          total_rows?: number | null
          total_saidas_extrato?: number | null
          transaction_candidate_rows?: number | null
          updated_at?: string
          very_low_confidence_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v3_row_snapshots: {
        Row: {
          company_id: string
          decided_at: string
          id: string
          payload: Json
          reason: string | null
          row_id: string
          stage: string
        }
        Insert: {
          company_id: string
          decided_at?: string
          id?: string
          payload: Json
          reason?: string | null
          row_id: string
          stage: string
        }
        Update: {
          company_id?: string
          decided_at?: string
          id?: string
          payload?: Json
          reason?: string | null
          row_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "v3_row_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_row_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_row_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_row_snapshots_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "v3_import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_row_snapshots_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "v3_row_audit"
            referencedColumns: ["row_id"]
          },
        ]
      }
    }
    Views: {
      birthday_clients: {
        Row: {
          birthday: string | null
          company_id: string | null
          id: string | null
          name: string | null
          phone: string | null
        }
        Insert: {
          birthday?: string | null
          company_id?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
        }
        Update: {
          birthday?: string | null
          company_id?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      dashboard_metrics: {
        Row: {
          company_id: string | null
          expense_month: number | null
          income_month: number | null
          profit: number | null
          total_expense: number | null
          total_income: number | null
        }
        Relationships: []
      }
      recovery_dashboard: {
        Row: {
          at_risk_count: number | null
          avg_days_to_recover: number | null
          avg_recovered_ticket: number | null
          company_id: string | null
          lost_count: number | null
          pending_count: number | null
          potential_revenue: number | null
          recovered_count_month: number | null
          recovered_value_month: number | null
          recovery_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recovery_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "recovery_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      retention_report: {
        Row: {
          company_id: string | null
          conversion_rate: number | null
          converted_returns: number | null
          lost_returns: number | null
          pending_returns: number | null
          potential_revenue: number | null
        }
        Relationships: []
      }
      service_metrics: {
        Row: {
          category: string | null
          color: string | null
          company_id: string | null
          id: string | null
          name: string | null
          price: number | null
          recurrence_ratio: number | null
          return_days: number | null
          total_completed: number | null
          total_revenue: number | null
          unique_clients: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      top_clients: {
        Row: {
          appointments_count: number | null
          company_id: string | null
          id: string | null
          last_visit: string | null
          name: string | null
          phone: string | null
          total_spent: number | null
        }
        Insert: {
          appointments_count?: number | null
          company_id?: string | null
          id?: string | null
          last_visit?: string | null
          name?: string | null
          phone?: string | null
          total_spent?: number | null
        }
        Update: {
          appointments_count?: number | null
          company_id?: string | null
          id?: string | null
          last_visit?: string | null
          name?: string | null
          phone?: string | null
          total_spent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_public_busy_slots: {
        Row: {
          company_id: string | null
          end_datetime: string | null
          professional_id: string | null
          start_datetime: string | null
        }
        Insert: {
          company_id?: string | null
          end_datetime?: string | null
          professional_id?: string | null
          start_datetime?: string | null
        }
        Update: {
          company_id?: string | null
          end_datetime?: string | null
          professional_id?: string | null
          start_datetime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      v3_row_audit: {
        Row: {
          applied_result: Json | null
          audit_trail: Json | null
          canonical: Json | null
          company_id: string | null
          confidence: number | null
          import_id: string | null
          original_snapshot: Json | null
          processing_metadata: Json | null
          row_id: string | null
          row_index: number | null
          snapshots: Json | null
          status: string | null
          suggestions: Json | null
        }
        Insert: {
          applied_result?: Json | null
          audit_trail?: never
          canonical?: Json | null
          company_id?: string | null
          confidence?: number | null
          import_id?: string | null
          original_snapshot?: Json | null
          processing_metadata?: Json | null
          row_id?: string | null
          row_index?: number | null
          snapshots?: never
          status?: string | null
          suggestions?: Json | null
        }
        Update: {
          applied_result?: Json | null
          audit_trail?: never
          canonical?: Json | null
          company_id?: string | null
          confidence?: number | null
          import_id?: string | null
          original_snapshot?: Json | null
          processing_metadata?: Json | null
          row_id?: string | null
          row_index?: number | null
          snapshots?: never
          status?: string | null
          suggestions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "v3_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v3_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "v3_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "v3_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_clients: {
        Row: {
          company_id: string | null
          id: string | null
          name: string | null
          total_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "dashboard_metrics"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "retention_report"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      assign_user_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      calc_recovery_score: { Args: { _client_id: string }; Returns: number }
      claim_next_job: {
        Args: never
        Returns: {
          attempts: number
          company_id: string | null
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          scheduled_at: string
          started_at: string | null
          status: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      classify_return: {
        Args: { _expected: string; _last_visit: string }
        Returns: Database["public"]["Enums"]["return_class"]
      }
      compute_import_confidence: {
        Args: {
          _amount_match: boolean
          _client_found: boolean
          _desc_match: boolean
          _has_history: boolean
          _tenant_pattern: boolean
        }
        Returns: number
      }
      create_online_booking: { Args: { p_data: Json }; Returns: Json }
      enqueue_job: {
        Args: {
          _company_id: string
          _payload?: Json
          _priority?: number
          _scheduled_at?: string
          _type: string
        }
        Returns: string
      }
      find_duplicate_client: {
        Args: {
          _company_id: string
          _name: string
          _phone: string
          _threshold?: number
        }
        Returns: {
          confidence: number
          id: string
          name: string
          phone: string
          reason: string
        }[]
      }
      finish_job: {
        Args: { _error?: string; _id: string; _ok: boolean; _result?: Json }
        Returns: undefined
      }
      get_public_busy_slots: {
        Args: {
          p_company_id: string
          p_from: string
          p_professional_id?: string
          p_to: string
        }
        Returns: {
          end_datetime: string
          professional_id: string
          start_datetime: string
        }[]
      }
      get_user_company: { Args: { _user_id: string }; Returns: string }
      has_any_role: {
        Args: {
          _company_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_feature: {
        Args: { _company_id: string; _feature: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_bookable: { Args: { _company_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      learn_pattern: {
        Args: {
          _company_id: string
          _delta?: number
          _entity_id?: string
          _entity_type?: string
          _label?: string
          _type: Database["public"]["Enums"]["import_pattern_type"]
          _value: string
        }
        Returns: string
      }
      merge_clients: {
        Args: { source_id: string; target_id: string }
        Returns: undefined
      }
      mie_enqueue_from_opportunities: {
        Args: { _company_id: string }
        Returns: number
      }
      mie_render_template: {
        Args: { _body: string; _client_id: string }
        Returns: string
      }
      normalize_name: { Args: { _name: string }; Returns: string }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      predict_offering_from_amount: {
        Args: { _amount: number; _company_id: string }
        Returns: {
          confidence: number
          entity_id: string
          entity_type: string
          label: string
          reason: string
        }[]
      }
      refresh_client_behavior_profile: {
        Args: { _client_id: string }
        Returns: undefined
      }
      refresh_recovery_opportunities: {
        Args: { _company?: string }
        Returns: undefined
      }
      refresh_return_opportunities: { Args: never; Returns: undefined }
      revoke_user_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      slugify: { Args: { _input: string }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "admin" | "employee"
      appointment_source: "ADMIN" | "ONLINE"
      appointment_status:
        | "SCHEDULED"
        | "CONFIRMED"
        | "COMPLETED"
        | "CANCELLED"
        | "NO_SHOW"
        | "BLOCKED"
      business_vertical: "BEAUTY" | "SALES" | "GYM"
      client_status: "ACTIVE" | "INACTIVE" | "LOST"
      company_plan: "starter" | "professional" | "premium"
      contact_channel:
        | "WHATSAPP"
        | "PHONE"
        | "INSTAGRAM"
        | "IN_PERSON"
        | "EMAIL"
      contact_result: "ANSWERED" | "NO_ANSWER" | "SCHEDULED" | "REFUSED"
      import_pattern_type:
        | "amount"
        | "description"
        | "client_name"
        | "pix_key"
        | "bank_description"
        | "service_hint"
        | "product_hint"
        | "plan_hint"
      import_row_status:
        | "pending"
        | "matched"
        | "review"
        | "manual"
        | "applied"
        | "skipped"
        | "failed"
      import_source: "csv" | "xlsx" | "pdf" | "ofx" | "manual_text"
      import_status: "uploaded" | "processing" | "completed" | "failed"
      invitation_status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELED"
      invoice_status: "OPEN" | "PAID" | "PAST_DUE" | "CANCELED" | "REFUNDED"
      message_channel: "WHATSAPP" | "EMAIL" | "SMS"
      message_event_type:
        | "SENT"
        | "DELIVERED"
        | "READ"
        | "REPLIED"
        | "CONVERTED"
        | "FAILED"
      message_queue_status:
        | "PENDING"
        | "READY"
        | "SENT"
        | "SKIPPED"
        | "CONVERTED"
        | "FAILED"
      message_type:
        | "RETURN"
        | "REPURCHASE"
        | "RENEWAL"
        | "REACTIVATION"
        | "COLLECTION"
        | "BIRTHDAY"
        | "FOLLOW_UP"
        | "CUSTOM"
      offering_kind: "SERVICE" | "PRODUCT" | "PLAN"
      recovery_status: "OPEN" | "IN_CONTACT" | "CONVERTED" | "LOST"
      return_class: "ON_TIME" | "ATTENTION" | "LATE" | "AT_RISK" | "LOST"
      return_status: "ON_TIME" | "DUE" | "LATE" | "LOST"
      subscription_status:
        | "TRIAL"
        | "ACTIVE"
        | "PAST_DUE"
        | "CANCELED"
        | "PENDING"
      task_status: "OPEN" | "DONE" | "CANCELED"
      transaction_type: "INCOME" | "EXPENSE"
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
      app_role: ["owner", "admin", "employee"],
      appointment_source: ["ADMIN", "ONLINE"],
      appointment_status: [
        "SCHEDULED",
        "CONFIRMED",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
        "BLOCKED",
      ],
      business_vertical: ["BEAUTY", "SALES", "GYM"],
      client_status: ["ACTIVE", "INACTIVE", "LOST"],
      company_plan: ["starter", "professional", "premium"],
      contact_channel: ["WHATSAPP", "PHONE", "INSTAGRAM", "IN_PERSON", "EMAIL"],
      contact_result: ["ANSWERED", "NO_ANSWER", "SCHEDULED", "REFUSED"],
      import_pattern_type: [
        "amount",
        "description",
        "client_name",
        "pix_key",
        "bank_description",
        "service_hint",
        "product_hint",
        "plan_hint",
      ],
      import_row_status: [
        "pending",
        "matched",
        "review",
        "manual",
        "applied",
        "skipped",
        "failed",
      ],
      import_source: ["csv", "xlsx", "pdf", "ofx", "manual_text"],
      import_status: ["uploaded", "processing", "completed", "failed"],
      invitation_status: ["PENDING", "ACCEPTED", "EXPIRED", "CANCELED"],
      invoice_status: ["OPEN", "PAID", "PAST_DUE", "CANCELED", "REFUNDED"],
      message_channel: ["WHATSAPP", "EMAIL", "SMS"],
      message_event_type: [
        "SENT",
        "DELIVERED",
        "READ",
        "REPLIED",
        "CONVERTED",
        "FAILED",
      ],
      message_queue_status: [
        "PENDING",
        "READY",
        "SENT",
        "SKIPPED",
        "CONVERTED",
        "FAILED",
      ],
      message_type: [
        "RETURN",
        "REPURCHASE",
        "RENEWAL",
        "REACTIVATION",
        "COLLECTION",
        "BIRTHDAY",
        "FOLLOW_UP",
        "CUSTOM",
      ],
      offering_kind: ["SERVICE", "PRODUCT", "PLAN"],
      recovery_status: ["OPEN", "IN_CONTACT", "CONVERTED", "LOST"],
      return_class: ["ON_TIME", "ATTENTION", "LATE", "AT_RISK", "LOST"],
      return_status: ["ON_TIME", "DUE", "LATE", "LOST"],
      subscription_status: [
        "TRIAL",
        "ACTIVE",
        "PAST_DUE",
        "CANCELED",
        "PENDING",
      ],
      task_status: ["OPEN", "DONE", "CANCELED"],
      transaction_type: ["INCOME", "EXPENSE"],
    },
  },
} as const
