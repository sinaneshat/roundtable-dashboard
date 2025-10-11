/**
 * Dynamic Open Graph Image for Chat Thread pages
 * Uses Next.js ImageResponse API (no edge runtime needed)
 */
import { ImageResponse } from 'next/og';

import { BRAND } from '@/constants/brand';

import * as config from './opengraph-image.config';

export { alt, contentType, runtime, size } from './opengraph-image.config';

export default async function Image() {
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
              fontSize: 40,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.05em',
            }}
          >
            {BRAND.displayName}
          </div>
        </div>

        {/* Main Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: '#fff',
            textAlign: 'center',
            maxWidth: '80%',
            lineHeight: 1.2,
            marginBottom: 20,
          }}
        >
          Chat Thread
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
      ...config.size,
    },
  );
}
