export type AdProvider = 'google' | 'facebook';

export interface Campaign {
  id: number;
  ad_campaign_id: string;
  name: string;
  active: boolean;
  platform: string;
  ad_account_id: number;
  budget?: number;
  ad_accounts: {
    ad_account_id: string;
    account_id: number;
    accounts: {
      user_id: string;
    };
  };
}

export interface AdSet {
  id: number;
  ad_set_id: string;
  name: string;
  active: boolean;
  ad_campaign_id: number;
  platform: string;
  budget?: number;
  ad_campaigns: {
    ad_accounts: {
      ad_account_id: string;
      account_id: number;
      accounts: {
        user_id: string;
      };
    };
  };
}

export interface Ad {
  id: number;
  ad_id: string;
  platform: string;
  name: string;
  active: boolean;
  ad_set_id: number;
  budget?: number;
  ad_sets: {
    ad_set_id: string;
    ad_campaigns: {
      ad_accounts: {
        ad_account_id: string;
        account_id: number;
        accounts: {
          user_id: string;
        };
      };
    };
  };
}

export interface Integration {
  id: string;
  access_token: string;
  account_id: number;
  ad_account_id?: string;
  client_id?: string;
  client_secret?: string;
  connected: boolean;
  error?: string;
  expires_at?: string;
  external_user_id?: string;
  email?: string;
  created_at: string;
  type: string;
  refresh_token?: string;
}

export interface StatusUpdateRequest {
  enabled: boolean;
  shop_name?: string;
}

export interface BudgetUpdateRequest {
  budget: number;
  shop_name?: string;
}
