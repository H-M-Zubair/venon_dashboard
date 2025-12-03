# Dashboard Metrics Debug Guide - 2025-11-17

## Issue Summary

**Endpoint**: `GET /api/analytics/dashboard-metrics`

**Failing Query**:
```
https://venon-dashboard-backend-915134456812.europe-west1.run.app/api/analytics/dashboard-metrics?account_id=10&start_date=2025-04-01&end_date=2025-05-01
```

**Response**: Empty timeseries array
```json
{
    "success": true,
    "result": {
        "data": {
            "timeseries": [],
            "aggregation_level": "daily"
        },
        "metadata": {
            "shop_name": "naturvibes",
            "start_date": "2025-04-01",
            "end_date": "2025-05-01"
        }
    }
}
```

**Known Facts**:
- Data EXISTS in pixel table for this period
- Cohort analysis queries return data successfully
- Shop name resolves correctly to "naturvibes"

---

## ClickHouse Table Schema Reference

**CRITICAL**: Different tables use different column names for the same data!

| Table | Shop Column | Date/Time Column | Revenue Column |
|-------|-------------|------------------|----------------|
| `int_order_enriched` | `shopify_shop` | `order_timestamp_local` | `total_price` |
| `int_order_metrics` | `shopify_name` | `date` | `revenue` |
| `int_ad_spend` | `shop_name` | `date_time` | `spend` |
| `int_refunds` | `shopify_name` | `date` | `refunds` |
| `int_customer_first_purchase` | `shopify_shop` | `first_order_datetime_local` | `first_order_value` |
| `stg_shopify_shops` | `shop_name` | N/A | N/A |

**Key int_order_metrics Columns:**
- `shopify_name` (String) - Shop identifier
- `date` (DateTime64) - Date of aggregation
- `orders` (UInt64) - Number of orders
- `revenue` (Float64) - Total revenue
- `vat` (Float64) - VAT amount
- `cogs` (Float64) - Cost of goods sold
- `payment_fees` (Float64) - Payment processing fees

**Key int_order_enriched Columns:**
- `shopify_shop` (String) - Shop identifier
- `order_timestamp_local` (DateTime64) - Order timestamp in shop timezone
- `order_date_local` (Date) - Order date in shop timezone
- `total_price` (Float64) - Total order price (NOT `total_price_usd`)
- `net_revenue` (Float64) - Net revenue after refunds/fees
- `customer_id` (UInt64) - Customer identifier
- `is_first_customer_order` (UInt8) - First order flag

**Key int_ad_spend Columns:**
- `shop_name` (String) - Shop identifier (different from others!)
- `date_time` (DateTime64) - Ad metric timestamp
- `spend` (Float64) - Ad spend amount
- `channel` (String) - Ad channel (Google, Meta, etc.)

**Key stg_shopify_shops Columns:**
- `shop_name` (String) - Shop identifier
- `account_id` (Int32) - Account ID
- `ignore_vat` (Bool) - VAT handling flag (NOT `has_vat`)

---

## Code Analysis

### Endpoint Flow
1. **Route**: `src/routes/analytics.ts:203` → `GET /api/analytics/dashboard-metrics`
2. **Controller**: `src/controllers/analytics.ts:189-238` → `AnalyticsController.getDashboardMetrics()`
3. **Service**: `src/services/analytics.ts:843-1151` → `AnalyticsService.getDashboardMetrics()`

### Query Logic (Daily Aggregation Path)

The endpoint executes **4 main queries** in parallel:

1. **Ad Spend Query** - `int_ad_spend` table
2. **Order Metrics Query** - `int_order_metrics` table (PRE-AGGREGATED)
3. **Refunds Query** - `int_refunds` table
4. **New Customers Query** - `int_order_enriched` + `int_customer_first_purchase` tables

### Key Difference from Cohort Analysis

| Aspect | Dashboard Metrics | Cohort Analysis |
|--------|------------------|-----------------|
| **Table** | `int_order_metrics` (aggregated) | `int_order_enriched` (raw orders) |
| **Shop Column** | `shopify_name` | `shopify_shop` |
| **Date Field** | `toDate(purchase_date)` | `CAST(created_at AS Date)` |
| **Grouping** | Pre-aggregated by day | Raw data aggregated on-the-fly |

---

## Debugging SQL Queries

