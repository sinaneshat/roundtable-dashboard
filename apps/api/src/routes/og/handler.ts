/**
 * OG Image Handler
 *
 * Generates dynamic Open Graph images for chat threads using satori + sharp.
 * Returns PNG images with proper cache headers for CDN optimization.
 */

import { Buffer } from 'node:buffer';

import type { RouteHandler } from '@hono/zod-openapi';
import type { ChatMode } from '@roundtable/shared';
import { and, eq } from 'drizzle-orm';
import satori from 'satori';

import { createHandler } from '@/core';
import { chatMessage, chatParticipant, chatThread, getDbAsync } from '@/db';
import type { ApiEnv } from '@/types';

import type { ogImageRoute } from './route';

// OG image dimensions (standard)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Brand constants (subset needed for OG images)
const BRAND = {
  name: 'Roundtable',
  tagline: 'Multiple AI Models, One Conversation',
} as const;

// OG image colors
const OG_COLORS = {
  background: '#000000',
  backgroundGradientStart: '#0a0a0a',
  backgroundGradientEnd: '#1a1a1a',
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
 * Fetch Inter font for satori
 */
async function getInterFont() {
  try {
    const response = await fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff');
    if (!response.ok) {
      throw new Error('Failed to fetch font');
    }
    return response.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Generate OG image SVG using satori
 */
async function generateOgImage(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}) {
  const { title, mode, participantCount, messageCount } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;

  // Load Inter font
  const interFont = await getInterFont();

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
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
        },
        children: [
          // Header with brand
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                marginBottom: '40px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '32px',
                      fontWeight: 700,
                      color: OG_COLORS.textPrimary,
                      letterSpacing: '-0.02em',
                    },
                    children: BRAND.name,
                  },
                },
              ],
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
                // Mode badge
                mode && {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '24px',
                    },
                    children: [
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
                    ],
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
      fonts: interFont
        ? [
            {
              name: 'Inter',
              data: interFont,
              weight: 400,
              style: 'normal',
            },
            {
              name: 'Inter',
              data: interFont,
              weight: 500,
              style: 'normal',
            },
            {
              name: 'Inter',
              data: interFont,
              weight: 600,
              style: 'normal',
            },
            {
              name: 'Inter',
              data: interFont,
              weight: 700,
              style: 'normal',
            },
          ]
        : [],
    },
  );

  return svg;
}

/**
 * Convert SVG to PNG using sharp
 */
async function svgToPng(svg: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
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

      // Generate OG image
      const svg = await generateOgImage({
        title,
        mode,
        participantCount,
        messageCount,
      });

      // Convert to PNG
      const png = await svgToPng(svg);

      // Return PNG with CDN cache headers (convert Buffer to Uint8Array for proper BodyInit compatibility)
      return new Response(new Uint8Array(png), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
          'X-OG-Generated': 'true',
        },
      });
    } catch (error) {
      console.error('[OG-IMAGE] Generation failed:', error);

      // Return minimal 1x1 transparent PNG on error
      const transparentPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      return new Response(new Uint8Array(transparentPng), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60',
          'X-OG-Error': 'true',
        },
      });
    }
  },
);
