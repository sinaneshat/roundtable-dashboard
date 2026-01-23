/**
 * Generate Sample OG Images
 *
 * Creates sample OG images locally for visual inspection using embedded assets.
 * Run with: bunx tsx scripts/generate-sample-og-images.ts
 *
 * Output: ./og-samples/ directory with PNG files
 */

import fs from 'node:fs';
import path from 'node:path';

import type { ChatMode } from '@roundtable/shared';
import satori from 'satori';

// Import embedded assets (same as production handler)
import {
  getLogoBase64Sync,
  getModeIconBase64Sync,
  getOGFontsSync,
} from '../src/lib/ui/og-assets.generated';

// OG image dimensions (standard)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Brand constants (matching roundtable.now)
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
const MODE_COLORS: Record<ChatMode, string> = {
  analyzing: OG_COLORS.analyzing,
  brainstorming: OG_COLORS.brainstorming,
  debating: OG_COLORS.debating,
  solving: OG_COLORS.solving,
};

function getModeColor(mode: ChatMode): string {
  return MODE_COLORS[mode] ?? OG_COLORS.primary;
}

/**
 * Generate OG image SVG using satori with embedded assets
 * (Mirrors production handler exactly)
 */
async function generateOgImage(params: {
  title: string;
  mode?: ChatMode;
  participantCount: number;
  messageCount: number;
}) {
  const { title, mode, participantCount, messageCount } = params;
  const modeColor = mode ? getModeColor(mode) : OG_COLORS.primary;

  // Get embedded fonts and assets (no network required)
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
          fontFamily: 'sans-serif',
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
 * Convert SVG to PNG using resvg (Node.js version)
 */
async function svgToPng(svg: string): Promise<Uint8Array> {
  const { Resvg } = await import('@cf-wasm/resvg/node');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

// Sample OG image configurations
const samples = [
  {
    filename: '01-default-no-mode.png',
    title: 'AI Conversation',
    mode: undefined,
    participantCount: 3,
    messageCount: 10,
  },
  {
    filename: '02-analyzing-mode.png',
    title: 'Analyzing the impact of AI on software development',
    mode: 'analyzing' as ChatMode,
    participantCount: 4,
    messageCount: 25,
  },
  {
    filename: '03-brainstorming-mode.png',
    title: 'Brainstorming startup ideas for 2024',
    mode: 'brainstorming' as ChatMode,
    participantCount: 5,
    messageCount: 42,
  },
  {
    filename: '04-debating-mode.png',
    title: 'Is remote work better than office work?',
    mode: 'debating' as ChatMode,
    participantCount: 3,
    messageCount: 18,
  },
  {
    filename: '05-solving-mode.png',
    title: 'How to scale a SaaS product to 1M users',
    mode: 'solving' as ChatMode,
    participantCount: 4,
    messageCount: 33,
  },
  {
    filename: '06-long-title.png',
    title:
      'This is a very long title that should demonstrate how the OG image handles text overflow and truncation when the title exceeds the available space in the card layout',
    mode: 'analyzing' as ChatMode,
    participantCount: 2,
    messageCount: 15,
  },
  {
    filename: '07-single-participant.png',
    title: 'Single AI model conversation',
    mode: 'solving' as ChatMode,
    participantCount: 1,
    messageCount: 5,
  },
  {
    filename: '08-many-messages.png',
    title: 'Extended discussion on machine learning',
    mode: 'debating' as ChatMode,
    participantCount: 6,
    messageCount: 150,
  },
];

async function main() {
  console.log('Generating sample OG images with embedded assets...\n');

  // Create output directory
  const outputDir = path.join(process.cwd(), 'og-samples');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check embedded assets
  const logoBase64 = getLogoBase64Sync();
  console.log(`Logo loaded: ${logoBase64 ? 'Yes' : 'No'} (${logoBase64?.length || 0} chars)`);

  const fonts = getOGFontsSync();
  console.log(`Fonts loaded: ${fonts.length} font(s)`);
  fonts.forEach(f => console.log(`  - ${f.name} (weight: ${f.weight})`));
  console.log('');

  // Generate each sample
  for (const sample of samples) {
    console.log(`Generating: ${sample.filename}`);
    console.log(`  Title: ${sample.title.slice(0, 50)}${sample.title.length > 50 ? '...' : ''}`);
    console.log(`  Mode: ${sample.mode || 'none'}`);
    console.log(`  Participants: ${sample.participantCount}, Messages: ${sample.messageCount}`);

    const svg = await generateOgImage({
      title: sample.title,
      mode: sample.mode,
      participantCount: sample.participantCount,
      messageCount: sample.messageCount,
    });

    // Also save SVG for debugging
    const svgPath = path.join(outputDir, sample.filename.replace('.png', '.svg'));
    fs.writeFileSync(svgPath, svg);

    const png = await svgToPng(svg);
    const pngPath = path.join(outputDir, sample.filename);
    fs.writeFileSync(pngPath, png);

    console.log(`  Saved: ${pngPath}\n`);
  }

  console.log('='.repeat(60));
  console.log('All sample OG images generated!');
  console.log(`Output directory: ${outputDir}`);
  console.log('\nGenerated files:');
  samples.forEach(s => console.log(`  - ${s.filename}`));
  console.log('\nOpen the PNG files to visually inspect the OG images.');
}

main().catch(console.error);