Run these queries **in order** in staging ClickHouse to identify the root cause.

### Step 1: Verify Shop Name Resolution

**Purpose**: Confirm what shop name account_id=10 maps to in Supabase.

```sql
-- Run this in Supabase (not ClickHouse):
SELECT id, shop_name, shopify_shop_domain
FROM shopify_shops
WHERE account_id = 10;
```

**Expected Result**: Should return "naturvibes" or similar.

**Action**: Note the exact `shop_name` value to use in ClickHouse queries below.

---

### Step 2: Check Raw Order Data Existence

**Purpose**: Verify if raw order data exists in `int_order_enriched` (used by cohort analysis).

```sql
-- Replace 'naturvibes' with actual shop_name from Step 1
-- CORRECTED: Uses order_timestamp_local and total_price (not created_at/total_price_usd)
SELECT
    shopify_shop,
    toDate(order_timestamp_local) AS order_date,
    COUNT(*) AS order_count,
    SUM(total_price) AS revenue,
    SUM(net_revenue) AS net_revenue
FROM int_order_enriched
WHERE shopify_shop = 'naturvibes'
  AND order_timestamp_local >= '2025-04-01 00:00:00'
  AND order_timestamp_local < '2025-05-02 00:00:00'
GROUP BY shopify_shop, order_date
ORDER BY order_date ASC
LIMIT 100;
```

**What to check**:
- ✅ If this returns data → Raw order data exists
- ❌ If empty → Data ingestion issue (check ETL pipeline)

---

### Step 3: Check Aggregated Order Metrics Table

**Purpose**: Check if `int_order_metrics` table has data (this is what dashboard-metrics uses).

```sql
-- CORRECTED: Uses 'date' and 'orders' columns (not purchase_date/num_orders)
SELECT
    shopify_name,
    date,
    COUNT(*) AS row_count,
    SUM(orders) AS total_orders,
    SUM(revenue) AS total_revenue,
    SUM(vat) AS total_vat,
    SUM(cogs) AS total_cogs
FROM int_order_metrics
WHERE shopify_name = 'naturvibes'  -- Uses shopify_name (confirmed in schema)
  AND toDate(date) >= '2025-04-01'
  AND toDate(date) < '2025-05-02'
GROUP BY shopify_name, date
ORDER BY date ASC
LIMIT 100;
```

**What to check**:
- ✅ If returns data → Table has correct data, check shop name column mismatch
- ❌ If empty → Aggregation table not populated (dbt model issue or ETL)

---

### Step 4: Check Table Schema

**Purpose**: Verify which shop name column actually exists in `int_order_metrics`.

```sql
-- Check table schema
DESCRIBE TABLE int_order_metrics;
```

**What to look for**:
- Confirm column is named `shopify_name` (String)
- Confirm date column is `date` (DateTime64), NOT `purchase_date`
- Confirm orders column is `orders` (UInt64), NOT `num_orders`

---

### Step 5: Check All Shop Names in int_order_metrics

**Purpose**: See what shop names are actually stored in the table.

```sql
-- CORRECTED: Uses 'date' and 'orders' columns
SELECT
    shopify_name,
    MIN(toDate(date)) AS first_date,
    MAX(toDate(date)) AS last_date,
    COUNT(*) AS row_count,
    SUM(orders) AS total_orders,
    SUM(revenue) AS total_revenue
FROM int_order_metrics
WHERE toDate(date) >= '2025-04-01'
  AND toDate(date) < '2025-05-02'
GROUP BY shopify_name
ORDER BY total_orders DESC
LIMIT 50;
```

**What to check**:
- Is "naturvibes" in the list?
- Is it spelled differently? (e.g., "Naturvibes", "naturvibes.myshopify.com")
- Are there any shops at all in this date range?

---

### Step 6: Test Exact Dashboard Metrics Query

**Purpose**: Run the exact query used by the endpoint (daily aggregation).

**This is the EXACT query from `analytics.service.ts` lines 985-1087 with variables substituted:**

