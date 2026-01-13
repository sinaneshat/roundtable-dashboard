import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants';
import {
  createGradient,
  getLogoBase64,
  OG_COLORS,
} from '@/lib/ui/og-image-helpers';
import { getOGFonts } from '@/lib/ui/og-fonts.server';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = `Privacy Policy - ${BRAND.fullName}`;
// Static generation - all assets embedded at build time
export const revalidate = 86400;

export default async function Image() {
  // Load translations, fonts, and logo in parallel
  const [t, fonts, logoBase64] = await Promise.all([
    getTranslations(),
    getOGFonts(),
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
          position: 'relative',
        }}
      >
        {/* Decorative shield icon area */}
        <div
          style={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.primary}20 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />

        {/* Brand Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 40,
            zIndex: 1,
          }}
        >
          {logoBase64 && (
            <img
              src={logoBase64}
              alt={BRAND.name}
              width={64}
              height={64}
            />
          )}
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: OG_COLORS.textPrimary,
            }}
          >
            {BRAND.displayName}
          </div>
        </div>

        {/* Main Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: OG_COLORS.textPrimary,
            textAlign: 'center',
            marginBottom: 20,
            zIndex: 1,
          }}
        >
          {t('legal.privacy.title')}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: OG_COLORS.textSecondary,
            textAlign: 'center',
            maxWidth: '70%',
            lineHeight: 1.4,
            marginBottom: 40,
            zIndex: 1,
          }}
        >
          {t('legal.privacy.tagline')}
        </div>

        {/* Trust Badges */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 24px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `1px solid ${OG_COLORS.glassBorder}`,
              borderRadius: 8,
              fontSize: 20,
              color: OG_COLORS.textSecondary,
            }}
          >
            🔒
            {' '}
            {t('legal.trustBadges.secure')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 24px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `1px solid ${OG_COLORS.glassBorder}`,
              borderRadius: 8,
              fontSize: 20,
              color: OG_COLORS.textSecondary,
            }}
          >
            🛡️
            {' '}
            {t('legal.trustBadges.protected')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 24px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `1px solid ${OG_COLORS.glassBorder}`,
              borderRadius: 8,
              fontSize: 20,
              color: OG_COLORS.textSecondary,
            }}
          >
            ✅
            {' '}
            {t('legal.trustBadges.transparent')}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            fontSize: 18,
            color: OG_COLORS.textMuted,
          }}
        >
          {t('legal.privacy.lastUpdatedYear', { year: 2025 })}
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    },
  );
}
