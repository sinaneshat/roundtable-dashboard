import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants';
import { getOGFontsSync } from '@/lib/ui/og-assets.generated';
import {
  createGradient,
  getLogoBase64,
  OG_COLORS,
} from '@/lib/ui/og-image-helpers';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = `Sign Up - ${BRAND.fullName}`;
// Static generation - all assets embedded at build time
export const revalidate = 86400;

export default async function Image() {
  // Load translations and fonts in parallel
  const [t, fonts, logoBase64] = await Promise.all([
    getTranslations(),
    getOGFontsSync(),
    getLogoBase64().catch(() => ''),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: OG_COLORS.background,
          backgroundImage: createGradient(),
          padding: 60,
        }}
      >
        {/* Brand Logo */}
        {logoBase64 && (
          <img
            src={logoBase64}
            alt={BRAND.name}
            width={80}
            height={80}
            style={{ marginBottom: 40 }}
          />
        )}

        {/* Main Title */}
        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 800,
            color: OG_COLORS.textPrimary,
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          {t('auth.signUp.join')}
          {' '}
          {BRAND.displayName}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: OG_COLORS.textSecondary,
            textAlign: 'center',
            maxWidth: '70%',
            lineHeight: 1.4,
            marginBottom: 40,
          }}
        >
          {BRAND.tagline}
        </div>

        {/* Value Proposition */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 22,
              color: OG_COLORS.textSecondary,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                backgroundColor: OG_COLORS.primary,
                borderRadius: '50%',
              }}
            />
            {t('auth.signUp.features.multipleModels')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 22,
              color: OG_COLORS.textSecondary,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                backgroundColor: OG_COLORS.primary,
                borderRadius: '50%',
              }}
            />
            {t('auth.signUp.features.realtimeBrainstorming')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 22,
              color: OG_COLORS.textSecondary,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                backgroundColor: OG_COLORS.primary,
                borderRadius: '50%',
              }}
            />
            {t('auth.signUp.features.publicSharing')}
          </div>
        </div>

        {/* Call to Action Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 32px',
            backgroundColor: OG_COLORS.primary,
            borderRadius: 12,
            fontSize: 24,
            fontWeight: 600,
            color: OG_COLORS.textPrimary,
          }}
        >
          {t('auth.signUp.getStartedFree')}
        </div>

        {/* Footer Brand */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            fontSize: 20,
            color: OG_COLORS.textMuted,
          }}
        >
          {BRAND.displayName}
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    },
  );
}
