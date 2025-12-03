/**
 * Event-Based Attribution Query Builder Utilities
 *
 * This module provides reusable query building functions for event-based attribution.
 * It eliminates duplication by extracting common CTEs and SQL patterns into composable functions.
 */

export type AttributionModel = 'first_click' | 'last_click' | 'last_paid_click' | 'linear_all' | 'linear_paid';
export type AggregationLevel = 'channel' | 'ad' | 'campaign';

interface QueryParams {
  shop_name: string;
  start_date: string;
  end_date: string;
  channel?: string;
}

// ============================================================================
// CTE BUILDERS - Reusable SQL fragments
// ============================================================================

/**
 * Builds the shop VAT settings CTE
 * Used in ALL queries to determine VAT inclusion in profit calculations
 */
export function buildShopVatSettingsCTE(): string {
  return `shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)`;
}

/**
 * Builds the channel spend CTE for channel-level aggregation
 * Used in channel-level queries (all channels)
 */
export function buildChannelSpendCTE(): string {
  return `channel_spend AS (
  SELECT
    channel,
    SUM(spend) AS ad_spend
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
  GROUP BY channel
)`;
}

/**
 * Builds the ad spend CTE for ad-level aggregation
 * Used in ad-level queries (paid channels only)
 */
export function buildAdSpendCTE(): string {
  return `ad_spend AS (
  SELECT
    channel,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    SUM(spend) AS ad_spend,
    SUM(impressions) AS impressions,
    SUM(clicks) AS clicks,
    SUM(conversions) AS conversions
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
    AND channel = {channel:String}
    AND platform_ad_id IS NOT NULL
  GROUP BY
    channel,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk
)`;
}

// ============================================================================
// ATTRIBUTION FILTER BUILDERS
// ============================================================================

/**
 * Builds WHERE clause filters for event-based attribution models
 * Different models use different event flags in int_event_metadata
 */
export function buildAttributionFilter(model: AttributionModel): string {
  switch (model) {
    case 'first_click':
      return 'is_first_event_overall = TRUE';

    case 'last_click':
      return 'is_last_event_overall = TRUE';

    case 'last_paid_click':
      return `(
      (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
      OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
    )`;

    // Linear models don't use simple filters - they need window functions
    case 'linear_all':
    case 'linear_paid':
      return '';

    default:
      throw new Error(`Unknown attribution model: ${model}`);
  }
}

// ============================================================================
// LINEAR ATTRIBUTION WEIGHT CALCULATOR
// ============================================================================

/**
 * Builds attribution weight calculation for linear models
 * Distributes credit across channels, then ads, then events
 */
export function buildAttributionWeightCalculation(): string {
  return `(1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
    AS attribution_weight`;
}

/**
 * Builds the event filtering and attribution weight CTE for linear models
 */
export function buildLinearAttributionCTE(
  model: 'linear_all' | 'linear_paid',
  level: AggregationLevel
): string {
  const isPaid = model === 'linear_paid';
  const baseFilter = level === 'channel' ? '' : 'AND channel = {channel:String}';
  const adFilter = level === 'ad' ? 'AND platform_ad_id IS NOT NULL' : '';

  if (isPaid) {
    // Linear Paid: Filter paid events, fallback to all events for orders without paid events
    return `filtered_paid_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    ${baseFilter}
    AND is_paid_channel = TRUE
    ${adFilter}
),
orders_with_paid_events AS (
  SELECT DISTINCT order_id
  FROM filtered_paid_events
),
filtered_fallback_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    ${baseFilter}
    AND order_id NOT IN (SELECT order_id FROM orders_with_paid_events)
    ${adFilter}
),
combined_events AS (
  SELECT * FROM filtered_paid_events
  UNION ALL
  SELECT * FROM filtered_fallback_events
)`;
  } else {
    // Linear All: Include all events
    return `filtered_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    ${baseFilter}
    ${adFilter}
)`;
  }
}

// ============================================================================
// METRIC SELECTION BUILDERS
// ============================================================================

/**
 * Builds the common metric calculations used in final SELECT
 */
