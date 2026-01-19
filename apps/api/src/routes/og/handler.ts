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
import { eq, or } from 'drizzle-orm';

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
          // Rainbow gradient accent - top right
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: 0,
                right: 0,
                width: '400px',
                height: '300px',
                background: 'radial-gradient(circle at 100% 0%, rgba(236, 72, 153, 0.3) 0%, rgba(139, 92, 246, 0.15) 50%, transparent 70%)',
              },
            },
          },
          // Rainbow gradient accent - bottom left
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '400px',
                height: '230px',
                background: 'radial-gradient(circle at 0% 100%, rgba(6, 182, 212, 0.25) 0%, rgba(34, 197, 94, 0.1) 50%, transparent 70%)',
              },
            },
          },
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
                // Logo image (circular with glass container)
                logoBase64 && {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      backgroundColor: OG_COLORS.glassBackground,
                      border: `1px solid ${OG_COLORS.glassBorder}`,
                    },
                    children: [
                      {
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
                    ],
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

                // Model icons row - each in separate glass container (NOT overlapping)
                modelIcons.length > 0 && {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginTop: '32px',
                      gap: '12px',
                    },
                    children: [
                      // Model icons in separate glass containers
                      ...modelIcons.map(iconBase64 => ({
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '56px',
                            height: '56px',
                            borderRadius: '12px',
                            backgroundColor: OG_COLORS.glassBackground,
                            border: `1px solid ${OG_COLORS.glassBorder}`,
                          },
                          children: [
                            {
                              type: 'img',
                              props: {
                                src: iconBase64,
                                width: 36,
                                height: 36,
                              },
                            },
                          ],
                        },
                      })),
                      // "+N more" indicator if there are more participants
                      participantCount > MAX_MODEL_ICONS && {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '56px',
                            height: '56px',
                            borderRadius: '12px',
                            backgroundColor: OG_COLORS.glassBackground,
                            border: `1px solid ${OG_COLORS.glassBorder}`,
                            fontSize: '16px',
                            fontWeight: 600,
                            color: OG_COLORS.textSecondary,
                          },
                          children: `+${participantCount - MAX_MODEL_ICONS}`,
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
 *
 * Design matches static og-image.png:
 * - Rainbow logo next to brand name
 * - Mode icon next to mode text
 * - Each model icon in separate rounded square glass container (NOT overlapping)
 * - Rainbow gradient accents in corners
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

  // Get logo and mode icon
  const logoBase64 = getLogoBase64Sync();
  const modeIconBase64 = mode ? getModeIconBase64Sync(mode) : null;

  // Get model icons for display (up to 6 to match static design)
  const maxIcons = 6;
  const modelIcons = participantModelIds
    .slice(0, maxIcons)
    .map(modelId => getModelIconBase64Sync(modelId))
    .filter(Boolean);

  // Model icon container dimensions (separate glass containers, not overlapping)
  const containerSize = 56; // Square container size
  const iconSize = 36; // Icon inside container
  const iconPadding = (containerSize - iconSize) / 2;
  const containerSpacing = 12; // Gap between containers
  const iconsY = 430;
  const iconsStartX = 60;

  // Build model icons - each in its own glass container
  const modelIconsElements = modelIcons.map((iconBase64, index) => {
    const containerX = iconsStartX + index * (containerSize + containerSpacing);
    const iconX = containerX + iconPadding;
    const iconY = iconsY + iconPadding;

    return `
    <!-- Model ${index} glass container -->
    <rect
      x="${containerX}"
      y="${iconsY}"
      width="${containerSize}"
      height="${containerSize}"
      rx="12"
      fill="${OG_COLORS.glassBackground}"
      stroke="${OG_COLORS.glassBorder}"
      stroke-width="1"
    />
    <!-- Model ${index} icon -->
    <image
      href="${iconBase64}"
      x="${iconX}"
      y="${iconY}"
      width="${iconSize}"
      height="${iconSize}"
      preserveAspectRatio="xMidYMid meet"
    />`;
  }).join('');

  // Extra participants indicator
  const extraCount = participantCount - maxIcons;
  const extraParticipantsX = iconsStartX + modelIcons.length * (containerSize + containerSpacing);
  const extraParticipants = extraCount > 0
    ? `
    <!-- Extra participants container -->
    <rect
      x="${extraParticipantsX}"
      y="${iconsY}"
      width="${containerSize}"
      height="${containerSize}"
      rx="12"
      fill="${OG_COLORS.glassBackground}"
      stroke="${OG_COLORS.glassBorder}"
      stroke-width="1"
    />
    <text
      x="${extraParticipantsX + containerSize / 2}"
      y="${iconsY + containerSize / 2 + 6}"
      fill="${OG_COLORS.textSecondary}"
      font-family="system-ui, -apple-system, sans-serif"
      font-size="16"
      font-weight="600"
      text-anchor="middle"
    >+${extraCount}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${OG_COLORS.backgroundGradientStart}"/>
      <stop offset="100%" style="stop-color:${OG_COLORS.backgroundGradientEnd}"/>
    </linearGradient>
    <!-- Rainbow gradient for logo glow -->
    <radialGradient id="rainbow-glow-tr" cx="100%" cy="0%" r="50%">
      <stop offset="0%" style="stop-color:#ec4899;stop-opacity:0.3"/>
      <stop offset="50%" style="stop-color:#8b5cf6;stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:transparent;stop-opacity:0"/>
    </radialGradient>
    <radialGradient id="rainbow-glow-bl" cx="0%" cy="100%" r="50%">
      <stop offset="0%" style="stop-color:#06b6d4;stop-opacity:0.25"/>
      <stop offset="50%" style="stop-color:#22c55e;stop-opacity:0.1"/>
      <stop offset="100%" style="stop-color:transparent;stop-opacity:0"/>
    </radialGradient>
    <clipPath id="logo-clip">
      <circle cx="100" cy="70" r="28"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>

  <!-- Rainbow gradient accents in corners -->
  <rect x="800" y="0" width="400" height="300" fill="url(#rainbow-glow-tr)"/>
  <rect x="0" y="400" width="400" height="230" fill="url(#rainbow-glow-bl)"/>

  <!-- Header with logo and brand -->
  <g>
    ${logoBase64
      ? `
    <!-- Logo circle background -->
    <circle cx="100" cy="70" r="30" fill="${OG_COLORS.glassBackground}" stroke="${OG_COLORS.glassBorder}" stroke-width="1"/>
    <!-- Logo image -->
    <image
      href="${logoBase64}"
      x="72"
      y="42"
      width="56"
      height="56"
      clip-path="url(#logo-clip)"
      preserveAspectRatio="xMidYMid slice"
    />`
      : ''}
    <!-- Brand name -->
    <text x="${logoBase64 ? '145' : '60'}" y="82" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600">${BRAND.name}</text>
  </g>

  <!-- Mode badge with icon -->
  ${mode
    ? `
  <g>
    ${modeIconBase64
      ? `<image href="${modeIconBase64}" x="60" y="165" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>`
      : ''}
    <text x="${modeIconBase64 ? '92' : '60'}" y="185" fill="${modeColor}" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600">${mode.charAt(0).toUpperCase() + mode.slice(1)}</text>
  </g>`
    : ''}

  <!-- Title -->
  <text x="60" y="${mode ? '270' : '220'}" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="700">
    <tspan>${displayTitle}</tspan>
  </text>

  <!-- Stats -->
  <g>
    <text x="60" y="370" fill="${modeColor || OG_COLORS.primary}" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="700">${participantCount}</text>
    <text x="60" y="400" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="500">${participantCount === 1 ? 'AI Model' : 'AI Models'}</text>

    <text x="180" y="370" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="700">${messageCount}</text>
    <text x="180" y="400" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="500">${messageCount === 1 ? 'Message' : 'Messages'}</text>
  </g>

  <!-- Model Icons in separate glass containers -->
  <g>
    ${modelIconsElements}
    ${extraParticipants}
  </g>

  <!-- Footer line -->
  <line x1="60" y1="540" x2="1140" y2="540" stroke="${OG_COLORS.glassBorder}" stroke-width="1"/>

  <!-- Tagline -->
  <text x="60" y="580" fill="${OG_COLORS.textSecondary}" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="500">${BRAND.tagline}</text>
</svg>`;
}

