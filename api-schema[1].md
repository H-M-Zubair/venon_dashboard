# Google Sheets Integration - API Schema

Complete API specification for all Google Sheets integration endpoints.

## Table of Contents
- [Authentication](#authentication)
- [OAuth Endpoints](#oauth-endpoints)
- [Account Management](#account-management)
- [Export Configuration](#export-configuration)
- [Export Management](#export-management)
- [Export Logs](#export-logs)
- [Error Responses](#error-responses)
- [Validation Rules](#validation-rules)

---

## Authentication

All endpoints (except OAuth callback) require Bearer token authentication.

**Headers**:
```
Authorization: Bearer {supabase_access_token}
```

**Authentication Middleware**: `authenticateUser`
- Validates token with Supabase Auth
- Attaches `req.user` with account information

---

## OAuth Endpoints

### 1. Initiate OAuth Flow

Redirects user to Google OAuth consent screen.

**Endpoint**: `GET /api/google-sheets/oauth/authorize`

**Authentication**: Required

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | UUID | Yes | User's account ID |
| `redirect_url` | string | No | Frontend URL to redirect after success (default: configured frontend URL) |

**Response**: HTTP 302 Redirect to Google OAuth consent screen

**Google OAuth URL Includes**:
- `client_id`: Google OAuth client ID
- `redirect_uri`: Backend callback URL
- `scope`: `https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file`
- `response_type`: `code`
- `access_type`: `offline` (to get refresh token)
- `state`: Encrypted state containing `account_id` and `redirect_url`

**Example Request**:
```bash
GET /api/google-sheets/oauth/authorize?account_id=550e8400-e29b-41d4-a716-446655440000
```

---

### 2. OAuth Callback

Handles redirect from Google after user grants permissions.

**Endpoint**: `GET /api/google-sheets/oauth/callback`

**Authentication**: Not required (public callback)

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Google |
| `state` | string | Yes | Encrypted state from authorize endpoint |
| `error` | string | No | Error code if user denied permissions |

**Process**:
1. Decrypt `state` to get `account_id` and `redirect_url`
2. Exchange `code` for `access_token` and `refresh_token`
3. Fetch user's Google email via Google API
4. Store tokens in `integrations` table
5. Redirect to frontend with success/error

**Success Response**: HTTP 302 Redirect
```
{redirect_url}?success=true&email={google_email}
```

**Error Response**: HTTP 302 Redirect
```
{redirect_url}?success=false&error={error_message}
```

**Example**:
```bash
# User grants permissions, Google redirects to:
GET /api/google-sheets/oauth/callback?code=4/0AX4XfWh...&state=eyJhY2NvdW50X2lkIjoi...

# Backend redirects user to:
https://app.venon.io/settings/integrations?success=true&email=user@gmail.com
```

---

## Account Management

### 3. List Connected Google Accounts

Retrieves all Google accounts connected for the authenticated user.

**Endpoint**: `GET /api/google-sheets/accounts`

**Authentication**: Required

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "integration-uuid-1",
      "email": "user@gmail.com",
      "connected_at": "2025-01-15T10:30:00Z",
      "last_used": "2025-01-20T14:45:00Z",
      "exports_count": 3
    },
    {
      "id": "integration-uuid-2",
      "email": "business@gmail.com",
      "connected_at": "2025-01-10T08:20:00Z",
      "last_used": null,
      "exports_count": 0
    }
  ]
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Integration ID (references `integrations.id`) |
| `email` | string | Google account email |
| `connected_at` | ISO 8601 | When account was first connected |
| `last_used` | ISO 8601 | Last time this account was used for an export (null if never) |
| `exports_count` | integer | Number of active export configurations using this account |

**Example Request**:
```bash
curl -X GET https://api.venon.io/api/google-sheets/accounts \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4. Disconnect Google Account

Removes a connected Google account. Fails if exports are using this account.

**Endpoint**: `DELETE /api/google-sheets/accounts/:integration_id`

**Authentication**: Required

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `integration_id` | UUID | Integration ID to disconnect |

**Response**: `200 OK`
```json
{
  "message": "Google account disconnected successfully",
  "email": "user@gmail.com"
}
```

**Error Response**: `400 Bad Request` (if exports exist)
```json
{
  "error": "Cannot disconnect account",
  "message": "3 export configurations are using this account. Delete or reassign exports first.",
  "exports_using_account": 3
}
```

**Example Request**:
```bash
curl -X DELETE https://api.venon.io/api/google-sheets/accounts/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Export Configuration

### 5. Create Export Configuration

Creates a new Google Sheets export configuration.

**Important Behavior**:
- **One-time exports** (`sync_frequency = 'one-time'`): Execute immediately after creation
- **Auto-updating exports** (`sync_frequency` = daily/weekly/monthly): Stored for cron job pickup at 10 AM UTC

**Endpoint**: `POST /api/google-sheets/exports`

**Authentication**: Required (Editor role or higher)

**Request Body**:
```json
{
  "report_name": "Daily Meta Ads Performance",
  "integration_id": "integration-uuid-1",
  "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "sheet_name": "Meta Ads Data",
  "sync_frequency": "daily",
  "attribution_model": "linear_paid",
  "granularity": "daily",
  "start_date": "2025-01-01",
  "end_date": null,
  "selected_channels": ["meta-ads", "google-ads"],
  "selected_metrics": [
    "gross_revenue_total",
    "orders",
    "ad_spend_total",
    "meta-ads.roas",
    "meta-ads.spend",
    "meta-ads.revenue",
    "google-ads.roas",
    "google-ads.spend",
    "google-ads.revenue"
  ]
}
```

**Request Body Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `report_name` | string | Yes | Human-readable report name (3-100 chars) |
| `integration_id` | UUID | Yes | ID of connected Google account to use |
| `spreadsheet_id` | string | No | Existing Google Sheet ID. If omitted, new sheet is created. |
| `sheet_name` | string | Yes | Name of the sheet tab (will be created if doesn't exist) |
| `sync_frequency` | enum | Yes | `one-time` (immediate), `daily`, `weekly`, `monthly` (scheduled at 10 AM UTC) |
| `attribution_model` | enum | Yes | `linear_paid`, `linear_all`, `first_click`, `last_click`, `last_paid_click` |
| `granularity` | enum | Yes | `daily`, `weekly`, `monthly` |
| `start_date` | date | Yes | Start date (YYYY-MM-DD) |
| `end_date` | date | No | End date for one-time exports. Must be null for auto-updating. |
| `selected_channels` | string[] | Yes | Array of channel names (at least one) |
| `selected_metrics` | string[] | Yes | Array of metric names (at least one) |

**Date Range Behavior**:
- **One-time exports**: Exports from `start_date` to `end_date` immediately
- **Auto-updating exports**:
  - First export: From `start_date` to **2 days ago** (not today, for timezone safety)
  - Subsequent exports: From `last_export_at + 1 day` to **2 days ago**

**Metric Naming Convention**:
- **Global metrics**: Just the metric name (e.g., `gross_revenue_total`, `orders`)
- **Channel-specific metrics**: `{channel}.{metric}` (e.g., `meta-ads.roas`, `google-ads.spend`)

**Response**: `201 Created`
```json
{
  "data": {
    "id": "export-uuid",
    "account_id": "account-uuid",
    "shop_name": "example.myshopify.com",
    "report_name": "Daily Meta Ads Performance",
    "integration_id": "integration-uuid-1",
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheet_name": "Meta Ads Data",
    "sync_frequency": "daily",
    "attribution_model": "linear_paid",
    "granularity": "daily",
    "start_date": "2025-01-01",
    "end_date": null,
    "selected_channels": ["meta-ads", "google-ads"],
    "selected_metrics": ["gross_revenue_total", "orders", "..."],
    "active": true,
    "last_export_at": null,
    "next_export_at": "2025-01-21T10:00:00Z",
    "created_at": "2025-01-20T15:30:00Z",
    "updated_at": "2025-01-20T15:30:00Z"
  }
}
```

**Example Request**:
```bash
curl -X POST https://api.venon.io/api/google-sheets/exports \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "report_name": "Daily Meta Ads Performance",
    "integration_id": "550e8400-e29b-41d4-a716-446655440000",
    "sheet_name": "Meta Ads Data",
    "sync_frequency": "daily",
    "attribution_model": "linear_paid",
    "granularity": "daily",
    "start_date": "2025-01-01",
    "selected_channels": ["meta-ads"],
    "selected_metrics": ["gross_revenue_total", "orders", "meta-ads.roas"]
  }'
```

---

### 6. List Export Configurations

Retrieves all export configurations for the authenticated user.

**Endpoint**: `GET /api/google-sheets/exports`

**Authentication**: Required

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `active` | boolean | No | Filter by active status |
| `sync_frequency` | enum | No | Filter by frequency (`daily`, `weekly`, `monthly`) |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "export-uuid-1",
      "report_name": "Daily Meta Ads Performance",
      "sync_frequency": "daily",
      "last_export_at": "2025-01-20T10:00:00Z",
      "next_export_at": "2025-01-21T10:00:00Z",
      "active": true,
      "spreadsheet_url": "https://docs.google.com/spreadsheets/d/...",
      "integration_email": "user@gmail.com",
      "created_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": "export-uuid-2",
      "report_name": "Monthly Revenue Report",
      "sync_frequency": "monthly",
      "last_export_at": "2025-01-01T10:00:00Z",
      "next_export_at": "2025-02-01T10:00:00Z",
      "active": true,
      "spreadsheet_url": "https://docs.google.com/spreadsheets/d/...",
      "integration_email": "business@gmail.com",
      "created_at": "2025-01-01T08:30:00Z"
    }
  ]
}
```

**Note**: `next_export_at` is always at 10 AM UTC for scheduled exports.

**Example Request**:
```bash
curl -X GET "https://api.venon.io/api/google-sheets/exports?active=true" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 7. Get Export Configuration

Retrieves a single export configuration by ID.

**Endpoint**: `GET /api/google-sheets/exports/:id`

**Authentication**: Required

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Export configuration ID |

**Response**: `200 OK`
```json
{
  "data": {
    "id": "export-uuid",
    "account_id": "account-uuid",
    "shop_name": "example.myshopify.com",
    "report_name": "Daily Meta Ads Performance",
    "integration_id": "integration-uuid-1",
    "integration_email": "user@gmail.com",
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheet_name": "Meta Ads Data",
    "sync_frequency": "daily",
    "attribution_model": "linear_paid",
    "granularity": "daily",
    "start_date": "2025-01-01",
    "end_date": null,
    "selected_channels": ["meta-ads", "google-ads"],
    "selected_metrics": ["gross_revenue_total", "orders", "ad_spend_total", "meta-ads.roas"],
    "active": true,
    "last_export_at": "2025-01-20T10:00:00Z",
    "next_export_at": "2025-01-21T10:00:00Z",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2025-01-20T10:05:00Z"
  }
}
```

**Error Response**: `404 Not Found`
```json
{
  "error": "Export configuration not found"
}
```

**Example Request**:
```bash
curl -X GET https://api.venon.io/api/google-sheets/exports/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 8. Update Export Configuration

Updates an existing export configuration.

**Endpoint**: `PUT /api/google-sheets/exports/:id`

**Authentication**: Required (Editor role or higher)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Export configuration ID |

**Request Body**: Same as create endpoint, all fields optional
```json
{
  "report_name": "Updated Report Name",
  "selected_metrics": ["gross_revenue_total", "orders", "ad_spend_total"]
}
```

**Response**: `200 OK`
```json
{
  "data": {
    "id": "export-uuid",
    "report_name": "Updated Report Name",
    "selected_metrics": ["gross_revenue_total", "orders", "ad_spend_total"],
    "updated_at": "2025-01-20T16:45:00Z",
    "...": "other fields"
  }
}
```

**Validation Rules**:
- Cannot change `sync_frequency` if export has already run (would break data continuity)
- Cannot change `granularity` if export has already run
- Cannot change `spreadsheet_id` if export has already run
- Can change `selected_channels`, `selected_metrics` anytime

**Example Request**:
```bash
curl -X PUT https://api.venon.io/api/google-sheets/exports/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"report_name": "Updated Report Name"}'
```

---

### 9. Delete Export Configuration

Deletes an export configuration. Stops future scheduled exports.

**Endpoint**: `DELETE /api/google-sheets/exports/:id`

**Authentication**: Required (Editor role or higher)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Export configuration ID |

**Response**: `200 OK`
```json
{
  "message": "Export configuration deleted successfully",
  "report_name": "Daily Meta Ads Performance"
}
```

**Note**: Deleting an export configuration does NOT delete the Google Sheet or its data. Users must manually delete the sheet if desired.

**Example Request**:
```bash
curl -X DELETE https://api.venon.io/api/google-sheets/exports/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Export Logs

### 10. Get Export History

Retrieves the last 30 export attempts for a configuration.

**Endpoint**: `GET /api/google-sheets/exports/:id/logs`

**Authentication**: Required

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Export configuration ID |

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Number of logs to return (default: 30, max: 100) |
| `status` | enum | No | Filter by status (`success`, `failed`) |

**Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "log-uuid-1",
      "export_config_id": "export-uuid",
      "started_at": "2025-01-20T10:00:00Z",
      "completed_at": "2025-01-20T10:00:45Z",
      "status": "success",
      "date_range_start": "2025-01-18",
      "date_range_end": "2025-01-18",
      "rows_exported": 1,
      "duration_ms": 45000,
      "triggered_by": "cron",
      "error_message": null
    },
    {
      "id": "log-uuid-2",
      "export_config_id": "export-uuid",
      "started_at": "2025-01-19T10:00:00Z",
      "completed_at": "2025-01-19T10:00:12Z",
      "status": "failed",
      "date_range_start": "2025-01-17",
      "date_range_end": "2025-01-17",
      "rows_exported": 0,
      "duration_ms": 12000,
      "triggered_by": "cron",
      "error_message": "Google Sheets API quota exceeded. Retrying in 1 hour."
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 30,
    "has_more": false
  }
}
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Log entry ID |
| `started_at` | ISO 8601 | When export job started |
| `completed_at` | ISO 8601 | When export job finished (null if still running) |
| `status` | enum | `running`, `success`, `failed` |
| `date_range_start` | date | Start date of data exported (note: always up to 2 days ago for auto-updating) |
| `date_range_end` | date | End date of data exported |
| `rows_exported` | integer | Number of rows added to sheet |
| `duration_ms` | integer | Export duration in milliseconds |
| `triggered_by` | enum | `cron` (scheduled at 10 AM UTC) |
| `error_message` | string | Error description (null if success) |

**Example Request**:
```bash
curl -X GET "https://api.venon.io/api/google-sheets/exports/550e8400-e29b-41d4-a716-446655440000/logs?limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Error Responses

### Standard Error Format

All error responses follow this structure:

```json
{
  "error": "Error category",
  "message": "Human-readable error description",
  "details": {
    "field": "Additional context"
  }
}
```

### Common HTTP Status Codes

| Status Code | Description | Example |
|-------------|-------------|---------|
| `400 Bad Request` | Invalid input data | Missing required field, invalid date format |
| `401 Unauthorized` | Authentication failed | Missing or invalid Bearer token |
| `403 Forbidden` | Insufficient permissions | User doesn't have editor role |
| `404 Not Found` | Resource not found | Export configuration doesn't exist |
| `409 Conflict` | Resource conflict | Export with same name already exists |
| `422 Unprocessable Entity` | Validation failed | Invalid channel selection, metric doesn't match channel |
| `429 Too Many Requests` | Rate limit exceeded | Too many requests |
| `500 Internal Server Error` | Server error | Database connection failed |
| `503 Service Unavailable` | External service down | Google Sheets API unavailable |

### Example Error Responses

**400 Bad Request - Validation Error**:
```json
{
  "error": "Validation failed",
  "message": "Request body contains invalid fields",
  "details": {
    "start_date": "Must be in YYYY-MM-DD format",
    "selected_channels": "Must contain at least one channel"
  }
}
```

**403 Forbidden - Authorization Error**:
```json
{
  "error": "Insufficient permissions",
  "message": "Editor role or higher required to create exports"
}
```

**404 Not Found - Resource Error**:
```json
{
  "error": "Export configuration not found",
  "message": "No export configuration exists with ID 550e8400-e29b-41d4-a716-446655440000"
}
```

**422 Unprocessable Entity - Business Logic Error**:
```json
{
  "error": "Invalid metric selection",
  "message": "Metric 'meta-ads.roas' requires channel 'meta-ads' to be selected",
  "details": {
    "metric": "meta-ads.roas",
    "required_channel": "meta-ads",
    "selected_channels": ["google-ads"]
  }
}
```

**503 Service Unavailable - External API Error**:
```json
{
  "error": "Google Sheets API unavailable",
  "message": "Unable to connect to Google Sheets API. Please try again later.",
  "details": {
    "service": "Google Sheets API",
    "retry_after": 300
  }
}
```

---

## Validation Rules

### Report Name
- **Required**: Yes
- **Min Length**: 3 characters
- **Max Length**: 100 characters
- **Pattern**: Alphanumeric, spaces, hyphens, underscores
- **Example**: `Daily Meta Ads Performance`

### Sync Frequency
- **Required**: Yes
- **Values**: `one-time`, `daily`, `weekly`, `monthly`
- **Behavior**:
  - `one-time`: Executes immediately upon creation
  - `daily`, `weekly`, `monthly`: Scheduled via cron at 10 AM UTC
- **Constraint**: Cannot be changed after first export runs

### Attribution Model
- **Required**: Yes
- **Values**: `linear_paid`, `linear_all`, `first_click`, `last_click`, `last_paid_click`
- **Note**: Must match available attribution tables in ClickHouse

### Granularity
- **Required**: Yes
- **Values**: `daily`, `weekly`, `monthly`
- **Constraint**: Cannot be changed after first export runs
- **Best Practice**: Match frequency to granularity (daily → daily, weekly → weekly)

### Date Range
- **start_date**:
  - Required: Yes
  - Format: `YYYY-MM-DD`
  - Constraint: Must be before or equal to today
- **end_date**:
  - Required: Only for one-time exports
  - Format: `YYYY-MM-DD`
  - Constraint: Must be after or equal to `start_date`
  - Constraint: Must be null for auto-updating exports
- **Note**: Auto-updating exports always export data up to **2 days ago** (not today) for timezone safety

### Selected Channels
- **Required**: Yes
- **Min Items**: 1
- **Valid Values**:
  - Ad Spend Channels: `meta-ads`, `google-ads`, `taboola`, `tiktok-ads`
  - Email Channels: `klaviyo`, `omnisend`
  - Other: `organic`, `direct`, `referral`, `sms`, etc.
- **Note**: Must be valid channel names from `channels` table

### Selected Metrics
- **Required**: Yes
- **Min Items**: 1
- **Validation Rules**:
  - Global metrics: Must be valid metric name (e.g., `gross_revenue_total`)
  - Channel metrics: Must match pattern `{channel}.{metric}`
  - Channel in metric must be in `selected_channels`
- **Example Valid**:
  ```json
  {
    "selected_channels": ["meta-ads", "google-ads"],
    "selected_metrics": [
      "gross_revenue_total",
      "orders",
      "meta-ads.roas",
      "meta-ads.spend",
      "google-ads.roas"
    ]
  }
  ```
- **Example Invalid**:
  ```json
  {
    "selected_channels": ["meta-ads"],
    "selected_metrics": [
      "google-ads.roas"  // ERROR: google-ads not in selected_channels
    ]
  }
  ```

---

## Rate Limiting

### API Rate Limits
- **Per User**: 60 requests per minute
- **Per Account**: 100 requests per minute

### Google Sheets API Quotas
- **Read Requests**: 300 per minute per project
- **Write Requests**: 60 per minute per user
- **Strategy**: Implement exponential backoff on rate limit errors

**Rate Limit Error Response**:
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

---

## Cron Job Schedule

All scheduled exports run at **10 AM UTC** via separate cron repository:

- **Daily exports**: Run every day at 10 AM UTC (`0 10 * * *`)
- **Weekly exports**: Run every Monday at 10 AM UTC (`0 10 * * 1`)
- **Monthly exports**: Run on the 1st of each month at 10 AM UTC (`0 10 1 * *`)

**Timezone Reasoning**:
- 10 AM UTC is timezone-safe for global shops
- Ensures previous day's data is complete across all timezones
- Combined with 2-day lag ensures data consistency

---

**Document Version**: 2.0
**Last Updated**: 2025-11-12
