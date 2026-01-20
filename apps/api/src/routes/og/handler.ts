/**
 * OG Image Handler
 *
 * Generates dynamic Open Graph images for public threads.
 * Uses workers-og (Cloudflare Workers compatible satori wrapper).
 *
 * @see /docs/backend-patterns.md - Handler conventions
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { ChatMode } from '@roundtable/shared/enums';
import { OgImageTypes, ThreadStatusSchema } from '@roundtable/shared/enums';
import { eq, or } from 'drizzle-orm';
import { ImageResponse } from 'workers-og';

import { BRAND } from '@/constants';
import { createHandler } from '@/core';
import * as tables from '@/db';
import { getDbAsync } from '@/db';
import { PublicThreadCacheTags } from '@/db/cache/cache-tags';
import {
  getLogoBase64Sync,
  getModeIconBase64Sync,
  getOGFontsSync,
} from '@/lib/ui/og-assets.generated';
import { getModeColor, OG_COLORS, OG_HEIGHT, OG_WIDTH } from '@/lib/ui/og-colors';
import {
  createCachedImageResponse,
  generateOgCacheKey,
  generateOgVersionHash,
  getOgImageFromCache,
  storeOgImageInCache,
} from '@/services/og-cache/og-cache.service';
import type { ApiEnv } from '@/types';

import type { ogChatRoute } from './route';
import { OgChatQuerySchema } from './schema';

const OG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate OG image HTML for workers-og
 */
function generateOgImageHtml(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}): string {
  const { title, mode, participantCount, messageCount } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;
  const logoBase64 = getLogoBase64Sync();
  const modeIconBase64 = mode ? getModeIconBase64Sync(mode) : null;

  const escapedTitle = escapeHtml(title);

  // Build mode section HTML if mode is provided (must be on single line to avoid whitespace issues)
  const modeSectionHtml = mode
    ? `<div style="display: flex; align-items: center; margin-bottom: 24px; gap: 12px;">${modeIconBase64 ? `<img src="${modeIconBase64}" width="28" height="28" />` : ''}<div style="font-size: 20px; font-weight: 600; color: ${modeColor}; text-transform: capitalize;">${escapeHtml(mode)}</div></div>`
    : '';

  return `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: linear-gradient(135deg, ${OG_COLORS.backgroundGradientStart} 0%, ${OG_COLORS.backgroundGradientEnd} 100%); padding: 60px; font-family: Geist, Inter, sans-serif;"><div style="display: flex; align-items: center; margin-bottom: 40px; gap: 16px;">${logoBase64 ? `<img src="${logoBase64}" width="56" height="56" style="border-radius: 50%;" />` : ''}<div style="font-size: 28px; font-weight: 600; color: ${OG_COLORS.textPrimary}; letter-spacing: -0.01em;">${escapeHtml(BRAND.displayName)}</div></div><div style="display: flex; flex-direction: column; flex: 1; justify-content: center;">${modeSectionHtml}<div style="font-size: 56px; font-weight: 700; color: ${OG_COLORS.textPrimary}; line-height: 1.2; margin-bottom: 32px; letter-spacing: -0.03em;">${escapedTitle}</div><div style="display: flex; gap: 48px; margin-top: 24px;"><div style="display: flex; flex-direction: column;"><div style="font-size: 48px; font-weight: 700; color: ${modeColor}; line-height: 1;">${participantCount}</div><div style="font-size: 18px; font-weight: 500; color: ${OG_COLORS.textSecondary}; margin-top: 8px;">${participantCount === 1 ? 'AI Model' : 'AI Models'}</div></div><div style="display: flex; flex-direction: column;"><div style="font-size: 48px; font-weight: 700; color: ${OG_COLORS.textPrimary}; line-height: 1;">${messageCount}</div><div style="font-size: 18px; font-weight: 500; color: ${OG_COLORS.textSecondary}; margin-top: 8px;">${messageCount === 1 ? 'Message' : 'Messages'}</div></div></div></div><div style="display: flex; align-items: center; margin-top: 40px; padding-top: 32px; border-top: 2px solid ${OG_COLORS.glassBorder};"><div style="font-size: 20px; font-weight: 500; color: ${OG_COLORS.textSecondary};">${escapeHtml(BRAND.tagline)}</div></div></div>`;
}

/**
 * Generate OG image using workers-og
 */
async function generateOgImage(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}): Promise<ArrayBuffer> {
  console.log('[OG] generateOgImage called with:', JSON.stringify(params));
  const html = generateOgImageHtml(params);
  console.log('[OG] Generated HTML length:', html.length);

  const fonts = getOGFontsSync();
  console.log('[OG] Loaded fonts:', fonts.length);

  try {
    const response = new ImageResponse(html, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: fonts.map(font => ({
        name: font.name,
        data: font.data,
        weight: font.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
        style: font.style as 'normal' | 'italic',
      })),
    });

    console.log('[OG] ImageResponse created');
    const buffer = await response.arrayBuffer();
    console.log('[OG] Image buffer size:', buffer.byteLength);
    return buffer;
  } catch (err) {
    console.error('[OG] ImageResponse error:', err);
    throw err;
  }
}

