# Cohort Analysis API

## Overview

The Cohort Analysis API provides detailed customer retention and revenue metrics organized by acquisition cohorts. It supports various time periods (week, month, quarter, year) and can filter cohorts based on specific products or variants purchased in the first order.

## Endpoint

```
GET /api/analytics/cohort
```

## Authentication

Requires Bearer token authentication. Available for users with viewer, editor, or admin roles.

## Query Parameters

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `shop_name` | string | Yes | The Shopify shop identifier | - |
| `start_date` | string | Yes | Start date for cohorts (YYYY-MM-DD format) | - |
| `end_date` | string | No | End date for cohorts (YYYY-MM-DD format) | Current date |
| `cohort_type` | enum | Yes | Time period granularity: 'week', 'month', 'quarter', 'year' | - |
| `max_periods` | integer | No | Maximum periods to track forward | 52 (week), 12 (month), 4 (quarter), 2 (year) |
| `filter_product_id` | integer | No | Filter by customers who purchased this product ID in their first order | - |
| `filter_variant_id` | integer | No | Filter by customers who purchased this variant ID in their first order | - |

## Response Structure

### Success Response

```json
{
  "success": true,
  "result": {
    "data": {
      "cohorts": [
        {
          "cohort": "2025-08-25",
          "cohort_size": 4,
          "cohort_ad_spend": 32.83,
          "cac_per_customer": 8.21,
          "periods": [
            {
              "period": 0,
              "metrics": {
                "incremental": {
                  "active_customers": 4,
                  "active_customers_percentage": 100,
                  "orders": 4,
                  "net_revenue": 138.64,
                  "contribution_margin_one": 73.64,
                  "contribution_margin_three": 40.81,
                  "average_order_value": 36.65
                },
                "cumulative": {
                  "active_customers": 4,
                  "active_customers_percentage": 100,
                  "orders": 4,
                  "net_revenue": 138.64,
                  "contribution_margin_one": 73.64,
                  "contribution_margin_three": 40.81,
                  "average_order_value": 36.65,
                  "ltv_to_date": 36.65,
                  "net_ltv_to_date": 34.66,
                  "ltv_to_cac_ratio": 4.46,
                  "net_ltv_to_cac_ratio": 4.22,
                  "is_payback_achieved": true,
                  "cumulative_contribution_margin_three_per_customer": 10.20
                }
              }
            }
          ]
        }
      ]
    },
    "metadata": {
      "shop_name": "gaming-klamotten",
      "cohort_type": "week",
      "start_date": "2025-06-30",
      "end_date": "2025-08-31",
      "max_periods": 52,
      "query_timestamp": "2025-09-18T06:42:03.792Z"
    }
  }
}
```

## Metrics Explained

### Incremental Metrics (per period)
- `active_customers`: Number of unique customers who made purchases in this period
- `active_customers_percentage`: Retention rate (% of original cohort)
- `orders`: Total orders in this period
- `net_revenue`: Revenue after refunds and taxes
- `contribution_margin_one`: Net revenue minus COGS
- `contribution_margin_three`: CM1 minus ad spend (only allocated in period 0)
- `average_order_value`: Average revenue per order

### Cumulative Metrics (from cohort start)
- All incremental metrics plus:
- `ltv_to_date`: Lifetime value (cumulative revenue per customer)
- `net_ltv_to_date`: Net LTV (cumulative net revenue per customer)
- `ltv_to_cac_ratio`: LTV divided by customer acquisition cost
- `net_ltv_to_cac_ratio`: Net LTV divided by CAC
- `is_payback_achieved`: Whether LTV >= CAC
- `cumulative_contribution_margin_three_per_customer`: Cumulative CM3 per customer

## Example cURL Commands

### 1. Basic Weekly Cohort Analysis
```bash
curl -X GET "http://localhost:3500/api/analytics/cohort?shop_name=gaming-klamotten&start_date=2025-06-30&cohort_type=week" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

### 2. Monthly Cohorts with Date Range
```bash
curl -X GET "http://localhost:3500/api/analytics/cohort?shop_name=gaming-klamotten&start_date=2025-01-01&end_date=2025-08-31&cohort_type=month" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Quarterly Cohorts with Custom Period Limit
```bash
curl -X GET "http://localhost:3500/api/analytics/cohort?shop_name=gaming-klamotten&start_date=2024-01-01&cohort_type=quarter&max_periods=8" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

### 4. Filter by Product ID
```bash
curl -X GET "http://localhost:3500/api/analytics/cohort?shop_name=gaming-klamotten&start_date=2025-07-01&cohort_type=month&filter_product_id=6883263348909" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

### 5. Filter by Variant ID
```bash
curl -X GET "http://localhost:3500/api/analytics/cohort?shop_name=gaming-klamotten&start_date=2025-06-01&cohort_type=week&filter_variant_id=40593745191085" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

## Error Responses

### Invalid Parameters
```json
{
  "success": false,
  "error": "Invalid query parameters"
}
```

### Authentication Error
```json
{
  "error": "Invalid or expired token"
}
```

### Server Error
```json
{
  "success": false,
  "error": "Internal server error while fetching cohort analysis"
}
```

## Implementation Notes

1. **Performance**: The query uses ClickHouse for fast analytical processing. Large date ranges with weekly cohorts may take longer to process.

2. **Data Sources**: 
   - Customer cohorts from `int_customer_first_purchase`
   - Order data from `int_order_enriched`
   - Ad spend from `int_ad_spend`
   - Product filters from `int_customer_first_order_line_items`

3. **CAC Calculation**: Customer Acquisition Cost is calculated by allocating ad spend from the cohort's acquisition period divided by cohort size.

4. **Contribution Margins**:
   - CM1 = Net Revenue - COGS
   - CM3 = CM1 - Ad Spend (only in period 0)

5. **Period Interpretation**:
   - Period 0 = Acquisition period
   - Period 1 = One period after acquisition
   - The period unit depends on cohort_type (weeks, months, quarters, or years)