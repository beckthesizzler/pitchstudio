export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** Generated from the live PitchStudio database on 14 Nov 2026 (Supabase generate_typescript_types, trimmed to the Database type). */
export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      analyses: {
        Row: { created_at: string; data: Json; id: string; title: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; data?: Json; id?: string; title?: string; updated_at?: string; user_id?: string }
        Update: { created_at?: string; data?: Json; id?: string; title?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      board_events: {
        Row: { board_id: string | null; created_at: string | null; event_type: string | null; id: string; user_id: string | null }
        Insert: { board_id?: string | null; created_at?: string | null; event_type?: string | null; id?: string; user_id?: string | null }
        Update: { board_id?: string | null; created_at?: string | null; event_type?: string | null; id?: string; user_id?: string | null }
        Relationships: []
      }
      boards: {
        Row: { canvas_data: Json; club_tags: string[] | null; created_at: string | null; export_count: number | null; formation_tag: string | null; id: string; is_public: boolean | null; narrative: string | null; thumbnail_url: string | null; title: string | null; updated_at: string | null; user_id: string; view_count: number | null }
        Insert: { canvas_data: Json; club_tags?: string[] | null; created_at?: string | null; export_count?: number | null; formation_tag?: string | null; id?: string; is_public?: boolean | null; narrative?: string | null; thumbnail_url?: string | null; title?: string | null; updated_at?: string | null; user_id: string; view_count?: number | null }
        Update: { canvas_data?: Json; club_tags?: string[] | null; created_at?: string | null; export_count?: number | null; formation_tag?: string | null; id?: string; is_public?: boolean | null; narrative?: string | null; thumbnail_url?: string | null; title?: string | null; updated_at?: string | null; user_id?: string; view_count?: number | null }
        Relationships: []
      }
      kv_store_8a7545db: {
        Row: { key: string; value: Json }
        Insert: { key: string; value: Json }
        Update: { key?: string; value?: Json }
        Relationships: []
      }
      library_folders: {
        Row: { created_at: string; id: string; name: string; parent_id: string | null; user_id: string }
        Insert: { created_at?: string; id?: string; name: string; parent_id?: string | null; user_id?: string }
        Update: { created_at?: string; id?: string; name?: string; parent_id?: string | null; user_id?: string }
        Relationships: []
      }
      library_shots: {
        Row: { created_at: string; dim: number; folder_id: string | null; h: number; id: string; items: Json; path: string; title: string; user_id: string; w: number }
        Insert: { created_at?: string; dim?: number; folder_id?: string | null; h: number; id?: string; items?: Json; path: string; title?: string; user_id?: string; w: number }
        Update: { created_at?: string; dim?: number; folder_id?: string | null; h?: number; id?: string; items?: Json; path?: string; title?: string; user_id?: string; w?: number }
        Relationships: []
      }
      notes: {
        Row: { body: Json; color: string; created_at: string; id: string; kind: string; parent_id: string | null; pos: number; title: string; updated_at: string; user_id: string }
        Insert: { body?: Json; color?: string; created_at?: string; id: string; kind?: string; parent_id?: string | null; pos?: number; title?: string; updated_at?: string; user_id?: string }
        Update: { body?: Json; color?: string; created_at?: string; id?: string; kind?: string; parent_id?: string | null; pos?: number; title?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      profiles: {
        Row: { accent_color: string | null; bio: string | null; brand: Json | null; country: string | null; created_at: string | null; display_name: string | null; favorite_club: string | null; favorite_player: string | null; handle: string; id: string; identity: string | null; issue_count: number; shelf: Json }
        Insert: { accent_color?: string | null; bio?: string | null; brand?: Json | null; country?: string | null; created_at?: string | null; display_name?: string | null; favorite_club?: string | null; favorite_player?: string | null; handle: string; id: string; identity?: string | null; issue_count?: number; shelf?: Json }
        Update: { accent_color?: string | null; bio?: string | null; brand?: Json | null; country?: string | null; created_at?: string | null; display_name?: string | null; favorite_club?: string | null; favorite_player?: string | null; handle?: string; id?: string; identity?: string | null; issue_count?: number; shelf?: Json }
        Relationships: []
      }
      reports: {
        Row: { created_at: string; data: Json; id: string; rev: number; title: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; data: Json; id: string; rev?: number; title?: string; updated_at?: string; user_id?: string }
        Update: { created_at?: string; data?: Json; id?: string; rev?: number; title?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      delete_my_account: { Args: never; Returns: undefined }
      handle_available: { Args: { candidate: string }; Returns: boolean }
      take_issue_number: { Args: { seed?: number }; Returns: number }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
