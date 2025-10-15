/**
 * Dynamic Open Graph Image for Chat Thread pages
 * Following official Next.js patterns: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */
import { ImageResponse } from 'next/og';

import { BRAND } from '@/constants/brand';
import { getThreadBySlugService } from '@/services/api';

// Image metadata - must be exported as string literals (not imported)
export const alt = 'Chat Thread';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// DO NOT export runtime - ImageResponse works without it
// Next.js requires runtime to be a string literal, and it's not needed for opengraph-image.tsx

/**
 * Dynamic Open Graph Image generation
 * Fetches actual thread data to display the thread title
 */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch thread data to get the actual title
  let threadTitle = 'Chat Thread';
  let threadMode = 'solving';

  try {
    const threadResult = await getThreadBySlugService({ param: { slug } });
    if (threadResult?.success && threadResult.data?.thread) {
      threadTitle = threadResult.data.thread.title || 'Chat Thread';
      threadMode = threadResult.data.thread.mode || 'solving';
    }
  } catch (error) {
    // Fallback to generic title if fetch fails
    console.error('Failed to fetch thread for OG image:', error);
  }

  // Mode-specific colors for visual distinction
  const modeColors = {
    analyzing: '#3b82f6', // blue
    brainstorming: '#8b5cf6', // purple
    debating: '#ef4444', // red
    solving: '#10b981', // green
  };

  const accentColor = modeColors[threadMode as keyof typeof modeColors] || modeColors.solving;

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
        {/* Brand Logo/Icon Area */}
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

        {/* Main Title - Dynamic thread title */}
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
            color: '#fff',
            textTransform: 'capitalize',
            marginBottom: 20,
          }}
        >
          {threadMode}
          {' '}
          Mode
        </div>

        {/* Description */}
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

        {/* Footer Badge */}
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
