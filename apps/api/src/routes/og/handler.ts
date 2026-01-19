/**
 * OG Image Handler
 *
 * Generates dynamic Open Graph images for chat threads using satori + @cf-wasm/resvg.
 * Uses WASM-based image processing for Cloudflare Workers compatibility.
 * Returns PNG images with proper cache headers for CDN optimization.
 *
 * Assets (logo, fonts, mode icons) are embedded at build time via og-assets.generated.ts
 * to avoid network requests and ensure reliability.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { ChatMode } from '@roundtable/shared';
import { and, eq } from 'drizzle-orm';

import { createHandler } from '@/core';
import { chatMessage, chatParticipant, chatThread, getDbAsync } from '@/db';
import {
  getLogoBase64Sync,
  getModeIconBase64Sync,
  getOGFontsSync,
} from '@/lib/ui/og-assets.generated';
import type { ApiEnv } from '@/types';

import type { ogImageRoute } from './route';

// OG image dimensions (standard)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Brand constants (subset needed for OG images)
const BRAND = {
  name: 'Roundtable.now',
  tagline: 'Multiple AI Models, One Conversation',
} as const;

// OG image colors (matching roundtable.now)
const OG_COLORS = {
  background: '#0a0a0a',
  backgroundGradientStart: '#0a0a0a',
  backgroundGradientEnd: '#141414',
  primary: '#2563eb',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  analyzing: '#8b5cf6',
  brainstorming: '#f59e0b',
  debating: '#ef4444',
  solving: '#10b981',
} as const;

// Mode colors
const MODE_COLORS = {
  analyzing: OG_COLORS.analyzing,
  brainstorming: OG_COLORS.brainstorming,
  debating: OG_COLORS.debating,
  solving: OG_COLORS.solving,
} as const satisfies Record<ChatMode, string>;

function getModeColor(mode: ChatMode): string {
  return MODE_COLORS[mode] ?? OG_COLORS.primary;
}

/**
 * Get embedded fonts for satori (no network fetch required)
 */
function getEmbeddedFonts() {
  return getOGFontsSync();
}

/**
 * Generate OG image SVG using satori with embedded assets
 */
async function generateOgImage(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}) {
  const { title, mode, participantCount, messageCount } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;

  // Lazy load satori to reduce worker startup CPU time
  const satori = (await import('satori')).default;

  // Get embedded fonts and assets (no network required)
  const fonts = getEmbeddedFonts();
  const logoBase64 = getLogoBase64Sync();
  const modeIconBase64 = mode ? getModeIconBase64Sync(mode) : null;

  // Generate SVG using satori
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
                // Logo image (circular to match roundtable.now)
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
                // Brand name
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '28px',
                      fontWeight: 600,
                      color: OG_COLORS.textPrimary,
                      letterSpacing: '-0.01em',
                    },
                    children: BRAND.name,
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
                      // Mode icon
                      modeIconBase64 && {
                        type: 'img',
                        props: {
                          src: modeIconBase64,
                          width: 28,
                          height: 28,
                        },
                      },
                      // Mode text
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
 * Convert SVG to PNG using @cf-wasm/resvg (Workers-compatible WASM)
 * Sharp is not compatible with Cloudflare Workers due to native Node.js dependencies
 *
 * IMPORTANT: Must use /workerd subpath for Cloudflare Workers compatibility
 * @see https://github.com/fineshopdesign/cf-wasm/tree/main/packages/resvg#usage
 *
 * Returns null if WASM is not available (local dev) - caller should fall back to SVG
 */
async function svgToPng(svg: string): Promise<Uint8Array | null> {
  try {
    // Lazy load resvg - MUST use /workerd subpath for Workers
    const { Resvg } = await import('@cf-wasm/resvg/workerd');
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: OG_WIDTH,
      },
    });
    const pngData = resvg.render();
    return pngData.asPng();
  } catch {
    // WASM fails in local development - return null to trigger SVG fallback
    return null;
  }
}

/**
 * Fetch public thread data from database
 */
async function getPublicThread(slug: string) {
  try {
    const db = await getDbAsync();

    // Fetch thread
    const threadResult = await db
      .select()
      .from(chatThread)
      .where(
        and(
          eq(chatThread.slug, slug),
          eq(chatThread.isPublic, true),
        ),
      )
      .limit(1);

    const thread = threadResult[0];
    if (!thread) {
      return null;
    }

    // Fetch participants count
    const participants = await db
      .select()
      .from(chatParticipant)
      .where(eq(chatParticipant.threadId, thread.id));

    // Fetch messages count
    const messages = await db
      .select()
      .from(chatMessage)
      .where(eq(chatMessage.threadId, thread.id));

    return {
      thread,
      participantCount: participants.length,
      messageCount: messages.length,
    };
  } catch {
    return null;
  }
}

/**
 * OG Image Handler
 */
export const ogImageHandler: RouteHandler<typeof ogImageRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'ogImage',
  },
  async (c) => {
    try {
      const query = c.req.query();
      const slug = query.slug;

      let title = 'AI Conversation';
      let mode: ChatMode | undefined;
      let participantCount = 3;
      let messageCount = 10;

      // Fetch thread data if slug provided
      if (slug) {
        const threadData = await getPublicThread(slug);
        if (threadData) {
          title = threadData.thread.title || title;
          mode = threadData.thread.mode as ChatMode;
          participantCount = threadData.participantCount || participantCount;
          messageCount = threadData.messageCount || messageCount;
        }
      }

      // Generate OG image SVG
      const svg = await generateOgImage({
        title,
        mode,
        participantCount,
        messageCount,
      });

      // Skip WASM in local dev where it's not supported
      const isLocalDev = c.env.WEBAPP_ENV === 'local';
      if (isLocalDev) {
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache',
            'X-OG-Generated': 'true',
            'X-OG-Format': 'svg-local-dev',
          },
        });
      }

      // Production: convert to PNG
      const png = await svgToPng(svg);

      // If PNG conversion failed, serve SVG as fallback
      if (png === null) {
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache',
            'X-OG-Generated': 'true',
            'X-OG-Format': 'svg-fallback',
          },
        });
      }

      // Return PNG with CDN cache headers
      return new Response(new Uint8Array(png).buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
          'X-OG-Generated': 'true',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[OG-IMAGE] Generation failed:', errorMessage);

      // Return minimal 1x1 fully transparent PNG on error
      const transparentPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
      const binaryString = atob(transparentPngBase64);
      const transparentPng = Uint8Array.from(binaryString, char => char.charCodeAt(0));

      return new Response(transparentPng.buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache',
          'X-OG-Error': 'true',
          'X-OG-Error-Message': encodeURIComponent(errorMessage.slice(0, 100)),
        },
      });
    }
  },
);
