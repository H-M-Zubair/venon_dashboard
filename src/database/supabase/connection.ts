import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import logger from '@/config/logger';

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string | number;
          name: string;
          domain: string;
          timezone: string;
          currency: string;
          subscription_status: 'active' | 'inactive' | 'trialing' | 'past_due';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['accounts']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['accounts']['Insert']>;
      };
      integrations: {
        Row: {
          id: string;
          account_id: string;
          platform: string;
          platform_account_id: string;
          access_token: string;
          email?: string;
          refresh_token?: string;
          expires_at?: string;
          is_active: boolean;
          last_sync: string;
          created_at: string;
          updated_at: string;
          connected?: boolean;
          deleted_at?: string;
        };
        Insert: Omit<
          Database['public']['Tables']['integrations']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<
          Omit<Database['public']['Tables']['integrations']['Row'], 'id' | 'created_at'>
        >;
      };
      google_sheets_exports: {
        Row: {
          id: string;
          account_id: string;
          integration_id: string;
          report_name: string;
          spreadsheet_id: string;
          sheet_name: string;
          spreadsheet_url?: string | null;
          sync_frequency: string;
          attribution_model: string;
          granularity: string;
          start_date: string;
          end_date?: string | null;
          selected_channels: string[];
          selected_metrics: string[];
          active: boolean;
          last_export_at?: string | null;
          deleted_at?: string | null;
          next_export_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['google_sheets_exports']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<
          Omit<Database['public']['Tables']['google_sheets_exports']['Row'], 'id' | 'created_at'>
        >;
      };
      google_sheets_export_logs: {
        Row: {
          id: string;
          export_config_id: string;
          started_at: string;
          completed_at?: string | null;
          status: 'running' | 'success' | 'failed';
          date_range_start: string;
          date_range_end: string;
          rows_exported?: number | null;
          duration_ms?: number | null;
          error_message?: string | null;
          error_stack?: string | null;
          triggered_by: 'api' | 'cron' | 'manual';
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['google_sheets_export_logs']['Row'],
          'id' | 'created_at'
        >;
        Update: Partial<
          Omit<
            Database['public']['Tables']['google_sheets_export_logs']['Row'],
            'id' | 'created_at'
          >
        >;
      };
      shopify_shops: {
        Row: {
          id: string;
          account_id: string;
          shop_domain: string;
          access_token: string;
          is_active: boolean;
          last_sync: string;
          webhook_verified: boolean;
          created_at: string;
          updated_at: string;
          deleted_at?: string;
        };
        Insert: Omit<
          Database['public']['Tables']['shopify_shops']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['shopify_shops']['Insert']>;
      };
      ad_accounts: {
        Row: {
          id: number;
          ad_account_id: string;
          account_id: number;
          platform: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['ad_accounts']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['ad_accounts']['Insert']>;
      };
      ad_campaigns: {
        Row: {
          id: number;
          ad_campaign_id: string;
          name: string;
          active: boolean;
          platform: string;
          ad_account_id: number;
          budget?: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['ad_campaigns']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['ad_campaigns']['Insert']>;
      };
      ad_sets: {
        Row: {
          id: number;
          ad_set_id: string;
          name: string;
          active: boolean;
          ad_campaign_id: number;
          platform: string;
          budget?: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['ad_sets']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['ad_sets']['Insert']>;
      };
      ads: {
        Row: {
          id: number;
          ad_id: string;
          platform: string;
          name: string;
          active: boolean;
          ad_set_id: number;
          budget?: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['ads']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['ads']['Insert']>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

class SupabaseConnection {
  private client: SupabaseClient<Database> | null = null;

  getClient(): SupabaseClient<Database> {
    if (!this.client) {
      this.client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: false,
        },
      });

      logger.info('Supabase client initialized');
    }

    return this.client;
  }

  getServiceClient(): SupabaseClient<Database> {
    return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const client = this.getClient();
      const { error } = await client.from('accounts').select('id').limit(1);

      if (error) {
        logger.error('Supabase connection verification failed:', error);
        return false;
      }

      logger.info('Supabase connection verified');
      return true;
    } catch (error) {
      logger.error('Supabase connection error:', error);
      return false;
    }
  }
}

export const supabaseConnection = new SupabaseConnection();
