export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          area: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          area?: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          area?: string;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'member';
          created_at?: string;
        };
        Update: {
          role?: 'owner' | 'admin' | 'member';
        };
        Relationships: [];
      };
      group_invites: {
        Row: {
          id: string;
          group_id: string;
          invited_email: string;
          role: 'admin' | 'member';
          invited_by: string;
          accepted_by: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          invited_email: string;
          role?: 'admin' | 'member';
          invited_by: string;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          accepted_by?: string | null;
          accepted_at?: string | null;
          role?: 'admin' | 'member';
        };
        Relationships: [];
      };
      stores: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          store_type: string;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          is_favorite: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          store_type?: string;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_favorite?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          store_type?: string;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_favorite?: boolean;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          category: string | null;
          amount: string | null;
          barcode: string | null;
          is_favorite: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          category?: string | null;
          amount?: string | null;
          barcode?: string | null;
          is_favorite?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          category?: string | null;
          amount?: string | null;
          barcode?: string | null;
          is_favorite?: boolean;
        };
        Relationships: [];
      };
      price_records: {
        Row: {
          id: string;
          group_id: string;
          product_id: string;
          store_id: string;
          price: number;
          memo: string | null;
          recorded_by: string;
          recorded_at: string;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          product_id: string;
          store_id: string;
          price: number;
          memo?: string | null;
          recorded_by: string;
          recorded_at?: string;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          price?: number;
          memo?: string | null;
          store_id?: string;
          product_id?: string;
        };
        Relationships: [];
      };
      shopping_lists: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          title?: string;
          created_at?: string;
        };
        Update: {
          title?: string;
        };
        Relationships: [];
      };
      shopping_list_items: {
        Row: {
          id: string;
          shopping_list_id: string;
          product_id: string | null;
          label: string | null;
          is_checked: boolean;
          checked_by: string | null;
          checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shopping_list_id: string;
          product_id?: string | null;
          label?: string | null;
          is_checked?: boolean;
          checked_by?: string | null;
          checked_at?: string | null;
          created_at?: string;
        };
        Update: {
          product_id?: string | null;
          label?: string | null;
          is_checked?: boolean;
          checked_by?: string | null;
          checked_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type GroupRow = Database['public']['Tables']['groups']['Row'];
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];
export type GroupInviteRow = Database['public']['Tables']['group_invites']['Row'];
export type StoreRow = Database['public']['Tables']['stores']['Row'];
export type ProductRow = Database['public']['Tables']['products']['Row'];
export type PriceRecordRow = Database['public']['Tables']['price_records']['Row'];