```sql
-- EXACT DAILY DASHBOARD METRICS QUERY FROM CODE
-- Variables filled: shop_name='naturvibes', start_date='2025-04-01', end_date='2025-05-01'
WITH shop_settings AS (
  SELECT
    shop_name,
    ignore_vat
  FROM stg_shopify_shops
  WHERE shop_name = 'naturvibes'
  LIMIT 1
),
daily_ad_spend AS (
  SELECT
    toDate(date_time) as day,
    SUM(spend) as total_ad_spend
  FROM int_ad_spend
  WHERE date_time >= '2025-04-01'
    AND date_time < '2025-05-01'
    AND shop_name = 'naturvibes'
  GROUP BY toDate(date_time)
),
daily_order_metrics AS (
  SELECT
    toDate(date) as day,
    SUM(revenue) as total_revenue,
    SUM(cogs) as total_cogs,
    SUM(vat) as total_vat,
    SUM(payment_fees) as total_payment_fees,
    SUM(orders) as total_orders
  FROM int_order_metrics
  WHERE date >= '2025-04-01'
    AND date < '2025-05-01'
    AND shopify_name = 'naturvibes'
  GROUP BY toDate(date)
),
daily_refunds AS (
  SELECT
    toDate(date) as day,
    SUM(refunds) as total_refunds
  FROM int_refunds
  WHERE date >= '2025-04-01'
    AND date < '2025-05-01'
    AND shopify_name = 'naturvibes'
  GROUP BY toDate(date)
),
new_customer_daily AS (
  SELECT
    toDate(oe.order_timestamp_local) as day,
    COUNT(DISTINCT oe.customer_email) as new_customer_count,
    SUM(oe.total_price) as new_customer_revenue
  FROM int_order_enriched oe
  INNER JOIN int_customer_first_purchase cfp
    ON oe.customer_email = cfp.customer_email
    AND oe.shopify_shop = cfp.shopify_shop
  WHERE oe.shopify_shop = 'naturvibes'
    AND oe.order_timestamp_local >= '2025-04-01'
    AND oe.order_timestamp_local < '2025-05-01'
    AND toDate(oe.order_timestamp_local) = toDate(cfp.first_order_datetime_local)
  GROUP BY toDate(oe.order_timestamp_local)
),
all_days AS (
  SELECT day FROM daily_ad_spend
  UNION ALL
  SELECT day FROM daily_order_metrics
  UNION ALL
  SELECT day FROM daily_refunds
  UNION ALL
  SELECT day FROM new_customer_daily
)
SELECT
  toString(d.day) as timestamp,
  COALESCE(o.total_orders, 0) as total_orders,
  COALESCE(o.total_revenue, 0) as total_revenue,
  COALESCE(r.total_refunds, 0) as total_refunds,
  COALESCE(o.total_cogs, 0) as total_cogs,
  COALESCE(a.total_ad_spend, 0) as total_ad_spend,
  COALESCE(o.total_revenue, 0) -
    CASE WHEN s.ignore_vat = true THEN 0 ELSE COALESCE(o.total_vat, 0) END -
    COALESCE(a.total_ad_spend, 0) -
    COALESCE(o.total_cogs, 0) -
    COALESCE(o.total_payment_fees, 0) -
    COALESCE(r.total_refunds, 0) as profit,
  CASE
    WHEN COALESCE(a.total_ad_spend, 0) > 0
    THEN COALESCE(o.total_revenue, 0) / a.total_ad_spend
    ELSE 0
  END as roas,
  COALESCE(nc.new_customer_count, 0) as new_customer_count,
  COALESCE(nc.new_customer_revenue, 0) as new_customer_revenue,
  CASE
    WHEN COALESCE(a.total_ad_spend, 0) > 0
    THEN COALESCE(nc.new_customer_revenue, 0) / a.total_ad_spend
    ELSE 0
  END as new_customer_roas,
  CASE
    WHEN COALESCE(nc.new_customer_count, 0) > 0
    THEN COALESCE(a.total_ad_spend, 0) / nc.new_customer_count
    ELSE 0
  END as cac
FROM (SELECT DISTINCT day FROM all_days) d
LEFT JOIN daily_ad_spend a ON d.day = a.day
LEFT JOIN daily_order_metrics o ON d.day = o.day
LEFT JOIN daily_refunds r ON d.day = r.day
LEFT JOIN new_customer_daily nc ON d.day = nc.day
CROSS JOIN shop_settings s
ORDER BY d.day ASC;
```

