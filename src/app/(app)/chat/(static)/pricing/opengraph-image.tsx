/**
 * Static Open Graph Image for Pricing Page
 * Uses Next.js ImageResponse API with server-side translations
 * Shows generic tier names from actual subscription tiers (no fake pricing)
 *
 * Note: This file uses Next.js Metadata API which requires named exports.
 * The react-refresh warning is disabled as this is not a React component file.
 */
/* eslint-disable react-refresh/only-export-components */
import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants/brand';
import {
  createGradient,
  getLogoBase64,
  OG_COLORS,
} from '@/lib/ui';

// Force dynamic to avoid build-time image fetch errors
export const dynamic = 'force-dynamic';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = `Pricing - ${BRAND.fullName}`;

export default async function Image() {
  // Load translations
  const t = await getTranslations();

  // Load logo
  let logoBase64: string;
  try {
    logoBase64 = await getLogoBase64();
  } catch {
    logoBase64 = '';
  }

  // Actual subscription tiers: Free (10K credits) and Pro ($100/month, 1M credits)
  const tiers = [
    { name: t('subscription.tiers.free.name'), desc: t('subscription.tiers.free.description') },
    { name: t('subscription.tiers.pro.name'), desc: t('subscription.tiers.pro.description') },
  ];

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
        {/* Decorative gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.primary}30 0%, transparent 70%)`,
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.analyzing}30 0%, transparent 70%)`,
            filter: 'blur(80px)',
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
          {t('pricing.page.title')}
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
          {t('pricing.page.description')}
        </div>

        {/* Real Subscription Tiers */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            zIndex: 1,
          }}
        >
          {tiers.map((tier, index) => (
            <div
              key={tier.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 20px',
                backgroundColor: index === 1 ? OG_COLORS.primary : OG_COLORS.glassBackground,
                border: index === 1 ? `2px solid ${OG_COLORS.primary}` : `1px solid ${OG_COLORS.glassBorder}`,
                borderRadius: 12,
                minWidth: 140,
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: OG_COLORS.textPrimary,
                  marginBottom: 8,
                }}
              >
                {tier.name}
              </div>
            </div>
          ))}
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
            zIndex: 1,
          }}
        >
          {t('billing.products.description')}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
