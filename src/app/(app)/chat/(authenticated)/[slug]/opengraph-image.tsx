/* eslint-disable react-refresh/only-export-components */
import { ImageResponse } from 'next/og';

import type { ChatMode } from '@/api/core/enums';
import { ChatModes, DEFAULT_CHAT_MODE } from '@/api/core/enums';
import { BRAND } from '@/constants/brand';
import { getThreadBySlugService } from '@/services/api';

export const alt = 'Chat Thread';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

const MODE_COLORS: Record<ChatMode, string> = {
  [ChatModes.ANALYZING]: '#3b82f6',
  [ChatModes.BRAINSTORMING]: '#8b5cf6',
  [ChatModes.DEBATING]: '#ef4444',
  [ChatModes.SOLVING]: '#10b981',
} as const;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let threadTitle = 'Chat Thread';
  let threadMode = DEFAULT_CHAT_MODE;

  try {
    const threadResult = await getThreadBySlugService({ param: { slug } });
    if (threadResult?.success && threadResult.data?.thread) {
      threadTitle = threadResult.data.thread.title || 'Chat Thread';
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
          backgroundColor: '#000',
          backgroundImage: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
          padding: '60px',
        }}
      >
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
              color: '#fff',
              letterSpacing: '-0.05em',
            }}
          >
            {BRAND.displayName}
          </div>
        </div>

        <div
          style={{
            fontSize: threadTitle.length > 50 ? 48 : 56,
            fontWeight: 800,
            color: '#fff',
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 20px',
            backgroundColor: accentColor,
            borderRadius: 20,
            fontSize: 20,
            fontWeight: 600,
            color: '#fff',
            textTransform: 'capitalize',
            marginBottom: 20,
          }}
        >
          {threadMode}
          {' '}
          Mode
        </div>

        <div
          style={{
            fontSize: 24,
            color: '#a1a1aa',
            textAlign: 'center',
            maxWidth: '70%',
            lineHeight: 1.4,
          }}
        >
          Collaborate with AI models in real-time conversations
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 40,
            display: 'flex',
            alignItems: 'center',
            padding: '12px 24px',
            backgroundColor: '#18181b',
            borderRadius: 8,
            fontSize: 18,
            color: '#a1a1aa',
          }}
        >
          {BRAND.fullName}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
