/**
 * Unit tests for Attribution Tables utility
 *
 * Testing strategy:
 * - Test all valid attribution models
 * - Test invalid attribution model
 * - Test case sensitivity
 * - Test that error is thrown for unknown models
 */

import { describe, it, expect } from 'vitest';
import { getAttributionTableName } from './attribution-tables.js';

describe('getAttributionTableName', () => {
  describe('Valid Attribution Models', () => {
    it('should return correct table for linear_paid model', () => {
      expect(getAttributionTableName('linear_paid')).toBe(
        'int_order_attribution_linear_paid'
      );
    });

    it('should return correct table for linear_all model', () => {
      expect(getAttributionTableName('linear_all')).toBe(
        'int_order_attribution_linear_all'
      );
    });

    it('should return correct table for first_click model', () => {
      expect(getAttributionTableName('first_click')).toBe(
        'int_order_attribution_first_click'
      );
    });

    it('should return correct table for last_click model', () => {
      expect(getAttributionTableName('last_click')).toBe(
        'int_order_attribution_last_click'
      );
    });

    it('should return correct table for all_clicks model', () => {
      expect(getAttributionTableName('all_clicks')).toBe(
        'int_order_attribution_all_clicks'
      );
    });

    it('should return correct table for last_paid_click model', () => {
      expect(getAttributionTableName('last_paid_click')).toBe(
        'int_order_attribution_last_paid_click'
      );
    });
  });

  describe('Invalid Attribution Models', () => {
    it('should throw error for unknown attribution model', () => {
      expect(() => getAttributionTableName('unknown_model')).toThrow(
        'Unknown attribution model: unknown_model'
      );
    });

    it('should throw error for empty string', () => {
      expect(() => getAttributionTableName('')).toThrow('Unknown attribution model: ');
    });

    it('should throw error for misspelled model', () => {
      expect(() => getAttributionTableName('linear-paid')).toThrow(
        'Unknown attribution model: linear-paid'
      );
    });

    it('should throw error for camelCase model', () => {
      expect(() => getAttributionTableName('linearPaid')).toThrow(
        'Unknown attribution model: linearPaid'
      );
    });

    it('should throw error for uppercase model', () => {
      expect(() => getAttributionTableName('LINEAR_PAID')).toThrow(
        'Unknown attribution model: LINEAR_PAID'
      );
    });

    it('should throw error for null-like values', () => {
      expect(() => getAttributionTableName('null')).toThrow('Unknown attribution model: null');
    });

    it('should throw error for undefined string', () => {
      expect(() => getAttributionTableName('undefined')).toThrow(
        'Unknown attribution model: undefined'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should not accept partial model names', () => {
      expect(() => getAttributionTableName('linear')).toThrow(
        'Unknown attribution model: linear'
      );
    });

    it('should not accept model names with extra whitespace', () => {
      expect(() => getAttributionTableName(' linear_paid ')).toThrow(
        'Unknown attribution model:  linear_paid '
      );
    });

    it('should throw Error instance', () => {
      try {
        getAttributionTableName('invalid');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Unknown attribution model: invalid');
      }
    });
  });

  describe('Return Values', () => {
    it('should return string values', () => {
      const result = getAttributionTableName('linear_paid');
      expect(typeof result).toBe('string');
    });

    it('should return table names with correct prefix', () => {
      const models = [
        'linear_paid',
        'linear_all',
        'first_click',
        'last_click',
        'all_clicks',
        'last_paid_click',
      ];

      models.forEach((model) => {
        const tableName = getAttributionTableName(model);
        expect(tableName).toMatch(/^int_order_attribution_/);
      });
    });

    it('should return consistent results for same input', () => {
      const result1 = getAttributionTableName('linear_paid');
      const result2 = getAttributionTableName('linear_paid');
      expect(result1).toBe(result2);
    });
  });
});