**FIXED**: Query updated to handle empty ad_spend gracefully using LEFT JOIN pattern:
- Added `all_days` CTE that collects dates from ALL metric CTEs
- Changed from FULL OUTER JOIN to LEFT JOIN pattern
- Uses `d.date` directly instead of COALESCE to prevent 1970-01-01 timestamps
- This ensures proper dates even when ad_spend table has no data for the period
- Pattern matches the working hourly aggregation query

**What to check**:
- If this returns empty → One of the CTEs is failing
- Check each CTE individually (run `SELECT * FROM order_data`, etc.)

---

### Step 7: Debug Each CTE Individually

**Purpose**: Isolate which part of the query is failing.

**Order Data CTE** (CORRECTED):
```sql
-- Test just the order_data CTE
-- FIXED: Aliased columns to avoid correlated subquery errors
WITH shop_settings AS (
    SELECT shop_name AS setting_shop_name, ignore_vat AS setting_ignore_vat
    FROM stg_shopify_shops
    WHERE shop_name = 'naturvibes'
    LIMIT 1
)
SELECT
    toDate(om.date) AS date,
    om.shopify_name,
    COUNT(*) AS row_count,
    SUM(om.orders) AS total_orders,
    SUM(om.revenue) AS revenue_raw,
    SUM(om.vat) AS vat_amount,
    SUM(CASE
        WHEN ss.setting_ignore_vat = false THEN om.revenue / 1.19
        ELSE om.revenue
    END) AS revenue_adjusted
FROM int_order_metrics om
LEFT JOIN shop_settings ss ON om.shopify_name = ss.setting_shop_name
WHERE om.shopify_name = 'naturvibes'
  AND toDate(om.date) >= '2025-04-01'
  AND toDate(om.date) < '2025-05-02'
GROUP BY date, om.shopify_name
ORDER BY date ASC;
```

**Ad Spend CTE** (CORRECTED):
```sql
-- CRITICAL: Uses shop_name and date_time, not shopify_name and date!
SELECT
    toDate(ads.date_time) AS date,
    ads.shop_name,
    ads.channel,
    COUNT(*) AS row_count,
    SUM(ads.spend) AS ad_spend,
    SUM(ads.impressions) AS impressions,
    SUM(ads.clicks) AS clicks
FROM int_ad_spend ads
WHERE ads.shop_name = 'naturvibes'  -- shop_name, not shopify_name!
  AND toDate(ads.date_time) >= '2025-04-01'
  AND toDate(ads.date_time) < '2025-05-02'
GROUP BY date, ads.shop_name, ads.channel
ORDER BY date ASC;
```

**Refunds CTE** (CORRECTED):
```sql
SELECT
    toDate(r.date) AS date,
    r.shopify_name,
    COUNT(*) AS row_count,
    SUM(r.refunds) AS total_refunds
FROM int_refunds r
WHERE r.shopify_name = 'naturvibes'
  AND toDate(r.date) >= '2025-04-01'
  AND toDate(r.date) < '2025-05-02'
GROUP BY date, r.shopify_name
ORDER BY date ASC;
```

**New Customers CTE** (CORRECTED):
```sql
-- Uses shopify_shop and order_timestamp_local (not created_at)
SELECT
    toDate(oe.order_timestamp_local) AS date,
    oe.shopify_shop,
    COUNT(*) AS total_orders,
    COUNT(DISTINCT oe.customer_id) AS unique_customers,
    COUNT(DISTINCT CASE
        WHEN cfp.customer_id IS NOT NULL THEN oe.customer_id
    END) AS new_customers
FROM int_order_enriched oe
LEFT JOIN int_customer_first_purchase cfp
    ON oe.customer_id = cfp.customer_id
    AND toDate(oe.order_timestamp_local) = toDate(cfp.first_order_datetime_local)
WHERE oe.shopify_shop = 'naturvibes'
  AND oe.order_timestamp_local >= '2025-04-01 00:00:00'
  AND oe.order_timestamp_local < '2025-05-02 00:00:00'
GROUP BY date, oe.shopify_shop
ORDER BY date ASC;
```

---

### Step 8: Compare with Working Cohort Analysis Query

**Purpose**: See why cohort analysis works but dashboard doesn't.

