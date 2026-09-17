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
      canonical_documents: {
        Row: {
          buyer: Json
          buyer_gstin: string
          content_hash: string
          created_at: string
          created_by: string | null
          currency: string
          direction: string
          doc_references: Json | null
          document_number: string
          id: string
          issue_date: string
          kind: string
          lines: Json
          notes: string | null
          payment_terms_days: number
          revision: number
          seller: Json
          seller_gstin: string
          source: string
          status: string
          totals: Json
          transport: Json | null
          updated_at: string
        }
        Insert: {
          buyer: Json
          buyer_gstin: string
          content_hash: string
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          doc_references?: Json | null
          document_number: string
          id?: string
          issue_date: string
          kind: string
          lines: Json
          notes?: string | null
          payment_terms_days?: number
          revision?: number
          seller: Json
          seller_gstin: string
          source?: string
          status?: string
          totals?: Json
          transport?: Json | null
          updated_at?: string
        }
        Update: {
          buyer?: Json
          buyer_gstin?: string
          content_hash?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: string
          doc_references?: Json | null
          document_number?: string
          id?: string
          issue_date?: string
          kind?: string
          lines?: Json
          notes?: string | null
          payment_terms_days?: number
          revision?: number
          seller?: Json
          seller_gstin?: string
          source?: string
          status?: string
          totals?: Json
          transport?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      document_revisions: {
        Row: {
          accepted: boolean
          author_gstin: string
          body: Json
          content_hash: string
          created_at: string
          document_id: string
          id: string
          origin: string
          prev_hash: string | null
          revision: number
        }
        Insert: {
          accepted?: boolean
          author_gstin: string
          body: Json
          content_hash: string
          created_at?: string
          document_id: string
          id?: string
          origin?: string
          prev_hash?: string | null
          revision: number
        }
        Update: {
          accepted?: boolean
          author_gstin?: string
          body?: Json
          content_hash?: string
          created_at?: string
          document_id?: string
          id?: string
          origin?: string
          prev_hash?: string | null
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      envelopes: {
        Row: {
          action: string
          attempts: number
          body_hash: string
          created_at: string
          dead_lettered: boolean
          direction: string
          document_id: string
          from_gstin: string
          id: string
          idempotency_key: string
          last_error: string | null
          signature: string
          signer_key_id: string
          status: string
          to_gstin: string
          transitions: Json
        }
        Insert: {
          action: string
          attempts?: number
          body_hash: string
          created_at?: string
          dead_lettered?: boolean
          direction: string
          document_id: string
          from_gstin: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          signature: string
          signer_key_id: string
          status?: string
          to_gstin: string
          transitions?: Json
        }
        Update: {
          action?: string
          attempts?: number
          body_hash?: string
          created_at?: string
          dead_lettered?: boolean
          direction?: string
          document_id?: string
          from_gstin?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          signature?: string
          signer_key_id?: string
          status?: string
          to_gstin?: string
          transitions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "envelopes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_disputes: {
        Row: {
          created_at: string
          element_id: string
          id: string
          raised_by: string
          reason: string
        }
        Insert: {
          created_at?: string
          element_id: string
          id?: string
          raised_by: string
          reason: string
        }
        Update: {
          created_at?: string
          element_id?: string
          id?: string
          raised_by?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_disputes_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "ledger_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_elements: {
        Row: {
          buyer_gstin: string
          chain_hash: string
          created_at: string
          credit: Json
          debit: Json
          dispute: Json | null
          document_id: string
          document_kind: string
          event_hash: string
          id: string
          narrative: string
          prev_hash: string
          seller_gstin: string
          sequence: number
          signatures: Json
          status: string
          tax: Json
        }
        Insert: {
          buyer_gstin: string
          chain_hash: string
          created_at?: string
          credit: Json
          debit: Json
          dispute?: Json | null
          document_id: string
          document_kind: string
          event_hash: string
          id?: string
          narrative: string
          prev_hash?: string
          seller_gstin: string
          sequence?: number
          signatures?: Json
          status?: string
          tax?: Json
        }
        Update: {
          buyer_gstin?: string
          chain_hash?: string
          created_at?: string
          credit?: Json
          debit?: Json
          dispute?: Json | null
          document_id?: string
          document_kind?: string
          event_hash?: string
          id?: string
          narrative?: string
          prev_hash?: string
          seller_gstin?: string
          sequence?: number
          signatures?: Json
          status?: string
          tax?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ledger_elements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_signatures: {
        Row: {
          created_at: string
          element_id: string
          gstin: string
          id: string
          key_id: string
          signature: string
        }
        Insert: {
          created_at?: string
          element_id: string
          gstin: string
          id?: string
          key_id: string
          signature: string
        }
        Update: {
          created_at?: string
          element_id?: string
          gstin?: string
          id?: string
          key_id?: string
          signature?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_signatures_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "ledger_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_private_keys: {
        Row: {
          active: boolean
          created_at: string
          gstin: string
          key_id: string
          private_key_jwk: Json
        }
        Insert: {
          active?: boolean
          created_at?: string
          gstin: string
          key_id: string
          private_key_jwk: Json
        }
        Update: {
          active?: boolean
          created_at?: string
          gstin?: string
          key_id?: string
          private_key_jwk?: Json
        }
        Relationships: [
          {
            foreignKeyName: "participant_private_keys_gstin_fkey"
            columns: ["gstin"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["gstin"]
          },
        ]
      }
      participants: {
        Row: {
          address: string
          city: string
          created_at: string
          email: string | null
          endpoint: string
          gstin: string
          key_id: string | null
          legal_name: string
          phone: string | null
          pincode: string
          profiles: string[]
          public_key_jwk: Json | null
          rotated_keys: Json
          state_code: string
          status: string
          trade_name: string | null
          user_id: string
        }
        Insert: {
          address?: string
          city?: string
          created_at?: string
          email?: string | null
          endpoint?: string
          gstin: string
          key_id?: string | null
          legal_name: string
          phone?: string | null
          pincode?: string
          profiles?: string[]
          public_key_jwk?: Json | null
          rotated_keys?: Json
          state_code: string
          status?: string
          trade_name?: string | null
          user_id: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          email?: string | null
          endpoint?: string
          gstin?: string
          key_id?: string | null
          legal_name?: string
          phone?: string | null
          pincode?: string
          profiles?: string[]
          public_key_jwk?: Json | null
          rotated_keys?: Json
          state_code?: string
          status?: string
          trade_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profile_submissions: {
        Row: {
          adapter: string
          created_at: string
          document_id: string
          id: string
          payload: Json | null
          profile: string
          reference_number: string | null
          response: Json | null
          status: string
        }
        Insert: {
          adapter?: string
          created_at?: string
          document_id: string
          id?: string
          payload?: Json | null
          profile: string
          reference_number?: string | null
          response?: Json | null
          status?: string
        }
        Update: {
          adapter?: string
          created_at?: string
          document_id?: string
          id?: string
          payload?: Json | null
          profile?: string
          reference_number?: string | null
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_submissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "canonical_documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_my_gstin: { Args: { _gstin: string }; Returns: boolean }
      ledger_chain_head: { Args: { _gstin: string }; Returns: string }
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
    Enums: {},
  },
} as const
