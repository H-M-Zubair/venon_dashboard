-- EVENT-BASED ATTRIBUTION TEST QUERIES
-- These queries can be used to test event-based attribution before API implementation
-- Replace parameters: {shop_name}, {start_date}, {end_date}, {channel}
-- ======================================================================================
-- CHANNEL-LEVEL QUERIES (similar to getChannelPerformance API)
-- Filter by: shop, date range (event-based), attribution model
-- Returns: Aggregated metrics per channel
-- ======================================================================================
-- 1. FIRST CLICK - EVENT BASED
-- Only orders where FIRST event occurred in date range
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND is_first_event_overall = TRUE
  GROUP BY channel, shopify_shop
),
channel_spend AS (
  SELECT
    channel,
    SUM(spend) AS ad_spend
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
  GROUP BY channel
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(cs.ad_spend, 0) AS ad_spend,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN ea.total_attributed_revenue / cs.ad_spend
    ELSE 0
  END AS roas,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(cs.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / cs.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 2. LAST CLICK - EVENT BASED
-- Only orders where LAST event occurred in date range
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND is_last_event_overall = TRUE
  GROUP BY channel, shopify_shop
),
channel_spend AS (
  SELECT
    channel,
    SUM(spend) AS ad_spend
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
  GROUP BY channel
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(cs.ad_spend, 0) AS ad_spend,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN ea.total_attributed_revenue / cs.ad_spend
    ELSE 0
  END AS roas,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(cs.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / cs.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 3. LAST PAID CLICK - EVENT BASED
-- Orders where LAST PAID event occurred in date range (fallback to last click if no paid)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND (
      (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
      OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
    )
  GROUP BY channel, shopify_shop
),
channel_spend AS (
  SELECT
    channel,
    SUM(spend) AS ad_spend
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
  GROUP BY channel
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(cs.ad_spend, 0) AS ad_spend,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN ea.total_attributed_revenue / cs.ad_spend
    ELSE 0
  END AS roas,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(cs.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / cs.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 4. LINEAR ALL - EVENT BASED
-- ALL events in date range share credit equally (partial attribution possible)
WITH filtered_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
),
attribution_weights AS (
  SELECT
    channel,
    shopify_shop,
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    -- Calculate attribution weight per event: distribute across channels, ads, then events
    (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
    AS attribution_weight
  FROM filtered_events
),
event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
  GROUP BY channel, shopify_shop
),
channel_spend AS (
  SELECT
    channel,
    SUM(spend) AS ad_spend
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
  GROUP BY channel
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(cs.ad_spend, 0) AS ad_spend,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN ea.total_attributed_revenue / cs.ad_spend
    ELSE 0
  END AS roas,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(cs.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / cs.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 5. LINEAR PAID - EVENT BASED
-- PAID events in date range share credit equally (fallback to linear all if no paid)
WITH filtered_paid_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND is_paid_channel = TRUE
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
    AND order_id NOT IN (SELECT order_id FROM orders_with_paid_events)
),
combined_events AS (
  SELECT * FROM filtered_paid_events
  UNION ALL
  SELECT * FROM filtered_fallback_events
),
attribution_weights AS (
  SELECT
    channel,
    shopify_shop,
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    -- Calculate attribution weight per event: distribute across channels, ads, then events
    (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
    AS attribution_weight
  FROM combined_events
),
event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
  GROUP BY channel, shopify_shop
),
channel_spend AS (
  SELECT
    channel,
    SUM(spend) AS ad_spend
  FROM int_ad_spend
  WHERE shop_name = {shop_name:String}
    AND date_time >= {start_date:String}
    AND date_time < {end_date:String}
  GROUP BY channel
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, cs.channel) AS channel,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(cs.ad_spend, 0) AS ad_spend,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN ea.total_attributed_revenue / cs.ad_spend
    ELSE 0
  END AS roas,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(cs.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(cs.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / cs.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN channel_spend cs ON ea.channel = cs.channel
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- AD-LEVEL QUERIES (similar to getPixelChannelPerformance API)
-- Filter by: shop, date range, attribution model, SPECIFIC CHANNEL
-- Group by: campaign, ad set, ad
-- Returns: Hierarchical campaign -> ad set -> ad metrics
-- ======================================================================================
-- 6. FIRST CLICK - AD LEVEL (for specific channel)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND is_first_event_overall = TRUE
    AND platform_ad_id IS NOT NULL
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
ad_spend AS (
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
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(ads.ad_spend, 0) AS ad_spend,
  COALESCE(ads.impressions, 0) AS impressions,
  COALESCE(ads.clicks, 0) AS clicks,
  COALESCE(ads.conversions, 0) AS conversions,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.total_attributed_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS roas,
  CASE
    WHEN COALESCE(ads.clicks, 0) > 0
    THEN COALESCE(ads.ad_spend, 0) / ads.clicks
    ELSE 0
  END AS cpc,
  CASE
    WHEN COALESCE(ads.impressions, 0) > 0
    THEN (COALESCE(ads.clicks, 0) * 100.0) / ads.impressions
    ELSE 0
  END AS ctr,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(ads.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 7. LINEAR ALL - AD LEVEL (for specific channel)
-- Note: For Last Click and Last Paid Click ad-level, just change the WHERE filter like in channel-level queries
-- For Linear Paid ad-level, add the paid filter logic like in channel-level query
WITH filtered_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND platform_ad_id IS NOT NULL
),
attribution_weights AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    -- Calculate attribution weight per event: distribute across channels, ads, then events
    (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
    AS attribution_weight
  FROM filtered_events
),
event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
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
ad_spend AS (
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
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(ads.ad_spend, 0) AS ad_spend,
  COALESCE(ads.impressions, 0) AS impressions,
  COALESCE(ads.clicks, 0) AS clicks,
  COALESCE(ads.conversions, 0) AS conversions,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.total_attributed_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS roas,
  CASE
    WHEN COALESCE(ads.clicks, 0) > 0
    THEN COALESCE(ads.ad_spend, 0) / ads.clicks
    ELSE 0
  END AS cpc,
  CASE
    WHEN COALESCE(ads.impressions, 0) > 0
    THEN (COALESCE(ads.clicks, 0) * 100.0) / ads.impressions
    ELSE 0
  END AS ctr,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(ads.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 8. LAST CLICK - AD LEVEL (for specific channel)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND is_last_event_overall = TRUE
    AND platform_ad_id IS NOT NULL
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
ad_spend AS (
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
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(ads.ad_spend, 0) AS ad_spend,
  COALESCE(ads.impressions, 0) AS impressions,
  COALESCE(ads.clicks, 0) AS clicks,
  COALESCE(ads.conversions, 0) AS conversions,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.total_attributed_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS roas,
  CASE
    WHEN COALESCE(ads.clicks, 0) > 0
    THEN COALESCE(ads.ad_spend, 0) / ads.clicks
    ELSE 0
  END AS cpc,
  CASE
    WHEN COALESCE(ads.impressions, 0) > 0
    THEN (COALESCE(ads.clicks, 0) * 100.0) / ads.impressions
    ELSE 0
  END AS ctr,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(ads.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 9. LAST PAID CLICK - AD LEVEL (for specific channel)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND (
      (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
      OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
    )
    AND platform_ad_id IS NOT NULL
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
ad_spend AS (
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
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(ads.ad_spend, 0) AS ad_spend,
  COALESCE(ads.impressions, 0) AS impressions,
  COALESCE(ads.clicks, 0) AS clicks,
  COALESCE(ads.conversions, 0) AS conversions,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.total_attributed_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS roas,
  CASE
    WHEN COALESCE(ads.clicks, 0) > 0
    THEN COALESCE(ads.ad_spend, 0) / ads.clicks
    ELSE 0
  END AS cpc,
  CASE
    WHEN COALESCE(ads.impressions, 0) > 0
    THEN (COALESCE(ads.clicks, 0) * 100.0) / ads.impressions
    ELSE 0
  END AS ctr,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(ads.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 10. LINEAR PAID - AD LEVEL (for specific channel)
WITH filtered_paid_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND is_paid_channel = TRUE
    AND platform_ad_id IS NOT NULL
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
    AND channel = {channel:String}
    AND order_id NOT IN (SELECT order_id FROM orders_with_paid_events)
    AND platform_ad_id IS NOT NULL
),
combined_events AS (
  SELECT * FROM filtered_paid_events
  UNION ALL
  SELECT * FROM filtered_fallback_events
),
attribution_weights AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    -- Calculate attribution weight per event: distribute across channels, ads, then events
    (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
    AS attribution_weight
  FROM combined_events
),
event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    platform_ad_campaign_id,
    platform_ad_set_id,
    platform_ad_id,
    ad_campaign_pk,
    ad_set_pk,
    ad_pk,
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
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
ad_spend AS (
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
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  COALESCE(ea.channel, ads.channel) AS channel,
  COALESCE(ea.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
  COALESCE(ea.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
  COALESCE(ea.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
  COALESCE(ea.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
  COALESCE(ea.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
  COALESCE(ea.ad_pk, ads.ad_pk) AS ad_pk,
  COALESCE(ea.total_attributed_orders, 0) AS attributed_orders,
  COALESCE(ea.total_attributed_revenue, 0) AS attributed_revenue,
  COALESCE(ea.distinct_orders_touched, 0) AS distinct_orders_touched,
  COALESCE(ea.total_attributed_cogs, 0) AS attributed_cogs,
  COALESCE(ea.total_attributed_payment_fees, 0) AS attributed_payment_fees,
  COALESCE(ea.total_attributed_tax, 0) AS attributed_tax,
  COALESCE(ads.ad_spend, 0) AS ad_spend,
  COALESCE(ads.impressions, 0) AS impressions,
  COALESCE(ads.clicks, 0) AS clicks,
  COALESCE(ads.conversions, 0) AS conversions,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.total_attributed_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS roas,
  CASE
    WHEN COALESCE(ads.clicks, 0) > 0
    THEN COALESCE(ads.ad_spend, 0) / ads.clicks
    ELSE 0
  END AS cpc,
  CASE
    WHEN COALESCE(ads.impressions, 0) > 0
    THEN (COALESCE(ads.clicks, 0) * 100.0) / ads.impressions
    ELSE 0
  END AS ctr,
  COALESCE(ea.total_attributed_revenue, 0) -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ea.total_attributed_tax, 0) END -
  COALESCE(ea.total_attributed_cogs, 0) -
  COALESCE(ea.total_attributed_payment_fees, 0) -
  COALESCE(ads.ad_spend, 0) AS net_profit,
  COALESCE(ea.first_time_customer_orders, 0) AS first_time_customer_orders,
  COALESCE(ea.first_time_customer_revenue, 0) AS first_time_customer_revenue,
  CASE
    WHEN COALESCE(ads.ad_spend, 0) > 0
    THEN COALESCE(ea.first_time_customer_revenue, 0) / ads.ad_spend
    ELSE 0
  END AS first_time_customer_roas
FROM event_attribution ea
FULL OUTER JOIN ad_spend ads ON
  ea.platform_ad_id = ads.platform_ad_id
  AND ea.platform_ad_set_id = ads.platform_ad_set_id
  AND ea.platform_ad_campaign_id = ads.platform_ad_campaign_id
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- CAMPAIGN-LEVEL QUERIES FOR NON-AD SPEND CHANNELS
-- These use the 'campaign' text column (from UTM campaigns, referrers, etc.)
-- For channels: organic, direct, email, social, etc. (non meta-ads/google-ads/taboola/tiktok-ads)
-- ======================================================================================
-- 11. FIRST CLICK - CAMPAIGN LEVEL (for specific channel)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND is_first_event_overall = TRUE
  GROUP BY channel, shopify_shop, campaign
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  ea.channel,
  ea.campaign,
  ea.total_attributed_orders AS attributed_orders,
  ea.total_attributed_revenue AS attributed_revenue,
  ea.distinct_orders_touched,
  ea.total_attributed_cogs AS attributed_cogs,
  ea.total_attributed_payment_fees AS attributed_payment_fees,
  ea.total_attributed_tax AS attributed_tax,
  ea.total_attributed_revenue -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE ea.total_attributed_tax END -
  ea.total_attributed_cogs -
  ea.total_attributed_payment_fees AS net_profit,
  ea.first_time_customer_orders,
  ea.first_time_customer_revenue
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 12. LAST CLICK - CAMPAIGN LEVEL (for specific channel)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND is_last_event_overall = TRUE
  GROUP BY channel, shopify_shop, campaign
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  ea.channel,
  ea.campaign,
  ea.total_attributed_orders AS attributed_orders,
  ea.total_attributed_revenue AS attributed_revenue,
  ea.distinct_orders_touched,
  ea.total_attributed_cogs AS attributed_cogs,
  ea.total_attributed_payment_fees AS attributed_payment_fees,
  ea.total_attributed_tax AS attributed_tax,
  ea.total_attributed_revenue -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE ea.total_attributed_tax END -
  ea.total_attributed_cogs -
  ea.total_attributed_payment_fees AS net_profit,
  ea.first_time_customer_orders,
  ea.first_time_customer_revenue
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 13. LAST PAID CLICK - CAMPAIGN LEVEL (for specific channel)
WITH event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    COUNT(DISTINCT order_id) AS total_attributed_orders,
    SUM(total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(total_cogs) AS total_attributed_cogs,
    SUM(payment_fees) AS total_attributed_payment_fees,
    SUM(total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN 1 ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN total_price ELSE 0 END) AS first_time_customer_revenue
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND (
      (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
      OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
    )
  GROUP BY channel, shopify_shop, campaign
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  ea.channel,
  ea.campaign,
  ea.total_attributed_orders AS attributed_orders,
  ea.total_attributed_revenue AS attributed_revenue,
  ea.distinct_orders_touched,
  ea.total_attributed_cogs AS attributed_cogs,
  ea.total_attributed_payment_fees AS attributed_payment_fees,
  ea.total_attributed_tax AS attributed_tax,
  ea.total_attributed_revenue -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE ea.total_attributed_tax END -
  ea.total_attributed_cogs -
  ea.total_attributed_payment_fees AS net_profit,
  ea.first_time_customer_orders,
  ea.first_time_customer_revenue
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 14. LINEAR ALL - CAMPAIGN LEVEL (for specific channel)
WITH filtered_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
),
attribution_weights AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    -- Calculate attribution weight per event
    (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT campaign) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, campaign)
    AS attribution_weight
  FROM filtered_events
),
event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
  GROUP BY channel, shopify_shop, campaign
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  ea.channel,
  ea.campaign,
  ea.total_attributed_orders AS attributed_orders,
  ea.total_attributed_revenue AS attributed_revenue,
  ea.distinct_orders_touched,
  ea.total_attributed_cogs AS attributed_cogs,
  ea.total_attributed_payment_fees AS attributed_payment_fees,
  ea.total_attributed_tax AS attributed_tax,
  ea.total_attributed_revenue -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE ea.total_attributed_tax END -
  ea.total_attributed_cogs -
  ea.total_attributed_payment_fees AS net_profit,
  ea.first_time_customer_orders,
  ea.first_time_customer_revenue
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
-- ======================================================================================
-- 15. LINEAR PAID - CAMPAIGN LEVEL (for specific channel)
WITH filtered_paid_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {shop_name:String}
    AND event_timestamp >= {start_date:String}
    AND event_timestamp < {end_date:String}
    AND channel = {channel:String}
    AND is_paid_channel = TRUE
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
    AND channel = {channel:String}
    AND order_id NOT IN (SELECT order_id FROM orders_with_paid_events)
),
combined_events AS (
  SELECT * FROM filtered_paid_events
  UNION ALL
  SELECT * FROM filtered_fallback_events
),
attribution_weights AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    order_id,
    total_price,
    total_cogs,
    payment_fees,
    total_tax,
    is_first_customer_order,
    -- Calculate attribution weight per event
    (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
    / COUNT(DISTINCT campaign) OVER (PARTITION BY order_id, channel)
    / COUNT(*) OVER (PARTITION BY order_id, channel, campaign)
    AS attribution_weight
  FROM combined_events
),
event_attribution AS (
  SELECT
    channel,
    shopify_shop,
    campaign,
    SUM(attribution_weight) AS total_attributed_orders,
    SUM(attribution_weight * total_price) AS total_attributed_revenue,
    COUNT(DISTINCT order_id) AS distinct_orders_touched,
    SUM(attribution_weight * total_cogs) AS total_attributed_cogs,
    SUM(attribution_weight * payment_fees) AS total_attributed_payment_fees,
    SUM(attribution_weight * total_tax) AS total_attributed_tax,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
    SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight * total_price ELSE 0 END) AS first_time_customer_revenue
  FROM attribution_weights
  GROUP BY channel, shopify_shop, campaign
),
shop_vat_settings AS (
  SELECT
    shop_name,
    COALESCE(ignore_vat, false) AS ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = {shop_name:String}
  LIMIT 1
)
SELECT
  ea.channel,
  ea.campaign,
  ea.total_attributed_orders AS attributed_orders,
  ea.total_attributed_revenue AS attributed_revenue,
  ea.distinct_orders_touched,
  ea.total_attributed_cogs AS attributed_cogs,
  ea.total_attributed_payment_fees AS attributed_payment_fees,
  ea.total_attributed_tax AS attributed_tax,
  ea.total_attributed_revenue -
  CASE WHEN svs.ignore_vat = true THEN 0 ELSE ea.total_attributed_tax END -
  ea.total_attributed_cogs -
  ea.total_attributed_payment_fees AS net_profit,
  ea.first_time_customer_orders,
  ea.first_time_customer_revenue
FROM event_attribution ea
CROSS JOIN shop_vat_settings svs
ORDER BY attributed_revenue DESC;
