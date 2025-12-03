# Timeseries Implementation Summary

## Backend Implementation

### 1. New API Endpoint
- **Path**: `/api/timeseries`
- **Method**: GET
- **Authentication**: Required (Bearer token)

### 2. Files Created/Modified

#### Backend:
- `src/services/timeseries.ts` - Service handling timeseries queries
- `src/types/timeseries.ts` - TypeScript types and Zod schemas
- `src/routes/timeseries.ts` - Route handler
- `src/routes/index.ts` - Added route registration

#### Frontend:
- `venon/services/timeseries.ts` - API client for timeseries endpoint
- `venon/components/charts/analytics-chart-v2.tsx` - New chart component using timeseries API
- `venon/app/(pages)/pixel/page.tsx` - Updated to use new chart component

## Features

### Backend Features:
1. **Automatic Aggregation**: 
   - Hourly data for single-day requests
   - Daily data for multi-day requests

2. **Flexible Filtering**:
   - All channels combined (default)
   - Single channel
   - Ad hierarchy (campaign/ad set/ad level)

3. **Query Parameters**:
   - `account_id`: Account identifier
   - `start_date` & `end_date`: Date range (YYYY-MM-DD)
   - `attribution_model`: Attribution model selection
   - `attribution_window`: Attribution window
   - `filter`: JSON object for filtering (optional)

### Frontend Features:
1. **Interactive Chart**:
   - Shows Ad Spend (left Y-axis) and ROAS (right Y-axis)
   - Responsive design with tooltips
   - Loading state with spinner
   - Error handling with toast notifications

2. **Selection Modes**:
   - Single channel selection
   - Multiple channel selection (shows combined data)
   - Total checkbox (shows all channels aggregated)

3. **Real-time Updates**:
   - Chart updates when checkbox selections change
   - Respects date range and attribution settings

## How It Works

1. User clicks green checkboxes in the channel performance table
2. Frontend detects selection change
3. New `AnalyticsChartV2` component fetches data from timeseries API
4. API returns aggregated spend and ROAS data
5. Chart displays the data with appropriate time granularity

## API Response Format

```json
{
  "data": {
    "timeseries": [
      {
        "time_period": "2025-06-01",
        "total_ad_spend": 450.50,
        "total_attributed_revenue": 2340.25,
        "roas": 5.19
      }
    ],
    "aggregation_level": "daily"
  },
  "metadata": {
    "shop_name": "gaming-klamotten",
    "start_date": "2025-06-01",
    "end_date": "2025-06-30",
    "attribution_model": "last_paid_click",
    "attribution_window": "28_day",
    "filter": { "type": "channel", "channel": "google-ads" },
    "query_timestamp": "2025-07-26T10:30:45.123Z"
  }
}
```

## Next Steps

The implementation is complete and ready for testing. The chart will now display when users select channels using the green checkboxes in the dashboard.