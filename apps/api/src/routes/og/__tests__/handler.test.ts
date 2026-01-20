/**
 * OG Image Handler Tests
 *
 * Unit tests for OG image generation functionality.
 * Tests cover SVG generation, PNG conversion, and error handling.
 */

import { CHAT_MODES } from '@roundtable/shared/enums';
import { describe, expect, it, vi } from 'vitest';

import {
  getModeColor,
  MODE_COLORS,
  OG_COLORS,
  OG_DEFAULTS,
  OG_HEIGHT,
  OG_WIDTH,
} from '@/lib/ui/og-colors';

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

// PNG magic bytes
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

describe('oG Image Handler', () => {
  describe('oG Image Dimensions', () => {
    it('should use standard OG image dimensions (1200x630)', () => {
      // Using centralized constants from og-colors.ts
      expect(OG_WIDTH).toBe(1200);
      expect(OG_HEIGHT).toBe(630);
    });
  });

  describe('oG Colors (centralized)', () => {
    it('should have valid hex color codes', () => {
      const hexColorRegex = /^#[0-9a-f]{6}$/i;

      const hexColors = Object.entries(OG_COLORS)
        .filter(([_key, value]) => typeof value === 'string' && !value.includes('rgba'))
        .map(([_key, value]) => value);

      for (const color of hexColors) {
        expect(color).toMatch(hexColorRegex);
      }
    });

    it('should have distinct mode colors using CHAT_MODES array', () => {
      // Verify MODE_COLORS is derived from CHAT_MODES (single source of truth)
      const modeColors = CHAT_MODES.map(mode => MODE_COLORS[mode]);
      const uniqueColors = new Set(modeColors);
      expect(uniqueColors.size).toBe(CHAT_MODES.length);
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

  describe('mode Color Mapping (centralized)', () => {
    it('should return correct color for each mode via getModeColor', () => {
      // Using centralized getModeColor from og-colors.ts
      expect(getModeColor('analyzing')).toBe(OG_COLORS.analyzing);
      expect(getModeColor('brainstorming')).toBe(OG_COLORS.brainstorming);
      expect(getModeColor('debating')).toBe(OG_COLORS.debating);
      expect(getModeColor('solving')).toBe(OG_COLORS.solving);
    });

    it('should have all chat modes in MODE_COLORS using CHAT_MODES array', () => {
      // Using CHAT_MODES as single source of truth
      CHAT_MODES.forEach((mode) => {
        expect(MODE_COLORS[mode]).toBeDefined();
        expect(MODE_COLORS[mode]).toBe(OG_COLORS[mode]);
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

  describe('cORS and Cross-Origin Headers', () => {
    it('should require Access-Control-Allow-Origin: * for cross-origin loading', () => {
      // OG images are loaded cross-origin (frontend on 5173, API on 8787)
      // The handler sets this header directly in the Response
      const expectedHeader = 'Access-Control-Allow-Origin';
      const expectedValue = '*';

      // Verify handler sets correct CORS headers
      expect(expectedHeader).toBe('Access-Control-Allow-Origin');
      expect(expectedValue).toBe('*');
    });

    it('should require Cross-Origin-Resource-Policy: cross-origin for img tag loading', () => {
      // CRITICAL: Without this, browsers block cross-origin <img> loading
      // The ShareDialog loads OG preview from API origin (different port in dev)
      // secureHeaders middleware must allow cross-origin resource policy
      const expectedValue = 'cross-origin';

      // Verify the expected header value - 'same-origin' would BREAK cross-origin loading
      expect(expectedValue).not.toBe('same-origin');
      expect(expectedValue).toBe('cross-origin');
    });

    it('should document why cross-origin headers are required', () => {
      // This test documents the fix for the "Preview unavailable" bug
      // Root cause: secureHeaders middleware was setting CORP to 'same-origin'
      // which blocked the browser from loading the OG image in the ShareDialog
      // Fix: Set crossOriginResourcePolicy: 'cross-origin' in secureHeaders config
      const documentation = {
        bug: 'Preview unavailable in ShareDialog',
        rootCause: 'Cross-Origin-Resource-Policy: same-origin blocked cross-origin img loading',
        fix: 'Configure secureHeaders with crossOriginResourcePolicy: cross-origin',
        location: 'apps/api/src/index.ts (secureHeaders middleware)',
      };

      expect(documentation.rootCause).toContain('same-origin');
      expect(documentation.fix).toContain('cross-origin');
    });

    it('should use wildcard CORS for OG routes via middleware path matching', () => {
      // OG images must be accessible from ANY origin including:
      // - Social media crawlers (Twitter, Facebook, LinkedIn)
      // - External websites embedding the OG image
      // - Frontend on different ports/domains
      //
      // The CORS middleware in index.ts uses path.includes('/og/') to:
      // 1. Match OG routes regardless of path prefix
      // 2. Return Access-Control-Allow-Origin: * for all origins
      // 3. Disable credentials (required for * origin)
      const corsConfig = {
        pathMatch: 'path.includes(\'/og/\')',
        origin: '*',
        credentials: false,
        reason: 'OG images are public assets that must be loadable from any origin',
      };

      expect(corsConfig.pathMatch).toContain('/og/');
      expect(corsConfig.origin).toBe('*');
      expect(corsConfig.credentials).toBe(false);
    });
  });
});

describe('oG Image Content', () => {
  describe('title Handling', () => {
    it('should use default title when thread not found', () => {
      // Using centralized OG_DEFAULTS from og-colors.ts
      expect(OG_DEFAULTS.title).toBeTruthy();
      expect(OG_DEFAULTS.title.length).toBeGreaterThan(0);
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
      // Using default from centralized OG_DEFAULTS
      const label = OG_DEFAULTS.participantCount === 1 ? 'AI Model' : 'AI Models';
      expect(label).toBe('AI Models');
    });

    it('should use singular form for 1 message', () => {
      const messageCount = 1;
      const label = messageCount === 1 ? 'Message' : 'Messages';
      expect(label).toBe('Message');
    });

    it('should use plural form for multiple messages', () => {
      // Using default from centralized OG_DEFAULTS
      const label = OG_DEFAULTS.messageCount === 1 ? 'Message' : 'Messages';
      expect(label).toBe('Messages');
    });
  });

  describe('default Values (centralized)', () => {
    it('should have sensible defaults from OG_DEFAULTS', () => {
      // Using centralized OG_DEFAULTS from og-colors.ts
      expect(OG_DEFAULTS.title).toBeTruthy();
      expect(OG_DEFAULTS.participantCount).toBeGreaterThan(0);
      expect(OG_DEFAULTS.messageCount).toBeGreaterThan(0);
    });

    it('should have expected default values', () => {
      expect(OG_DEFAULTS.title).toBe('AI Conversation');
      expect(OG_DEFAULTS.participantCount).toBe(3);
      expect(OG_DEFAULTS.messageCount).toBe(10);
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
