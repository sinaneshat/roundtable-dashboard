import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import type { ChatMode } from '@/api/core/enums';
import { ChatModes, DEFAULT_CHAT_MODE } from '@/api/core/enums';
import { BRAND } from '@/constants';
import {
  createGradient,
  OG_COLORS,
} from '@/lib/ui/og-image-helpers';
import { getOGFonts } from '@/lib/ui/og-fonts.server';
import { getThreadBySlugService } from '@/services/api';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = `Chat Thread - ${BRAND.fullName}`;

// Force dynamic to prevent build-time prerendering (fonts loaded at runtime)
export const dynamic = 'force-dynamic';

const MODE_COLORS: Record<ChatMode, string> = {
  [ChatModes.ANALYZING]: OG_COLORS.analyzing,
  [ChatModes.BRAINSTORMING]: OG_COLORS.brainstorming,
  [ChatModes.DEBATING]: OG_COLORS.debating,
  [ChatModes.SOLVING]: OG_COLORS.solving,
} as const;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Load translations and fonts in parallel
  const [t, fonts] = await Promise.all([
    getTranslations(),
    getOGFonts(),
  ]);

  // Default fallback values
  const defaultTitle = t('chat.dashboard.title');
  let threadTitle = defaultTitle;
  let threadMode = DEFAULT_CHAT_MODE;

  try {
    const threadResult = await getThreadBySlugService({ param: { slug } });
    if (threadResult?.success && threadResult.data?.thread) {
      threadTitle = threadResult.data.thread.title || defaultTitle;
      threadMode = threadResult.data.thread.mode || DEFAULT_CHAT_MODE;
    }
  } catch {
    // Intentionally silent - fallback to defaults
  }

  const accentColor = MODE_COLORS[threadMode];

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
        {/* Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: OG_COLORS.textPrimary,
              letterSpacing: '-0.05em',
            }}
          >
            {BRAND.displayName}
          </div>
        </div>

        {/* Thread Title */}
        <div
          style={{
            fontSize: threadTitle.length > 50 ? 48 : 56,
            fontWeight: 800,
            color: OG_COLORS.textPrimary,
            textAlign: 'center',
            maxWidth: '85%',
            lineHeight: 1.2,
            marginBottom: 20,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {threadTitle}
        </div>

        {/* Mode Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 20px',
            backgroundColor: accentColor,
            borderRadius: 20,
            fontSize: 20,
            fontWeight: 600,
            color: OG_COLORS.textPrimary,
            textTransform: 'capitalize',
            marginBottom: 20,
          }}
        >
          {t(`moderator.mode.${threadMode}`)}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: OG_COLORS.textSecondary,
            textAlign: 'center',
            maxWidth: '70%',
            lineHeight: 1.4,
          }}
        >
          {BRAND.tagline}
        </div>

        {/* Footer Brand */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 40,
            display: 'flex',
            alignItems: 'center',
            padding: '12px 24px',
            backgroundColor: OG_COLORS.glassBackground,
            borderRadius: 8,
            fontSize: 18,
            color: OG_COLORS.textMuted,
          }}
        >
          {BRAND.fullName}
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    },
  );
}
