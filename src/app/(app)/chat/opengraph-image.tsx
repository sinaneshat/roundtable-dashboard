/**
 * Static Open Graph Image for Chat Overview/Dashboard Page
 * Uses Next.js ImageResponse API with server-side translations
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

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = `Dashboard - ${BRAND.fullName}`;

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
        {/* Decorative gradient orbs for different modes */}
        <div
          style={{
            position: 'absolute',
            top: -50,
            right: 100,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.analyzing}30 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -50,
            left: 100,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.brainstorming}30 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: -50,
            width: 250,
            height: 250,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${OG_COLORS.solving}30 0%, transparent 70%)`,
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
              width={80}
              height={80}
            />
          )}
          <div
            style={{
              fontSize: 36,
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
          {t('chat.dashboard.title')}
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
          {BRAND.tagline}
        </div>

        {/* Mode Badges */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginBottom: 24,
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `2px solid ${OG_COLORS.analyzing}`,
              borderRadius: 20,
              fontSize: 18,
              fontWeight: 600,
              color: OG_COLORS.textPrimary,
            }}
          >
            {t('moderator.mode.analyzing')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `2px solid ${OG_COLORS.brainstorming}`,
              borderRadius: 20,
              fontSize: 18,
              fontWeight: 600,
              color: OG_COLORS.textPrimary,
            }}
          >
            {t('moderator.mode.brainstorming')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `2px solid ${OG_COLORS.debating}`,
              borderRadius: 20,
              fontSize: 18,
              fontWeight: 600,
              color: OG_COLORS.textPrimary,
            }}
          >
            {t('moderator.mode.debating')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 20px',
              backgroundColor: OG_COLORS.glassBackground,
              border: `2px solid ${OG_COLORS.solving}`,
              borderRadius: 20,
              fontSize: 18,
              fontWeight: 600,
              color: OG_COLORS.textPrimary,
            }}
          >
            {t('moderator.mode.solving')}
          </div>
        </div>

        {/* Features */}
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
              gap: 10,
              fontSize: 20,
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
            {t('chat.dashboard.features.multipleModels')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 20,
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
            {t('chat.dashboard.features.realtimeCollaboration')}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 20,
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
            {t('chat.dashboard.features.publicSharing')}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
