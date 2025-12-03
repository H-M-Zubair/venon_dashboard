-- EVENT-BASED ATTRIBUTION - ORDER DETAILS QUERIES
-- Use these queries to inspect which specific orders qualify for attribution
-- Helps with debugging and understanding the attribution logic
-- ======================================================================================
-- PARAMETERS - Set these first
-- ======================================================================================
SET param_shop_name = 'gaming-klamotten';
SET param_start_date = '2025-06-01';
SET param_end_date = '2025-06-02';
SET param_channel = 'google-ads';  -- For channel-specific queries
-- ======================================================================================
-- 1. FIRST CLICK - Which orders have their FIRST event in date range?
-- ======================================================================================
SELECT
  order_id,
  order_number,
  order_timestamp,
  event_timestamp as first_event_timestamp,
  channel,
  is_paid_channel,
  total_price,
  total_cogs,
  payment_fees,
  total_tax,
  is_first_customer_order,
  platform_ad_campaign_id,
  platform_ad_set_id,
  platform_ad_id,
  campaign,
  -- Useful for verification
  event_rank_asc,  -- Should always be 1
  total_events_for_order,
  DATEDIFF('day', event_timestamp, order_timestamp) as days_from_event_to_order
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND is_first_event_overall = TRUE
ORDER BY total_price DESC, order_timestamp DESC;
-- ======================================================================================
-- 2. LAST CLICK - Which orders have their LAST event in date range?
-- ======================================================================================
SELECT
  order_id,
  order_number,
  order_timestamp,
  event_timestamp as last_event_timestamp,
  channel,
  is_paid_channel,
  total_price,
  total_cogs,
  payment_fees,
  total_tax,
  is_first_customer_order,
  platform_ad_campaign_id,
  platform_ad_set_id,
  platform_ad_id,
  campaign,
  -- Useful for verification
  event_rank_desc,  -- Should always be 1
  total_events_for_order,
  DATEDIFF('day', event_timestamp, order_timestamp) as days_from_event_to_order
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND is_last_event_overall = TRUE
ORDER BY total_price DESC, order_timestamp DESC;
-- ======================================================================================
-- 3. LAST PAID CLICK - Which orders have their LAST PAID event in date range?
-- ======================================================================================
SELECT
  order_id,
  order_number,
  order_timestamp,
  event_timestamp as last_paid_event_timestamp,
  channel,
  is_paid_channel,
  total_price,
  total_cogs,
  payment_fees,
  total_tax,
  is_first_customer_order,
  platform_ad_campaign_id,
  platform_ad_set_id,
  platform_ad_id,
  campaign,
  -- Useful for verification
  has_any_paid_events,
  is_last_paid_event_overall,
  is_last_event_overall,
  total_events_for_order,
  total_paid_events_for_order,
  DATEDIFF('day', event_timestamp, order_timestamp) as days_from_event_to_order,
  CASE
    WHEN is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE THEN 'Last Paid Event'
    WHEN is_last_event_overall = TRUE AND has_any_paid_events = FALSE THEN 'Fallback: Last Event (no paid)'
  END as attribution_reason
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND (
    (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
    OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
  )
ORDER BY total_price DESC, order_timestamp DESC;
-- ======================================================================================
-- 4. LINEAR ALL - Which orders have ANY events in date range?
-- Shows all events (not just one per order) with calculated attribution weight
-- ======================================================================================
WITH filtered_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {param_shop_name:String}
    AND event_timestamp >= {param_start_date:String}
    AND event_timestamp < {param_end_date:String}
)
SELECT
  order_id,
  order_number,
  order_timestamp,
  event_id,
  event_timestamp,
  channel,
  is_paid_channel,
  total_price,
  is_first_customer_order,
  platform_ad_campaign_id,
  platform_ad_set_id,
  platform_ad_id,
  campaign,
  -- Calculated attribution weight (distributes: 1) across channels, 2) across ads, 3) across events)
  (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
  / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
  / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
  AS attribution_weight,
  -- Show how much revenue this event gets
  ((1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
  / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
  / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)) * total_price
  AS attributed_revenue,
  -- Verification fields
  total_events_for_order,
  total_distinct_channels_for_order,
  events_in_same_channel_for_order,
  events_in_same_ad_for_order,
  event_rank_asc,
  DATEDIFF('day', event_timestamp, order_timestamp) as days_from_event_to_order
FROM filtered_events
ORDER BY order_id, event_timestamp;
-- ======================================================================================
-- 5. LINEAR PAID - Which orders have PAID events in date range?
-- Shows paid events + fallback events (for orders with no paid events in range)
-- ======================================================================================
WITH filtered_paid_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {param_shop_name:String}
    AND event_timestamp >= {param_start_date:String}
    AND event_timestamp < {param_end_date:String}
    AND is_paid_channel = TRUE
),
orders_with_paid_events AS (
  SELECT DISTINCT order_id
  FROM filtered_paid_events
),
filtered_fallback_events AS (
  SELECT *
  FROM int_event_metadata
  WHERE shopify_shop = {param_shop_name:String}
    AND event_timestamp >= {param_start_date:String}
    AND event_timestamp < {param_end_date:String}
    AND order_id NOT IN (SELECT order_id FROM orders_with_paid_events)
),
combined_events AS (
  SELECT *, 'Paid Event' as event_type FROM filtered_paid_events
  UNION ALL
  SELECT *, 'Fallback Event (no paid)' as event_type FROM filtered_fallback_events
)
SELECT
  order_id,
  order_number,
  order_timestamp,
  event_id,
  event_timestamp,
  channel,
  is_paid_channel,
  event_type,
  total_price,
  is_first_customer_order,
  platform_ad_campaign_id,
  platform_ad_set_id,
  platform_ad_id,
  campaign,
  -- Calculated attribution weight (distributes: 1) across channels, 2) across ads, 3) across events)
  (1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
  / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
  / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)
  AS attribution_weight,
  -- Show how much revenue this event gets
  ((1.0 / COUNT(DISTINCT channel) OVER (PARTITION BY order_id))
  / COUNT(DISTINCT (ad_pk, ad_set_pk, ad_campaign_pk)) OVER (PARTITION BY order_id, channel)
  / COUNT(*) OVER (PARTITION BY order_id, channel, ad_pk, ad_set_pk, ad_campaign_pk)) * total_price
  AS attributed_revenue,
  -- Verification fields
  total_events_for_order,
  total_paid_events_for_order,
  total_distinct_channels_for_order,
  total_distinct_paid_channels_for_order,
  event_rank_asc,
  DATEDIFF('day', event_timestamp, order_timestamp) as days_from_event_to_order
