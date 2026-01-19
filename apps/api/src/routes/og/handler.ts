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
  getModelIconBase64Sync,
  getOGFontsSync,
} from '@/lib/ui/og-assets.generated';
import { OG_COLORS as SHARED_OG_COLORS } from '@/lib/ui/og-image-helpers';
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

// Use centralized OG colors from og-image-helpers
const OG_COLORS = SHARED_OG_COLORS;

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

// Maximum number of model icons to display
const MAX_MODEL_ICONS = 5;

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
  participantModelIds?: string[];
}) {
  const { title, mode, participantCount, messageCount, participantModelIds = [] } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;

  // Get model icons for participants (limit to MAX_MODEL_ICONS)
  const modelIcons = participantModelIds
    .slice(0, MAX_MODEL_ICONS)
    .map(modelId => getModelIconBase64Sync(modelId))
    .filter(Boolean);

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

                // Model icons row (only if we have icons)
                modelIcons.length > 0 && {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginTop: '32px',
                      gap: '8px',
                    },
                    children: [
                      // Stacked model icons (overlapping style)
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                          },
                          children: modelIcons.map((iconBase64, index) => ({
                            type: 'img',
                            props: {
                              src: iconBase64,
                              width: 40,
                              height: 40,
                              style: {
                                borderRadius: '50%',
                                border: `2px solid ${OG_COLORS.background}`,
                                marginLeft: index === 0 ? '0' : '-12px',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                              },
                            },
                          })),
                        },
                      },
                      // "+N more" indicator if there are more participants
                      participantCount > MAX_MODEL_ICONS && {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '16px',
                            fontWeight: 500,
                            color: OG_COLORS.textSecondary,
                            marginLeft: '8px',
                          },
                          children: `+${participantCount - MAX_MODEL_ICONS} more`,
                        },
                      },
                    ].filter(Boolean),
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
 * Generate simple SVG for local development (no satori/WASM required)
 * Mimics the production OG image layout using raw SVG
 */
function generateSimpleOgSvg(params: {
  title: string;
  mode?: ChatMode;
  modeColor: string;
  participantCount: number;
  messageCount: number;
  participantModelIds: string[];
}): string {
  const { title, mode, modeColor, participantCount, messageCount, participantModelIds } = params;

  // Truncate title if too long
  const displayTitle = title.length > 80 ? `${title.slice(0, 77)}...` : title;

  // Get model icons for display (up to 5)
  const modelIcons = participantModelIds
    .slice(0, MAX_MODEL_ICONS)
    .map(modelId => getModelIconBase64Sync(modelId))
    .filter(Boolean);

  // Build model icons SVG elements
  const modelIconsElements = modelIcons.map((iconBase64, index) => `
    <image
      href="${iconBase64}"
      x="${60 + index * 32}"
      y="480"
      width="40"
      height="40"
      clip-path="circle(20px at 20px 20px)"
      style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"
    />
  `).join('');

  // Extra participants indicator
  const extraParticipants = participantCount > MAX_MODEL_ICONS
    ? `<text x="${60 + modelIcons.length * 32 + 16}" y="508" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="16">+${participantCount - MAX_MODEL_ICONS} more</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${OG_COLORS.backgroundGradientStart}"/>
      <stop offset="100%" style="stop-color:${OG_COLORS.backgroundGradientEnd}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>

  <!-- Header with brand -->
  <text x="60" y="90" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600">${BRAND.name}</text>

  <!-- Mode badge -->
  ${mode
    ? `
  <text x="60" y="200" fill="${modeColor}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" text-transform="capitalize">${mode.charAt(0).toUpperCase() + mode.slice(1)}</text>
  `
    : ''}

  <!-- Title -->
  <text x="60" y="${mode ? '280' : '240'}" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700">
    <tspan>${displayTitle}</tspan>
  </text>

  <!-- Stats -->
  <text x="60" y="380" fill="${modeColor}" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700">${participantCount}</text>
  <text x="60" y="410" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="500">${participantCount === 1 ? 'AI Model' : 'AI Models'}</text>

  <text x="200" y="380" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700">${messageCount}</text>
  <text x="200" y="410" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="500">${messageCount === 1 ? 'Message' : 'Messages'}</text>

  <!-- Model Icons (if available) -->
  ${modelIconsElements}
  ${extraParticipants}

  <!-- Footer line -->
  <line x1="60" y1="550" x2="1140" y2="550" stroke="${OG_COLORS.glassBorder}" stroke-width="2"/>

  <!-- Tagline -->
  <text x="60" y="590" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500">${BRAND.tagline}</text>

  <!-- Local dev indicator -->
  <rect x="1000" y="20" width="180" height="30" rx="4" fill="${OG_COLORS.analyzing}" opacity="0.8"/>
  <text x="1090" y="42" fill="white" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" text-anchor="middle">LOCAL DEV</text>
</svg>`;
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

    // Fetch participants with their model IDs
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
      participantModelIds: participants.map(p => p.modelId),
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
    // Check for local dev FIRST - satori uses WASM which doesn't work in local dev
    const isLocalDev = c.env.WEBAPP_ENV === 'local';

    try {
      const query = c.req.query();
      const slug = query.slug;

      let title = 'AI Conversation';
      let mode: ChatMode | undefined;
      let participantCount = 3;
      let messageCount = 10;
      let participantModelIds: string[] = [];

      // Fetch thread data if slug provided
      if (slug) {
        const threadData = await getPublicThread(slug);
        if (threadData) {
          title = threadData.thread.title || title;
          mode = threadData.thread.mode as ChatMode;
          participantCount = threadData.participantCount || participantCount;
          messageCount = threadData.messageCount || messageCount;
          participantModelIds = threadData.participantModelIds || [];
        }
      }

      // Local dev: Generate simple SVG without satori (WASM not available)
      if (isLocalDev) {
        const modeColor = mode ? MODE_COLORS[mode] : OG_COLORS.primary;
        const simpleSvg = generateSimpleOgSvg({
          title,
          mode,
          modeColor,
          participantCount,
          messageCount,
          participantModelIds,
        });
        return new Response(simpleSvg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache',
            'X-OG-Generated': 'true',
            'X-OG-Format': 'svg-local-dev',
          },
        });
      }

      // Production: Generate OG image with satori
      const svg = await generateOgImage({
        title,
        mode,
        participantCount,
        messageCount,
        participantModelIds,
      });

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
