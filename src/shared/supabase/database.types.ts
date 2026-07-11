export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_metadata: {
        Row: {
          difficulty: string | null
          estimated_read_min: number | null
          field_name: string | null
          owner_id: string
          post_id: string
        }
        Insert: {
          difficulty?: string | null
          estimated_read_min?: number | null
          field_name?: string | null
          owner_id: string
          post_id: string
        }
        Update: {
          difficulty?: string | null
          estimated_read_min?: number | null
          field_name?: string | null
          owner_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_metadata_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      categories: {
        Row: {
          code: string
          content_group: string
          created_at: string
          display_id_pattern: string | null
          enabled: boolean
          id: string
          name: string
          slug_pattern: string
          sort_order: number
          updated_at: string
          wrapper_class: string
        }
        Insert: {
          code: string
          content_group: string
          created_at?: string
          display_id_pattern?: string | null
          enabled?: boolean
          id: string
          name: string
          slug_pattern: string
          sort_order: number
          updated_at?: string
          wrapper_class: string
        }
        Update: {
          code?: string
          content_group?: string
          created_at?: string
          display_id_pattern?: string | null
          enabled?: boolean
          id?: string
          name?: string
          slug_pattern?: string
          sort_order?: number
          updated_at?: string
          wrapper_class?: string
        }
        Relationships: []
      }
      chinese_metadata: {
        Row: {
          difficulty: string | null
          episode_list_included: boolean | null
          learning_points: string | null
          learning_topic: string
          original_published_at: string | null
          original_title: string
          original_url: string
          owner_id: string
          post_id: string
          program_name: string
          verified_core_fact: string
        }
        Insert: {
          difficulty?: string | null
          episode_list_included?: boolean | null
          learning_points?: string | null
          learning_topic: string
          original_published_at?: string | null
          original_title: string
          original_url: string
          owner_id: string
          post_id: string
          program_name: string
          verified_core_fact: string
        }
        Update: {
          difficulty?: string | null
          episode_list_included?: boolean | null
          learning_points?: string | null
          learning_topic?: string
          original_published_at?: string | null
          original_title?: string
          original_url?: string
          owner_id?: string
          post_id?: string
          program_name?: string
          verified_core_fact?: string
        }
        Relationships: [
          {
            foreignKeyName: "chinese_metadata_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      generated_prompts: {
        Row: {
          actual_post_count: number
          category_id: string
          generated_at: string
          id: string
          is_pinned: boolean
          owner_id: string
          prompt_mode: string
          prompt_text: string
          requested_post_count: number
        }
        Insert: {
          actual_post_count: number
          category_id: string
          generated_at?: string
          id?: string
          is_pinned?: boolean
          owner_id: string
          prompt_mode?: string
          prompt_text: string
          requested_post_count: number
        }
        Update: {
          actual_post_count?: number
          category_id?: string
          generated_at?: string
          id?: string
          is_pinned?: boolean
          owner_id?: string
          prompt_mode?: string
          prompt_text?: string
          requested_post_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_prompts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      info_db_metadata: {
        Row: {
          difficulty: string | null
          estimated_read_min: number | null
          field_name: string | null
          owner_id: string
          post_id: string
          reference_date: string | null
        }
        Insert: {
          difficulty?: string | null
          estimated_read_min?: number | null
          field_name?: string | null
          owner_id: string
          post_id: string
          reference_date?: string | null
        }
        Update: {
          difficulty?: string | null
          estimated_read_min?: number | null
          field_name?: string | null
          owner_id?: string
          post_id?: string
          reference_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "info_db_metadata_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      news_followups: {
        Row: {
          check_text: string
          created_at: string
          due_date: string | null
          id: string
          owner_id: string
          priority: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          check_text: string
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          check_text?: string
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_followups_topic_owner_fkey"
            columns: ["topic_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "news_topics"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      news_status_history: {
        Row: {
          changed_at: string
          from_status: string | null
          id: string
          owner_id: string
          reason: string | null
          to_status: string
          topic_id: string
        }
        Insert: {
          changed_at?: string
          from_status?: string | null
          id?: string
          owner_id: string
          reason?: string | null
          to_status: string
          topic_id: string
        }
        Update: {
          changed_at?: string
          from_status?: string | null
          id?: string
          owner_id?: string
          reason?: string | null
          to_status?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_status_history_topic_owner_fkey"
            columns: ["topic_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "news_topics"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      news_topics: {
        Row: {
          canonical_title: string
          category_id: string
          closed_reason: string | null
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          owner_id: string
          status: string
          topic_key: string
          topic_summary: string | null
          updated_at: string
        }
        Insert: {
          canonical_title: string
          category_id: string
          closed_reason?: string | null
          created_at?: string
          first_seen_at: string
          id?: string
          last_seen_at: string
          owner_id: string
          status?: string
          topic_key: string
          topic_summary?: string | null
          updated_at?: string
        }
        Update: {
          canonical_title?: string
          category_id?: string
          closed_reason?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          owner_id?: string
          status?: string
          topic_key?: string
          topic_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      news_updates: {
        Row: {
          change_summary: string | null
          created_at: string
          fact_summary: string
          headline: string
          id: string
          impact_summary: string | null
          importance_summary: string | null
          item_order: number
          owner_id: string
          post_id: string
          previous_update_id: string | null
          topic_id: string
          update_type: string
          updated_at: string
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          fact_summary: string
          headline: string
          id?: string
          impact_summary?: string | null
          importance_summary?: string | null
          item_order: number
          owner_id: string
          post_id: string
          previous_update_id?: string | null
          topic_id: string
          update_type: string
          updated_at?: string
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          fact_summary?: string
          headline?: string
          id?: string
          impact_summary?: string | null
          importance_summary?: string | null
          item_order?: number
          owner_id?: string
          post_id?: string
          previous_update_id?: string | null
          topic_id?: string
          update_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_updates_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "news_updates_previous_owner_fkey"
            columns: ["previous_update_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "news_updates"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "news_updates_topic_owner_fkey"
            columns: ["topic_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "news_topics"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      post_tags: {
        Row: {
          owner_id: string
          post_id: string
          tag_id: string
        }
        Insert: {
          owner_id: string
          post_id: string
          tag_id: string
        }
        Update: {
          owner_id?: string
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "post_tags_tag_owner_fkey"
            columns: ["tag_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      posts: {
        Row: {
          briefing_date: string | null
          category_id: string
          content_status: string
          created_at: string
          display_id: string | null
          html_body: string | null
          id: string
          image_alt: string | null
          image_prompt: string | null
          image_prompt_updated_at: string | null
          image_prompt_version: number
          owner_id: string
          published_at: string | null
          published_on: string | null
          series_no: number | null
          slug: string
          source_import_type: string
          summary: string
          title: string
          updated_at: string
          wordpress_url: string | null
        }
        Insert: {
          briefing_date?: string | null
          category_id: string
          content_status?: string
          created_at?: string
          display_id?: string | null
          html_body?: string | null
          id?: string
          image_alt?: string | null
          image_prompt?: string | null
          image_prompt_updated_at?: string | null
          image_prompt_version?: number
          owner_id: string
          published_at?: string | null
          published_on?: string | null
          series_no?: number | null
          slug: string
          source_import_type: string
          summary: string
          title: string
          updated_at?: string
          wordpress_url?: string | null
        }
        Update: {
          briefing_date?: string | null
          category_id?: string
          content_status?: string
          created_at?: string
          display_id?: string | null
          html_body?: string | null
          id?: string
          image_alt?: string | null
          image_prompt?: string | null
          image_prompt_updated_at?: string | null
          image_prompt_version?: number
          owner_id?: string
          published_at?: string | null
          published_on?: string | null
          series_no?: number | null
          slug?: string
          source_import_type?: string
          summary?: string
          title?: string
          updated_at?: string
          wordpress_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_data: {
        Row: {
          alternative_titles: Json
          created_at: string
          focus_keyword: string | null
          meta_description: string
          owner_id: string
          post_id: string
          representative_title: string | null
          updated_at: string
        }
        Insert: {
          alternative_titles?: Json
          created_at?: string
          focus_keyword?: string | null
          meta_description: string
          owner_id: string
          post_id: string
          representative_title?: string | null
          updated_at?: string
        }
        Update: {
          alternative_titles?: Json
          created_at?: string
          focus_keyword?: string | null
          meta_description?: string
          owner_id?: string
          post_id?: string
          representative_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_data_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      series_counters: {
        Row: {
          category_id: string
          last_issued_no: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          last_issued_no?: number
          owner_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          last_issued_no?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_counters_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          checked_at: string | null
          checked_point: string
          created_at: string
          id: string
          news_update_id: string | null
          owner_id: string
          post_id: string
          sort_order: number
          source_name: string
          source_published_at: string | null
          source_title: string
          source_url: string
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          checked_point: string
          created_at?: string
          id?: string
          news_update_id?: string | null
          owner_id: string
          post_id: string
          sort_order?: number
          source_name: string
          source_published_at?: string | null
          source_title: string
          source_url: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          checked_point?: string
          created_at?: string
          id?: string
          news_update_id?: string | null
          owner_id?: string
          post_id?: string
          sort_order?: number
          source_name?: string
          source_published_at?: string | null
          source_title?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_news_update_owner_fkey"
            columns: ["news_update_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "news_updates"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "sources_post_owner_fkey"
            columns: ["post_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      issue_series_no: {
        Args: { p_category_id: string; p_owner_id: string }
        Returns: number
      }
      save_generated_prompt: {
        Args: {
          p_actual_post_count: number
          p_category_id: string
          p_is_pinned?: boolean
          p_owner_id: string
          p_prompt_mode: string
          p_prompt_text: string
          p_requested_post_count: number
        }
        Returns: {
          actual_post_count: number
          category_id: string
          generated_at: string
          id: string
          is_pinned: boolean
          owner_id: string
          prompt_mode: string
          prompt_text: string
          requested_post_count: number
        }
        SetofOptions: {
          from: "*"
          to: "generated_prompts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_post_editor: {
        Args: {
          p_alternative_titles: string[]
          p_content_status: string
          p_focus_keyword: string
          p_html_body: string | null
          p_image_alt: string | null
          p_image_prompt: string | null
          p_meta_description: string
          p_post_id: string
          p_published_on: string | null
          p_representative_title: string
          p_slug: string
          p_summary: string
          p_title: string
          p_wordpress_url: string | null
        }
        Returns: {
          briefing_date: string | null
          category_id: string
          content_status: string
          created_at: string
          display_id: string | null
          html_body: string | null
          id: string
          image_alt: string | null
          image_prompt: string | null
          image_prompt_updated_at: string | null
          image_prompt_version: number
          owner_id: string
          published_at: string | null
          published_on: string | null
          series_no: number | null
          slug: string
          source_import_type: string
          summary: string
          title: string
          updated_at: string
          wordpress_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