export function buildMetricCalculations(
  level: AggregationLevel,
  attributionAlias: string = 'ea',
  spendAlias: string = 'cs'
): string {
  const spendColumn = level === 'ad' ? 'ads' : spendAlias;

  const baseMetrics = `COALESCE(${attributionAlias}.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(${attributionAlias}.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(${attributionAlias}.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(${attributionAlias}.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(${attributionAlias}.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(${attributionAlias}.total_attributed_tax, 0) AS attributed_tax`;

  // Ad-level queries include ad performance metrics
  // Campaign-level queries (non-paid channels) don't include ad spend at all
  const adMetrics = level === 'ad' ? `,
  COALESCE(${spendColumn}.ad_spend, 0) AS ad_spend,
  COALESCE(${spendColumn}.impressions, 0) AS impressions,
  COALESCE(${spendColumn}.clicks, 0) AS clicks,
  COALESCE(${spendColumn}.conversions, 0) AS conversions`
  : level === 'campaign' ? ''
  : `,
  COALESCE(${spendColumn}.ad_spend, 0) AS ad_spend`;

  // CPC and CTR only for ad-level
  const adPerformanceMetrics = level === 'ad' ? `,
  CASE
    WHEN COALESCE(${spendColumn}.clicks, 0) > 0
    THEN COALESCE(${spendColumn}.ad_spend, 0) / ${spendColumn}.clicks
    ELSE 0
  END AS cpc,
  CASE
    WHEN COALESCE(${spendColumn}.impressions, 0) > 0
    THEN (COALESCE(${spendColumn}.clicks, 0) * 100.0) / ${spendColumn}.impressions
    ELSE 0
  END AS ctr` : '';

  // ROAS calculation - only when there's ad spend
  const roasMetric = level === 'campaign' ? '' : `,
  CASE
    WHEN COALESCE(${spendColumn}.ad_spend, 0) > 0
    THEN COALESCE(${attributionAlias}.total_attributed_revenue, 0) / ${spendColumn}.ad_spend
    ELSE 0
  END AS roas`;

  // Net profit calculation with conditional VAT
  const profitMetric = level === 'campaign' ? `COALESCE(${attributionAlias}.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(${attributionAlias}.total_attributed_tax, 0) END -
  COALESCE(${attributionAlias}.total_attributed_cogs, 0) -
  COALESCE(${attributionAlias}.total_attributed_payment_fees, 0) AS net_profit` : `COALESCE(${attributionAlias}.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(${attributionAlias}.total_attributed_tax, 0) END -
  COALESCE(${attributionAlias}.total_attributed_cogs, 0) -
  COALESCE(${attributionAlias}.total_attributed_payment_fees, 0) -
  COALESCE(${spendColumn}.ad_spend, 0) AS net_profit`;

  // First-time customer metrics
  const ftcMetrics = `,
  COALESCE(${attributionAlias}.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(${attributionAlias}.first_time_customer_revenue, 0) AS first_time_customer_revenue`;

  const ftcRoasMetric = level === 'campaign' ? '' : `,
  CASE
    WHEN COALESCE(${spendColumn}.ad_spend, 0) > 0
    THEN COALESCE(${attributionAlias}.first_time_customer_revenue, 0) / ${spendColumn}.ad_spend
    ELSE 0
  END AS first_time_customer_roas`;

  return `${baseMetrics}${adMetrics}${adPerformanceMetrics}${roasMetric},
  ${profitMetric}${ftcMetrics}${ftcRoasMetric}`;
}

// ============================================================================
// ATTRIBUTION AGGREGATION BUILDERS
// ============================================================================

/**
 * Builds the aggregation SELECT for simple attribution models (first/last click)
 */
export function buildSimpleAttributionAggregation(level: AggregationLevel): string {
  const groupByFields = level === 'channel'
    ? 'channel, shopify_shop'
    : level === 'ad'
    ? `channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk`
    : 'channel, shopify_shop, campaign';

  const selectFields = level === 'channel'
    ? 'channel,\n    shopify_shop,'
    : level === 'ad'
    ? `channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,`
    : 'channel,\n    shopify_shop,\n    campaign,';

  return `SELECT
    ${selectFields}
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata`;
}

/**
 * Builds the aggregation SELECT for linear attribution models
 */
export function buildLinearAttributionAggregation(
  level: AggregationLevel,
  model: 'linear_all' | 'linear_paid'
): string {
  const sourceTable = model === 'linear_paid' ? 'combined_events' : 'filtered_events';

  const groupByFields = level === 'channel'
    ? 'channel, shopify_shop'
    : level === 'ad'
    ? `channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk`
    : 'channel, shopify_shop, campaign';

  const selectFields = level === 'channel'
    ? 'channel,\n    shopify_shop,'
    : level === 'ad'
    ? `channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,`
    : 'channel,\n    shopify_shop,\n    campaign,';

  return `attribution_weights AS (
  SELECT
    ${selectFields}
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    ${buildAttributionWeightCalculation()}
  FROM ${sourceTable}
),
event_attribution AS (
  SELECT
    ${selectFields}
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
  GROUP BY ${groupByFields}
)`;
}

