/**
 * Timestamp Utility Tests
 *
 * Tests for clean, type-safe timestamp handling utilities
 * that enforce strict validation and error handling.
 *
 * @see src/db/utils/timestamps.ts
 * @see docs/TIMESTAMP_BUG_FIX.md
 */

import { describe, expect, it } from 'vitest';

import {
  formatAgeMs,
  getCurrentTimestamp,
  getTimestampAge,
  hasTimestampExceededTimeout,
  validateTimestamp,
} from '../timestamps';

describe('timestamp utilities', () => {
  describe('getCurrentTimestamp', () => {
    it('should return a Date object', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp).toBeInstanceOf(Date);
    });

    it('should return a valid timestamp', () => {
      const timestamp = getCurrentTimestamp();
      expect(timestamp.getTime()).toBeGreaterThan(0);
      expect(Number.isNaN(timestamp.getTime())).toBe(false);
    });

    it('should return a timestamp close to Date.now()', () => {
      const before = Date.now();
      const timestamp = getCurrentTimestamp();
      const after = Date.now();

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(timestamp.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('getTimestampAge', () => {
    it('should calculate age correctly for recent timestamp', () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const age = getTimestampAge(fiveSecondsAgo);

      expect(age).toBeGreaterThanOrEqual(4900); // Allow 100ms variance
      expect(age).toBeLessThanOrEqual(5100);
    });

    it('should calculate age correctly for timestamp 1 minute ago', () => {
      const oneMinuteAgo = new Date(Date.now() - 60000);
      const age = getTimestampAge(oneMinuteAgo);

      expect(age).toBeGreaterThanOrEqual(59900);
      expect(age).toBeLessThanOrEqual(60100);
    });

    it('should throw error for non-Date input', () => {
      expect(() => getTimestampAge('not a date' as unknown as Date)).toThrow(
        'Invalid timestamp: expected Date object, got string',
      );
      expect(() => getTimestampAge(123456 as unknown as Date)).toThrow(
        'Invalid timestamp: expected Date object, got number',
      );
      expect(() => getTimestampAge(null as unknown as Date)).toThrow(
        'Invalid timestamp: expected Date object, got object',
      );
    });

    it('should throw error for invalid Date object (NaN)', () => {
      const invalidDate = new Date('invalid');
      expect(() => getTimestampAge(invalidDate)).toThrow(
        'Invalid timestamp: Date object is invalid (NaN)',
      );
    });

    it('should throw error for future timestamp (negative age)', () => {
      const futureDate = new Date(Date.now() + 10000);
      expect(() => getTimestampAge(futureDate)).toThrow(
        /Invalid timestamp: age is negative.*Timestamp is in the future/,
      );
    });

    it('should throw error for excessively old timestamp (> 30 days)', () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      expect(() => getTimestampAge(oldDate)).toThrow(
        /Invalid timestamp: age is excessive.*> 30 days/,
      );
    });

    it('should allow timestamp exactly at 30 day boundary', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const age = getTimestampAge(thirtyDaysAgo);
      expect(age).toBeGreaterThan(0);
    });
  });

  describe('hasTimestampExceededTimeout', () => {
    it('should return false for timestamp within timeout', () => {
      const recentTimestamp = new Date(Date.now() - 5000);
      const result = hasTimestampExceededTimeout(recentTimestamp, 10000);
      expect(result).toBe(false);
    });

    it('should return true for timestamp that exceeded timeout', () => {
      const oldTimestamp = new Date(Date.now() - 15000);
      const result = hasTimestampExceededTimeout(oldTimestamp, 10000);
      expect(result).toBe(true);
    });

    it('should return false for timestamp exactly at timeout boundary', () => {
      const boundaryTimestamp = new Date(Date.now() - 10000);
      const result = hasTimestampExceededTimeout(boundaryTimestamp, 10000);
      expect(result).toBe(false); // Should be false because age === timeout (not >)
    });

    it('should return true for invalid timestamp (treats as exceeded)', () => {
      const invalidDate = new Date('invalid');
      const result = hasTimestampExceededTimeout(invalidDate, 10000);
      expect(result).toBe(true);
    });

    it('should return true for future timestamp (treats as exceeded)', () => {
      const futureDate = new Date(Date.now() + 10000);
      const result = hasTimestampExceededTimeout(futureDate, 10000);
      expect(result).toBe(true);
    });

    it('should return true for excessively old timestamp', () => {
      const veryOldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const result = hasTimestampExceededTimeout(veryOldDate, 10000);
      expect(result).toBe(true);
    });
  });

  describe('formatAgeMs', () => {
    it('should format milliseconds correctly', () => {
      expect(formatAgeMs(0)).toBe('0ms');
      expect(formatAgeMs(500)).toBe('500ms');
      expect(formatAgeMs(999)).toBe('999ms');
    });

    it('should format seconds correctly', () => {
      expect(formatAgeMs(1000)).toBe('1s');
      expect(formatAgeMs(5500)).toBe('6s'); // Rounds up
      expect(formatAgeMs(30000)).toBe('30s');
      expect(formatAgeMs(59999)).toBe('60s');
    });

    it('should format minutes correctly', () => {
      expect(formatAgeMs(60000)).toBe('1m');
      expect(formatAgeMs(90000)).toBe('2m'); // Rounds 1.5m to 2m
      expect(formatAgeMs(300000)).toBe('5m');
      expect(formatAgeMs(3599999)).toBe('60m');
    });

    it('should format hours correctly', () => {
      expect(formatAgeMs(3600000)).toBe('1h');
      expect(formatAgeMs(7200000)).toBe('2h');
      expect(formatAgeMs(86400000)).toBe('24h');
    });
  });

  describe('validateTimestamp', () => {
    it('should not throw for valid recent timestamp', () => {
      const validDate = new Date(Date.now() - 5000);
      expect(() => validateTimestamp(validDate)).not.toThrow();
    });

    it('should not throw for valid timestamp with custom field name', () => {
      const validDate = new Date(Date.now() - 5000);
      expect(() => validateTimestamp(validDate, 'createdAt')).not.toThrow();
    });

    it('should throw error for non-Date input with custom field name', () => {
      expect(() => validateTimestamp('not a date' as unknown as Date, 'createdAt')).toThrow(
        'createdAt: expected Date object, got string',
      );
    });

    it('should throw error for invalid Date object', () => {
      const invalidDate = new Date('invalid');
      expect(() => validateTimestamp(invalidDate, 'updatedAt')).toThrow(
        'updatedAt: invalid Date object (NaN)',
      );
    });

    it('should throw error for future timestamp', () => {
      const futureDate = new Date(Date.now() + 10000);
      expect(() => validateTimestamp(futureDate, 'createdAt')).toThrow(
        /createdAt: timestamp is in the future by \d+s/,
      );
    });

    it('should throw error for timestamp before year 2020', () => {
      const oldDate = new Date('2019-12-31T23:59:59.999Z');
      expect(() => validateTimestamp(oldDate, 'createdAt')).toThrow(
        /createdAt: timestamp is before 2020/,
      );
    });

    it('should allow timestamp exactly at 2020-01-01', () => {
      const year2020 = new Date('2020-01-01T00:00:00.000Z');
      expect(() => validateTimestamp(year2020)).not.toThrow();
    });

    it('should allow timestamp from year 2023', () => {
      const year2023 = new Date('2023-06-15T12:00:00.000Z');
      expect(() => validateTimestamp(year2023)).not.toThrow();
    });
  });

  describe('integration: real-world scenarios', () => {
    it('should handle stream timeout check correctly', () => {
      const STREAM_TIMEOUT_MS = 120000; // 2 minutes

      // Recent stream (1 minute old) - should NOT timeout
      const recentStream = new Date(Date.now() - 60000);
      expect(hasTimestampExceededTimeout(recentStream, STREAM_TIMEOUT_MS)).toBe(false);

      // Old stream (3 minutes old) - should timeout
      const oldStream = new Date(Date.now() - 180000);
      expect(hasTimestampExceededTimeout(oldStream, STREAM_TIMEOUT_MS)).toBe(true);
    });

    it('should format age for error messages correctly', () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      const age = getTimestampAge(fiveSecondsAgo);
      const formatted = formatAgeMs(age);

      expect(formatted).toMatch(/\d+s/);
    });

    it('should handle orphan cleanup timeout (30 minutes)', () => {
      const ORPHAN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

      // 20 minutes old - should NOT be orphaned
      const recent = new Date(Date.now() - 20 * 60 * 1000);
      expect(hasTimestampExceededTimeout(recent, ORPHAN_TIMEOUT_MS)).toBe(false);

      // 40 minutes old - should be orphaned
      // Note: This will throw from getTimestampAge because it's > 30 days check
      // But hasTimestampExceededTimeout catches and returns true
      // Actually, 40 minutes is way less than 30 days, so it should work
      const old = new Date(Date.now() - 40 * 60 * 1000);
      expect(hasTimestampExceededTimeout(old, ORPHAN_TIMEOUT_MS)).toBe(true);
    });

    it('should detect corrupted timestamp (the original bug scenario)', () => {
      // Simulate the bug: timestamp interpreted as seconds when it was milliseconds
      // Result: date in year ~55,000 (way in the future)
      const corruptedDate = new Date(Date.now() * 1000);

      // getTimestampAge should throw because age is negative
      expect(() => getTimestampAge(corruptedDate)).toThrow(/age is negative/);

      // hasTimestampExceededTimeout should return true (treats as exceeded)
      expect(hasTimestampExceededTimeout(corruptedDate, 120000)).toBe(true);
    });
  });
});
