/**
 * Dynamic Open Graph Image for Public Chat Threads
 * Generates custom OG images with thread title and conversation details
 * Uses Next.js ImageResponse API (no edge runtime needed)
 */
import { ImageResponse } from 'next/og';

import { BRAND } from '@/constants/brand';
import { getPublicThreadService } from '@/services/api';

import * as config from './opengraph-image.config';

export { alt, contentType, revalidate, runtime, size } from './opengraph-image.config';

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    // Fetch thread data for OG image generation
    const response = await getPublicThreadService(slug);

    if (!response.success || !response.data?.thread) {
      // Fallback image for not found threads
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
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: '#fff',
                textAlign: 'center',
                maxWidth: '80%',
              }}
            >
              Thread Not Found
            </div>
            <div
              style={{
                fontSize: 28,
                color: '#a1a1aa',
                textAlign: 'center',
                marginTop: 20,
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

    const { thread, participants = [], messages = [] } = response.data;

    // Get conversation stats
    const _userMessages = messages?.filter(m => m.role === 'user').length || 0;
    const _assistantMessages = messages?.filter(m => m.role === 'assistant').length || 0;

    // Get first user message preview
    const firstUserMessage = messages?.find(m => m.role === 'user');
    const messagePreview = firstUserMessage?.content
      ? firstUserMessage.content.slice(0, 120) + (firstUserMessage.content.length > 120 ? '...' : '')
      : 'View this AI conversation';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#000',
            backgroundImage: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
            padding: 60,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 40,
            }}
          >
            {/* Brand */}
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {BRAND.name}
            </div>
            {/* Public Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 20px',
                backgroundColor: '#18181b',
                borderRadius: 8,
                fontSize: 18,
                color: '#22c55e',
                fontWeight: 600,
              }}
            >
              🌐 PUBLIC
            </div>
          </div>

          {/* Thread Title */}
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: '#fff',
              lineHeight: 1.2,
              marginBottom: 20,
              maxHeight: 130,
              overflow: 'hidden',
              display: '-webkit-box',
            }}
          >
            {thread.title}
          </div>

          {/* Message Preview */}
          <div
            style={{
              fontSize: 22,
              color: '#a1a1aa',
              lineHeight: 1.4,
              marginBottom: 30,
              maxHeight: 70,
              overflow: 'hidden',
            }}
          >
            {messagePreview}
          </div>

          {/* Stats Bar */}
          <div
            style={{
              display: 'flex',
              gap: 30,
              marginTop: 'auto',
            }}
          >
            {/* Mode Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 24px',
                backgroundColor: '#18181b',
                borderRadius: 8,
                fontSize: 20,
                color: '#fff',
                textTransform: 'capitalize',
              }}
            >
              {thread.mode}
            </div>

            {/* Participants */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 24px',
                backgroundColor: '#18181b',
                borderRadius: 8,
                fontSize: 20,
                color: '#a1a1aa',
              }}
            >
              👥
              {' '}
              {participants.length}
              {' '}
              {participants.length === 1
                ? 'Participant'
                : 'Participants'}
            </div>

            {/* Messages */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 24px',
                backgroundColor: '#18181b',
                borderRadius: 8,
                fontSize: 20,
                color: '#a1a1aa',
              }}
            >
              💬
              {' '}
              {messages.length}
              {' '}
              {messages.length === 1
                ? 'Message'
                : 'Messages'}
            </div>
          </div>
        </div>
      ),
      {
        ...config.size,
      },
    );
  } catch (error) {
    console.error('Error generating OG image for public thread:', error);

    // Fallback error image
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
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: '#fff',
              textAlign: 'center',
            }}
          >
            Public AI Chat
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#a1a1aa',
              textAlign: 'center',
              marginTop: 20,
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
}