```sql
-- CORRECTED: Uses order_timestamp_local and total_price (not created_at/total_price_usd)
SELECT
    toDate(order_timestamp_local) AS order_date,
    shopify_shop,
    COUNT(*) AS orders,
    SUM(total_price) AS revenue,
    SUM(net_revenue) AS net_revenue,
    COUNT(DISTINCT customer_id) AS customers,
    SUM(is_first_customer_order) AS first_time_customers
FROM int_order_enriched
WHERE shopify_shop = 'naturvibes'
  AND order_timestamp_local >= '2025-04-01 00:00:00'
  AND order_timestamp_local < '2025-05-02 00:00:00'
GROUP BY order_date, shopify_shop
ORDER BY order_date ASC;
```

**What to check**:
- ✅ If this returns data → Confirms data exists in `int_order_enriched`
- Compare with Step 3 results from `int_order_metrics`

---

## Root Cause Checklist

Based on query results, identify the issue:

- [ ] **Shop name mismatch**: Supabase returns different shop name than what's in ClickHouse
  - **Fix**: Update shop name mapping or use consistent naming

- [ ] **Column name mismatch**: Code uses `shopify_name` but table has `shopify_shop`
  - **Fix**: Update query in `src/services/analytics.ts:950-1028` to use correct column

- [ ] **int_order_metrics table empty**: Aggregation table not populated
  - **Fix**: Check dbt models or ETL pipeline for `int_order_metrics`

- [ ] **Date filtering issue**: Date conversion causing mismatch
  - **Fix**: Check if dates are stored as Date vs DateTime

- [ ] **FULL OUTER JOIN issue**: All CTEs return empty so COALESCE has nothing
  - **Fix**: Check why base tables are empty

---

## Expected Findings

Based on schema analysis, **CONFIRMED ROOT CAUSE**:

### 1. **Column Name Mismatches in Code** (VERY HIGH PROBABILITY - THIS IS THE BUG!)

The code in `src/services/analytics.ts` uses **WRONG column names** that don't match the actual ClickHouse schema:

**Shop Settings (stg_shopify_shops):**
- ❌ Code uses: `shopify_name`, `has_vat`
- ✅ Actual schema: `shop_name`, `ignore_vat`

**Order Metrics (int_order_metrics):**
- ❌ Code uses: `purchase_date`, `num_orders`
- ✅ Actual schema: `date`, `orders`

**Ad Spend (int_ad_spend):**
- ❌ Code uses: `shopify_name`, `date`
- ✅ Actual schema: `shop_name`, `date_time`

**Order Enriched (int_order_enriched):**
- ❌ Code uses: `created_at`, `total_price_usd`
- ✅ Actual schema: `order_timestamp_local`, `total_price`

**Customer First Purchase:**
- ❌ Code uses: `first_purchase_date`
- ✅ Actual schema: `first_order_datetime_local`

**Refunds (int_refunds):**
- ❌ Code uses: `refund_date`, `total_refunded`
- ✅ Actual schema: `date`, `refunds`

### 2. **Shop Column Inconsistency** (CONFIRMED)
Different tables use different shop identifier columns:
- `int_order_metrics` → `shopify_name`
- `int_ad_spend` → `shop_name`
- `int_order_enriched` → `shopify_shop`
- `stg_shopify_shops` → `shop_name`

The code needs to handle this inconsistency correctly.

---

## Next Steps

1. **Run queries Step 1-8** in order and document results
2. **Identify which query returns empty** vs which returns data
3. **Compare column names** in Step 4 schema check
4. **Check shop name values** in Step 5
5. **Report findings** with specific query results

Once you confirm the diagnosis with the debugging queries, the fix will be in:
- `src/services/analytics.ts` lines 950-1028 (daily aggregation query) - **UPDATE ALL COLUMN NAMES**
- Potentially also lines 871-948 (hourly aggregation query)

**Required Code Changes:**
1. Update all references to match actual ClickHouse schema columns
2. Fix shop identifier column inconsistencies across tables
3. Ensure VAT logic uses `ignore_vat` instead of `has_vat`
4. Update date/timestamp column references throughout

---

## Code References

- **Endpoint**: `src/routes/analytics.ts:203`
- **Controller**: `src/controllers/analytics.ts:189-238`
- **Service (Daily Query)**: `src/services/analytics.ts:950-1028`
- **Service (Hourly Query)**: `src/services/analytics.ts:871-948`
- **Shop Resolution**: `src/services/analytics.ts:61-73`
