/**
 * OG Image Handler
 *
 * Generates dynamic Open Graph images for public threads.
 * Uses satori for SVG generation and @cf-wasm/resvg for PNG conversion.
 *
 * @see /docs/backend-patterns.md - Handler conventions
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { ChatMode } from '@roundtable/shared/enums';
import { OgImageTypes, ThreadStatusSchema } from '@roundtable/shared/enums';
import { eq, or } from 'drizzle-orm';
import satori from 'satori';

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
 * Convert SVG to PNG using @cf-wasm/resvg
 */
async function svgToPng(svg: string): Promise<Uint8Array> {
  try {
    const { Resvg } = await import('@cf-wasm/resvg');
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: OG_WIDTH },
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch (error) {
    console.error('[OG] svgToPng error:', error);
    throw error;
  }
}

/**
 * Generate OG image SVG using satori
 */
async function generateOgImageSvg(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}): Promise<string> {
  const { title, mode, participantCount, messageCount } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;

  const fonts = getOGFontsSync();
  const logoBase64 = getLogoBase64Sync();
  const modeIconBase64 = mode ? getModeIconBase64Sync(mode) : null;

  const svg = await satori(
    // @ts-expect-error - satori accepts plain objects as virtual DOM
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: OG_COLORS.background,
          backgroundImage: `linear-gradient(135deg, ${OG_COLORS.backgroundGradientStart} 0%, ${OG_COLORS.backgroundGradientEnd} 100%)`,
          padding: '60px',
          fontFamily: 'Geist, Inter, sans-serif',
          position: 'relative',
        },
        children: [
          // Header with logo
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                marginBottom: '40px',
                gap: '16px',
              },
              children: [
                logoBase64 && {
                  type: 'img',
                  props: {
                    src: logoBase64,
                    width: 56,
                    height: 56,
                    style: {
                      borderRadius: '50%',
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '28px',
                      fontWeight: 600,
                      color: OG_COLORS.textPrimary,
                      letterSpacing: '-0.01em',
                    },
                    children: BRAND.displayName,
                  },
                },
              ].filter(Boolean),
            },
          },

          // Main content
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                justifyContent: 'center',
              },
              children: [
                // Mode badge with icon
                mode && {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '24px',
                      gap: '12px',
                    },
                    children: [
                      modeIconBase64 && {
                        type: 'img',
                        props: {
                          src: modeIconBase64,
                          width: 28,
                          height: 28,
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '20px',
                            fontWeight: 600,
                            color: modeColor,
                            textTransform: 'capitalize',
                          },
                          children: mode,
                        },
                      },
                    ].filter(Boolean),
                  },
                },

                // Thread title
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '56px',
                      fontWeight: 700,
                      color: OG_COLORS.textPrimary,
                      lineHeight: 1.2,
                      marginBottom: '32px',
                      letterSpacing: '-0.03em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                    },
                    children: title,
                  },
                },

                // Stats row
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '48px',
                      marginTop: '24px',
                    },
                    children: [
                      // Participants
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            flexDirection: 'column',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '48px',
                                  fontWeight: 700,
                                  color: modeColor,
                                  lineHeight: 1,
                                },
                                children: String(participantCount),
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '18px',
                                  fontWeight: 500,
                                  color: OG_COLORS.textSecondary,
                                  marginTop: '8px',
                                },
                                children: participantCount === 1 ? 'AI Model' : 'AI Models',
                              },
                            },
                          ],
                        },
                      },

                      // Messages
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            flexDirection: 'column',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '48px',
                                  fontWeight: 700,
                                  color: OG_COLORS.textPrimary,
                                  lineHeight: 1,
                                },
                                children: String(messageCount),
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '18px',
                                  fontWeight: 500,
                                  color: OG_COLORS.textSecondary,
                                  marginTop: '8px',
                                },
                                children: messageCount === 1 ? 'Message' : 'Messages',
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          },

          // Footer
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                marginTop: '40px',
                paddingTop: '32px',
                borderTop: `2px solid ${OG_COLORS.glassBorder}`,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '20px',
                      fontWeight: 500,
                      color: OG_COLORS.textSecondary,
                    },
                    children: BRAND.tagline,
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts,
    },
  );

  return svg;
}

/**
 * Generate fallback OG image for threads not found or not public
 */
async function generateFallbackOgImage(): Promise<Uint8Array> {
  const svg = await generateOgImageSvg({
    title: 'AI Conversation',
    mode: undefined,
    participantCount: 3,
    messageCount: 10,
  });
  return svgToPng(svg);
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
          return new Response(fallbackPng.buffer as ArrayBuffer, {
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
      const svg = await generateOgImageSvg({
        title: thread.title ?? 'AI Conversation',
        mode: thread.mode as ChatMode | undefined,
        participantCount,
        messageCount,
      });

      const pngData = await svgToPng(svg);

      // Store in R2 cache (fire and forget)
      storeOgImageInCache(r2Bucket, cacheKey, pngData.buffer as ArrayBuffer).catch(() => {
        // Ignore cache store errors
      });

      return new Response(pngData.buffer as ArrayBuffer, {
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
        return new Response(fallbackPng.buffer as ArrayBuffer, {
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
