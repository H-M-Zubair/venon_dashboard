/**
 * Unit Tests for Date Helpers
 */

import { describe, it, expect } from 'vitest';
import {
  validateDateRange,
  makeEndDateInclusive,
  formatDateForQuery,
  makeEndDateInclusiveAndFormat,
  calculateDaysDifference,
  shouldUseHourlyAggregation,
} from './date-helpers';

describe('date-helpers', () => {
  describe('validateDateRange', () => {
    it('should not throw when start date is before end date', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');

      expect(() => validateDateRange(start, end)).not.toThrow();
    });

    it('should not throw when start date equals end date', () => {
      const date = new Date('2024-01-15');

      expect(() => validateDateRange(date, date)).not.toThrow();
    });

    it('should throw when start date is after end date', () => {
      const start = new Date('2024-01-31');
      const end = new Date('2024-01-01');

      expect(() => validateDateRange(start, end)).toThrow('Start date must not be after end date');
    });

    it('should throw with correct error message', () => {
      const start = new Date('2024-12-31');
      const end = new Date('2024-01-01');

      expect(() => validateDateRange(start, end)).toThrow(Error);
      expect(() => validateDateRange(start, end)).toThrow(
        /Start date must not be after end date/
      );
    });
  });

  describe('makeEndDateInclusive', () => {
    it('should add 1 day to the end date', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const result = makeEndDateInclusive(date);

      expect(result.getDate()).toBe(16);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getFullYear()).toBe(2024);
    });

    it('should handle month boundaries correctly', () => {
      const date = new Date('2024-01-31T00:00:00.000Z');
      const result = makeEndDateInclusive(date);

      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getFullYear()).toBe(2024);
    });

    it('should handle year boundaries correctly', () => {
      const date = new Date('2024-12-31T00:00:00.000Z');
      const result = makeEndDateInclusive(date);

      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getFullYear()).toBe(2025);
    });

    it('should handle leap year correctly', () => {
      const date = new Date('2024-02-28T00:00:00.000Z');
      const result = makeEndDateInclusive(date);

      expect(result.getDate()).toBe(29);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getFullYear()).toBe(2024);
    });

    it('should not modify the original date', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const originalDate = date.getDate();

      makeEndDateInclusive(date);

      expect(date.getDate()).toBe(originalDate);
    });
  });

  describe('formatDateForQuery', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = formatDateForQuery(date);

      expect(result).toBe('2024-01-15');
    });

    it('should handle single-digit months and days correctly', () => {
      const date = new Date('2024-03-05T00:00:00.000Z');
      const result = formatDateForQuery(date);

      expect(result).toBe('2024-03-05');
    });

    it('should handle year-end dates correctly', () => {
      const date = new Date('2024-12-31T23:59:59.000Z');
      const result = formatDateForQuery(date);

      expect(result).toBe('2024-12-31');
    });

    it('should handle year-start dates correctly', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const result = formatDateForQuery(date);

      expect(result).toBe('2024-01-01');
    });
  });

  describe('makeEndDateInclusiveAndFormat', () => {
    it('should add 1 day and format as YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const result = makeEndDateInclusiveAndFormat(date);

      expect(result).toBe('2024-01-16');
    });

    it('should handle month boundaries correctly', () => {
      const date = new Date('2024-01-31T00:00:00.000Z');
      const result = makeEndDateInclusiveAndFormat(date);

      expect(result).toBe('2024-02-01');
    });

    it('should handle year boundaries correctly', () => {
      const date = new Date('2024-12-31T00:00:00.000Z');
      const result = makeEndDateInclusiveAndFormat(date);

      expect(result).toBe('2025-01-01');
    });

    it('should not modify the original date', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const originalTime = date.getTime();

      makeEndDateInclusiveAndFormat(date);

      expect(date.getTime()).toBe(originalTime);
    });
  });

  describe('calculateDaysDifference', () => {
    it('should return 0 for same day', () => {
      const date = new Date('2024-01-15');
      const result = calculateDaysDifference(date, date);

      expect(result).toBe(0);
    });

    it('should calculate correct difference for consecutive days', () => {
      const start = new Date('2024-01-15');
      const end = new Date('2024-01-16');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(1);
    });

    it('should calculate correct difference for a week', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-08');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(7);
    });

    it('should calculate correct difference for a month', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(30);
    });

    it('should calculate correct difference across months', () => {
      const start = new Date('2024-01-15');
      const end = new Date('2024-02-15');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(31);
    });

    it('should calculate correct difference across years', () => {
      const start = new Date('2024-12-15');
      const end = new Date('2025-01-15');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(31);
    });

    it('should return negative for reversed dates', () => {
      const start = new Date('2024-01-16');
      const end = new Date('2024-01-15');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(-1);
    });

    it('should floor fractional days', () => {
      const start = new Date('2024-01-15T10:00:00.000Z');
      const end = new Date('2024-01-16T08:00:00.000Z');
      const result = calculateDaysDifference(start, end);

      expect(result).toBe(0); // Less than 24 hours
    });
  });

  describe('shouldUseHourlyAggregation', () => {
    it('should return true for same day', () => {
      const date = new Date('2024-01-15');
      const result = shouldUseHourlyAggregation(date, date);

      expect(result).toBe(true);
    });

    it('should return false for consecutive days', () => {
      const start = new Date('2024-01-15');
      const end = new Date('2024-01-16');
      const result = shouldUseHourlyAggregation(start, end);

      expect(result).toBe(false);
    });

    it('should return false for multi-day range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const result = shouldUseHourlyAggregation(start, end);

      expect(result).toBe(false);
    });

    it('should return true even with different times on same day', () => {
      const start = new Date('2024-01-15T08:00:00.000Z');
      const end = new Date('2024-01-15T20:00:00.000Z');
      const result = shouldUseHourlyAggregation(start, end);

      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle timezone-aware dates correctly', () => {
      const start = new Date('2024-01-15T23:00:00.000+05:00');
      const end = new Date('2024-01-16T01:00:00.000+05:00');
      const daysDiff = calculateDaysDifference(start, end);

      // Should be less than 1 day (2 hours)
      expect(daysDiff).toBe(0);
    });

    it('should handle daylight saving time transitions', () => {
      // This test may behave differently depending on the system timezone
      // Just ensuring no errors are thrown
      const start = new Date('2024-03-10T00:00:00.000Z');
      const end = new Date('2024-03-11T00:00:00.000Z');

      expect(() => calculateDaysDifference(start, end)).not.toThrow();
      expect(() => shouldUseHourlyAggregation(start, end)).not.toThrow();
    });

    it('should handle dates far in the past', () => {
      const start = new Date('2000-01-01');
      const end = new Date('2024-01-01');
      const result = calculateDaysDifference(start, end);

      expect(result).toBeGreaterThan(8000); // Approximately 24 years
    });

    it('should handle dates far in the future', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2050-01-01');
      const result = calculateDaysDifference(start, end);

      expect(result).toBeGreaterThan(9000); // Approximately 26 years
    });
  });
});
