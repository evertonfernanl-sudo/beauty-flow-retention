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
      appointments: {
        Row: {
          cancellation_reason: string | null
          client_id: string
          company_id: string
          completed_at: string | null
          created_at: string
          end_datetime: string
          id: string
          notes: string | null
          price: number
          service_id: string
          start_datetime: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          client_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          end_datetime: string
          id?: string
          notes?: string | null
          price?: number
          service_id: string
          start_datetime: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          client_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          end_datetime?: string
          id?: string
          notes?: string | null
          price?: number
          service_id?: string
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
          notes: string | null
          phone: string | null
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
          notes?: string | null
          phone?: string | null
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
          notes?: string | null
          phone?: string | null
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
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          monthly_revenue_goal: number
          name: string
          onboarding_completed: boolean
          phone: string | null
          plan: Database["public"]["Enums"]["company_plan"]
          updated_at: string
          whatsapp_template: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          monthly_revenue_goal?: number
          name: string
          onboarding_completed?: boolean
          phone?: string | null
          plan?: Database["public"]["Enums"]["company_plan"]
          updated_at?: string
          whatsapp_template?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          monthly_revenue_goal?: number
          name?: string
          onboarding_completed?: boolean
          phone?: string | null
          plan?: Database["public"]["Enums"]["company_plan"]
          updated_at?: string
          whatsapp_template?: string | null
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          payment_method: string | null
          transaction_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          transaction_date?: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
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
          category: string | null
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          return_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price?: number
          return_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
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
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
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
      calc_recovery_score: { Args: { _client_id: string }; Returns: number }
      classify_return: {
        Args: { _expected: string; _last_visit: string }
        Returns: Database["public"]["Enums"]["return_class"]
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
      has_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_recovery_opportunities: {
        Args: { _company?: string }
        Returns: undefined
      }
      refresh_return_opportunities: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "owner" | "admin" | "employee"
      appointment_status:
        | "SCHEDULED"
        | "CONFIRMED"
        | "COMPLETED"
        | "CANCELLED"
        | "NO_SHOW"
      client_status: "ACTIVE" | "INACTIVE" | "LOST"
      company_plan: "starter" | "professional" | "premium"
      contact_channel:
        | "WHATSAPP"
        | "PHONE"
        | "INSTAGRAM"
        | "IN_PERSON"
        | "EMAIL"
      contact_result: "ANSWERED" | "NO_ANSWER" | "SCHEDULED" | "REFUSED"
      recovery_status: "OPEN" | "IN_CONTACT" | "CONVERTED" | "LOST"
      return_class: "ON_TIME" | "ATTENTION" | "LATE" | "AT_RISK" | "LOST"
      return_status: "ON_TIME" | "DUE" | "LATE" | "LOST"
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
      appointment_status: [
        "SCHEDULED",
        "CONFIRMED",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
      ],
      client_status: ["ACTIVE", "INACTIVE", "LOST"],
      company_plan: ["starter", "professional", "premium"],
      contact_channel: ["WHATSAPP", "PHONE", "INSTAGRAM", "IN_PERSON", "EMAIL"],
      contact_result: ["ANSWERED", "NO_ANSWER", "SCHEDULED", "REFUSED"],
      recovery_status: ["OPEN", "IN_CONTACT", "CONVERTED", "LOST"],
      return_class: ["ON_TIME", "ATTENTION", "LATE", "AT_RISK", "LOST"],
      return_status: ["ON_TIME", "DUE", "LATE", "LOST"],
      task_status: ["OPEN", "DONE", "CANCELED"],
      transaction_type: ["INCOME", "EXPENSE"],
    },
  },
} as const
