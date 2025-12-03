# Google Sheets Integration - Implementation Checklist

This checklist provides a detailed step-by-step guide for implementing the Google Sheets integration feature. Check off items as you complete them.

---

## Phase 1: OAuth Integration and Account Management ⏱️ 3-4 days

### 1.1 Environment Setup
- [ ] Create Google Cloud Project at [console.cloud.google.com](https://console.cloud.google.com)
- [ ] Enable Google Sheets API in the project
- [ ] Enable Google Drive API in the project
- [ ] Create OAuth 2.0 credentials (Web application)
  - Add authorized redirect URI: `https://api.venon.io/api/google-sheets/oauth/callback` (production)
  - Add authorized redirect URI: `http://localhost:3001/api/google-sheets/oauth/callback` (development)
- [ ] Save Client ID and Client Secret
- [ ] Add environment variables to `.env`:
  ```env
  GOOGLE_OAUTH_CLIENT_ID=your-client-id
  GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
  GOOGLE_OAUTH_REDIRECT_URI=https://api.venon.io/api/google-sheets/oauth/callback
  FRONTEND_URL=https://app.venon.io
  ```
- [ ] Update `src/config/env.ts` to validate new environment variables

### 1.2 Install Dependencies
- [ ] Install Google Auth library: `npm install google-auth-library`
- [ ] Install Google Sheets API: `npm install googleapis`
- [ ] Update `package.json` and commit changes

### 1.3 Create Service Layer
- [ ] Create `src/services/google-sheets.ts`
- [ ] Implement `GoogleSheetsService` class with methods:
  - [ ] `initializeClient(integrationId: string)` - Create authenticated Google API client
  - [ ] `createSpreadsheet(title: string)` - Create new Google Sheet
  - [ ] `getSpreadsheet(spreadsheetId: string)` - Get sheet metadata
  - [ ] `appendRows(spreadsheetId: string, sheetName: string, rows: any[][])` - Append data
  - [ ] `formatSheet(spreadsheetId: string, sheetName: string, headerRowIndex: number)` - Format headers
  - [ ] `refreshAccessToken(integrationId: string)` - Refresh OAuth token
- [ ] Add error handling for:
  - Token expiration
  - Rate limiting (HTTP 429)
  - Permission errors (HTTP 403)
  - Invalid spreadsheet ID

### 1.4 Create OAuth Routes
- [ ] Create `src/routes/google-sheets.ts`
- [ ] Implement `GET /api/google-sheets/oauth/authorize`:
  - [ ] Validate `account_id` query parameter
  - [ ] Generate encrypted state (include `account_id` and `redirect_url`)
  - [ ] Build Google OAuth URL with scopes:
    - `https://www.googleapis.com/auth/spreadsheets`
    - `https://www.googleapis.com/auth/drive.file`
  - [ ] Redirect to Google consent screen
- [ ] Implement `GET /api/google-sheets/oauth/callback`:
  - [ ] Decrypt state to get `account_id`
  - [ ] Exchange authorization code for tokens
  - [ ] Fetch user's Google email
  - [ ] Store tokens in `integrations` table:
    - `type: 'google-sheets'`
    - `access_token` (encrypted)
    - `refresh_token` (encrypted)
    - `token_expires_at`
    - `email`
  - [ ] Redirect to frontend with success/error message
- [ ] Add routes to `src/routes/index.ts`:
  ```typescript
  router.use('/google-sheets', googleSheetsRoutes);
  ```

### 1.5 Create Account Management Routes
- [ ] Implement `GET /api/google-sheets/accounts`:
  - [ ] Add `authenticateUser` middleware
  - [ ] Query `integrations` table for type `'google-sheets'`
  - [ ] Return list of connected accounts with email and created_at
  - [ ] Include count of exports using each account
- [ ] Implement `DELETE /api/google-sheets/accounts/:integration_id`:
  - [ ] Add `authenticateUser` middleware
  - [ ] Check if any exports are using this integration
  - [ ] If yes, return 400 error with count
  - [ ] If no, delete integration from database
  - [ ] Return success message

### 1.6 Testing
- [ ] Write unit tests for `GoogleSheetsService`:
  - [ ] Test `initializeClient()` with mocked OAuth client
  - [ ] Test `createSpreadsheet()` with mocked Sheets API
  - [ ] Test `appendRows()` with various data formats
  - [ ] Test `refreshAccessToken()` flow
- [ ] Manual testing:
  - [ ] Test OAuth flow end-to-end (authorize → callback → token storage)
  - [ ] Test connecting multiple Google accounts
  - [ ] Test disconnecting account (verify token removed)
  - [ ] Test token refresh on expiration
- [ ] Document any issues or gotchas in comments

---

## Phase 2: Export Configuration API and Database Schema ⏱️ 3-4 days

### 2.1 Database Migration
- [ ] Run database schema from `tasks/google-sheets-integration/database-schema.sql`:
  - [ ] Create `google_sheets_exports` table
  - [ ] Create `google_sheets_export_logs` table
  - [ ] Create indexes
  - [ ] Enable Row Level Security (RLS)
  - [ ] Create RLS policies
  - [ ] Create triggers
  - [ ] Create helper functions
- [ ] Test migration in local development environment
- [ ] Test RLS policies (verify users can only access their own data)
- [ ] Commit migration script to version control

### 2.2 Create Validation Schemas
- [ ] Create `src/validators/google-sheets.ts`
- [ ] Define Zod schemas:
  - [ ] `createExportConfigSchema` - Validate POST request body
    - `report_name`: string (3-100 chars)
    - `integration_id`: UUID
    - `spreadsheet_id`: optional string
    - `sheet_name`: string (1-100 chars)
    - `sync_frequency`: enum (one-time, daily, weekly, monthly)
    - `attribution_model`: enum (linear_paid, linear_all, etc.)
    - `granularity`: enum (daily, weekly, monthly)
    - `start_date`: date string (YYYY-MM-DD)
    - `end_date`: optional date string
    - `selected_channels`: array of strings (min 1)
    - `selected_metrics`: array of strings (min 1)
    - `notification_email`: optional email
    - `notify_on_success`: optional boolean
    - `notify_on_failure`: optional boolean
  - [ ] `updateExportConfigSchema` - Validate PUT request body (all fields optional)
  - [ ] `exportIdParamSchema` - Validate UUID path parameter
- [ ] Add custom validation:
  - [ ] `end_date` required if `sync_frequency === 'one-time'`
  - [ ] `end_date` must be null if `sync_frequency !== 'one-time'`
  - [ ] `start_date` must be before or equal to `end_date`
  - [ ] Channel-specific metrics must have channel in `selected_channels`

### 2.3 Create Export Configuration Routes
- [ ] Implement `POST /api/google-sheets/exports`:
  - [ ] Add middleware: `authenticateUser`, `requireEditor`, validation
  - [ ] Validate request body with Zod
  - [ ] If `spreadsheet_id` not provided, create new spreadsheet
  - [ ] Insert into `google_sheets_exports` table
  - [ ] Return created configuration with spreadsheet URL
- [ ] Implement `GET /api/google-sheets/exports`:
  - [ ] Add middleware: `authenticateUser`
  - [ ] Support query filters: `active`, `sync_frequency`
  - [ ] Query user's export configurations
  - [ ] Join with `integrations` to get email
  - [ ] Return list with pagination
- [ ] Implement `GET /api/google-sheets/exports/:id`:
  - [ ] Add middleware: `authenticateUser`
  - [ ] Validate UUID parameter
  - [ ] Query single export configuration
  - [ ] Verify user owns the export (RLS handles this)
  - [ ] Return full configuration
- [ ] Implement `PUT /api/google-sheets/exports/:id`:
  - [ ] Add middleware: `authenticateUser`, `requireEditor`, validation
  - [ ] Validate request body with Zod
  - [ ] Check constraints (can't change frequency/granularity after first export)
  - [ ] Update export configuration
  - [ ] Return updated configuration
- [ ] Implement `DELETE /api/google-sheets/exports/:id`:
  - [ ] Add middleware: `authenticateUser`, `requireEditor`
  - [ ] Validate UUID parameter
  - [ ] Delete export configuration (cascades to logs)
  - [ ] Return success message

### 2.4 Testing
- [ ] Write integration tests for CRUD endpoints:
  - [ ] Test creating export with all configurations
  - [ ] Test creating export with invalid data (expect validation errors)
  - [ ] Test listing exports (with filters)
  - [ ] Test getting single export
  - [ ] Test updating export (valid and invalid updates)
  - [ ] Test deleting export
  - [ ] Test authorization (users can't access other users' exports)
- [ ] Create Postman/Insomnia collection for manual testing
- [ ] Test with real Google Sheets:
  - [ ] Create export with existing spreadsheet
  - [ ] Create export without spreadsheet (auto-create)
- [ ] Verify RLS policies work correctly

---

## Phase 3: Data Export Logic and Google Sheets API Integration ⏱️ 5-7 days

### 3.1 Create Export Service
- [ ] Create `src/services/google-sheets-export.ts`
- [ ] Implement `GoogleSheetsExportService` class with methods:
  - [ ] `exportMetricsToSheet(exportConfigId: string)` - Main orchestration
  - [ ] `getAnalyticsDataForExport(config: ExportConfig)` - Query ClickHouse
  - [ ] `transformDataToRows(data: any[], config: ExportConfig)` - Transform to rows
  - [ ] `calculateMetrics(rawData: any[], config: ExportConfig)` - Calculate derived metrics
  - [ ] `getExportDateRange(config: ExportConfig)` - Determine date range
  - [ ] `createHeaderRow(config: ExportConfig)` - Generate header row
  - [ ] `logExportAttempt(configId: string, status: string, details: any)` - Log to database

### 3.2 Implement Analytics Data Query
- [ ] In `getAnalyticsDataForExport()`:
  - [ ] Determine date range (one-time vs auto-update)
  - [ ] Build ClickHouse query based on:
    - `attribution_model` - Select correct `int_attribution_*` table
    - `granularity` - Use daily/weekly/monthly aggregation
    - `selected_channels` - Filter channels
    - `start_date` and `end_date` - Date range filter
  - [ ] Query global metrics (orders, revenue, ad spend, etc.)
  - [ ] Query channel-specific metrics for each selected channel
  - [ ] Handle new customer metrics (first_time_customer_*)
  - [ ] Handle email revenue (klaviyo, omnisend)
  - [ ] Return aggregated data grouped by time period

### 3.3 Implement Metric Calculations
- [ ] In `calculateMetrics()`:
  - [ ] Calculate ROAS: `revenue / ad_spend`
  - [ ] Calculate NC ROAS: `first_time_customer_revenue / ad_spend`
  - [ ] Calculate CAC: `ad_spend / new_customer_count`
  - [ ] Calculate CPA: `ad_spend / orders`
  - [ ] Calculate AOV: `revenue / orders`
  - [ ] Calculate returns %: `(returns_eur / gross_revenue) * 100`
  - [ ] Calculate returning customer rate: `(returning_orders / total_orders) * 100`
  - [ ] Handle division by zero (return null or 0)
  - [ ] Round numbers to 2 decimal places

### 3.4 Implement Data Transformation
- [ ] In `transformDataToRows()`:
  - [ ] Create header row:
    - Time period column (Date/Week/Month)
    - Global metric columns (in order selected)
    - Channel-specific metric columns (grouped by channel)
  - [ ] Create data rows:
    - Format dates (YYYY-MM-DD)
    - Format currency (numbers only, no symbols)
    - Format percentages (decimals, e.g., 0.15 for 15%)
    - Handle null values (empty string or 0)
  - [ ] Return 2D array: `[[headers], [row1], [row2], ...]`

### 3.5 Implement Main Export Function
- [ ] In `exportMetricsToSheet()`:
  - [ ] Fetch export configuration from database
  - [ ] Validate configuration is active
  - [ ] Initialize Google Sheets client
  - [ ] Determine date range (call `getExportDateRange()`)
  - [ ] Query analytics data (call `getAnalyticsDataForExport()`)
  - [ ] Transform data to rows (call `transformDataToRows()`)
  - [ ] Check if sheet exists, create if not
  - [ ] Append rows to Google Sheet (call `GoogleSheetsService.appendRows()`)
  - [ ] Format sheet (bold headers, freeze top row)
  - [ ] Update `last_export_at` in database
  - [ ] Log export attempt with status 'success'
  - [ ] Handle errors:
    - Catch exceptions
    - Log export attempt with status 'failed'
    - Rethrow error

### 3.6 Testing
- [ ] Write unit tests for export logic:
  - [ ] Test `getExportDateRange()` with various configurations
  - [ ] Test `calculateMetrics()` with sample data
  - [ ] Test `transformDataToRows()` output format
  - [ ] Test metric calculations (ROAS, CAC, etc.)
  - [ ] Test header row generation
- [ ] Write integration tests:
  - [ ] Test full export with real ClickHouse test data
  - [ ] Test with different attribution models
  - [ ] Test with different granularities
  - [ ] Test with different channel selections
  - [ ] Test append mode (multiple exports to same sheet)
- [ ] Manual testing with real Google Sheets:
  - [ ] Create daily export and verify data
  - [ ] Create weekly export and verify aggregation
  - [ ] Create monthly export
  - [ ] Verify metrics match dashboard values
  - [ ] Verify append mode preserves history

---

## Phase 4: Cron Job Scheduling for Auto-Updates ⏱️ 2-3 days

### 4.1 Create Scheduler Service
- [ ] Create `src/services/google-sheets-scheduler.ts`
- [ ] Implement `scheduleGoogleSheetsExports()` function:
  - [ ] Set up daily cron job (0 2 * * *) for daily exports
  - [ ] Set up weekly cron job (0 2 * * 1) for weekly exports
  - [ ] Set up monthly cron job (0 2 1 * *) for monthly exports
  - [ ] Add error handling and logging
- [ ] Implement `runDailyExports()` function:
  - [ ] Query exports with `sync_frequency = 'daily'` and `next_export_at <= NOW()`
  - [ ] Loop through each export
  - [ ] Call `exportMetricsToSheet()` for each
  - [ ] Handle errors (log but continue with other exports)
  - [ ] Update `next_export_at` after completion
- [ ] Implement `runWeeklyExports()` function (similar to daily)
- [ ] Implement `runMonthlyExports()` function (similar to daily)

### 4.2 Integrate Scheduler
- [ ] Register cron jobs in `src/index.ts`:
  ```typescript
  import { scheduleGoogleSheetsExports } from './services/google-sheets-scheduler';

  // After server starts
  scheduleGoogleSheetsExports();
  logger.info('Google Sheets export scheduler initialized');
  ```
- [ ] Add logging for cron job execution
- [ ] Ensure cron jobs don't run during deployment (graceful shutdown)

### 4.3 Implement Next Export Calculation
- [ ] Verify trigger `calculate_next_export_at` works correctly
- [ ] Test that `next_export_at` is calculated on:
  - Insert new export
  - Update export (change frequency)
  - After successful export

### 4.4 Testing
- [ ] Test cron job scheduling:
  - [ ] Use test schedule (every minute) for testing: `* * * * *`
  - [ ] Verify daily exports run
  - [ ] Verify weekly exports run
  - [ ] Verify monthly exports run
  - [ ] Verify inactive exports are skipped
- [ ] Test date range logic for auto-updates:
  - [ ] First export: from `start_date` to today
  - [ ] Second export: from `last_export_at + 1 day` to today
  - [ ] Verify no duplicate data
- [ ] Test error handling:
  - [ ] Simulate Google Sheets API failure
  - [ ] Verify export is logged as failed
  - [ ] Verify other exports continue
- [ ] Load test with 100+ export configurations

---

## Phase 5: Export Logs

### 5.1 Implement Export Logs API
- [ ] Implement `GET /api/google-sheets/exports/:id/logs`:
  - [ ] Add middleware: `authenticateUser`
  - [ ] Query `google_sheets_export_logs` table
  - [ ] Filter by `export_config_id`
  - [ ] Order by `created_at DESC`
  - [ ] Limit to last 30 (or query parameter)
  - [ ] Support status filter (success/failed)
  - [ ] Return paginated results

### 5.2 Implement Log Cleanup
- [ ] Create cron job for log cleanup:
  - [ ] Run daily at 3 AM: `0 3 * * *`
  - [ ] Call `cleanup_old_export_logs()` function
  - [ ] Log number of deleted logs
- [ ] Register in `src/services/google-sheets-scheduler.ts`

### 5.3 Testing
- [ ] Test export logs API:
  - [ ] Get logs for export with multiple attempts
  - [ ] Filter by status (success/failed)
  - [ ] Verify pagination works
  - [ ] Verify correct fields returned
- [ ] Test log cleanup:
  - [ ] Create 50 logs for one export
  - [ ] Run cleanup function
  - [ ] Verify only last 30 remain

---

## Phase 6: Frontend UI Integration

**Note**: This is frontend work. Adjust based on your frontend stack.

### 6.1 Create Google Sheets Page
- [ ] Create `/venon/app/(pages)/integrations/google-sheets/page.tsx`
- [ ] Implement page layout:
  - [ ] Header with title and "Connect Google Account" button
  - [ ] Connected accounts section
  - [ ] Export configurations list
  - [ ] "New Export" button

### 6.2 Implement OAuth Connection Flow
- [ ] Create "Connect Google Account" button:
  - [ ] On click, redirect to backend OAuth URL
  - [ ] Include `account_id` in query string
- [ ] Handle OAuth callback redirect:
  - [ ] Parse `success` and `error` query parameters
  - [ ] Show success/error toast notification
  - [ ] Refresh connected accounts list

### 6.3 Create Export Configuration Form
- [ ] Create `/venon/app/(pages)/integrations/google-sheets/new/page.tsx`
- [ ] Implement form with React Hook Form + Zod validation:
  - [ ] Report name input
  - [ ] Google account dropdown (fetch from API)
  - [ ] Sync frequency radio buttons
  - [ ] Attribution model dropdown
  - [ ] Granularity radio buttons
  - [ ] Date range picker (conditional on sync frequency)
  - [ ] Channel multi-select (fetch from channels API)
  - [ ] Metric multi-select (grouped by global/channel-specific)
  - [ ] Notification settings
- [ ] Add form validation:
  - [ ] Required fields
  - [ ] Date range logic
  - [ ] Channel-metric validation
- [ ] Submit form to `POST /api/google-sheets/exports`
- [ ] Show success toast and redirect to list

### 6.4 Create Export List Table
- [ ] Implement table component:
  - [ ] Columns: Report Name, Frequency, Last Export, Next Export, Status, Actions
  - [ ] Status indicator (active/inactive)
  - [ ] Actions dropdown: Edit, Logs, Delete
  - [ ] Loading states
  - [ ] Empty state (no exports)
- [ ] Implement actions:
  - [ ] Edit: Navigate to edit page
  - [ ] Logs: Navigate to logs page
  - [ ] Delete: Show confirmation modal, call `DELETE /api/google-sheets/exports/:id`

### 6.5 Create Export Detail/Edit Page
- [ ] Create `/venon/app/(pages)/integrations/google-sheets/[id]/page.tsx`
- [ ] Show full export configuration
- [ ] Add action buttons (delete)
- [ ] Show export logs table (last 10 attempts)
- [ ] Add "Edit" mode to update configuration

### 6.6 Create Export Logs Page
- [ ] Create `/venon/app/(pages)/integrations/google-sheets/[id]/logs/page.tsx`
- [ ] Implement logs table:
  - [ ] Columns: Timestamp, Status, Date Range, Rows Exported, Duration, Error
  - [ ] Filter by status (success/failed)
  - [ ] Pagination
  - [ ] Expandable error details
- [ ] Add "View Sheet" link for successful exports

### 6.7 Testing
- [ ] E2E tests with Playwright/Cypress:
  - [ ] Test connecting Google account
  - [ ] Test creating export (all field combinations)
  - [ ] Test editing export
  - [ ] Test viewing logs
  - [ ] Test deleting export
  - [ ] Test disconnecting account
- [ ] Accessibility testing (keyboard navigation, screen readers)
- [ ] Responsive design testing (mobile, tablet, desktop)

---

## Phase 7: Testing and Documentation

### 7.1 Comprehensive Testing
- [ ] Run full test suite:
  - [ ] Unit tests: `npm run test`
  - [ ] Coverage report: `npm run test:coverage`
  - [ ] Ensure >80% code coverage
- [ ] Integration testing:
  - [ ] Test full export flow (OAuth → create → export → logs)
  - [ ] Test cron jobs in staging environment
  - [ ] Test error scenarios
  - [ ] Test with large datasets (1 year of daily data)
- [ ] Load testing:
  - [ ] Create 100+ export configurations
  - [ ] Monitor server resource usage
  - [ ] Check Google Sheets API quota usage
- [ ] Security audit:
  - [ ] Review OAuth implementation (PKCE, state validation)
  - [ ] Check token storage (encryption)
  - [ ] Test RLS policies
  - [ ] Test input validation (XSS, SQL injection)
  - [ ] Check rate limiting

### 7.2 API Documentation
- [ ] Create OpenAPI/Swagger spec:
  - [ ] Document all endpoints
  - [ ] Include request/response examples
  - [ ] Document error codes
- [ ] Add API documentation to Postman/Insomnia collection
- [ ] Generate API reference from OpenAPI spec

### 7.3 User Documentation
- [ ] Write user guide:
  - [ ] How to connect Google account
  - [ ] How to create export configuration
  - [ ] How to select channels and metrics
  - [ ] How to manage exports (delete)
  - [ ] How to troubleshoot issues
- [ ] Create video tutorial (optional)
- [ ] Add FAQ section:
  - How often do exports run?
  - What happens if an export fails?
  - Can I export historical data?
  - How do I change the Google account?

### 7.4 Developer Documentation
- [ ] Update README.md:
  - [ ] Add Google Sheets integration section
  - [ ] Document new environment variables
  - [ ] Update architecture diagram
- [ ] Document code:
  - [ ] Add JSDoc comments to all public methods
  - [ ] Document ClickHouse queries
  - [ ] Document metric calculations
- [ ] Update CLAUDE.md with integration details

### 7.5 Performance Optimization
- [ ] Profile export queries:
  - [ ] Check ClickHouse query performance
  - [ ] Add indexes if needed
  - [ ] Optimize data transformation
- [ ] Cache frequently accessed data:
  - [ ] Connected accounts
  - [ ] Channel list
- [ ] Implement batching for large exports:
  - [ ] If >10,000 rows, split into multiple appends
  - [ ] Respect Google Sheets API rate limits

### 7.6 Monitoring and Alerting
- [ ] Set up monitoring:
  - [ ] Track export success rate
  - [ ] Monitor Google Sheets API quota usage
  - [ ] Monitor export duration
  - [ ] Track error rates
- [ ] Set up alerts:
  - [ ] Alert if export success rate <90%
  - [ ] Alert if Google Sheets API quota >80%
  - [ ] Alert if exports are stuck (running >10 minutes)

---

## Pre-Production Checklist

### Code Quality
- [ ] All tests passing
- [ ] Code coverage >80%
- [ ] No linting errors
- [ ] No TypeScript errors
- [ ] Code reviewed by team

### Configuration
- [ ] Environment variables set in production
- [ ] Google OAuth credentials configured
- [ ] Database migrations run
- [ ] RLS policies enabled
- [ ] Cron jobs scheduled

### Documentation
- [ ] API documentation complete
- [ ] User guide published
- [ ] Developer documentation updated
- [ ] Changelog updated

### Security
- [ ] OAuth flow audited
- [ ] Tokens encrypted
- [ ] RLS policies tested
- [ ] Input validation verified
- [ ] Rate limiting configured

### Monitoring
- [ ] Logging configured
- [ ] Alerts set up
- [ ] Dashboards created
- [ ] Error tracking enabled (Sentry/Bugsnag)

---

## Production Deployment Checklist

### Pre-Deployment
- [ ] Merge feature branch to `main`
- [ ] Tag release: `git tag v1.0.0-google-sheets`
- [ ] Create deployment plan
- [ ] Schedule deployment window
- [ ] Notify team

### Deployment Steps
- [ ] Deploy to staging environment
- [ ] Run smoke tests in staging
- [ ] Run database migrations in production
- [ ] Deploy backend to production
- [ ] Verify cron jobs started
- [ ] Deploy frontend to production
- [ ] Run smoke tests in production

### Post-Deployment
- [ ] Monitor logs for errors
- [ ] Check export success rates
- [ ] Verify cron jobs running
- [ ] Test OAuth flow in production
- [ ] Create test export configuration

### Rollback Plan (if needed)
- [ ] Revert backend deployment
- [ ] Revert frontend deployment
- [ ] Disable cron jobs
- [ ] Run rollback migration (if needed)

---

## Future Enhancements (Post-Launch)

### Nice-to-Have Features
- [ ] Webhook support for export completion
- [ ] Export templates (pre-configured metric sets)
- [ ] Scheduled reports (send email with sheet link)
- [ ] Export to CSV (in addition to Google Sheets)
- [ ] Data visualization in Google Sheets (auto-create charts)
- [ ] Multi-shop exports (compare multiple shops)
- [ ] Custom metrics (user-defined calculations)
- [ ] Export scheduling (choose specific time of day)

### Performance Improvements
- [ ] Implement incremental exports (only export new data)
- [ ] Add caching layer (Redis)
- [ ] Optimize ClickHouse queries (materialized views)
- [ ] Implement parallel exports (multiple sheets simultaneously)

### Analytics & Insights
- [ ] Track most used metrics
- [ ] Track export usage by shop
- [ ] Monitor Google Sheets API quota usage
- [ ] Export performance analytics dashboard

---

**Checklist Version**: 1.0
**Last Updated**: 2025-11-12
**Total Estimated Time**: 25-35 days (1 developer)
