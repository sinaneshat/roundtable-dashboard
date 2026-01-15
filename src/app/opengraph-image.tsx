import { ImageResponse } from 'next/og';

import { BRAND } from '@/constants';
import { getOGFontsSync } from '@/lib/ui/og-assets.generated';
import {
  createGradient,
  getLogoBase64,
  getModelIconBase64,
  OG_COLORS,
} from '@/lib/ui/og-image-helpers';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = BRAND.fullName;
// Static generation - all assets (fonts, logo, icons) are embedded at build time
export const revalidate = 86400; // Revalidate once per day

const FEATURED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'x-ai',
  'deepseek',
  'meta',
];

export default async function Image() {
  const [fonts, logoBase64, ...modelIcons] = await Promise.all([
    getOGFontsSync(),
    getLogoBase64().catch(() => ''),
    ...FEATURED_PROVIDERS.map(provider =>
      getModelIconBase64(provider).catch(() => ''),
    ),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: OG_COLORS.background,
          backgroundImage: createGradient(),
          padding: 60,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.primary}35 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 50,
            zIndex: 1,
          }}
        >
          {logoBase64 && (
            <img
              src={logoBase64}
              alt={BRAND.name}
              width={80}
              height={80}
            />
          )}
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: OG_COLORS.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            {BRAND.displayName}
          </div>
        </div>

        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: OG_COLORS.textPrimary,
            lineHeight: 1.15,
            marginBottom: 40,
            maxWidth: '90%',
            zIndex: 1,
          }}
        >
          {BRAND.tagline}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
            zIndex: 1,
          }}
        >
          {modelIcons.map((icon, index) => (
            icon && (
              <div
                key={FEATURED_PROVIDERS[index]}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 64,
                  height: 64,
                  backgroundColor: OG_COLORS.glassBackground,
                  borderRadius: 16,
                  border: `1px solid ${OG_COLORS.glassBorder}`,
                  padding: 12,
                }}
              >
                <img
                  src={icon}
                  alt="AI Model"
                  width={40}
                  height={40}
                  style={{ borderRadius: 8 }}
                />
              </div>
            )
          ))}
        </div>

        <div
          style={{
            fontSize: 24,
            color: OG_COLORS.textSecondary,
            lineHeight: 1.4,
            zIndex: 1,
          }}
        >
          Chat with the best AI models together in real-time
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: -150,
            left: -150,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.primary}25 0%, transparent 70%)`,
            filter: 'blur(80px)',
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts,
    },
  );
}
