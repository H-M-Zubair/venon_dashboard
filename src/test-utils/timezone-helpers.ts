/**
 * Timezone Testing Utilities
 *
 * Helper functions and test case constants for timezone-related tests.
 * Created to support regression testing for timezone fixes implemented on 2025-10-30.
 */

/**
 * Creates mock order data with timezone conversion
 *
 * @param params - Configuration for the mock order
 * @returns Mock order object with timezone fields
 */
export function createMockOrderWithTimezone(params: {
  utc_timestamp: string;
  shop_timezone: string;
  expected_local_date: string;
  customer_email?: string;
  total_revenue?: number;
  is_first_customer_order?: number;
}) {
  const {
    utc_timestamp,
    expected_local_date,
    customer_email = 'test@example.com',
    total_revenue = 100.0,
    is_first_customer_order = 0,
  } = params;

  return {
    timestamp: utc_timestamp,
    order_date_local: expected_local_date,
    order_timestamp_local: utc_timestamp, // Simplified - in real scenario would be converted
    customer_email,
    total_orders: 1,
    total_revenue,
    total_refunds: 0,
    total_cogs: 30.0,
    total_ad_spend: 10.0,
    profit: total_revenue - 40.0,
    roas: total_revenue / 10.0,
    new_customer_count: is_first_customer_order,
    new_customer_revenue: is_first_customer_order ? total_revenue : 0,
    new_customer_roas: is_first_customer_order ? total_revenue / 10.0 : 0,
    cac: is_first_customer_order ? 10.0 : 0,
  };
}

/**
 * Creates mock shop configuration with timezone
 *
 * @param timezone - IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns Mock shop settings object
 */
export function createMockShopWithTimezone(timezone: string) {
  return {
    shop_name: `test-shop-${timezone.replace('/', '-')}.myshopify.com`,
    timezone,
    ignore_vat: false,
  };
}

/**
 * Validates that local timestamp and date are consistent
 *
 * @param timestamp_local - Local timestamp string
 * @param date_local - Local date string
 * @returns true if timestamp and date are consistent
 */
export function verifyTimezoneConsistency(timestamp_local: string, date_local: string): boolean {
  const timestampDate = new Date(timestamp_local).toISOString().split('T')[0];
  return timestampDate === date_local;
}

/**
 * Pre-defined timezone test cases for common scenarios
 *
 * Each test case includes:
 * - utc: UTC timestamp
 * - local: Local timestamp (with offset)
 * - timezone: IANA timezone string
 * - expected_date: Expected local date
 * - description: What this scenario tests
 */
export const TIMEZONE_TEST_CASES = {
  PST_MIDNIGHT: {
    utc: '2024-01-01T08:00:00Z',
    local: '2024-01-01T00:00:00-08:00',
    timezone: 'America/Los_Angeles',
    expected_date: '2024-01-01',
    description: 'Midnight in PST (negative UTC offset)',
  },

  PST_LATE_NIGHT: {
    utc: '2024-02-01T07:59:59Z',
    local: '2024-01-31T23:59:59-08:00',
    timezone: 'America/Los_Angeles',
    expected_date: '2024-01-31',
    description: 'Last second of day in PST (tests date boundary)',
  },

  PST_EARLY_NEXT_DAY_UTC: {
    utc: '2024-02-01T08:00:01Z',
    local: '2024-02-01T00:00:01-08:00',
    timezone: 'America/Los_Angeles',
    expected_date: '2024-02-01',
    description: 'First second of next day in PST',
  },

  TOKYO_EARLY_MORNING: {
    utc: '2024-01-31T16:00:01Z',
    local: '2024-02-01T01:00:01+09:00',
    timezone: 'Asia/Tokyo',
    expected_date: '2024-02-01',
    description: 'Early morning in Tokyo (positive UTC offset)',
  },

  TOKYO_LATE_PREVIOUS_DAY_UTC: {
    utc: '2024-01-31T15:59:59Z',
    local: '2024-02-01T00:59:59+09:00',
    timezone: 'Asia/Tokyo',
    expected_date: '2024-02-01',
    description: 'Still previous day in UTC but next day in Tokyo',
  },

  UTC_MIDNIGHT: {
    utc: '2024-01-01T00:00:00Z',
    local: '2024-01-01T00:00:00+00:00',
    timezone: 'UTC',
    expected_date: '2024-01-01',
    description: 'Midnight in UTC (baseline case)',
  },

  BERLIN_DST_TRANSITION: {
    utc: '2024-03-31T01:00:00Z',
    local: '2024-03-31T02:00:00+01:00',
    timezone: 'Europe/Berlin',
    expected_date: '2024-03-31',
    description: 'DST transition in Berlin (CET -> CEST)',
  },

  LEAP_YEAR_FEB_29: {
    utc: '2024-02-29T12:00:00Z',
    local: '2024-02-29T04:00:00-08:00',
    timezone: 'America/Los_Angeles',
    expected_date: '2024-02-29',
    description: 'Leap day (February 29)',
  },

  NEW_YEAR_EVE_PST: {
    utc: '2025-01-01T07:59:59Z',
    local: '2024-12-31T23:59:59-08:00',
    timezone: 'America/Los_Angeles',
    expected_date: '2024-12-31',
    description: 'New Year\'s Eve last second in PST',
  },

  NEW_YEAR_DAY_PST: {
    utc: '2025-01-01T08:00:00Z',
    local: '2025-01-01T00:00:00-08:00',
    timezone: 'America/Los_Angeles',
    expected_date: '2025-01-01',
    description: 'New Year\'s Day midnight in PST',
  },
} as const;

/**
 * Generates mock ClickHouse results for timezone boundary testing
 *
 * @param scenario - Test scenario from TIMEZONE_TEST_CASES
 * @param overrides - Optional field overrides
 * @returns Mock ClickHouse results array
 */
export function generateMockTimezoneResults(
  scenario: typeof TIMEZONE_TEST_CASES[keyof typeof TIMEZONE_TEST_CASES],
  overrides: Partial<ReturnType<typeof createMockOrderWithTimezone>> = {}
) {
  const baseOrder = createMockOrderWithTimezone({
    utc_timestamp: scenario.utc,
    shop_timezone: scenario.timezone,
    expected_local_date: scenario.expected_date,
  });

  return [{ ...baseOrder, ...overrides }];
}

/**
 * Helper to create expected query parameters with timezone
 *
 * @param start_date - Start date string
 * @param end_date - End date string
 * @returns Query parameters object
 */
export function createTimezoneQueryParams(start_date: string, end_date: string) {
  return {
    start_date,
    end_date,
  };
}
