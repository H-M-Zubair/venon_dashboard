/**
 * Date Utilities
 *
 * Common date validation and transformation utilities
 * to eliminate duplication across services.
 */

/**
 * Validates that start date is not after end date
 *
 * @param startDate - The start date
 * @param endDate - The end date
 * @throws {Error} If start date is after end date
 */
export function validateDateRange(startDate: Date, endDate: Date): void {
  if (startDate > endDate) {
    throw new Error('Start date must not be after end date');
  }
}

/**
 * Makes an end date inclusive by adding 1 day
 * Used for SQL queries with < comparison instead of <=
 *
 * @param endDate - The end date to make inclusive
 * @returns The inclusive end date
 */
export function makeEndDateInclusive(endDate: Date): Date {
  const endDateInclusive = new Date(endDate);
  endDateInclusive.setDate(endDateInclusive.getDate() + 1);
  return endDateInclusive;
}

/**
 * Formats a date as YYYY-MM-DD string for SQL queries
 *
 * @param date - The date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForQuery(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/**
 * Makes end date inclusive and formats it for SQL queries
 * Convenience function combining makeEndDateInclusive and formatDateForQuery
 *
 * @param endDate - The end date to make inclusive and format
 * @returns Formatted inclusive end date string (YYYY-MM-DD)
 */
export function makeEndDateInclusiveAndFormat(endDate: Date): string {
  const inclusiveDate = makeEndDateInclusive(endDate);
  return formatDateForQuery(inclusiveDate);
}

/**
 * Calculates the number of days between two dates
 *
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns Number of days between dates (rounded down)
 */
export function calculateDaysDifference(startDate: Date, endDate: Date): number {
  const timeDiff = endDate.getTime() - startDate.getTime();
  return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
}

/**
 * Determines if date range should use hourly aggregation
 * Hourly is used when date range is within the same day
 *
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns true if should use hourly aggregation, false for daily
 */
export function shouldUseHourlyAggregation(startDate: Date, endDate: Date): boolean {
  return calculateDaysDifference(startDate, endDate) === 0;
}
