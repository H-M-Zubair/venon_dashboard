import { supabaseConnection } from '@/database/supabase/connection.js';
import {
  updateGoogleCampaignStatus,
  updateGoogleCampaignBudget,
  updateGoogleAdSetStatus,
  updateGoogleAdStatus,
} from '@/services/ad-platforms/google.js';
import {
  updateMetaCampaignStatus,
  updateMetaCampaignBudget,
  updateMetaAdSetStatus,
  updateMetaAdSetBudget,
  updateMetaAdStatus,
} from '@/services/ad-platforms/meta.js';
import { Campaign, AdSet, Ad, AdProvider } from '@/types/ads.js';
import logger from '@/config/logger.js';

export class AdService {
  /**
   * Get campaign by ID with related data
   */
  static async getCampaign(campaignId: string): Promise<Campaign | null> {
    const supabase = supabaseConnection.getServiceClient();

    const { data, error } = await supabase
      .from('ad_campaigns')
      .select(
        `
        id, ad_campaign_id, name, active, platform, ad_account_id,
        ad_accounts (
          ad_account_id,
          account_id
        )
      `
      )
      .eq('id', campaignId)
      .single();

    if (error) {
      logger.error('Error fetching campaign:', error);
      return null;
    }

    return data as unknown as Campaign;
  }

  /**
   * Update campaign status
   */
  static async updateCampaignStatus(
    provider: AdProvider,
    campaignId: string,
    enabled: boolean
  ): Promise<Campaign> {
    const campaign = await this.getCampaign(campaignId);

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update status on the ad platform
    if (provider === 'google') {
      await updateGoogleCampaignStatus(
        campaign.ad_accounts.ad_account_id,
        campaign.ad_accounts.account_id,
        campaign.ad_campaign_id,
        enabled
      );
    } else if (provider === 'facebook') {
      await updateMetaCampaignStatus(
        campaign.ad_accounts.account_id,
        campaign.ad_campaign_id,
        enabled
      );
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update local database
    const supabase = supabaseConnection.getServiceClient();
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ active: enabled })
      .eq('id', campaign.id);

    if (error) {
      logger.error('Error updating campaign status in database:', error);
      throw new Error('Failed to update campaign status in database');
    }

