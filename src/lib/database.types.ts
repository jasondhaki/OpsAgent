export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          ok: boolean
          org_id: string | null
          output_tokens: number | null
          prompt_version: string | null
          provider: string
          step: string
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          ok: boolean
          org_id?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          provider: string
          step: string
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          ok?: boolean
          org_id?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          provider?: string
          step?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_blocked: boolean
          org_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          is_blocked?: boolean
          org_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_blocked?: boolean
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          author: string
          body: string
          citations: Json
          created_at: string
          created_by: string | null
          groundedness: Json | null
          id: string
          language: string | null
          org_id: string
          ticket_id: string
          validator: Json | null
          version: number
        }
        Insert: {
          author: string
          body: string
          citations?: Json
          created_at?: string
          created_by?: string | null
          groundedness?: Json | null
          id?: string
          language?: string | null
          org_id: string
          ticket_id: string
          validator?: Json | null
          version: number
        }
        Update: {
          author?: string
          body?: string
          citations?: Json
          created_at?: string
          created_by?: string | null
          groundedness?: Json | null
          id?: string
          language?: string | null
          org_id?: string
          ticket_id?: string
          validator?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          org_id: string | null
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          org_id?: string | null
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          org_id?: string | null
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          embedding_model: string
          id: string
          org_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          embedding_model: string
          id?: string
          org_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          embedding_model?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_documents: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          kind: string
          language: string
          org_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind: string
          language?: string
          org_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          language?: string
          org_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body_redacted: string | null
          body_text: string
          created_at: string
          direction: Database["public"]["Enums"]["msg_direction"]
          external_message_id: string | null
          from_address: string | null
          headers: Json
          id: string
          org_id: string
          provider_message_id: string | null
          ticket_id: string
        }
        Insert: {
          body_redacted?: string | null
          body_text: string
          created_at?: string
          direction: Database["public"]["Enums"]["msg_direction"]
          external_message_id?: string | null
          from_address?: string | null
          headers?: Json
          id?: string
          org_id: string
          provider_message_id?: string | null
          ticket_id: string
        }
        Update: {
          body_redacted?: string | null
          body_text?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["msg_direction"]
          external_message_id?: string | null
          from_address?: string | null
          headers?: Json
          id?: string
          org_id?: string
          provider_message_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          settings?: Json
          slug?: string
        }
        Relationships: []
      }
      outbox: {
        Row: {
          attempts: number
          body: string
          claimed_until: string | null
          created_at: string
          draft_id: string
          id: string
          last_error: string | null
          org_id: string
          reply_to_provider_message_id: string | null
          sent_at: string | null
          sent_ref: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          subject: string | null
          ticket_id: string
          to_address: string
        }
        Insert: {
          attempts?: number
          body: string
          claimed_until?: string | null
          created_at?: string
          draft_id: string
          id?: string
          last_error?: string | null
          org_id: string
          reply_to_provider_message_id?: string | null
          sent_at?: string | null
          sent_ref?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          subject?: string | null
          ticket_id: string
          to_address: string
        }
        Update: {
          attempts?: number
          body?: string
          claimed_until?: string | null
          created_at?: string
          draft_id?: string
          id?: string
          last_error?: string | null
          org_id?: string
          reply_to_provider_message_id?: string | null
          sent_at?: string | null
          sent_ref?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          subject?: string | null
          ticket_id?: string
          to_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      products_cache: {
        Row: {
          attributes: Json
          currency: string
          external_id: string
          id: string
          in_stock: boolean | null
          name: string
          org_id: string
          price_minor: number | null
          synced_at: string
          url: string | null
        }
        Insert: {
          attributes?: Json
          currency?: string
          external_id: string
          id?: string
          in_stock?: boolean | null
          name: string
          org_id: string
          price_minor?: number | null
          synced_at?: string
          url?: string | null
        }
        Update: {
          attributes?: Json
          currency?: string
          external_id?: string
          id?: string
          in_stock?: boolean | null
          name?: string
          org_id?: string
          price_minor?: number | null
          synced_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_cache_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_usage: {
        Row: {
          cooldown_until: string | null
          day: string
          model: string
          provider: string
          requests: number
        }
        Insert: {
          cooldown_until?: string | null
          day: string
          model: string
          provider: string
          requests?: number
        }
        Update: {
          cooldown_until?: string | null
          day?: string
          model?: string
          provider?: string
          requests?: number
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      ticket_events: {
        Row: {
          actor: string
          created_at: string
          data: Json
          id: number
          org_id: string
          ticket_id: string
          type: string
        }
        Insert: {
          actor: string
          created_at?: string
          data?: Json
          id?: never
          org_id: string
          ticket_id: string
          type: string
        }
        Update: {
          actor?: string
          created_at?: string
          data?: Json
          id?: never
          org_id?: string
          ticket_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          channel: Database["public"]["Enums"]["channel"]
          classification: Json | null
          created_at: string
          customer_id: string | null
          external_thread_id: string | null
          gate: Json | null
          id: string
          intent: Database["public"]["Enums"]["ticket_intent"] | null
          language: string | null
          last_message_at: string
          lead: Json | null
          org_id: string
          pipeline_step: string | null
          requires_human: boolean
          risk_flags: string[]
          sentiment: Database["public"]["Enums"]["sentiment_level"] | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string | null
          updated_at: string
          urgency: Database["public"]["Enums"]["urgency_level"] | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel"]
          classification?: Json | null
          created_at?: string
          customer_id?: string | null
          external_thread_id?: string | null
          gate?: Json | null
          id?: string
          intent?: Database["public"]["Enums"]["ticket_intent"] | null
          language?: string | null
          last_message_at?: string
          lead?: Json | null
          org_id: string
          pipeline_step?: string | null
          requires_human?: boolean
          risk_flags?: string[]
          sentiment?: Database["public"]["Enums"]["sentiment_level"] | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency_level"] | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel"]
          classification?: Json | null
          created_at?: string
          customer_id?: string | null
          external_thread_id?: string | null
          gate?: Json | null
          id?: string
          intent?: Database["public"]["Enums"]["ticket_intent"] | null
          language?: string | null
          last_message_at?: string
          lead?: Json | null
          org_id?: string
          pipeline_step?: string | null
          requires_human?: boolean
          risk_flags?: string[]
          sentiment?: Database["public"]["Enums"]["sentiment_level"] | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: { p_lease_seconds: number; p_limit: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          org_id: string | null
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      increment_provider_usage: {
        Args: { p_model: string; p_provider: string }
        Returns: number
      }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      match_kb_chunks: {
        Args: { p_match_count?: number; p_org_id: string; p_query: string }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          kind: string
          similarity: number
          title: string
        }[]
      }
    }
    Enums: {
      channel: "email" | "simulator" | "web_chat"
      job_status: "queued" | "running" | "done" | "failed" | "dead"
      member_role: "owner" | "reviewer" | "viewer"
      msg_direction: "inbound" | "outbound"
      outbox_status: "queued" | "claimed" | "sent" | "failed" | "cancelled"
      sentiment_level: "positive" | "neutral" | "negative" | "hostile"
      ticket_intent:
        | "product_question"
        | "shipping_payment"
        | "order_status"
        | "custom_bulk_order"
        | "complaint_return"
        | "payment_issue"
        | "other"
        | "spam"
      ticket_status:
        | "received"
        | "processing"
        | "needs_review"
        | "approved"
        | "sent"
        | "rejected"
        | "closed"
        | "error"
      urgency_level: "low" | "medium" | "high"
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
      channel: ["email", "simulator", "web_chat"],
      job_status: ["queued", "running", "done", "failed", "dead"],
      member_role: ["owner", "reviewer", "viewer"],
      msg_direction: ["inbound", "outbound"],
      outbox_status: ["queued", "claimed", "sent", "failed", "cancelled"],
      sentiment_level: ["positive", "neutral", "negative", "hostile"],
      ticket_intent: [
        "product_question",
        "shipping_payment",
        "order_status",
        "custom_bulk_order",
        "complaint_return",
        "payment_issue",
        "other",
        "spam",
      ],
      ticket_status: [
        "received",
        "processing",
        "needs_review",
        "approved",
        "sent",
        "rejected",
        "closed",
        "error",
      ],
      urgency_level: ["low", "medium", "high"],
    },
  },
} as const

