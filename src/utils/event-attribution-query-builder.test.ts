/**
 * Unit Tests for Event Attribution Query Builder
 */

import { describe, it, expect } from 'vitest';
import {
  buildShopVatSettingsCTE,
  buildChannelSpendCTE,
  buildAdSpendCTE,
  buildAttributionFilter,
  buildAttributionWeightCalculation,
  buildLinearAttributionCTE,
  buildMetricCalculations,
  buildSimpleAttributionAggregation,
  buildLinearAttributionAggregation,
  buildEventBasedChannelQuery,
  buildEventBasedAdLevelQuery,
  buildEventBasedCampaignQuery,
  type AttributionModel,
  type AggregationLevel,
} from './event-attribution-query-builder';

describe('event-attribution-query-builder', () => {
  // ========================================================================
  // CTE BUILDERS - Simple SQL generation tests
  // ========================================================================

  describe('buildShopVatSettingsCTE', () => {
    it('should generate shop VAT settings CTE', () => {
      const result = buildShopVatSettingsCTE();

      expect(result).toContain('shop_vat_settings AS (');
      expect(result).toContain('FROM stg_shopify_shops');
      expect(result).toContain('WHERE shop_name = {shop_name:String}');
      expect(result).toContain('COALESCE(ignore_vat, false) AS ignore_vat');
      expect(result).toContain('LIMIT 1');
    });

    it('should use parameterized query syntax', () => {
      const result = buildShopVatSettingsCTE();
      expect(result).toMatch(/\{shop_name:String\}/);
    });
  });

  describe('buildChannelSpendCTE', () => {
    it('should generate channel spend CTE', () => {
      const result = buildChannelSpendCTE();

      expect(result).toContain('channel_spend AS (');
      expect(result).toContain('FROM int_ad_spend');
      expect(result).toContain('SUM(spend) AS ad_spend');
      expect(result).toContain('GROUP BY channel');
    });

    it('should filter by shop_name and date range', () => {
      const result = buildChannelSpendCTE();

      expect(result).toContain('WHERE shop_name = {shop_name:String}');
      expect(result).toContain('AND date_time >= {start_date:String}');
      expect(result).toContain('AND date_time < {end_date:String}');
    });
  });

  describe('buildAdSpendCTE', () => {
    it('should generate ad spend CTE with all ad metrics', () => {
      const result = buildAdSpendCTE();

      expect(result).toContain('ad_spend AS (');
      expect(result).toContain('FROM int_ad_spend');
      expect(result).toContain('SUM(spend) AS ad_spend');
      expect(result).toContain('SUM(impressions) AS impressions');
      expect(result).toContain('SUM(clicks) AS clicks');
      expect(result).toContain('SUM(conversions) AS conversions');
    });

    it('should filter by channel and require platform_ad_id', () => {
      const result = buildAdSpendCTE();

      expect(result).toContain('AND channel = {channel:String}');
      expect(result).toContain('AND platform_ad_id IS NOT NULL');
    });

    it('should group by all ad hierarchy fields', () => {
      const result = buildAdSpendCTE();

      expect(result).toContain('platform_ad_campaign_id');
      expect(result).toContain('platform_ad_set_id');
      expect(result).toContain('platform_ad_id');
      expect(result).toContain('ad_campaign_pk');
      expect(result).toContain('ad_set_pk');
      expect(result).toContain('ad_pk');
    });
  });

  // ========================================================================
  // ATTRIBUTION FILTER BUILDERS
  // ========================================================================

  describe('buildAttributionFilter', () => {
    it('should build first_click filter', () => {
      const result = buildAttributionFilter('first_click');
      expect(result).toBe('is_first_event_overall = TRUE');
    });

    it('should build last_click filter', () => {
      const result = buildAttributionFilter('last_click');
      expect(result).toBe('is_last_event_overall = TRUE');
    });

    it('should build last_paid_click filter with fallback', () => {
      const result = buildAttributionFilter('last_paid_click');

      expect(result).toContain('is_last_paid_event_overall = TRUE');
      expect(result).toContain('has_any_paid_events = TRUE');
      expect(result).toContain('is_last_event_overall = TRUE');
      expect(result).toContain('has_any_paid_events = FALSE');
    });

    it('should return empty string for linear_all', () => {
      const result = buildAttributionFilter('linear_all');
      expect(result).toBe('');
    });

    it('should return empty string for linear_paid', () => {
      const result = buildAttributionFilter('linear_paid');
      expect(result).toBe('');
    });

    it('should throw error for unknown attribution model', () => {
      expect(() => {
        buildAttributionFilter('invalid_model' as AttributionModel);
      }).toThrow('Unknown attribution model: invalid_model');
    });
  });

  // ========================================================================
  // LINEAR ATTRIBUTION WEIGHT CALCULATOR
  // ========================================================================

  describe('buildAttributionWeightCalculation', () => {
    it('should generate weight calculation with nested partitions', () => {
      const result = buildAttributionWeightCalculation();

      expect(result).toContain('(1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))');
      expect(result).toContain('/ COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)');
      expect(result).toContain('/ COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)');
      expect(result).toContain('AS attribution_weight');
    });
  });

  // ========================================================================
  // LINEAR ATTRIBUTION CTE BUILDERS
  // ========================================================================

  describe('buildLinearAttributionCTE', () => {
    describe('linear_all model', () => {
      it('should build channel-level CTE', () => {
        const result = buildLinearAttributionCTE('linear_all', 'channel');

        expect(result).toContain('filtered_events AS (');
        expect(result).toContain('FROM int_event_metadata');
        expect(result).toContain('WHERE shopify_shop = {shop_name:String}');
        expect(result).toContain('AND event_timestamp >= {start_date:String}');
        expect(result).toContain('AND event_timestamp < {end_date:String}');
        expect(result).not.toContain('AND channel = {channel:String}');
        expect(result).not.toContain('AND platform_ad_id IS NOT NULL');
      });

      it('should build ad-level CTE with ad filtering', () => {
        const result = buildLinearAttributionCTE('linear_all', 'ad');

        expect(result).toContain('filtered_events AS (');
        expect(result).toContain('AND platform_ad_id IS NOT NULL');
      });

      it('should build campaign-level CTE', () => {
        const result = buildLinearAttributionCTE('linear_all', 'campaign');

        expect(result).toContain('filtered_events AS (');
        expect(result).not.toContain('AND platform_ad_id IS NOT NULL');
      });
    });

    describe('linear_paid model', () => {
      it('should build channel-level CTE with paid/fallback logic', () => {
        const result = buildLinearAttributionCTE('linear_paid', 'channel');

        expect(result).toContain('filtered_paid_events AS (');
        expect(result).toContain('orders_with_paid_events AS (');
        expect(result).toContain('filtered_fallback_events AS (');
        expect(result).toContain('combined_events AS (');
        expect(result).toContain('AND is_paid_channel = TRUE');
        expect(result).toContain('UNION ALL');
      });

      it('should build ad-level CTE with ad filtering', () => {
        const result = buildLinearAttributionCTE('linear_paid', 'ad');

        expect(result).toContain('filtered_paid_events AS (');
        expect(result).toContain('AND platform_ad_id IS NOT NULL');
      });

      it('should include fallback for orders without paid events', () => {
        const result = buildLinearAttributionCTE('linear_paid', 'channel');

        expect(result).toContain('AND order_id NOT IN (SELECT order_id FROM orders_with_paid_events)');
      });
    });
  });

  // ========================================================================
  // METRIC CALCULATION BUILDERS
  // ========================================================================

  describe('buildMetricCalculations', () => {
    it('should build channel-level metrics', () => {
      const result = buildMetricCalculations('channel', 'ea', 'cs');

      expect(result).toContain('COALESCE(ea.total_attributed_orders, 0) AS attributed_orders');
      expect(result).toContain('COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue');
      expect(result).toContain('COALESCE(cs.ad_spend, 0) AS ad_spend');
      expect(result).toContain('AS roas');
      expect(result).toContain('AS net_profit');
      expect(result).toContain('AS first_time_customer_orders');
      expect(result).not.toContain('AS impressions');
      expect(result).not.toContain('AS cpc');
      expect(result).not.toContain('AS ctr');
    });

    it('should build ad-level metrics with ad performance', () => {
      const result = buildMetricCalculations('ad', 'ea', 'ads');

      expect(result).toContain('COALESCE(ads.ad_spend, 0) AS ad_spend');
      expect(result).toContain('COALESCE(ads.impressions, 0) AS impressions');
      expect(result).toContain('COALESCE(ads.clicks, 0) AS clicks');
      expect(result).toContain('COALESCE(ads.conversions, 0) AS conversions');
      expect(result).toContain('AS cpc');
      expect(result).toContain('AS ctr');
    });

    it('should build campaign-level metrics without ad spend', () => {
      const result = buildMetricCalculations('campaign', 'ea', 'cs');

      expect(result).not.toContain('ad_spend');
      expect(result).not.toContain('roas');
      expect(result).toContain('AS net_profit');
    });

    it('should include VAT conditional logic in profit calculation', () => {
      const result = buildMetricCalculations('channel');

      expect(result).toContain('CASE WHEN svs.ignore_vat = true');
      expect(result).toContain('ELSE COALESCE');
      expect(result).toContain('total_attributed_tax');
    });

    it('should calculate CPC correctly', () => {
      const result = buildMetricCalculations('ad');

      expect(result).toMatch(/CASE.*WHEN.*clicks.*> 0.*THEN.*ad_spend.*clicks.*ELSE 0.*END.*AS cpc/s);
    });

    it('should calculate CTR correctly', () => {
      const result = buildMetricCalculations('ad');

      expect(result).toMatch(/CASE.*WHEN.*impressions.*> 0.*THEN.*clicks.*100.*impressions.*ELSE 0.*END.*AS ctr/s);
    });
  });

  // ========================================================================
  // AGGREGATION BUILDERS
  // ========================================================================

  describe('buildSimpleAttributionAggregation', () => {
    it('should build channel-level aggregation', () => {
      const result = buildSimpleAttributionAggregation('channel');

      expect(result).toContain('SELECT');
      expect(result).toContain('channel,');
      expect(result).toContain('shopify_shop,');
      expect(result).toContain('COUNT(DISTINCT order_id) AS total_attributed_orders');
      expect(result).toContain('SUM(total_price) AS total_attributed_revenue');
      expect(result).toContain('FROM int_event_metadata');
      expect(result).not.toContain('platform_ad_id');
    });

    it('should build ad-level aggregation with ad fields', () => {
      const result = buildSimpleAttributionAggregation('ad');

      expect(result).toContain('platform_ad_campaign_id,');
      expect(result).toContain('platform_ad_set_id,');
      expect(result).toContain('platform_ad_id,');
      expect(result).toContain('ad_campaign_pk,');
      expect(result).toContain('ad_set_pk,');
      expect(result).toContain('ad_pk,');
    });

    it('should build campaign-level aggregation', () => {
      const result = buildSimpleAttributionAggregation('campaign');

      expect(result).toContain('channel,');
      expect(result).toContain('campaign,');
      expect(result).not.toContain('platform_ad_id');
    });

    it('should include first-time customer metrics', () => {
      const result = buildSimpleAttributionAggregation('channel');

      expect(result).toContain('SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders');
      expect(result).toContain('SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue');
    });
  });

  describe('buildLinearAttributionAggregation', () => {
    it('should build linear_all channel aggregation', () => {
      const result = buildLinearAttributionAggregation('channel', 'linear_all');

      expect(result).toContain('attribution_weights AS (');
      expect(result).toContain('event_attribution AS (');
      expect(result).toContain('FROM filtered_events');
      expect(result).toContain('SUM(attribution_weight) AS total_attributed_orders');
      expect(result).toContain('SUM(attribution_weight * total_price) AS total_attributed_revenue');
    });

    it('should build linear_paid channel aggregation', () => {
      const result = buildLinearAttributionAggregation('channel', 'linear_paid');

      expect(result).toContain('FROM combined_events');
    });

    it('should include attribution weight calculation', () => {
      const result = buildLinearAttributionAggregation('channel', 'linear_all');

      expect(result).toContain('attribution_weight');
      expect(result).toContain('PARTITION BY order_id');
    });

    it('should build ad-level aggregation with ad fields', () => {
      const result = buildLinearAttributionAggregation('ad', 'linear_all');

      expect(result).toContain('platform_ad_campaign_id,');
      expect(result).toContain('platform_ad_set_id,');
      expect(result).toContain('platform_ad_id,');
    });

    it('should apply attribution weight to all metrics', () => {
      const result = buildLinearAttributionAggregation('channel', 'linear_all');

      expect(result).toContain('SUM(attribution_weight * total_cogs)');
      expect(result).toContain('SUM(attribution_weight * payment_fees)');
      expect(result).toContain('SUM(attribution_weight * total_tax)');
    });
  });

  // ========================================================================
  // MAIN QUERY COMPOSERS - CHANNEL LEVEL
  // ========================================================================

  describe('buildEventBasedChannelQuery', () => {
    const params = {
      shop_name: 'test-shop.myshopify.com',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
    };

    describe('first_click model', () => {
      it('should generate complete query with simple attribution', () => {
        const result = buildEventBasedChannelQuery('first_click', params);

        expect(result).toContain('WITH event_attribution AS (');
        expect(result).toContain('is_first_event_overall = TRUE');
        expect(result).toContain('channel_spend');
        expect(result).toContain('shop_vat_settings');
        expect(result).toContain('FULL OUTER JOIN channel_spend cs');
        expect(result).toContain('ORDER BY attributed_revenue DESC');
      });

      it('should use correct attribution filter', () => {
        const result = buildEventBasedChannelQuery('first_click', params);
        expect(result).toContain('is_first_event_overall = TRUE');
        expect(result).not.toContain('is_last_event_overall');
      });
    });

    describe('last_click model', () => {
      it('should use last event filter', () => {
        const result = buildEventBasedChannelQuery('last_click', params);
        expect(result).toContain('is_last_event_overall = TRUE');
      });
    });

    describe('last_paid_click model', () => {
      it('should use last paid event with fallback filter', () => {
        const result = buildEventBasedChannelQuery('last_paid_click', params);

        expect(result).toContain('is_last_paid_event_overall = TRUE');
        expect(result).toContain('has_any_paid_events');
      });
    });

    describe('linear_all model', () => {
      it('should generate query with linear attribution logic', () => {
        const result = buildEventBasedChannelQuery('linear_all', params);

        expect(result).toContain('filtered_events AS (');
        expect(result).toContain('attribution_weights AS (');
        expect(result).toContain('event_attribution AS (');
        expect(result).toContain('attribution_weight');
      });

      it('should not use simple attribution filters', () => {
        const result = buildEventBasedChannelQuery('linear_all', params);

        expect(result).not.toContain('is_first_event_overall = TRUE');
        expect(result).not.toContain('is_last_event_overall = TRUE');
      });
    });

    describe('linear_paid model', () => {
      it('should use combined_events from paid/fallback logic', () => {
        const result = buildEventBasedChannelQuery('linear_paid', params);

        expect(result).toContain('filtered_paid_events AS (');
        expect(result).toContain('combined_events AS (');
        expect(result).toContain('is_paid_channel = TRUE');
      });
    });

    it('should include all required CTEs', () => {
      const result = buildEventBasedChannelQuery('first_click', params);

      expect(result).toContain('event_attribution AS (');
      expect(result).toContain('channel_spend AS (');
      expect(result).toContain('shop_vat_settings AS (');
    });

    it('should use parameter placeholders', () => {
      const result = buildEventBasedChannelQuery('first_click', params);

      expect(result).toContain('{shop_name:String}');
      expect(result).toContain('{start_date:String}');
      expect(result).toContain('{end_date:String}');
    });
  });

  // ========================================================================
  // MAIN QUERY COMPOSERS - AD LEVEL
  // ========================================================================

  describe('buildEventBasedAdLevelQuery', () => {
    const params = {
      shop_name: 'test-shop.myshopify.com',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      channel: 'facebook',
    };

    it('should throw error when channel is missing', () => {
      const invalidParams = { ...params, channel: undefined };

      expect(() => {
        buildEventBasedAdLevelQuery('first_click', invalidParams);
      }).toThrow('Channel is required for ad-level queries');
    });

    describe('first_click model', () => {
      it('should generate complete ad-level query', () => {
        const result = buildEventBasedAdLevelQuery('first_click', params);

        expect(result).toContain('WITH event_attribution AS (');
        expect(result).toContain('ad_spend AS (');
        expect(result).toContain('shop_vat_settings AS (');
        expect(result).toContain('platform_ad_campaign_id');
        expect(result).toContain('platform_ad_set_id');
        expect(result).toContain('platform_ad_id');
      });

      it('should filter by channel and require platform_ad_id', () => {
        const result = buildEventBasedAdLevelQuery('first_click', params);

        expect(result).toContain('AND channel = {channel:String}');
        expect(result).toContain('AND platform_ad_id IS NOT NULL');
      });

      it('should join on all ad hierarchy fields', () => {
        const result = buildEventBasedAdLevelQuery('first_click', params);

        expect(result).toContain('ea.platform_ad_id = ads.platform_ad_id');
        expect(result).toContain('ea.platform_ad_set_id = ads.platform_ad_set_id');
        expect(result).toContain('ea.platform_ad_campaign_id = ads.platform_ad_campaign_id');
      });
    });

    describe('linear_all model', () => {
      it('should use linear attribution for ad level', () => {
        const result = buildEventBasedAdLevelQuery('linear_all', params);

        expect(result).toContain('filtered_events AS (');
        expect(result).toContain('attribution_weights AS (');
        expect(result).toContain('AND platform_ad_id IS NOT NULL');
      });
    });

    describe('linear_paid model', () => {
      it('should use combined events logic', () => {
        const result = buildEventBasedAdLevelQuery('linear_paid', params);

        expect(result).toContain('filtered_paid_events AS (');
        expect(result).toContain('combined_events AS (');
      });
    });
  });

  // ========================================================================
  // MAIN QUERY COMPOSERS - CAMPAIGN LEVEL
  // ========================================================================

  describe('buildEventBasedCampaignQuery', () => {
    const params = {
      shop_name: 'test-shop.myshopify.com',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      channel: 'organic',
    };

    it('should throw error when channel is missing', () => {
      const invalidParams = { ...params, channel: undefined };

      expect(() => {
        buildEventBasedCampaignQuery('first_click', invalidParams);
      }).toThrow('Channel is required for campaign-level queries');
    });

    describe('first_click model', () => {
      it('should generate complete campaign-level query', () => {
        const result = buildEventBasedCampaignQuery('first_click', params);

        expect(result).toContain('WITH event_attribution AS (');
        expect(result).toContain('shop_vat_settings AS (');
        expect(result).toContain('ea.campaign');
        expect(result).not.toContain('channel_spend');
        expect(result).not.toContain('ad_spend');
      });

      it('should filter by channel', () => {
        const result = buildEventBasedCampaignQuery('first_click', params);
        expect(result).toContain('AND channel = {channel:String}');
      });

      it('should group by campaign', () => {
        const result = buildEventBasedCampaignQuery('first_click', params);
        expect(result).toContain('GROUP BY channel, shopify_shop, campaign');
      });
    });

    describe('linear_all model', () => {
      it('should use linear attribution for campaign level', () => {
        const result = buildEventBasedCampaignQuery('linear_all', params);

        expect(result).toContain('filtered_events AS (');
        expect(result).toContain('attribution_weights AS (');
      });
    });

    describe('linear_paid model', () => {
      it('should use combined events logic', () => {
        const result = buildEventBasedCampaignQuery('linear_paid', params);

        expect(result).toContain('filtered_paid_events AS (');
        expect(result).toContain('combined_events AS (');
      });
    });

    it('should not include ad spend metrics for campaigns', () => {
      const result = buildEventBasedCampaignQuery('first_click', params);

      expect(result).not.toContain('ad_spend AS (');
      expect(result).not.toContain('channel_spend AS (');
    });
  });

  // ========================================================================
  // INTEGRATION TESTS - Full Query Validation
  // ========================================================================

  describe('integration: full query generation', () => {
    const params = {
      shop_name: 'integration-shop.myshopify.com',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
    };

    it('should generate syntactically valid SQL for all attribution models', () => {
      const models: AttributionModel[] = [
        'first_click',
        'last_click',
        'last_paid_click',
        'linear_all',
        'linear_paid',
      ];

      models.forEach((model) => {
        const query = buildEventBasedChannelQuery(model, params);

        // Basic SQL structure validation
        expect(query).toContain('WITH');
        expect(query).toContain('SELECT');
        expect(query).toContain('FROM');
        expect(query).not.toContain('undefined');
        expect(query).not.toContain('null');
      });
    });

    it('should generate distinct queries for each attribution model', () => {
      const firstClick = buildEventBasedChannelQuery('first_click', params);
      const lastClick = buildEventBasedChannelQuery('last_click', params);
      const linearAll = buildEventBasedChannelQuery('linear_all', params);

      expect(firstClick).not.toBe(lastClick);
      expect(lastClick).not.toBe(linearAll);
      expect(firstClick).not.toBe(linearAll);
    });

    it('should handle all aggregation levels for all models', () => {
      const adParams = { ...params, channel: 'facebook' };
      const models: AttributionModel[] = ['first_click', 'last_click', 'linear_all'];

      models.forEach((model) => {
        // Channel level
        const channelQuery = buildEventBasedChannelQuery(model, params);
        expect(channelQuery).toContain('SELECT');

        // Ad level
        const adQuery = buildEventBasedAdLevelQuery(model, adParams);
        expect(adQuery).toContain('SELECT');

        // Campaign level
        const campaignQuery = buildEventBasedCampaignQuery(model, adParams);
        expect(campaignQuery).toContain('SELECT');
      });
    });
  });
});