/**
 * Generate fallback OG image for threads not found or not public
 */
async function generateFallbackOgImage(): Promise<ArrayBuffer> {
  return generateOgImage({
    title: 'AI Conversation',
    mode: undefined,
    participantCount: 3,
    messageCount: 10,
  });
}

/**
 * Create error fallback response (simple placeholder)
 */
function createErrorFallbackResponse(): Response {
  // Return 1x1 transparent PNG as absolute fallback
  const transparentPng = new Uint8Array([
    0x89,
    0x50,
    0x4E,
    0x47,
    0x0D,
    0x0A,
    0x1A,
    0x0A,
    0x00,
    0x00,
    0x00,
    0x0D,
    0x49,
    0x48,
    0x44,
    0x52,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
    0x08,
    0x06,
    0x00,
    0x00,
    0x00,
    0x1F,
    0x15,
    0xC4,
    0x89,
    0x00,
    0x00,
    0x00,
    0x0A,
    0x49,
    0x44,
    0x41,
    0x54,
    0x78,
    0x9C,
    0x63,
    0x00,
    0x01,
    0x00,
    0x00,
    0x05,
    0x00,
    0x01,
    0x0D,
    0x0A,
    0x2D,
    0xB4,
    0x00,
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4E,
    0x44,
    0xAE,
    0x42,
    0x60,
    0x82,
  ]);
  return new Response(transparentPng.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
      'X-OG-Cache': 'ERROR',
    },
  });
}

/**
 * GET /og/chat - Generate OG image for public thread
 */
export const ogChatHandler: RouteHandler<typeof ogChatRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    validateQuery: OgChatQuerySchema,
    operationName: 'ogChat',
  },
  async (c) => {
    try {
      const { slug, v: versionParam } = c.validated.query;
      const db = await getDbAsync();
      const r2Bucket = c.env.UPLOADS_R2_BUCKET;

      // Fetch thread by slug (same pattern as getPublicThreadHandler)
      const threads = await db
        .select()
        .from(tables.chatThread)
        .where(or(
          eq(tables.chatThread.slug, slug),
          eq(tables.chatThread.previousSlug, slug),
        ))
        .limit(1)
        .$withCache({
          config: { ex: 3600 },
          tag: PublicThreadCacheTags.single(slug),
        });

      const thread = threads[0];

      // Return fallback if thread not found or not public
      if (!thread || !thread.isPublic
        || thread.status === ThreadStatusSchema.enum.deleted
        || thread.status === ThreadStatusSchema.enum.archived) {
        try {
          const fallbackPng = await generateFallbackOgImage();
          return new Response(fallbackPng, {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': `public, max-age=${OG_CACHE_TTL_SECONDS}, immutable`,
              'X-OG-Cache': 'MISS',
              'X-OG-Fallback': 'true',
            },
          });
        } catch (fallbackError) {
          console.error('[OG] Fallback generation error:', fallbackError);
          return createErrorFallbackResponse();
        }
      }

      // Get participant count and message count (no query cache - R2 caches the final image)
      const [participants, messages] = await Promise.all([
        db.select()
          .from(tables.chatParticipant)
          .where(eq(tables.chatParticipant.threadId, thread.id)),
        db.select()
          .from(tables.chatMessage)
          .where(eq(tables.chatMessage.threadId, thread.id)),
      ]);

      const participantCount = participants.length;
      const messageCount = messages.length;

      // Generate version hash for cache key
      const versionHash = versionParam ?? generateOgVersionHash({
        title: thread.title ?? undefined,
        mode: thread.mode,
        participantCount,
        messageCount,
        updatedAt: thread.updatedAt,
      });

      const cacheKey = generateOgCacheKey(
        OgImageTypes.PUBLIC_THREAD,
        slug,
        versionHash,
      );

      // Check R2 cache
      const cached = await getOgImageFromCache(r2Bucket, cacheKey);
      if (cached.found && cached.data) {
        return createCachedImageResponse(cached.data);
      }

      // Generate OG image
      const pngData = await generateOgImage({
        title: thread.title ?? 'AI Conversation',
        mode: thread.mode as ChatMode | undefined,
        participantCount,
        messageCount,
      });

      // Store in R2 cache (fire and forget)
      storeOgImageInCache(r2Bucket, cacheKey, pngData).catch(() => {
        // Ignore cache store errors
      });

      return new Response(pngData, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': `public, max-age=${OG_CACHE_TTL_SECONDS}, immutable`,
          'X-OG-Cache': 'MISS',
        },
      });
    } catch (error) {
      console.error('[OG] Handler error:', error);
      // Try to return fallback OG image on any error
      try {
        const fallbackPng = await generateFallbackOgImage();
        return new Response(fallbackPng, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache',
            'X-OG-Cache': 'ERROR',
            'X-OG-Fallback': 'true',
          },
        });
      } catch {
        return createErrorFallbackResponse();
      }
    }
  },
);
