/**
 * Generate Static OG Image
 *
 * Creates the default static OG image matching roundtable.now style.
 * Run with: npx tsx scripts/generate-static-og-image.ts
 *
 * Output: ../apps/web/public/static/og-image.png
 */

import fs from 'node:fs';
import path from 'node:path';

import satori from 'satori';

import {
  getLogoBase64Sync,
  getModelIconBase64Sync,
  getOGFontsSync,
} from '../src/lib/ui/og-assets.generated';

// OG image dimensions (standard)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Brand constants
const BRAND = {
  name: 'Roundtable.now',
  tagline: 'Multiple AI Models, One Conversation',
  description: 'Chat with the best AI models together in real-time',
} as const;

// OG image colors (matching roundtable.now)
const OG_COLORS = {
  background: '#0a0a0a',
  backgroundGradientStart: '#0a0a0a',
  backgroundGradientEnd: '#141414',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  iconBackground: '#1a1a1a',
  iconBorder: 'rgba(255, 255, 255, 0.1)',
} as const;

// AI model providers to display
const MODEL_PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'meta', 'openrouter'];

/**
 * Generate static OG image SVG matching roundtable.now style
 */
async function generateStaticOgImage() {
  const fonts = getOGFontsSync();
  const logoBase64 = getLogoBase64Sync();

  // Get model icons
  const modelIcons = MODEL_PROVIDERS.map(provider => ({
    provider,
    icon: getModelIconBase64Sync(provider),
  }));

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
          backgroundImage: `linear-gradient(180deg, ${OG_COLORS.backgroundGradientStart} 0%, ${OG_COLORS.backgroundGradientEnd} 100%)`,
          padding: '60px',
          fontFamily: 'sans-serif',
        },
        children: [
          // Header with logo
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              },
              children: [
                // Logo image
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

          // Main content area
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                justifyContent: 'center',
                marginTop: '20px',
              },
              children: [
                // Main heading
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '64px',
                      fontWeight: 700,
                      color: OG_COLORS.textPrimary,
                      lineHeight: 1.1,
                      letterSpacing: '-0.03em',
                      marginBottom: '40px',
                    },
                    children: BRAND.tagline,
                  },
                },

                // Model icons row
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      gap: '16px',
                      marginBottom: '40px',
                    },
                    children: modelIcons.map(({ icon }) => ({
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '64px',
                          height: '64px',
                          backgroundColor: OG_COLORS.iconBackground,
                          borderRadius: '16px',
                          border: `1px solid ${OG_COLORS.iconBorder}`,
                        },
                        children: icon
                          ? [
                              {
                                type: 'img',
                                props: {
                                  src: icon,
                                  width: 36,
                                  height: 36,
                                },
                              },
                            ]
                          : [],
                      },
                    })),
                  },
                },

                // Description
                {
                  type: 'div',
                  props: {
                    style: {
                      fontSize: '24px',
                      fontWeight: 400,
                      color: OG_COLORS.textSecondary,
                      lineHeight: 1.4,
                    },
                    children: BRAND.description,
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

async function main() {
  console.log('Generating static OG image matching roundtable.now style...\n');

  // Check embedded assets
  const logoBase64 = getLogoBase64Sync();
  console.log(`Logo loaded: ${logoBase64 ? 'Yes' : 'No'}`);

  const fonts = getOGFontsSync();
  console.log(`Fonts loaded: ${fonts.length} font(s)`);

  // Check model icons
  console.log('\nModel icons:');
  MODEL_PROVIDERS.forEach((provider) => {
    const icon = getModelIconBase64Sync(provider);
    console.log(`  - ${provider}: ${icon ? 'Yes' : 'No'}`);
  });

  console.log('\nGenerating image...');
  const svg = await generateStaticOgImage();

  // Save to og-samples for preview
  const samplesDir = path.join(process.cwd(), 'og-samples');
  const svgPath = path.join(samplesDir, 'static-og-new.svg');
  fs.writeFileSync(svgPath, svg);
  console.log(`SVG saved: ${svgPath}`);

  const png = await svgToPng(svg);
  const pngPath = path.join(samplesDir, 'static-og-new.png');
  fs.writeFileSync(pngPath, png);
  console.log(`PNG saved: ${pngPath}`);

  // Also save to web public folder
  const webPublicPath = path.resolve(process.cwd(), '../web/public/static/og-image.png');
  fs.writeFileSync(webPublicPath, png);
  console.log(`\nUpdated web static: ${webPublicPath}`);

  console.log('\n✓ Static OG image generated successfully!');
  console.log('Preview at: og-samples/static-og-new.png');
}

main().catch(console.error);