/**
 * Fetch thread data from database for OG image generation
 * For public threads: returns full data
 * For private threads in dev mode: still returns data for preview (with debug info)
 *
 * IMPORTANT: Also checks previousSlug for backwards compatibility when threads are renamed
 */
async function getThreadForOgImage(slug: string, isLocalDev: boolean) {
  try {
    const db = await getDbAsync();

    // Query thread by slug OR previousSlug (handles renamed threads)
    const threadResult = await db
      .select()
      .from(chatThread)
      .where(or(
        eq(chatThread.slug, slug),
        eq(chatThread.previousSlug, slug),
      ))
      .limit(1);

    const thread = threadResult[0];

    if (!thread) {
      return { found: false, isPublic: false, thread: null, participantCount: 0, participantModelIds: [], messageCount: 0 };
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

    // In local dev, always return data for preview (helps with testing)
    // In production, only return data if thread is public
    if (!thread.isPublic && !isLocalDev) {
      return { found: true, isPublic: false, thread: null, participantCount: 0, participantModelIds: [], messageCount: 0 };
    }

    return {
      found: true,
      isPublic: thread.isPublic,
      thread,
      participantCount: participants.length,
      participantModelIds: participants.map(p => p.modelId),
      messageCount: messages.length,
    };
  } catch (error) {
    console.error('[OG-IMAGE] getThreadForOgImage error:', error);
    return { found: false, isPublic: false, thread: null, participantCount: 0, participantModelIds: [], messageCount: 0 };
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
      let debugInfo = '';

      // Fetch thread data if slug provided
      if (slug) {
        const threadData = await getThreadForOgImage(slug, isLocalDev);

        if (isLocalDev) {
          // Add debug info to title in local dev to help diagnose issues
          debugInfo = threadData.found
            ? (threadData.isPublic ? '' : ' [NOT PUBLIC]')
            : ' [NOT FOUND]';
        }

        if (threadData.thread) {
          title = threadData.thread.title || title;
          mode = threadData.thread.mode as ChatMode;
          participantCount = threadData.participantCount || participantCount;
          messageCount = threadData.messageCount || messageCount;
          participantModelIds = threadData.participantModelIds || [];
        }
      } else if (isLocalDev) {
        debugInfo = ' [NO SLUG]';
      }

      // Append debug info in local dev
      if (isLocalDev && debugInfo) {
        title = `${title}${debugInfo}`;
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
