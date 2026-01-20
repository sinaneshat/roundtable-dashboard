/**
 * OG Image Handler
 *
 * Generates dynamic Open Graph images for public threads.
 * Uses @cf-wasm/satori + @cf-wasm/resvg for Cloudflare Workers.
 *
 * @see /docs/backend-patterns.md - Handler conventions
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { ChatMode } from '@roundtable/shared/enums';
import { OgImageTypes, ThreadStatusSchema } from '@roundtable/shared/enums';
import { Resvg } from '@cf-wasm/resvg/workerd';
import { satori } from '@cf-wasm/satori/workerd';
import { eq, or } from 'drizzle-orm';

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
 * Generate OG image using @cf-wasm/satori + @cf-wasm/resvg
 */
async function generateOgImage(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}): Promise<ArrayBuffer> {
  const { title, mode, participantCount, messageCount } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;
  const logoBase64 = getLogoBase64Sync();
  const modeIconBase64 = mode ? getModeIconBase64Sync(mode) : null;
  const fonts = getOGFontsSync();

  // Generate SVG using satori - ALL divs must have display: flex
  const svg = await satori(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: `linear-gradient(135deg, ${OG_COLORS.backgroundGradientStart} 0%, ${OG_COLORS.backgroundGradientEnd} 100%)`,
          padding: 60,
          fontFamily: 'Geist, Inter, sans-serif',
        }}
      >
        {/* Header with logo */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 40,
            gap: 16,
          }}
        >
          {logoBase64 ? (
            <img
              src={logoBase64}
              width={56}
              height={56}
              style={{ borderRadius: 28 }}
            />
          ) : (
            <div style={{ display: 'flex', width: 56, height: 56 }} />
          )}
          <span
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: OG_COLORS.textPrimary,
              letterSpacing: '-0.01em',
            }}
          >
            {BRAND.displayName}
          </span>
        </div>

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          {/* Mode badge */}
          {mode ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 24,
                gap: 12,
              }}
            >
              {modeIconBase64 ? (
                <img src={modeIconBase64} width={28} height={28} />
              ) : (
                <div style={{ display: 'flex', width: 28, height: 28 }} />
              )}
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: modeColor,
                  textTransform: 'capitalize',
                }}
              >
                {mode}
              </span>
            </div>
          ) : null}

          {/* Title */}
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.2,
              marginBottom: 32,
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </span>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 48, marginTop: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: modeColor,
                  lineHeight: 1,
                }}
              >
                {participantCount}
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  color: OG_COLORS.textSecondary,
                  marginTop: 8,
                }}
              >
                {participantCount === 1 ? 'AI Model' : 'AI Models'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: OG_COLORS.textPrimary,
                  lineHeight: 1,
                }}
              >
                {messageCount}
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  color: OG_COLORS.textSecondary,
                  marginTop: 8,
                }}
              >
                {messageCount === 1 ? 'Message' : 'Messages'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer with tagline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 40,
            paddingTop: 32,
            borderTop: `2px solid ${OG_COLORS.glassBorder}`,
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: OG_COLORS.textSecondary,
            }}
          >
            {BRAND.tagline}
          </span>
        </div>
      </div>
    ),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: fonts.map(font => ({
        name: font.name,
        data: font.data,
        weight: font.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
        style: font.style as 'normal' | 'italic',
      })),
    },
  );

  // Convert SVG to PNG using @cf-wasm/resvg
  const resvg = await Resvg.async(svg, {
    fitTo: {
      mode: 'width',
      value: OG_WIDTH,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return pngBuffer.buffer as ArrayBuffer;
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
  const transparentPng = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
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

      const cached = await getOgImageFromCache(r2Bucket, cacheKey);
      if (cached.found && cached.data) {
        return createCachedImageResponse(cached.data);
      }

      const pngData = await generateOgImage({
        title: thread.title ?? 'AI Conversation',
        mode: thread.mode as ChatMode | undefined,
        participantCount,
        messageCount,
      });

      storeOgImageInCache(r2Bucket, cacheKey, pngData).catch(() => {});

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
