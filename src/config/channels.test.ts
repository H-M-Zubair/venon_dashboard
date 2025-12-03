/**
 * Unit tests for channel configuration utilities
 *
 * Testing strategy:
 * - Test isAdSpendChannel with ad spend and non-ad spend channels
 * - Test isNonAdSpendChannel with ad spend and non-ad spend channels
 * - Test isManagedAdChannel with managed and non-managed channels
 * - Test case sensitivity
 */

import { describe, it, expect } from 'vitest';
import {
  isAdSpendChannel,
  isNonAdSpendChannel,
  isManagedAdChannel,
  AD_SPEND_CHANNELS,
  MANAGED_AD_CHANNELS,
} from './channels.js';

describe('Channel Configuration', () => {
  describe('AD_SPEND_CHANNELS constant', () => {
    it('should contain expected ad spend channels', () => {
      expect(AD_SPEND_CHANNELS).toContain('meta-ads');
      expect(AD_SPEND_CHANNELS).toContain('google-ads');
      expect(AD_SPEND_CHANNELS).toContain('taboola');
      expect(AD_SPEND_CHANNELS).toContain('tiktok-ads');
    });

    it('should have 4 ad spend channels', () => {
      expect(AD_SPEND_CHANNELS).toHaveLength(4);
    });
  });

  describe('MANAGED_AD_CHANNELS constant', () => {
    it('should contain expected managed ad channels', () => {
      expect(MANAGED_AD_CHANNELS).toContain('meta-ads');
      expect(MANAGED_AD_CHANNELS).toContain('google-ads');
    });

    it('should have 2 managed ad channels', () => {
      expect(MANAGED_AD_CHANNELS).toHaveLength(2);
    });
  });

  describe('isAdSpendChannel', () => {
    describe('Ad Spend Channels', () => {
      it('should return true for meta-ads', () => {
        expect(isAdSpendChannel('meta-ads')).toBe(true);
      });

      it('should return true for google-ads', () => {
        expect(isAdSpendChannel('google-ads')).toBe(true);
      });

      it('should return true for taboola', () => {
        expect(isAdSpendChannel('taboola')).toBe(true);
      });

      it('should return true for tiktok-ads', () => {
        expect(isAdSpendChannel('tiktok-ads')).toBe(true);
      });
    });

    describe('Non-Ad Spend Channels', () => {
      it('should return false for organic-search', () => {
        expect(isAdSpendChannel('organic-search')).toBe(false);
      });

      it('should return false for direct', () => {
        expect(isAdSpendChannel('direct')).toBe(false);
      });

      it('should return false for email', () => {
        expect(isAdSpendChannel('email')).toBe(false);
      });

      it('should return false for social', () => {
        expect(isAdSpendChannel('social')).toBe(false);
      });

      it('should return false for unknown channel', () => {
        expect(isAdSpendChannel('unknown-channel')).toBe(false);
      });
    });

    describe('Case Sensitivity', () => {
      it('should handle uppercase channel names', () => {
        expect(isAdSpendChannel('META-ADS')).toBe(true);
        expect(isAdSpendChannel('GOOGLE-ADS')).toBe(true);
      });

      it('should handle mixed case channel names', () => {
        expect(isAdSpendChannel('Meta-Ads')).toBe(true);
        expect(isAdSpendChannel('Google-Ads')).toBe(true);
      });

      it('should return false for uppercase non-ad spend channels', () => {
        expect(isAdSpendChannel('ORGANIC-SEARCH')).toBe(false);
      });
    });
  });

  describe('isNonAdSpendChannel', () => {
    describe('Non-Ad Spend Channels', () => {
      it('should return true for organic-search', () => {
        expect(isNonAdSpendChannel('organic-search')).toBe(true);
      });

      it('should return true for direct', () => {
        expect(isNonAdSpendChannel('direct')).toBe(true);
      });

      it('should return true for email', () => {
        expect(isNonAdSpendChannel('email')).toBe(true);
      });

      it('should return true for unknown channel', () => {
        expect(isNonAdSpendChannel('unknown-channel')).toBe(true);
      });
    });

    describe('Ad Spend Channels', () => {
      it('should return false for meta-ads', () => {
        expect(isNonAdSpendChannel('meta-ads')).toBe(false);
      });

      it('should return false for google-ads', () => {
        expect(isNonAdSpendChannel('google-ads')).toBe(false);
      });

      it('should return false for taboola', () => {
        expect(isNonAdSpendChannel('taboola')).toBe(false);
      });

      it('should return false for tiktok-ads', () => {
        expect(isNonAdSpendChannel('tiktok-ads')).toBe(false);
      });
    });

    describe('Case Sensitivity', () => {
      it('should handle uppercase non-ad spend channels', () => {
        expect(isNonAdSpendChannel('ORGANIC-SEARCH')).toBe(true);
      });

      it('should return false for uppercase ad spend channels', () => {
        expect(isNonAdSpendChannel('META-ADS')).toBe(false);
      });
    });
  });

  describe('isManagedAdChannel', () => {
    describe('Managed Ad Channels', () => {
      it('should return true for meta-ads', () => {
        expect(isManagedAdChannel('meta-ads')).toBe(true);
      });

      it('should return true for google-ads', () => {
        expect(isManagedAdChannel('google-ads')).toBe(true);
      });
    });

    describe('Non-Managed Channels', () => {
      it('should return false for taboola (ad spend but not managed)', () => {
        expect(isManagedAdChannel('taboola')).toBe(false);
      });

      it('should return false for tiktok-ads (ad spend but not managed)', () => {
        expect(isManagedAdChannel('tiktok-ads')).toBe(false);
      });

      it('should return false for organic-search (non-ad spend)', () => {
        expect(isManagedAdChannel('organic-search')).toBe(false);
      });

      it('should return false for direct', () => {
        expect(isManagedAdChannel('direct')).toBe(false);
      });

      it('should return false for unknown channel', () => {
        expect(isManagedAdChannel('unknown-channel')).toBe(false);
      });
    });

    describe('Case Sensitivity', () => {
      it('should handle uppercase managed channels', () => {
        expect(isManagedAdChannel('META-ADS')).toBe(true);
        expect(isManagedAdChannel('GOOGLE-ADS')).toBe(true);
      });

      it('should handle mixed case managed channels', () => {
        expect(isManagedAdChannel('Meta-Ads')).toBe(true);
        expect(isManagedAdChannel('Google-Ads')).toBe(true);
      });

      it('should return false for uppercase non-managed channels', () => {
        expect(isManagedAdChannel('TABOOLA')).toBe(false);
      });
    });
  });

  describe('Function Relationships', () => {
    it('isAdSpendChannel and isNonAdSpendChannel should be inverses for ad channels', () => {
      expect(isAdSpendChannel('meta-ads')).toBe(true);
      expect(isNonAdSpendChannel('meta-ads')).toBe(false);
    });

    it('isAdSpendChannel and isNonAdSpendChannel should be inverses for non-ad channels', () => {
      expect(isAdSpendChannel('organic-search')).toBe(false);
      expect(isNonAdSpendChannel('organic-search')).toBe(true);
    });

    it('all managed channels should be ad spend channels', () => {
      MANAGED_AD_CHANNELS.forEach((channel) => {
        expect(isAdSpendChannel(channel)).toBe(true);
      });
    });

    it('not all ad spend channels are managed', () => {
      const managedCount = AD_SPEND_CHANNELS.filter((channel) =>
        isManagedAdChannel(channel)
      ).length;
      expect(managedCount).toBe(MANAGED_AD_CHANNELS.length);
      expect(managedCount).toBeLessThan(AD_SPEND_CHANNELS.length);
    });
  });
});