FROM combined_events
ORDER BY order_id, event_timestamp;
-- ======================================================================================
-- 6. SUMMARY - Count of qualifying orders per model
-- Quick overview of how many orders qualify for each attribution model
-- ======================================================================================
SELECT
  'First Click' as attribution_model,
  COUNT(DISTINCT order_id) as qualifying_orders,
  SUM(total_price) as total_revenue
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND is_first_event_overall = TRUE
UNION ALL
SELECT
  'Last Click' as attribution_model,
  COUNT(DISTINCT order_id) as qualifying_orders,
  SUM(total_price) as total_revenue
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND is_last_event_overall = TRUE
UNION ALL
SELECT
  'Last Paid Click' as attribution_model,
  COUNT(DISTINCT order_id) as qualifying_orders,
  SUM(total_price) as total_revenue
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND (
    (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
    OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
  )
UNION ALL
SELECT
  'Linear All' as attribution_model,
  COUNT(DISTINCT order_id) as qualifying_orders,
  SUM(total_price) as total_revenue
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
UNION ALL
SELECT
  'Linear Paid' as attribution_model,
  COUNT(DISTINCT order_id) as qualifying_orders,
  SUM(total_price) as total_revenue
FROM (
  SELECT order_id, total_price
  FROM int_event_metadata
  WHERE shopify_shop = {param_shop_name:String}
    AND event_timestamp >= {param_start_date:String}
    AND event_timestamp < {param_end_date:String}
    AND is_paid_channel = TRUE
  UNION ALL
  SELECT em.order_id, em.total_price
  FROM int_event_metadata em
  WHERE shopify_shop = {param_shop_name:String}
    AND event_timestamp >= {param_start_date:String}
    AND event_timestamp < {param_end_date:String}
    AND order_id NOT IN (
      SELECT DISTINCT order_id
      FROM int_event_metadata
      WHERE shopify_shop = {param_shop_name:String}
        AND event_timestamp >= {param_start_date:String}
        AND event_timestamp < {param_end_date:String}
        AND is_paid_channel = TRUE
    )
)
ORDER BY attribution_model;
-- ======================================================================================
-- 7. CHANNEL-SPECIFIC ORDER DETAILS
-- Show orders for a specific channel (useful for ad-level debugging)
-- ======================================================================================
SELECT
  order_id,
  order_number,
  order_timestamp,
  event_timestamp as first_event_timestamp,
  channel,
  is_paid_channel,
  total_price,
  platform_ad_campaign_id,
  platform_ad_set_id,
  platform_ad_id,
  ad_campaign_pk,
  ad_set_pk,
  ad_pk,
  campaign,
  is_first_customer_order,
  -- Verification
  event_rank_asc,
  total_events_for_order,
  DATEDIFF('day', event_timestamp, order_timestamp) as days_from_event_to_order
FROM int_event_metadata
WHERE shopify_shop = {param_shop_name:String}
  AND event_timestamp >= {param_start_date:String}
  AND event_timestamp < {param_end_date:String}
  AND channel = {param_channel:String}
  AND is_first_event_overall = TRUE
  AND platform_ad_id IS NOT NULL
ORDER BY total_price DESC;
-- ======================================================================================
-- 8. COMPARE ORDER-BASED vs EVENT-BASED for same date range
-- This shows the difference between filtering by order_timestamp vs event_timestamp
-- ======================================================================================
WITH event_based_orders AS (
  SELECT DISTINCT order_id, 'Event-Based' as source
  FROM int_event_metadata
  WHERE shopify_shop = {param_shop_name:String}
    AND event_timestamp >= {param_start_date:String}
    AND event_timestamp < {param_end_date:String}
    AND is_first_event_overall = TRUE
),
order_based_orders AS (
  SELECT DISTINCT order_id, 'Order-Based' as source
  FROM int_event_metadata
  WHERE shopify_shop = {param_shop_name:String}
    AND order_timestamp >= {param_start_date:String}
    AND order_timestamp < {param_end_date:String}
    AND is_first_event_overall = TRUE
)
SELECT
  'Only in Event-Based' as comparison,
  COUNT(*) as order_count
FROM event_based_orders
WHERE order_id NOT IN (SELECT order_id FROM order_based_orders)
UNION ALL
SELECT
  'Only in Order-Based' as comparison,
  COUNT(*) as order_count
FROM order_based_orders
WHERE order_id NOT IN (SELECT order_id FROM event_based_orders)
UNION ALL
SELECT
  'In Both' as comparison,
  COUNT(*) as order_count
FROM event_based_orders
WHERE order_id IN (SELECT order_id FROM order_based_orders);
