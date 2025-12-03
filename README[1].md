# Google Sheets Integration - Task Documentation

## Table of Contents

- [Feature Overview](#feature-overview)
- [Pre-Implementation Decision](#pre-implementation-decision)
- [User Requirements](#user-requirements)
- [Technical Architecture](#technical-architecture)
- [Data Model](#data-model)
- [Implementation Phases](#implementation-phases)
- [Security Considerations](#security-considerations)
- [Testing Strategy](#testing-strategy)
- [References](#references)

---

## Feature Overview

### Executive Summary

Implement a comprehensive Google Sheets integration that allows Venon users to automatically export analytics data to Google Sheets. Users can configure one-time exports or set up auto-updating reports with customizable metrics, attribution models, and time granularity.

### Business Value

- **Automated Reporting**: Eliminate manual data exports and spreadsheet updates
- **Flexible Analysis**: Users can analyze data in Google Sheets with familiar tools
- **Historical Tracking**: Preserve historical data with append-only updates
- **Multi-Account Support**: Connect multiple Google accounts for different reports
- **Customizable Metrics**: Export only the metrics users need for their specific use cases

### Key Capabilities

- **OAuth Integration**: Secure connection to Google accounts
- **Flexible Export Configuration**:
  - Choose attribution model (linear, first-click, last-click, etc.)
  - Select time granularity (daily, weekly, monthly)
  - Filter specific channels (Meta Ads, Google Ads, organic, etc.)
  - Choose specific metrics to export
- **Time-Series Data**: One row per time period with full metric breakdown
- **Auto-Updating Reports**: Scheduled exports that append new data
- **Export Management**: History logs
- **One-Time Exports**: Execute immediately upon creation

---

## Pre-Implementation Decision

### GCP Service Account Strategy

Before implementing the OAuth integration, a critical decision must be made regarding the Google Cloud Platform (GCP) service account setup.

#### Decision Required

**Should we create a new GCP OAuth client specifically for Google Sheets integration, or reuse the existing Google Ads OAuth client?**

#### Research Tasks

1. **Evaluate Existing Google Ads Client**:
   - Review current Google Ads OAuth implementation in `/src/services/ad-platforms/google.ts`
   - Check current OAuth scopes configured for Google Ads client
   - Determine if we can simply add additional scopes to existing client

2. **Scope Addition Analysis**:
   - Current Google Ads scopes (likely `https://www.googleapis.com/auth/adwords`)
   - Required Google Sheets scopes:
     - `https://www.googleapis.com/auth/spreadsheets` - Read and write spreadsheets
     - `https://www.googleapis.com/auth/drive.file` - Create new spreadsheets
   - Question: Can we add Sheets scopes to existing OAuth client without re-verification?

3. **OAuth App Verification Investigation**:
   - Critical: Google OAuth verification process for Google Ads integration took a very long time
   - Question: Does adding new API scopes (Google Sheets API) require re-submitting app for verification?
   - Question: Would a new OAuth client (separate from Google Ads) also require full verification?
   - Research: Google's verification requirements for Sheets API vs. Ads API

#### Pros and Cons Analysis

**Option 1: Reuse Existing Google Ads OAuth Client**

Pros:

- Single OAuth flow for users (one-time Google account connection)
- Unified token management (one refresh token for both Ads and Sheets)
- Less complexity in integrations table (one integration type)
- Potentially faster if no re-verification needed

Cons:

- May require re-verification if scopes change significantly
- Tighter coupling between Ads and Sheets features
- If Sheets API has issues, could affect Ads integration
- Less flexibility to deprecate one integration without affecting the other

**Option 2: Create New Separate OAuth Client for Sheets**

Pros:

- Independent verification process (Ads already verified, Sheets separate)
- Isolation: Issues with one integration don't affect the other
- Easier to manage permissions separately
- Clearer separation of concerns in codebase
- Better testing

Cons:

- Users must connect Google account twice (once for Ads, once for Sheets)
- Duplicate OAuth flows in frontend/backend
- More complex integrations table (multiple integration types)
- Potentially requires full OAuth app verification (long process)

#### Recommended Approach

**Document your decision here after research:**

_[To be filled in during Phase 0 of implementation]_

**Decision**: [ ] Reuse Existing Client / [ ] Create New Client

**Rationale**:

- ...

**Verification Status**:

- ...

**Implementation Notes**:

- ...

---

## User Requirements

### UI Configuration Options

#### 1. Report Name

- **Field Type**: Text input
- **Required**: Yes
- **Validation**: 3-100 characters, alphanumeric with spaces/hyphens
- **Purpose**: User-friendly identifier for the export configuration

#### 2. Google Account Selection

- **Field Type**: Dropdown
- **Required**: Yes
- **Options**: All connected Google accounts (email displayed)
- **Purpose**: Select which Google account/credentials to use for the export
- **Multi-Account Support**: Users can connect multiple Google accounts via OAuth

#### 3. Sync Frequency

- **Field Type**: Radio buttons or dropdown
- **Required**: Yes
- **Options**:
  - `one-time` - Execute export immediately upon creation, then mark as completed
  - `daily` - Export runs daily at 10 AM UTC via cron job
  - `weekly` - Export runs weekly on Monday at 10 AM UTC via cron job
  - `monthly` - Export runs on the 1st of each month at 10 AM UTC via cron job
- **Note**:
  - **One-time exports execute immediately** when user submits the form (no scheduling)
  - **Auto-updating exports** are scheduled via cron job in separate repository
  - **10 AM UTC** chosen to be timezone-safe for shops worldwide

#### 4. Attribution Model

- **Field Type**: Dropdown
- **Required**: Yes
- **Options**:
  - `linear_paid` - Linear attribution across paid touchpoints
  - `linear_all` - Linear attribution across all touchpoints
  - `first_click` - 100% credit to first touchpoint
  - `last_click` - 100% credit to last touchpoint
  - `last_paid_click` - 100% credit to last paid touchpoint
- **Purpose**: Determines how revenue/orders are attributed to channels

#### 5. Granularity

- **Field Type**: Radio buttons or dropdown
- **Required**: Yes
- **Options**:
  - `daily` - One row per day
  - `weekly` - One row per week (Monday-Sunday)
  - `monthly` - One row per month
- **Purpose**: Time period grouping for time-series data

#### 6. Date Range

- **Field Type**: Date picker (start date + end date for one-time, start date only for auto-updating)
- **Required**: Yes
- **Behavior**:
  - **One-time exports**: User selects both start and end date (full range exported immediately)
  - **Auto-updating exports**: User selects start date only
    - First export: From start date to **2 days ago** (not today)
    - Subsequent exports: Only export new time periods since last export (append mode)
- **Rationale for "2 days ago" cutoff**:
  - Shops operate in different timezones
  - Yesterday's data might not be complete in shop's timezone yet
  - Using 2-days-ago ensures data completeness and consistency
- **Validation**: Start date must be before or equal to end date (for one-time)

#### 7. Channel Selection

- **Field Type**: Multi-select dropdown or checkbox list
- **Required**: Yes (at least one channel)
- **Options**:
  - **Ad Spend Channels**: `meta-ads`, `google-ads`, `taboola`, `tiktok-ads`
  - **Other Channels**: `klaviyo`, `omnisend`, `organic`, `direct`, `referral`, etc.
- **Purpose**: Filter which channels to include in the export
- **Note**: Each selected channel gets its own column group in the sheet

#### 8. Field Selection

- **Field Type**: Multi-select dropdown or checkbox list organized by category
- **Required**: Yes (at least one field)
- **Categories**:
  - **Global Metrics**: Revenue, orders, costs, customer metrics
  - **Channel-Specific Metrics**: ROAS, spend, purchases (varies by channel type)
- **Purpose**: User selects which metrics to include in the export
- **Dynamic Display**: Show only metrics relevant to selected channels

### Export Management Features

#### 1. Export History/Logs

- **UI**: Table showing recent export attempts
- **Columns**:
  - Timestamp
  - Status (success/failure)
  - Rows exported
  - Duration
  - Error message (if failed)
- **Retention**: Last 30 export attempts per configuration

---

## Technical Architecture

### Backend Components

#### 1. Route Handlers (`/src/routes/google-sheets.ts`)

All routes require authentication (`authenticateUser` middleware).

**OAuth Routes**:

- `GET /api/google-sheets/oauth/authorize` - Initiate OAuth flow
- `GET /api/google-sheets/oauth/callback` - Handle OAuth callback

**Account Management**:

- `GET /api/google-sheets/accounts` - List connected Google accounts
- `DELETE /api/google-sheets/accounts/:integration_id` - Disconnect account

**Export Configuration** (requires `requireEditor` role):

- `POST /api/google-sheets/exports` - Create new export configuration
  - If `sync_frequency = 'one-time'`: Execute export immediately after creation
  - If `sync_frequency` is daily/weekly/monthly: Store config for cron job pickup
- `GET /api/google-sheets/exports` - List all exports for authenticated user
- `GET /api/google-sheets/exports/:id` - Get single export configuration
- `PUT /api/google-sheets/exports/:id` - Update export configuration
- `DELETE /api/google-sheets/exports/:id` - Delete export configuration

**Export Logs**:

- `GET /api/google-sheets/exports/:id/logs` - Get export history (last 30 attempts)

#### 2. Service Layer

**`/src/services/google-sheets.ts`** - Google Sheets API Wrapper

- `initializeGoogleSheetsClient(integrationId)` - Create authenticated Google Sheets API client
- `createSpreadsheet(title)` - Create new Google Sheet
- `getSpreadsheet(spreadsheetId)` - Get sheet metadata
- `appendRows(spreadsheetId, sheetName, rows)` - Append data rows
- `formatSheet(spreadsheetId, sheetName, headers)` - Apply formatting (bold headers, freeze row, etc.)
- `refreshAccessToken(integrationId)` - Refresh OAuth token if expired

**`/src/services/google-sheets-export.ts`** - Export Logic

- `exportMetricsToSheet(exportConfigId)` - Main export orchestration function
  - Fetch export configuration
  - Query analytics data from ClickHouse
  - Transform data to sheet rows
  - Append to Google Sheet
  - Log export attempt
- `getAnalyticsDataForExport(config)` - Query ClickHouse for metrics
- `transformDataToRows(data, config)` - Transform query results to sheet format
- `calculateMetrics(rawData, config)` - Calculate derived metrics (ROAS, CAC, CPA, etc.)
- `getExportDateRange(config)` - Determine date range for current export
  - One-time: Use configured start/end dates
  - Auto-updating first export: From start_date to 2 days ago
  - Auto-updating subsequent: From last_export_at + 1 day to 2 days ago

#### 3. OAuth Integration

**Flow**:

```
1. User clicks "Connect Google Account" in frontend
2. Frontend redirects to GET /api/google-sheets/oauth/authorize
3. Backend generates OAuth URL with scopes and redirects to Google
4. User grants permissions on Google consent screen
5. Google redirects back to GET /api/google-sheets/oauth/callback?code=...
6. Backend exchanges code for access_token + refresh_token
7. Backend stores tokens in integrations table
8. Backend redirects to frontend with success message
```

**Required Scopes**:

- `https://www.googleapis.com/auth/spreadsheets` - Read and write spreadsheets
- `https://www.googleapis.com/auth/drive.file` - Create new spreadsheets

**Environment Variables**:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://api.venon.io/api/google-sheets/oauth/callback
```

#### 4. Cron Job Scheduling (Separate Repository)

**Important**: Cron jobs should run in a **separate repository** (e.g., `venon-backend-cron`) to isolate scheduled tasks from the main API server.

**Timezone Considerations**:

- Shops operate in different timezones
- Schedule exports at **10 AM UTC** to be timezone-safe
- 10 AM UTC is:
  - 2 AM PST (Los Angeles)
  - 5 AM EST (New York)
  - 11 AM CET (Europe)
  - 9 PM AEDT (Sydney, previous day)
- This timing ensures most shops' previous day data is complete

**Schedule Configuration** (in separate cron repo):

```typescript
// In venon-backend-cron repository
import cron from 'node-cron';

export function scheduleGoogleSheetsExports() {
  // Daily exports at 10 AM UTC
  cron.schedule('0 10 * * *', async () => {
    logger.info('Running daily Google Sheets exports');
    await runDailyExports();
  });

  // Weekly exports on Mondays at 10 AM UTC
  cron.schedule('0 10 * * 1', async () => {
    logger.info('Running weekly Google Sheets exports');
    await runWeeklyExports();
  });

  // Monthly exports on the 1st at 10 AM UTC
  cron.schedule('0 10 1 * *', async () => {
    logger.info('Running monthly Google Sheets exports');
    await runMonthlyExports();
  });
}
```

**Date Range Logic**:

- Auto-updating exports always export data up to **2 days ago** (not today)
- Example: If today is January 15, export data up to January 13
- This ensures data completeness across all shop timezones

**Cron Implementation Notes**:

- Fetch export configurations from main database via API or direct database connection
- For each export due to run:
  - Calculate date range (last_export_at + 1 day to 2 days ago)
  - Call export service
  - Update last_export_at timestamp
  - Log attempt in google_sheets_export_logs table

### Database Schema

#### Overview

Two new tables are required in Supabase, plus reuse of existing `integrations` table.

#### Table 1: `integrations` (existing table)

**Purpose**: Store OAuth tokens for Google Sheets integration

**Usage**: Add rows with `type = 'google-sheets'` to this existing table

**Key Fields**:

- `id` (UUID, primary key)
- `account_id` (UUID, foreign key to accounts)
- `type` (TEXT) - Set to `'google-sheets'`
- `access_token` (TEXT) - Encrypted OAuth access token
- `refresh_token` (TEXT) - Encrypted OAuth refresh token
- `token_expires_at` (TIMESTAMPTZ) - Token expiration timestamp
- `email` (TEXT) - Google account email address
- `connected` (BOOLEAN) - Whether integration is active

**No schema changes needed** - this table already exists for Google Ads and Meta Ads integrations.

#### Table 2: `google_sheets_exports` (new table)

**Purpose**: Store export configurations for Google Sheets integration

**Key Fields**:

**Primary Key and Foreign Keys**:

- `id` (UUID, primary key, auto-generated)
- `account_id` (UUID, foreign key to accounts, ON DELETE CASCADE)
- `shop_name` (TEXT, foreign key to shopify_shops, ON DELETE CASCADE)
- `integration_id` (UUID, foreign key to integrations, ON DELETE CASCADE)

**Report Configuration**:

- `report_name` (TEXT, NOT NULL) - User-friendly report name
  - Validation: 3-100 characters
- `spreadsheet_id` (TEXT, NOT NULL) - Google Sheets spreadsheet ID
- `sheet_name` (TEXT, NOT NULL) - Name of sheet tab within spreadsheet
  - Validation: 1-100 characters

**Export Settings**:

- `sync_frequency` (TEXT, NOT NULL) - Export frequency
  - Values: `'one-time'`, `'daily'`, `'weekly'`, `'monthly'`
  - Constraint: Must be one of these exact values
- `attribution_model` (TEXT, NOT NULL) - Attribution model for revenue/orders
  - Values: `'linear_paid'`, `'linear_all'`, `'first_click'`, `'last_click'`, `'last_paid_click'`
- `granularity` (TEXT, NOT NULL) - Time period grouping
  - Values: `'daily'`, `'weekly'`, `'monthly'`

**Date Range**:

- `start_date` (DATE, NOT NULL) - Start date for exports
- `end_date` (DATE, nullable) - End date for one-time exports
  - NULL for auto-updating exports
  - Required for one-time exports
  - Must be >= start_date

**Channel and Metric Selection**:

- `selected_channels` (TEXT[], NOT NULL) - Array of channel names
  - Must contain at least one channel
  - Examples: `['meta-ads', 'google-ads']`
- `selected_metrics` (TEXT[], NOT NULL) - Array of metric names
  - Must contain at least one metric
  - Examples: `['gross_revenue_total', 'orders', 'meta-ads.roas']`

**State Management**:

- `active` (BOOLEAN, default true) - Whether export is active
- `last_export_at` (TIMESTAMPTZ, nullable) - Timestamp of last successful export
- `next_export_at` (TIMESTAMPTZ, nullable) - When next scheduled export should run
  - NULL for one-time exports
  - Calculated automatically for auto-updating exports

**Metadata**:

- `created_at` (TIMESTAMPTZ, default NOW())
- `updated_at` (TIMESTAMPTZ, default NOW())

**Indexes Needed**:

- `idx_google_sheets_exports_account_id` on `account_id` - For user queries
- `idx_google_sheets_exports_shop_name` on `shop_name` - For shop filtering
- `idx_google_sheets_exports_integration_id` on `integration_id` - For integration lookups
- `idx_google_sheets_exports_next_export` on `next_export_at` WHERE `active = true` - For cron job queries
- `idx_google_sheets_exports_sync_frequency` on `sync_frequency` WHERE `active = true` - For cron job filtering

**Constraints**:

- Check: `end_date` must be NULL OR `end_date >= start_date`
- Check: If `sync_frequency = 'one-time'` then `end_date` must NOT be NULL
- Check: If `sync_frequency != 'one-time'` then `end_date` must be NULL
- Check: Array `selected_channels` must have length >= 1
- Check: Array `selected_metrics` must have length >= 1

**Triggers Needed**:

1. `update_updated_at_timestamp` - Auto-update `updated_at` on row modification
2. `calculate_next_export_at` - Auto-calculate `next_export_at` based on frequency and last_export_at
   - On INSERT: Calculate based on frequency
   - On UPDATE: Recalculate if frequency or last_export_at changes
   - Logic:
     - Daily: last_export_at + 1 day at 10 AM UTC
     - Weekly: last_export_at + 1 week (Monday) at 10 AM UTC
     - Monthly: last_export_at + 1 month (1st) at 10 AM UTC

**Row Level Security (RLS)**:

- Enable RLS on table
- Policy: Users can SELECT their own exports (WHERE account_id IN user's accounts)
- Policy: Users can INSERT exports for their own accounts
- Policy: Users can UPDATE their own exports
- Policy: Users can DELETE their own exports
- Policy: Service role has full access (for cron jobs and background tasks)

#### Table 3: `google_sheets_export_logs` (new table)

**Purpose**: Audit log of all export attempts for monitoring and debugging

**Key Fields**:

**Primary Key and Foreign Key**:

- `id` (UUID, primary key, auto-generated)
- `export_config_id` (UUID, foreign key to google_sheets_exports, ON DELETE CASCADE)

**Execution Details**:

- `started_at` (TIMESTAMPTZ, NOT NULL, default NOW()) - When export job started
- `completed_at` (TIMESTAMPTZ, nullable) - When export job finished
- `status` (TEXT, NOT NULL, default 'running') - Export status
  - Values: `'running'`, `'success'`, `'failed'`

**Export Details**:

- `date_range_start` (DATE, NOT NULL) - Start date of data exported
- `date_range_end` (DATE, NOT NULL) - End date of data exported
- `rows_exported` (INTEGER, nullable) - Number of rows added to sheet
- `duration_ms` (INTEGER, nullable) - Export duration in milliseconds

**Error Tracking**:

- `error_message` (TEXT, nullable) - Human-readable error message
- `error_stack` (TEXT, nullable) - Full error stack trace for debugging

**Metadata**:

- `triggered_by` (TEXT, NOT NULL) - How export was triggered
  - Values: `'cron'`
- `created_at` (TIMESTAMPTZ, default NOW())

**Indexes Needed**:

- `idx_google_sheets_export_logs_config_id` on `export_config_id` - For fetching logs by export
- `idx_google_sheets_export_logs_created_at` on `created_at DESC` - For recent logs queries
- `idx_google_sheets_export_logs_status` on `status` - For filtering by success/failure
- `idx_google_sheets_export_logs_config_created` on `(export_config_id, created_at DESC)` - For recent logs per export

**Constraints**:

- Check: `date_range_end >= date_range_start`
- Check: If `status = 'success'` then `rows_exported >= 0`
- Check: If `status = 'failed'` then `error_message` must NOT be NULL

**Row Level Security (RLS)**:

- Enable RLS on table
- Policy: Users can SELECT logs for their own exports (via join to google_sheets_exports)
- Policy: Service role has full access (for writing logs from cron jobs)

**Log Retention**:

- Implement cleanup logic to keep only last 30 logs per export configuration
- Can be done via:
  - Database function called by cron job (recommended)
  - Application logic when fetching logs
  - Manual cleanup script

---

## Data Model

### Metrics to Export

#### Global Metrics

These metrics are calculated once per time period (not per channel).

| Metric Name                  | Description                       | Calculation                                                        | Source               |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------ | -------------------- |
| `gross_revenue_total`        | Total revenue before deductions   | `SUM(order_value)`                                                 | `int_order_enriched` |
| `net_revenue_total`          | Revenue after VAT, COGS, fees     | `gross_revenue - vat - cogs - payment_fees`                        | Calculated           |
| `orders`                     | Total number of orders            | `COUNT(DISTINCT order_id)`                                         | `int_order_enriched` |
| `ad_spend_total`             | Total advertising spend           | `SUM(spend)` across all ad channels                                | `int_ad_spend`       |
| `cogs`                       | Cost of goods sold                | `SUM(attributed_cogs)`                                             | Attribution tables   |
| `returns_eur`                | Value of returns in EUR           | `SUM(refund_amount)`                                               | `int_refunds`        |
| `returns_pct`                | Returns as % of orders            | `(returns_eur / gross_revenue_total) * 100`                        | Calculated           |
| `sales_tax`                  | VAT or sales tax                  | `SUM(attributed_tax)`                                              | Attribution tables   |
| `payment_fees`               | Payment processing fees           | `gross_revenue * 0.03` (default 3%)                                | Calculated           |
| `returning_customer_revenue` | Revenue from repeat customers     | `SUM(order_value) WHERE is_first_order = false`                    | `int_order_enriched` |
| `new_customer_revenue`       | Revenue from first-time customers | `SUM(order_value) WHERE is_first_order = true`                     | `int_order_enriched` |
| `returning_customer_rate`    | % of orders from repeat customers | `(returning_orders / total_orders) * 100`                          | Calculated           |
| `email_revenue`              | Revenue from email channels       | `SUM(attributed_revenue) WHERE channel IN ('klaviyo', 'omnisend')` | Attribution tables   |
| `cac`                        | Customer acquisition cost         | `ad_spend_total / new_customer_count`                              | Calculated           |
| `cpa`                        | Cost per action (order)           | `ad_spend_total / orders`                                          | Calculated           |

#### Channel-Specific Metrics

**For Ad Spend Channels** (`meta-ads`, `google-ads`, `taboola`, `tiktok-ads`):

| Metric Name              | Description               | Calculation                                           | Source                 |
| ------------------------ | ------------------------- | ----------------------------------------------------- | ---------------------- |
| `{channel}_roas`         | Return on ad spend        | `attributed_revenue / ad_spend`                       | Attribution + ad spend |
| `{channel}_nc_roas`      | New customer ROAS         | `first_time_customer_revenue / ad_spend`              | Attribution + ad spend |
| `{channel}_spend`        | Ad spend for this channel | `SUM(spend)`                                          | `int_ad_spend`         |
| `{channel}_revenue`      | Attributed revenue        | `SUM(attributed_revenue)`                             | Attribution tables     |
| `{channel}_nc_revenue`   | New customer revenue      | `SUM(attributed_revenue) WHERE is_first_order = true` | Attribution tables     |
| `{channel}_purchases`    | Attributed orders         | `SUM(attributed_orders)`                              | Attribution tables     |
| `{channel}_nc_purchases` | New customer orders       | `SUM(attributed_orders) WHERE is_first_order = true`  | Attribution tables     |
| `{channel}_aov`          | Average order value       | `attributed_revenue / attributed_orders`              | Calculated             |
| `{channel}_cpa`          | Cost per acquisition      | `ad_spend / attributed_orders`                        | Calculated             |

**For Other Channels** (e.g., `klaviyo`, `omnisend`, `organic`, `direct`, `referral`):

| Metric Name            | Description          | Calculation                                           | Source             |
| ---------------------- | -------------------- | ----------------------------------------------------- | ------------------ |
| `{channel}_revenue`    | Attributed revenue   | `SUM(attributed_revenue)`                             | Attribution tables |
| `{channel}_nc_revenue` | New customer revenue | `SUM(attributed_revenue) WHERE is_first_order = true` | Attribution tables |
| `{channel}_purchases`  | Attributed orders    | `SUM(attributed_orders)`                              | Attribution tables |
| `{channel}_aov`        | Average order value  | `attributed_revenue / attributed_orders`              | Calculated         |

### Google Sheets Structure

#### Sheet Format (Time-Series)

**Example for daily granularity with Meta Ads and Google Ads selected:**

| Date       | Gross Revenue | Net Revenue | Orders | Ad Spend | COGS | ... | Meta Ads ROAS | Meta Ads Spend | Meta Ads Revenue | ... | Google Ads ROAS | Google Ads Spend | ...  |
| ---------- | ------------- | ----------- | ------ | -------- | ---- | --- | ------------- | -------------- | ---------------- | --- | --------------- | ---------------- | ---- |
| 2025-01-01 | 10000         | 7500        | 50     | 2000     | 1000 | ... | 4.5           | 1000           | 4500             | ... | 3.2             | 1000             | 3200 |
| 2025-01-02 | 12000         | 9000        | 60     | 2200     | 1200 | ... | 4.8           | 1100           | 5280             | ... | 3.5             | 1100             | 3850 |

**Header Row Structure**:

1. Time period column: "Date" (or "Week", "Month")
2. Global metrics columns (selected metrics only)
3. Channel-specific metric columns (one group per selected channel)

**Data Type Formatting**:

- Dates: ISO 8601 format (`YYYY-MM-DD`)
- Currency: Numbers (no currency symbol, user can format in Sheets)
- Percentages: Decimal format (e.g., 0.15 for 15%, user can format in Sheets)
- Integers: Orders, purchases

#### Update Strategy (Auto-Updating Exports)

**Append Mode**:

1. First export (initial run):
   - Export all data from `start_date` to **2 days ago**
   - Create header row if sheet is empty
   - Append all time period rows

2. Subsequent exports:
   - Determine new date range: `last_export_at + 1 day` to **2 days ago**
   - Query only new time periods
   - Append new rows to bottom of sheet
   - Preserve all historical data

**Example Timeline** (assuming today is Jan 15):

```
Jan 10 (Initial Export):
- Configuration: start_date = 2025-01-01, frequency = daily
- Export: 2025-01-01 to 2025-01-13 (2 days ago from Jan 15) = 13 rows
- Sheet now has 14 rows (1 header + 13 data)

Jan 11 (Auto-Update, cron runs at 10 AM UTC):
- last_export_at = 2025-01-13
- Today = Jan 11, so 2 days ago = Jan 9
- Since Jan 9 < last_export_at (Jan 13), no new data to export
- No rows added

Jan 14 (Auto-Update):
- last_export_at = 2025-01-13
- Today = Jan 14, so 2 days ago = Jan 12
- Since Jan 12 < last_export_at (Jan 13), no new data to export
- No rows added

Jan 15 (Auto-Update):
- last_export_at = 2025-01-13
- Today = Jan 15, so 2 days ago = Jan 13
- Export: Nothing new (already have Jan 13)
- No rows added

Jan 16 (Auto-Update):
- last_export_at = 2025-01-13
- Today = Jan 16, so 2 days ago = Jan 14
- Export: 2025-01-14 to 2025-01-14 (1 row)
- Sheet now has 15 rows (1 header + 14 data)
```

**Rationale for 2-Day Lag**:

- Shop A in Sydney (UTC+11) places order at 11 PM on Jan 14 (Sydney time)
- This is 12 PM Jan 14 UTC
- Shop B in Los Angeles (UTC-8) places order at 11 PM on Jan 14 (LA time)
- This is 7 AM Jan 15 UTC
- Both orders should appear in "Jan 14" data
- If we exported "yesterday" (Jan 15 at 10 AM UTC), we'd miss Shop B's late orders
- By exporting data from 2 days ago, we ensure all shops' daily data is complete

---

## Implementation Phases

### Phase 0: Pre-Implementation Research and Decision

**Tasks**:

1. Research GCP OAuth client strategy (see [Pre-Implementation Decision](#pre-implementation-decision))
2. Evaluate reusing existing Google Ads client vs. creating new client
3. Investigate OAuth app verification requirements
4. Document decision with rationale
5. If creating new client: Set up Google Cloud Project
6. If reusing existing: Plan scope addition strategy

**Deliverables**:

- Decision documented in this README
- Google Cloud Project set up (if new client)
- OAuth credentials obtained
- Verification timeline estimated

**Testing**:

- Verify OAuth client can access Google Sheets API
- Test scope permissions in Google OAuth playground

---

### Phase 1: OAuth Integration and Account Management

**Tasks**:

1. Set up Google Cloud Project and obtain OAuth credentials (if not done in Phase 0)
2. Implement OAuth flow:
   - `GET /api/google-sheets/oauth/authorize` endpoint
   - `GET /api/google-sheets/oauth/callback` endpoint
   - Token storage in `integrations` table
3. Implement `GET /api/google-sheets/accounts` endpoint
4. Implement `DELETE /api/google-sheets/accounts/:id` endpoint
5. Create `GoogleSheetsService.initializeClient()` method
6. Implement token refresh logic
7. Add environment variables and configuration
8. Write unit tests for OAuth flow

**Deliverables**:

- Users can connect Google accounts
- Tokens are securely stored and refreshed
- API endpoints for account management

**Testing**:

- Test OAuth flow end-to-end
- Test token refresh on expiration
- Test multiple account connections

---

### Phase 2: Export Configuration API and Database Schema

**Tasks**:

1. Create database migration for:
   - `google_sheets_exports` table (see Database Schema section)
   - `google_sheets_export_logs` table (see Database Schema section)
   - Indexes, constraints, triggers, RLS policies
2. Implement export configuration endpoints:
   - `POST /api/google-sheets/exports`
     - If sync_frequency = 'one-time': Execute export immediately after creation
     - If sync_frequency is auto-updating: Store config for cron pickup
   - `GET /api/google-sheets/exports`
   - `GET /api/google-sheets/exports/:id`
   - `PUT /api/google-sheets/exports/:id`
   - `DELETE /api/google-sheets/exports/:id`
3. Add Zod validation schemas for request bodies
4. Implement RBAC (require editor role for create/update/delete)
5. Write unit tests for CRUD operations
6. Create Postman/REST client collection for API testing

**Deliverables**:

- Database schema in place
- CRUD API for export configurations
- Validation and error handling
- One-time exports execute immediately

**Testing**:

- Test creating one-time export (verify immediate execution)
- Test creating auto-updating export (verify stored for cron)
- Test validation errors (invalid dates, channels, metrics)
- Test authorization (editor role required)
- Test updating and deleting configurations

---

### Phase 3: Data Export Logic and Google Sheets API Integration

**Tasks**:

1. Implement `GoogleSheetsService` methods:
   - `createSpreadsheet()`
   - `appendRows()`
   - `formatSheet()`
2. Implement `GoogleSheetsExportService.exportMetricsToSheet()`:
   - Fetch export configuration
   - Determine date range (one-time vs auto-update)
   - Query ClickHouse for analytics data
   - Transform data to sheet rows
   - Append to Google Sheet
   - Log export attempt
3. Implement `getAnalyticsDataForExport()`:
   - Build ClickHouse query based on configuration
   - Support all attribution models
   - Support all granularities (daily, weekly, monthly)
   - Filter by selected channels
   - Return only selected metrics
4. Implement `getExportDateRange()`:
   - One-time: Use start_date and end_date from config
   - Auto-updating first export: start_date to 2 days ago
   - Auto-updating subsequent: last_export_at + 1 day to 2 days ago
5. Implement `transformDataToRows()`:
   - Create header row
   - Transform each time period to a row
   - Format numbers, dates, percentages
6. Implement metric calculations:
   - Calculate global metrics (CAC, CPA, returns %, etc.)
   - Calculate channel-specific metrics (ROAS, AOV, etc.)
7. Write comprehensive unit tests for data transformation
8. Write integration tests with ClickHouse test database

**Deliverables**:

- Functional export logic
- Google Sheets API integration
- Data transformation and formatting
- Date range logic with 2-day lag

**Testing**:

- Test export with different attribution models
- Test export with different granularities
- Test export with different channel selections
- Test metric calculations (ROAS, CAC, etc.)
- Test append mode (verify new rows added correctly)
- Test 2-day lag logic (verify correct date ranges)
- Test with real Google Sheets (manual testing)

---

### Phase 4: Cron Job Scheduling in Separate Repository

**Tasks**:

1. Create or extend separate cron repository (e.g., `venon-backend-cron`)
2. Implement `GoogleSheetsSchedulerService` in cron repo:
   - `scheduleGoogleSheetsExports()`
   - `runDailyExports()`
   - `runWeeklyExports()`
   - `runMonthlyExports()`
3. Configure cron schedules for 10 AM UTC:
   - Daily: `0 10 * * *`
   - Weekly: `0 10 * * 1`
   - Monthly: `0 10 1 * *`
4. Implement logic to fetch active exports from database
5. Implement date range calculation (to 2 days ago)
6. Update `next_export_at` and `last_export_at` after each run
7. Add error handling and retry logic
8. Add logging for cron job execution
9. Set up monitoring and alerts

**Deliverables**:

- Scheduled exports run automatically at 10 AM UTC
- Exports update `last_export_at` timestamps
- Failed exports are logged
- Cron jobs isolated in separate repository

**Testing**:

- Test cron jobs trigger at correct times (use test schedules like every minute)
- Test exports handle errors gracefully
- Test `next_export_at` is calculated correctly
- Test timezone handling (verify 10 AM UTC works for global shops)
- Test 2-day lag logic in cron context

---

### Phase 5: Export Logs

**Tasks**:

1. Implement export logging:
   - Log each export attempt to `google_sheets_export_logs`
   - Track status, duration, rows exported, errors
2. Implement `GET /api/google-sheets/exports/:id/logs` endpoint
3. Implement log retention (keep last 30 logs per export)
4. Write unit tests for logging

**Deliverables**:

- Export logs stored in database
- API endpoint to view logs

**Testing**:

- Test logs are created for each export attempt
- Test log retrieval endpoint

---

### Phase 6: Frontend UI Integration

**Tasks**:

1. Create "Google Sheets" page in dashboard
2. Implement "Connect Google Account" button (OAuth flow)
3. Implement export configuration form:
   - Report name input
   - Google account dropdown
   - Sync frequency radio buttons (with clear labeling: one-time = immediate, auto = scheduled)
   - Attribution model dropdown
   - Granularity radio buttons
   - Date range picker (conditional on sync frequency)
   - Channel multi-select
   - Metric multi-select (grouped by global/channel-specific)
4. Implement export list table:
   - Show report name, sync frequency, last export, status
   - Actions: Edit, View Logs, Delete
5. Implement export detail page:
   - Show full configuration
   - Export logs table
   - Action buttons (edit, delete)
6. Add loading states and error handling
7. Add toast notifications for actions

**Deliverables**:

- Full UI for configuring and managing exports
- Integration with backend API

**Testing**:

- E2E tests for full user flow (Playwright/Cypress)
- Test OAuth connection
- Test creating one-time export (verify immediate execution)
- Test creating auto-updating export
- Test viewing logs
- Test deleting export

---

### Phase 7: Testing and Documentation

**Tasks**:

1. Write comprehensive integration tests:
   - End-to-end export flow
   - OAuth flow
   - Cron job execution
2. Write API documentation (OpenAPI/Swagger)
3. Write user documentation:
   - How to connect Google account
   - How to configure exports
   - Difference between one-time and auto-updating
   - Understanding the 2-day data lag
   - How to troubleshoot issues
4. Perform load testing:
   - Test with 100+ export configurations
   - Test with large date ranges (1 year+)
5. Security audit:
   - Review OAuth implementation
   - Review token storage
   - Review input validation
6. Code review and refactoring

**Deliverables**:

- Comprehensive test coverage
- API documentation
- User documentation
- Performance and security validated

**Testing**:

- Run full test suite
- Load testing with realistic data volumes
- Security testing (OWASP top 10)

---

## Security Considerations

### OAuth Token Management

- **Storage**: Tokens stored encrypted in Supabase `integrations` table
- **Refresh**: Implement automatic token refresh before expiration
- **Revocation**: Handle token revocation gracefully (re-authenticate)
- **Scopes**: Request minimal required scopes (spreadsheets, drive.file)

### API Rate Limiting

- **Google Sheets API Quotas**:
  - 300 requests per minute per project
  - 60 requests per minute per user
- **Strategy**:
  - Implement exponential backoff for rate limit errors
  - Queue exports if rate limit reached
  - Retry failed exports with delay

### Input Validation

- **Zod Schemas**: Validate all user inputs (dates, channels, metrics)
- **SQL Injection**: Use parameterized queries for all database operations
- **XSS**: Sanitize user inputs (report names, etc.)

### Authorization

- **RBAC**: Enforce role-based access (editor required for create/update/delete)
- **Account Isolation**: Users can only access exports for their own accounts
- **RLS**: Use Supabase Row Level Security policies

### Data Privacy

- **No PII in Sheets**: Ensure exports don't include customer email, names, addresses
- **Aggregated Data Only**: Export only aggregated metrics, not raw events
- **Sheet Permissions**: User's Google Sheet, user controls who can view

---

## Testing Strategy

### Unit Tests (Vitest)

- **Service Layer**: Test each service method in isolation
  - `GoogleSheetsService` methods (mocked Google API)
  - `GoogleSheetsExportService` methods (mocked ClickHouse)
  - Metric calculation functions
  - Date range helpers (especially 2-day lag logic)
- **Data Transformation**: Test row formatting and calculations
- **OAuth Logic**: Test token refresh, error handling

### Integration Tests (Vitest)

- **Database Operations**: Test CRUD operations with test database
- **ClickHouse Queries**: Test analytics queries with test data
- **API Endpoints**: Test all routes with supertest

### End-to-End Tests (Manual + Automated)

- **OAuth Flow**: Connect Google account, verify token storage
- **Export Creation**: Create export via API, verify database entry
- **One-Time Export**: Create one-time export, verify immediate execution
- **Auto-Update**: Wait for cron job, verify new rows appended

### Load Testing

- **Multiple Exports**: Create 100+ export configurations, ensure cron handles all
- **Large Date Ranges**: Export 1 year of daily data, ensure no timeout

### Security Testing

- **Authorization**: Test unauthorized access to exports (different account)
- **Input Validation**: Test invalid inputs (XSS, SQL injection attempts)
- **Token Security**: Verify tokens are encrypted, refresh works correctly

---

## References

### External Documentation

- [Google Sheets API v4](https://developers.google.com/sheets/api/reference/rest)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Google OAuth App Verification](https://support.google.com/cloud/answer/9110914)
- [node-cron Documentation](https://github.com/node-cron/node-cron)

### Internal Documentation

- [Architecture Analysis](./README.md#technical-architecture)
- [API Schema](./api-schema.md)
- [Implementation Checklist](./implementation-checklist.md)

### Related Services

- `/src/services/analytics.ts` - Analytics metric calculations (reuse for exports)
- `/src/services/timeseries.ts` - Time-series data aggregation (reuse patterns)
- `/src/services/integrations.ts` - OAuth integration patterns (follow for Google)
- `/src/services/ad-platforms/google.ts` - Existing Google Ads OAuth implementation (reference or reuse)
- `/src/routes/analytics.ts` - Route structure patterns (follow for Google Sheets routes)

---

## Next Steps

1. **Phase 0: Complete Pre-Implementation Research**: Decide on OAuth client strategy
2. **Environment Setup**: Set up Google Cloud Project, obtain OAuth credentials (if needed)
3. **Phase 1 Implementation**: Start with OAuth integration
4. **Iterative Development**: Follow implementation phases sequentially
5. **User Testing**: Beta test with internal users before full rollout
6. **Production Deployment**: Deploy to staging, then production
7. **Monitoring**: Set up alerts for export failures, API rate limits, cron job health

---

**Document Version**: 2.0
**Last Updated**: 2025-11-12
**Author**: Claude Code
**Status**: Ready for Implementation
