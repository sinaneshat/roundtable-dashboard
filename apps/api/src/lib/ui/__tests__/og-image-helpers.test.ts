/**
 * OG Image Helpers Unit Tests
 *
 * Tests for OpenGraph image generation utilities including:
 * - Color constants and mode color mapping
 * - Text truncation utilities
 * - Gradient generation
 * - Base64 image loading functions
 */

import { CHAT_MODES } from '@roundtable/shared/enums';
import { describe, expect, it } from 'vitest';

import {
  createGradient,
  getModeColor,
  MODE_COLORS,
  OG_COLORS,
  OG_DEFAULTS,
  OG_HEIGHT,
  OG_WIDTH,
  truncateText,
} from '../og-colors';

describe('oG_COLORS', () => {
  it('should have all required color properties', () => {
    expect(OG_COLORS.background).toBeDefined();
    expect(OG_COLORS.primary).toBeDefined();
    expect(OG_COLORS.textPrimary).toBeDefined();
    expect(OG_COLORS.textSecondary).toBeDefined();
    expect(OG_COLORS.textMuted).toBeDefined();
    expect(OG_COLORS.glassBackground).toBeDefined();
    expect(OG_COLORS.glassBorder).toBeDefined();
  });

  it('should have mode-specific colors', () => {
    expect(OG_COLORS.analyzing).toBeDefined();
    expect(OG_COLORS.brainstorming).toBeDefined();
    expect(OG_COLORS.debating).toBeDefined();
    expect(OG_COLORS.solving).toBeDefined();
  });

  it('should have valid hex color format for primary colors', () => {
    const hexColorRegex = /^#[0-9A-F]{6}$/i;

    expect(OG_COLORS.background).toMatch(hexColorRegex);
    expect(OG_COLORS.textPrimary).toMatch(hexColorRegex);
    expect(OG_COLORS.analyzing).toMatch(hexColorRegex);
    expect(OG_COLORS.brainstorming).toMatch(hexColorRegex);
    expect(OG_COLORS.debating).toMatch(hexColorRegex);
    expect(OG_COLORS.solving).toMatch(hexColorRegex);
  });

  it('should have valid rgba format for glass morphism colors', () => {
    const rgbaRegex = /^rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*[\d.]+\)$/;

    expect(OG_COLORS.glassBackground).toMatch(rgbaRegex);
    expect(OG_COLORS.glassBorder).toMatch(rgbaRegex);
    expect(OG_COLORS.glassHighlight).toMatch(rgbaRegex);
  });
});

describe('getModeColor', () => {
  it('should return correct color for all modes using CHAT_MODES array', () => {
    // Using CHAT_MODES as single source of truth - no unsafe typecasts
    CHAT_MODES.forEach((mode) => {
      const color = getModeColor(mode);
      expect(color).toBe(OG_COLORS[mode]);
      expect(color).toBe(MODE_COLORS[mode]);
    });
  });

  it('should return primary color for invalid mode via Zod validation', () => {
    // getModeColor uses Zod safeParse internally, invalid modes return primary
    // Test with runtime-invalid value using type assertion for test purposes
    const invalidMode = 'unknown-mode' as Parameters<typeof getModeColor>[0];
    const color = getModeColor(invalidMode);
    expect(color).toBe(OG_COLORS.primary);
  });
});

describe('createGradient', () => {
  it('should create gradient with default values', () => {
    const gradient = createGradient();

    expect(gradient).toContain('linear-gradient');
    expect(gradient).toContain('135deg');
    expect(gradient).toContain(OG_COLORS.backgroundGradientStart);
    expect(gradient).toContain(OG_COLORS.backgroundGradientEnd);
  });

  it('should create gradient with custom angle', () => {
    const gradient = createGradient(45);

    expect(gradient).toContain('45deg');
  });

  it('should create gradient with custom colors', () => {
    const startColor = '#ff0000';
    const endColor = '#0000ff';
    const gradient = createGradient(90, startColor, endColor);

    expect(gradient).toContain('90deg');
    expect(gradient).toContain(startColor);
    expect(gradient).toContain(endColor);
  });

  it('should produce valid CSS gradient syntax', () => {
    const gradient = createGradient(180, '#000000', '#ffffff');

    // Should match pattern: linear-gradient(180deg, #000000 0%, #ffffff 100%)
    expect(gradient).toMatch(/^linear-gradient\(\d+deg,\s*#[0-9A-Fa-f]{6}\s*0%,\s*#[0-9A-Fa-f]{6}\s*100%\)$/);
  });
});

describe('truncateText', () => {
  it('should return original text if shorter than max length', () => {
    const text = 'Hello';
    const result = truncateText(text, 10);

    expect(result).toBe('Hello');
  });

  it('should return original text if equal to max length', () => {
    const text = 'HelloWorld';
    const result = truncateText(text, 10);

    expect(result).toBe('HelloWorld');
  });

  it('should truncate and add ellipsis if longer than max length', () => {
    const text = 'This is a very long text that should be truncated';
    const result = truncateText(text, 20);

    expect(result).toBe('This is a very long ...');
    expect(result).toHaveLength(23); // 20 chars + '...'
  });

  it('should handle empty string', () => {
    const result = truncateText('', 10);
    expect(result).toBe('');
  });

  it('should handle max length of 0', () => {
    const result = truncateText('Hello', 0);
    expect(result).toBe('...');
  });

  it('should handle unicode characters correctly', () => {
    const text = 'Hello 👋 World 🌍';
    const result = truncateText(text, 10);

    expect(result.length).toBeLessThanOrEqual(13); // 10 + '...'
  });
});

describe('oG Image Dimension Constants (centralized)', () => {
  it('should use standard OG image dimensions from og-colors.ts', () => {
    // Using centralized constants - single source of truth
    expect(OG_WIDTH).toBe(1200);
    expect(OG_HEIGHT).toBe(630);

    // Aspect ratio should be approximately 1.9:1
    const aspectRatio = OG_WIDTH / OG_HEIGHT;
    expect(aspectRatio).toBeCloseTo(1.9, 1);
  });

  it('should have sensible defaults from OG_DEFAULTS', () => {
    expect(OG_DEFAULTS.title).toBeTruthy();
    expect(OG_DEFAULTS.participantCount).toBeGreaterThan(0);
    expect(OG_DEFAULTS.messageCount).toBeGreaterThan(0);
  });
});
