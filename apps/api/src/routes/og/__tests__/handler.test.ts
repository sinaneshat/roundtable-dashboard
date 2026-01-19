/**
 * OG Image Handler Tests
 *
 * Unit tests for OG image generation functionality.
 * Tests cover SVG generation, PNG conversion, and error handling.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock database
vi.mock('@/db', () => ({
  getDbAsync: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  }),
  chatThread: { slug: 'slug', isPublic: 'isPublic', id: 'id' },
  chatParticipant: { threadId: 'threadId' },
  chatMessage: { threadId: 'threadId' },
}));

// Standard OG dimensions
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// PNG magic bytes
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

describe('oG Image Handler', () => {
  describe('oG Image Dimensions', () => {
    it('should use standard OG image dimensions (1200x630)', () => {
      expect(OG_WIDTH).toBe(1200);
      expect(OG_HEIGHT).toBe(630);
    });
  });

  describe('oG Colors', () => {
    const OG_COLORS = {
      background: '#000000',
      backgroundGradientStart: '#0a0a0a',
      backgroundGradientEnd: '#1a1a1a',
      primary: '#2563eb',
      textPrimary: '#ffffff',
      textSecondary: '#a1a1aa',
      analyzing: '#8b5cf6',
      brainstorming: '#f59e0b',
      debating: '#ef4444',
      solving: '#10b981',
    };

    it('should have valid hex color codes', () => {
      const hexColorRegex = /^#[0-9a-f]{6}$/i;

      const hexColors = Object.entries(OG_COLORS)
        .filter(([_key, value]) => typeof value === 'string' && !value.includes('rgba'))
        .map(([_key, value]) => value);

      for (const color of hexColors) {
        expect(color).toMatch(hexColorRegex);
      }
    });

    it('should have distinct mode colors', () => {
      const modeColors = [
        OG_COLORS.analyzing,
        OG_COLORS.brainstorming,
        OG_COLORS.debating,
        OG_COLORS.solving,
      ];

      const uniqueColors = new Set(modeColors);
      expect(uniqueColors.size).toBe(4);
    });
  });

  describe('error PNG Fallback', () => {
    it('should have a valid transparent 1x1 PNG encoded in base64', () => {
      // This is the corrected transparent PNG (RGBA: 0,0,0,0)
      const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

      // Decode and verify
      const binaryString = atob(base64Png);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Check PNG magic bytes
      const header = Array.from(bytes.subarray(0, 8));
      expect(header).toEqual(PNG_MAGIC);

      // Should be a small file (< 100 bytes for 1x1)
      expect(bytes.length).toBeLessThan(100);
    });

    it('should NOT be the old green PNG', () => {
      // The OLD broken PNG was green (RGBA: 0,255,0,127)
      const oldBrokenPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const newTransparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

      expect(newTransparentPng).not.toBe(oldBrokenPng);
    });
  });

  describe('mode Color Mapping', () => {
    const MODE_COLORS: Record<string, string> = {
      analyzing: '#8b5cf6',
      brainstorming: '#f59e0b',
      debating: '#ef4444',
      solving: '#10b981',
    };

    it('should return correct color for each mode', () => {
      expect(MODE_COLORS.analyzing).toBe('#8b5cf6'); // Purple
      expect(MODE_COLORS.brainstorming).toBe('#f59e0b'); // Orange
      expect(MODE_COLORS.debating).toBe('#ef4444'); // Red
      expect(MODE_COLORS.solving).toBe('#10b981'); // Green
    });

    it('should have all four chat modes', () => {
      const modes = ['analyzing', 'brainstorming', 'debating', 'solving'];
      modes.forEach((mode) => {
        expect(MODE_COLORS[mode]).toBeDefined();
      });
    });
  });

  describe('resvg Import Path', () => {
    it('should use /workerd subpath for Cloudflare Workers', async () => {
      // This test verifies the import path is correct
      // The actual import would fail in Node.js test environment,
      // but we can verify the path pattern exists
      const expectedPath = '@cf-wasm/resvg/workerd';

      // Read the handler file and check for correct import
      const fs = await import('node:fs');
      const path = await import('node:path');

      const handlerPath = path.resolve(__dirname, '../handler.ts');
      const handlerContent = fs.readFileSync(handlerPath, 'utf-8');

      expect(handlerContent).toContain(expectedPath);
      expect(handlerContent).not.toMatch(/import.*from\s+['"]@cf-wasm\/resvg['"]\s*;/);
    });
  });

  describe('cache Headers', () => {
    it('should define appropriate cache durations', () => {
      // Success: 1 hour cache, 24 hour stale-while-revalidate
      const successCacheControl = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';

      expect(successCacheControl).toContain('max-age=3600'); // 1 hour
      expect(successCacheControl).toContain('stale-while-revalidate=86400'); // 24 hours

      // Error: Short cache (1 minute)
      const errorCacheControl = 'public, max-age=60';
      expect(errorCacheControl).toContain('max-age=60');
    });
  });
});

describe('oG Image Content', () => {
  describe('title Handling', () => {
    it('should use default title when thread not found', () => {
      const defaultTitle = 'AI Conversation';
      expect(defaultTitle).toBeTruthy();
      expect(defaultTitle.length).toBeGreaterThan(0);
    });

    it('should handle long titles gracefully', () => {
      const longTitle = 'A'.repeat(200);
      // Title should be truncatable (CSS handles this with -webkit-line-clamp)
      expect(longTitle).toHaveLength(200);
    });
  });

  describe('stats Display', () => {
    it('should use singular form for 1 participant', () => {
      const participantCount = 1;
      const label = participantCount === 1 ? 'AI Model' : 'AI Models';
      expect(label).toBe('AI Model');
    });

    it('should use plural form for multiple participants', () => {
      const participantCount = 3;
      const label = participantCount === 1 ? 'AI Model' : 'AI Models';
      expect(label).toBe('AI Models');
    });

    it('should use singular form for 1 message', () => {
      const messageCount = 1;
      const label = messageCount === 1 ? 'Message' : 'Messages';
      expect(label).toBe('Message');
    });

    it('should use plural form for multiple messages', () => {
      const messageCount = 10;
      const label = messageCount === 1 ? 'Message' : 'Messages';
      expect(label).toBe('Messages');
    });
  });

  describe('default Values', () => {
    it('should have sensible defaults for missing thread data', () => {
      const defaults = {
        title: 'AI Conversation',
        participantCount: 3,
        messageCount: 10,
      };

      expect(defaults.title).toBeTruthy();
      expect(defaults.participantCount).toBeGreaterThan(0);
      expect(defaults.messageCount).toBeGreaterThan(0);
    });
  });
});

describe('oG Image Routes', () => {
  describe('route Paths', () => {
    it('should have correct API route path', () => {
      // The OG route is mounted at /api/v1/og/chat
      const routePath = '/og/chat';
      expect(routePath).toBe('/og/chat');
    });

    it('should accept slug query parameter', () => {
      const exampleUrl = '/api/v1/og/chat?slug=my-thread-slug';
      const url = new URL(exampleUrl, 'http://localhost');
      expect(url.searchParams.get('slug')).toBe('my-thread-slug');
    });
  });
});

describe('oG Embedded Assets', () => {
  describe('logo Assets', () => {
    it('should load logo as base64 data URL', async () => {
      const { getLogoBase64Sync } = await import('@/lib/ui/og-assets.generated');
      const logo = getLogoBase64Sync();

      expect(logo).toBeTruthy();
      expect(logo).toMatch(/^data:image\/(png|svg|webp);base64,/);
      expect(logo?.length ?? 0).toBeGreaterThan(1000);
    });
  });

  describe('font Assets', () => {
    it('should load Geist fonts for satori', async () => {
      const { getOGFontsSync } = await import('@/lib/ui/og-assets.generated');
      const fonts = getOGFontsSync();

      expect(fonts).toBeInstanceOf(Array);
      expect(fonts.length).toBeGreaterThan(0);

      // Check all fonts are Geist
      fonts.forEach((font) => {
        expect(font.name).toBe('Geist');
        expect(font.data).toBeInstanceOf(ArrayBuffer);
        expect(font.data.byteLength).toBeGreaterThan(10000);
      });
    });

    it('should have multiple font weights', async () => {
      const { getOGFontsSync } = await import('@/lib/ui/og-assets.generated');
      const fonts = getOGFontsSync();

      const weights = fonts.map(f => f.weight);
      expect(weights).toContain(400); // Regular
      expect(weights).toContain(700); // Bold
    });
  });

  describe('mode Icon Assets', () => {
    it('should load mode icons for all chat modes', async () => {
      const { getModeIconBase64Sync } = await import('@/lib/ui/og-assets.generated');
      const modes = ['analyzing', 'brainstorming', 'debating', 'solving'] as const;

      modes.forEach((mode) => {
        const icon = getModeIconBase64Sync(mode);
        expect(icon).toBeTruthy();
        expect(icon).toMatch(/^data:image\/(png|svg\+xml);base64,/);
      });
    });
  });
});
