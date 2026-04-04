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
      catches: {
        Row: {
          caught_at: string
          created_at: string
          id: string
          is_demo: boolean
          length_in: number | null
          lure_or_bait: string | null
          notes: string | null
          photo_url: string | null
          quantity: number
          species: string
          trip_id: string
          user_id: string
          weight_oz: number | null
        }
        Insert: {
          caught_at?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          length_in?: number | null
          lure_or_bait?: string | null
          notes?: string | null
          photo_url?: string | null
          quantity?: number
          species: string
          trip_id: string
          user_id: string
          weight_oz?: number | null
        }
        Update: {
          caught_at?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          length_in?: number | null
          lure_or_bait?: string | null
          notes?: string | null
          photo_url?: string | null
          quantity?: number
          species?: string
          trip_id?: string
          user_id?: string
          weight_oz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "fishing_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fishing_trips: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          is_demo: boolean
          latitude: number | null
          location_name: string | null
          longitude: number | null
          notes: string | null
          spot_id: string | null
          started_at: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
          water_flow_snapshot: Json | null
          weather_snapshot: Json | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          notes?: string | null
          spot_id?: string | null
          started_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          water_flow_snapshot?: Json | null
          weather_snapshot?: Json | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          notes?: string | null
          spot_id?: string | null
          started_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          water_flow_snapshot?: Json | null
          weather_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fishing_trips_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
      gear: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          demo_session_id: string | null
          display_name: string | null
          favorite_species: string[] | null
          home_state: string | null
          home_water: string | null
          id: string
          is_demo: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          demo_session_id?: string | null
          display_name?: string | null
          favorite_species?: string[] | null
          home_state?: string | null
          home_water?: string | null
          id?: string
          is_demo?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          demo_session_id?: string | null
          display_name?: string | null
          favorite_species?: string[] | null
          home_state?: string | null
          home_water?: string | null
          id?: string
          is_demo?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spot_points: {
        Row: {
          created_at: string
          id: string
          label: string
          latitude: number
          longitude: number
          spot_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          latitude: number
          longitude: number
          spot_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          latitude?: number
          longitude?: number
          spot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spot_points_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
      spots: {
        Row: {
          body_of_water: string
          created_at: string
          id: string
          is_demo: boolean
          name: string | null
          site_type: string
          state_code: string
          updated_at: string
          user_id: string
          usgs_site_id: string | null
        }
        Insert: {
          body_of_water: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string | null
          site_type?: string
          state_code: string
          updated_at?: string
          user_id: string
          usgs_site_id?: string | null
        }
        Update: {
          body_of_water?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string | null
          site_type?: string
          state_code?: string
          updated_at?: string
          user_id?: string
          usgs_site_id?: string | null
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
      usgs_fishing_water_bodies: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          monitoring_location_name: string
          normalized_water_body: string | null
          site_id: string
          site_type: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          monitoring_location_name: string
          normalized_water_body?: string | null
          site_id: string
          site_type?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          monitoring_location_name?: string
          normalized_water_body?: string | null
          site_id?: string
          site_type?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usgs_monitoring_locations: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          monitoring_location_name: string
          normalized_water_body: string | null
          site_id: string
          site_type: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          monitoring_location_name: string
          normalized_water_body?: string | null
          site_id: string
          site_type?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          monitoring_location_name?: string
          normalized_water_body?: string | null
          site_id?: string
          site_type?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      water_data_cache: {
        Row: {
          created_at: string
          date: string
          id: string
          monitoring_location_id: string
          response_json: Json
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          monitoring_location_id: string
          response_json: Json
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          monitoring_location_id?: string
          response_json?: Json
        }
        Relationships: []
      }
      weather_data_cache: {
        Row: {
          created_at: string
          date: string
          id: string
          lat: number
          lon: number
          response_json: Json
          spot_id: string | null
          trip_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          lat: number
          lon: number
          response_json: Json
          spot_id?: string | null
          trip_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          lat?: number
          lon?: number
          response_json?: Json
          spot_id?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_data_cache_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_data_cache_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "fishing_trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_distinct_water_bodies: {
        Args: { _site_type: string; _state_code: string }
        Returns: {
          normalized_water_body: string
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
