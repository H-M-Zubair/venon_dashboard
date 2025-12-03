# Timeseries API Endpoint Test Examples

The timeseries endpoint is available at: `GET /api/timeseries`

## Authentication
All requests require a Bearer token in the Authorization header.

## Query Parameters

- `account_id` (required): The account ID
- `start_date` (required): Start date in YYYY-MM-DD format
- `end_date` (required): End date in YYYY-MM-DD format
- `attribution_model` (optional): one of `linear_paid`, `linear_all`, `first_click`, `last_click`, `last_paid_click`, `all_clicks` (default: `last_paid_click`)
- `attribution_window` (optional): one of `1_day`, `7_day`, `14_day`, `28_day`, `90_day`, `lifetime` (default: `28_day`)
- `filter` (optional): JSON object to filter results

## Filter Types

### 1. All Channels (default)
No filter needed or:
```json
{"type": "all_channels"}
```

### 2. Single Channel
```json
{"type": "channel", "channel": "google-ads"}
```

### 3. Ad Hierarchy
```json
{
  "type": "ad_hierarchy",
  "channel": "google-ads",
  "ad_campaign_pk": 188294
}
```

Or with ad set:
```json
{
  "type": "ad_hierarchy", 
  "channel": "google-ads",
  "ad_campaign_pk": 188294,
  "ad_set_pk": 456
}
```

Or with specific ad:
```json
{
  "type": "ad_hierarchy",
  "channel": "google-ads", 
  "ad_campaign_pk": 188294,
  "ad_set_pk": 456,
  "ad_pk": 789
}
```

## Example Requests

### All Channels - Daily Data
```bash
curl -X GET "http://localhost:3001/api/timeseries?account_id=YOUR_ACCOUNT_ID&start_date=2025-06-01&end_date=2025-06-30&attribution_model=last_paid_click&attribution_window=28_day" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### All Channels - Hourly Data (single day)
```bash
curl -X GET "http://localhost:3001/api/timeseries?account_id=YOUR_ACCOUNT_ID&start_date=2025-06-15&end_date=2025-06-15&attribution_model=last_paid_click&attribution_window=28_day" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Single Channel
```bash
curl -X GET "http://localhost:3001/api/timeseries?account_id=YOUR_ACCOUNT_ID&start_date=2025-06-01&end_date=2025-06-30&attribution_model=last_paid_click&attribution_window=28_day&filter=%7B%22type%22%3A%22channel%22%2C%22channel%22%3A%22google-ads%22%7D" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Campaign Level
```bash
curl -X GET "http://localhost:3001/api/timeseries?account_id=YOUR_ACCOUNT_ID&start_date=2025-06-01&end_date=2025-06-30&attribution_model=last_paid_click&attribution_window=28_day&filter=%7B%22type%22%3A%22ad_hierarchy%22%2C%22channel%22%3A%22google-ads%22%2C%22ad_campaign_pk%22%3A188294%7D" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Response Format

```json
{
  "data": {
    "timeseries": [
      {
        "time_period": "2025-06-01",
        "total_ad_spend": 450.50,
        "total_attributed_revenue": 2340.25,
        "roas": 5.19
      },
      // ... more data points
    ],
    "aggregation_level": "daily" // or "hourly"
  },
  "metadata": {
    "shop_name": "gaming-klamotten",
    "start_date": "2025-06-01",
    "end_date": "2025-06-30",
    "attribution_model": "last_paid_click",
    "attribution_window": "28_day",
    "filter": {
      "type": "channel",
      "channel": "google-ads"
    },
    "query_timestamp": "2025-07-26T10:30:45.123Z"
  }
}
```

## Notes

- When requesting a single day, the API returns hourly data
- When requesting multiple days, the API returns daily data
- Time periods are returned in ascending order (oldest first)
- ROAS is calculated as total_attributed_revenue / total_ad_spend
- If ad spend is 0, ROAS will be 0