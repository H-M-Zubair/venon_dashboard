export const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(),
    account_id String,
    visitor_id String,
    session_id String,
    event_type LowCardinality(String),
    event_name String,
    page_url String,
    referrer_url String,
    user_agent String,
    ip_address IPv4,
    country_code FixedString(2),
    device_type LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    utm_source String,
    utm_medium String,
    utm_campaign String,
    utm_content String,
    utm_term String,
    properties String, -- JSON string
    created_at DateTime64(3) DEFAULT now64()
) ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (account_id, visitor_id, timestamp, id)
SETTINGS index_granularity = 8192;
`;

export const CREATE_AD_METRICS_TABLE = `
CREATE TABLE IF NOT EXISTS ad_metrics (
    id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime64(3) DEFAULT now64(),
    account_id String,
    platform LowCardinality(String), -- 'facebook', 'google', 'tiktok', etc.
    ad_account_id String,
    campaign_id String,
    campaign_name String,
    ad_set_id String,
    ad_set_name String,
    ad_id String,
    ad_name String,
    impressions UInt64,
    clicks UInt64,
    spend Decimal64(4),
    conversions UInt32,
    conversion_value Decimal64(4),
    reach UInt64,
    frequency Decimal32(2),
    cpm Decimal64(4),
    cpc Decimal64(4),
    ctr Decimal32(4),
    roas Decimal32(4),
    currency FixedString(3),
    date_start Date,
    date_end Date,
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY (platform, toYYYYMM(date_start))
ORDER BY (account_id, platform, ad_account_id, campaign_id, ad_set_id, ad_id, date_start)
SETTINGS index_granularity = 8192;
`;

export const CREATE_ORDERS_TABLE = `
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT generateUUIDv4(),
    order_id String,
    account_id String,
    visitor_id String,
    session_id String,
    email String,
    phone String,
    first_name String,
    last_name String,
    total_amount Decimal64(4),
    currency FixedString(3),
    order_status LowCardinality(String),
    payment_status LowCardinality(String),
    shipping_country String,
    shipping_state String,
    shipping_city String,
    shipping_zip String,
    discount_amount Decimal64(4),
    tax_amount Decimal64(4),
    shipping_amount Decimal64(4),
    gateway_fees Decimal64(4),
    cost_of_goods Decimal64(4),
    profit Decimal64(4),
    utm_source String,
    utm_medium String,
    utm_campaign String,
    utm_content String,
    utm_term String,
    attribution_source String,
    attribution_medium String,
    attribution_campaign String,
    first_click_timestamp DateTime64(3),
    last_click_timestamp DateTime64(3),
    order_timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(order_timestamp)
ORDER BY (account_id, order_id, order_timestamp)
SETTINGS index_granularity = 8192;
`;

export const CREATE_ATTRIBUTION_TABLE = `
CREATE TABLE IF NOT EXISTS attribution (
    id UUID DEFAULT generateUUIDv4(),
    account_id String,
    visitor_id String,
    session_id String,
    order_id String,
    platform LowCardinality(String),
    campaign_id String,
    campaign_name String,
    ad_set_id String,
    ad_set_name String,
    ad_id String,
    ad_name String,
    click_timestamp DateTime64(3),
    conversion_timestamp DateTime64(3),
    conversion_value Decimal64(4),
    attribution_model LowCardinality(String), -- 'first_click', 'last_click', 'linear'
    attribution_weight Decimal32(4),
    attribution_value Decimal64(4),
    created_at DateTime64(3) DEFAULT now64()
) ENGINE = ReplacingMergeTree(created_at)
PARTITION BY (platform, toYYYYMM(click_timestamp))
ORDER BY (account_id, visitor_id, platform, campaign_id, click_timestamp)
SETTINGS index_granularity = 8192;
`;

export const CREATE_VISITORS_TABLE = `
CREATE TABLE IF NOT EXISTS visitors (
    id UUID DEFAULT generateUUIDv4(),
    visitor_id String,
    account_id String,
    first_seen DateTime64(3),
    last_seen DateTime64(3),
    session_count UInt32,
    page_view_count UInt32,
    total_session_duration UInt32,
    first_referrer String,
    first_utm_source String,
    first_utm_medium String,
    first_utm_campaign String,
    country_code FixedString(2),
    device_type LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    is_converted UInt8,
    total_order_value Decimal64(4),
    order_count UInt32,
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(first_seen)
ORDER BY (account_id, visitor_id)
SETTINGS index_granularity = 8192;
`;

export const ALL_TABLES = [
  CREATE_EVENTS_TABLE,
  CREATE_AD_METRICS_TABLE,
  CREATE_ORDERS_TABLE,
  CREATE_ATTRIBUTION_TABLE,
  CREATE_VISITORS_TABLE,
];