    campaign.active = enabled;
    return campaign;
  }

  /**
   * Update campaign budget
   */
  static async updateCampaignBudget(
    provider: AdProvider,
    campaignId: string,
    budget: number
  ): Promise<Campaign> {
    const campaign = await this.getCampaign(campaignId);

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update budget on the ad platform
    if (provider === 'google') {
      await updateGoogleCampaignBudget(
        campaign.ad_accounts.ad_account_id,
        campaign.ad_accounts.account_id,
        campaign.ad_campaign_id,
        budget
      );
    } else if (provider === 'facebook') {
      await updateMetaCampaignBudget(
        campaign.ad_accounts.account_id,
        campaign.ad_campaign_id,
        budget
      );
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update local database
    const supabase = supabaseConnection.getServiceClient();
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ budget: budget })
      .eq('id', campaign.id);

    if (error) {
      logger.error('Error updating campaign budget in database:', error);
      throw new Error('Failed to update campaign budget in database');
    }

    campaign.budget = budget;
    return campaign;
  }

  /**
   * Get ad set by ID with related data
   */
  static async getAdSet(adSetId: string): Promise<AdSet | null> {
    const supabase = supabaseConnection.getServiceClient();

    const { data, error } = await supabase
      .from('ad_sets')
      .select(
        `
        id, ad_set_id, name, active, ad_campaign_id, platform,
        ad_campaigns (
          ad_accounts (
            ad_account_id,
            account_id
          )
        )
      `
      )
      .eq('id', adSetId)
      .single();

    if (error) {
      logger.error('Error fetching ad set:', error);
      return null;
    }

    return data as unknown as AdSet;
  }

  /**
   * Update ad set status
   */
  static async updateAdSetStatus(
    provider: AdProvider,
    adSetId: string,
    enabled: boolean
  ): Promise<AdSet> {
    const adSet = await this.getAdSet(adSetId);

    if (!adSet) {
      throw new Error('Ad set not found');
    }

    // Update status on the ad platform
    if (provider === 'google') {
      await updateGoogleAdSetStatus(
        adSet.ad_campaigns.ad_accounts.ad_account_id,
        adSet.ad_campaigns.ad_accounts.account_id,
        adSet.ad_set_id,
        enabled
      );
    } else if (provider === 'facebook') {
      await updateMetaAdSetStatus(
        adSet.ad_campaigns.ad_accounts.account_id,
        adSet.ad_set_id,
        enabled
      );
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update local database
    const supabase = supabaseConnection.getServiceClient();
    const { error } = await supabase
      .from('ad_sets')
      .update({ active: enabled })
      .eq('id', adSet.id);

    if (error) {
      logger.error('Error updating ad set status in database:', error);
      throw new Error('Failed to update ad set status in database');
    }

    adSet.active = enabled;
    return adSet;
  }

  /**
   * Update ad set budget
   */
  static async updateAdSetBudget(
    provider: AdProvider,
    adSetId: string,
    budget: number
  ): Promise<AdSet> {
    const adSet = await this.getAdSet(adSetId);

    if (!adSet) {
      throw new Error('Ad set not found');
    }

    // Update budget on the ad platform
    if (provider === 'google') {
      throw new Error('Google Ad Set budget update is not supported directly');
    } else if (provider === 'facebook') {
      await updateMetaAdSetBudget(adSet.ad_campaigns.ad_accounts.account_id, adSet.ad_set_id, budget);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update local database
    const supabase = supabaseConnection.getServiceClient();
    const { error } = await supabase
      .from('ad_sets')
      .update({ budget: budget })
      .eq('id', adSet.id);

    if (error) {
      logger.error('Error updating ad set budget in database:', error);
      throw new Error('Failed to update ad set budget in database');
    }

    adSet.budget = budget;
    return adSet;
  }

  /**
   * Get ad by ID with related data
   */
  static async getAd(adId: string): Promise<Ad | null> {
    const supabase = supabaseConnection.getServiceClient();

    const { data, error } = await supabase
      .from('ads')
      .select(
        `
        id, ad_id, platform, name, active, ad_set_id,
        ad_sets (
          ad_set_id,
          ad_campaigns (
            ad_accounts (
              ad_account_id,
              account_id
            )
          )
        )
      `
      )
      .eq('id', adId)
      .single();

    if (error) {
      logger.error('Error fetching ad:', error);
      return null;
    }

    return data as unknown as Ad;
  }

  /**
   * Update ad status
   */
  static async updateAdStatus(
    provider: AdProvider,
    adId: string,
    enabled: boolean
  ): Promise<Ad> {
    const ad = await this.getAd(adId);

    if (!ad) {
      throw new Error('Ad not found');
    }

    // Update status on the ad platform
    if (provider === 'google') {
      await updateGoogleAdStatus(
        ad.ad_sets.ad_campaigns.ad_accounts.ad_account_id,
        ad.ad_sets.ad_campaigns.ad_accounts.account_id,
        ad.ad_sets.ad_set_id,
        ad.ad_id,
        enabled
      );
    } else if (provider === 'facebook') {
      await updateMetaAdStatus(ad.ad_sets.ad_campaigns.ad_accounts.account_id, ad.ad_id, enabled);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update local database
    const supabase = supabaseConnection.getServiceClient();
    const { error } = await supabase.from('ads').update({ active: enabled }).eq('id', ad.id);

    if (error) {
      logger.error('Error updating ad status in database:', error);
      throw new Error('Failed to update ad status in database');
    }

    ad.active = enabled;
    return ad;
  }

  /**
   * Update ad budget (not supported - ads don't have individual budgets)
   */
  static async updateAdBudget(
    provider: AdProvider,
    adId: string,
    budget: number
  ): Promise<Ad> {
    throw new Error(
      'Ad budget updates are not supported. Budget is managed at the ad set or campaign level.'
    );
  }
}