// ============================================================================
// MAIN QUERY COMPOSERS
// ============================================================================

/**
 * Builds complete event-based channel performance query
 * Aggregates by channel across all events in date range
 */
export function buildEventBasedChannelQuery(
  model: AttributionModel,
  params: QueryParams
): string {
  const isLinear = model === 'linear_all' || model === 'linear_paid';

  if (isLinear) {
    // Linear models need window functions
    const linearCTE = buildLinearAttributionCTE(model, 'channel');
    const attributionAggregation = buildLinearAttributionAggregation('channel', model);

    return `
WITH ${linearCTE},
${attributionAggregation},
${buildChannelSpendCTE()},
${buildShopVatSettingsCTE()}
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  ${buildMetricCalculations('channel', 'ea', 'cs')}
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC
    `.trim();
  } else {
    // Simple click models (first/last/last_paid)
    const attributionFilter = buildAttributionFilter(model);
    const baseFilter = `WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND ${attributionFilter}`;

    return `
WITH event_attribution AS (
  ${buildSimpleAttributionAggregation('channel')}
  ${baseFilter}
  GROUP BY channel, shopify_shop
),
${buildChannelSpendCTE()},
${buildShopVatSettingsCTE()}
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  ${buildMetricCalculations('channel', 'ea', 'cs')}
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC
    `.trim();
  }
}

/**
 * Builds complete event-based ad-level query for paid channels
 * Groups by campaign -> ad set -> ad hierarchy
 */
export function buildEventBasedAdLevelQuery(
  model: AttributionModel,
  params: QueryParams
): string {
  if (!params.channel) {
    throw new Error('Channel is required for ad-level queries');
  }

  const isLinear = model === 'linear_all' || model === 'linear_paid';

  if (isLinear) {
    // Linear models need window functions
    const linearCTE = buildLinearAttributionCTE(model, 'ad');
    const attributionAggregation = buildLinearAttributionAggregation('ad', model);

    return `
WITH ${linearCTE},
${attributionAggregation},
${buildAdSpendCTE()},
${buildShopVatSettingsCTE()}
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  ${buildMetricCalculations('ad', 'ea', 'ads')}
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC
    `.trim();
  } else {
    // Simple click models
    const attributionFilter = buildAttributionFilter(model);
    const baseFilter = `WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND ${attributionFilter}
    AND platform_ad_id IS NOT NULL`;

    return `
WITH event_attribution AS (
  ${buildSimpleAttributionAggregation('ad')}
  ${baseFilter}
  GROUP BY
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk
),
${buildAdSpendCTE()},
${buildShopVatSettingsCTE()}
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  ${buildMetricCalculations('ad', 'ea', 'ads')}
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC
    `.trim();
  }
}

/**
 * Builds complete event-based campaign-level query for non-paid channels
 * Groups by campaign name (UTM campaign, referrer, etc.)
 */
export function buildEventBasedCampaignQuery(
  model: AttributionModel,
  params: QueryParams
): string {
  if (!params.channel) {
    throw new Error('Channel is required for campaign-level queries');
  }

  const isLinear = model === 'linear_all' || model === 'linear_paid';

  if (isLinear) {
    // Linear models need window functions
    const linearCTE = buildLinearAttributionCTE(model, 'campaign');
    const attributionAggregation = buildLinearAttributionAggregation('campaign', model);

    return `
WITH ${linearCTE},
${attributionAggregation},
${buildShopVatSettingsCTE()}
SELECT
  ea.channel,
  ea.campaign,
  ${buildMetricCalculations('campaign', 'ea', 'cs')}
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC
    `.trim();
  } else {
    // Simple click models
    const attributionFilter = buildAttributionFilter(model);
    const baseFilter = `WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND ${attributionFilter}`;

    return `
WITH event_attribution AS (
  ${buildSimpleAttributionAggregation('campaign')}
  ${baseFilter}
  GROUP BY channel, shopify_shop, campaign
),
${buildShopVatSettingsCTE()}
SELECT
  ea.channel,
  ea.campaign,
  ${buildMetricCalculations('campaign', 'ea', 'cs')}
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC
    `.trim();
  }
}
