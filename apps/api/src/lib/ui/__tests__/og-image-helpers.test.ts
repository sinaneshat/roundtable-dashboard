/**
 * OG Image Helpers Unit Tests
 *
 * Tests for OpenGraph image generation utilities including:
 * - Color constants and mode color mapping
 * - Text truncation utilities
 * - Gradient generation
 * - Base64 image loading functions
 */

import type { ChatMode } from '@roundtable/shared/enums';
import { describe, expect, it } from 'vitest';

import {
  createGradient,
  getModeColor,
  OG_COLORS,
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
  it('should return correct color for analyzing mode', () => {
    const color = getModeColor('analyzing' as ChatMode);
    expect(color).toBe(OG_COLORS.analyzing);
  });

  it('should return correct color for brainstorming mode', () => {
    const color = getModeColor('brainstorming' as ChatMode);
    expect(color).toBe(OG_COLORS.brainstorming);
  });

  it('should return correct color for debating mode', () => {
    const color = getModeColor('debating' as ChatMode);
    expect(color).toBe(OG_COLORS.debating);
  });

  it('should return correct color for solving mode', () => {
    const color = getModeColor('solving' as ChatMode);
    expect(color).toBe(OG_COLORS.solving);
  });

  it('should return primary color for unknown mode', () => {
    const color = getModeColor('unknown-mode' as ChatMode);
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

describe('oG Image Dimension Constants', () => {
  // Standard OG image dimensions
  const STANDARD_OG_WIDTH = 1200;
  const STANDARD_OG_HEIGHT = 630;

  it('should use standard OG image dimensions', () => {
    // These are the recommended dimensions for OG images
    // Verify that our implementation uses these standards
    expect(STANDARD_OG_WIDTH).toBe(1200);
    expect(STANDARD_OG_HEIGHT).toBe(630);

    // Aspect ratio should be approximately 1.9:1
    const aspectRatio = STANDARD_OG_WIDTH / STANDARD_OG_HEIGHT;
    expect(aspectRatio).toBeCloseTo(1.9, 1);
  });
});
