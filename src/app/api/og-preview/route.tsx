/**
 * OG Image Preview API Route
 * Allows developers to preview OG images before they're generated
 *
 * Usage:
 * GET /api/og-preview?slug={threadSlug}
 *
 * This endpoint serves the OG image directly in the browser for preview
 */
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

import { BRAND } from '@/constants/brand';
import {
  createGradient,
  getLogoBase64,
  getModeColor,
  getModelIconBase64,
  OG_COLORS,
  truncateText,
} from '@/lib/utils/og-image-helpers';
import { getPublicThreadService } from '@/services/api';

const MODE_ICONS: Record<string, string> = {
  analyzing: '🔍',
  brainstorming: '💡',
  debating: '⚖️',
  solving: '🎯',
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');

    if (!slug) {
      return new Response('Missing slug parameter. Usage: /api/og-preview?slug=your-thread-slug', {
        status: 400,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // Load logo
    let logoBase64: string;
    try {
      logoBase64 = await getLogoBase64();
    } catch (error) {
      console.error('Failed to load logo:', error);
      logoBase64 = '';
    }

    // Fetch thread data
    const response = await getPublicThreadService(slug);

    if (!response.success || !response.data?.thread) {
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
            }}
          >
            {logoBase64 && (
              <img
                src={logoBase64}
                alt={BRAND.name}
                width={80}
                height={80}
                style={{ marginBottom: 30 }}
              />
            )}
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: OG_COLORS.textPrimary,
                textAlign: 'center',
              }}
            >
              Thread Not Found
            </div>
            <div
              style={{
                fontSize: 28,
                color: OG_COLORS.textSecondary,
                textAlign: 'center',
                marginTop: 20,
              }}
            >
              {BRAND.fullName}
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        },
      );
    }

    const { thread, participants = [], messages = [] } = response.data;

    // Get first user message preview
    const firstUserMessage = messages?.find(m => m.role === 'user');
    const messagePreview = firstUserMessage?.content
      ? truncateText(firstUserMessage.content, 120)
      : 'View this AI conversation';

    // Load model icons
    const participantIcons = await Promise.all(
      participants.slice(0, 4).map(async (p) => {
        try {
          const icon = await getModelIconBase64(p.role);
          return { role: p.role, icon };
        } catch {
          return { role: p.role, icon: '' };
        }
      }),
    );

    const modeColor = getModeColor(thread.mode);
    const modeIcon = MODE_ICONS[thread.mode] || MODE_ICONS.analyzing;

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
          {/* Decorative gradient orb - top right */}
          <div
            style={{
              position: 'absolute',
              top: -100,
              right: -100,
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${modeColor}40 0%, transparent 70%)`,
              filter: 'blur(60px)',
            }}
          />

          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 40,
              zIndex: 1,
            }}
          >
            {/* Brand with Logo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {logoBase64 && (
                <img
                  src={logoBase64}
                  alt={BRAND.name}
                  width={48}
                  height={48}
                />
              )}
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: OG_COLORS.textPrimary,
                }}
              >
                {BRAND.name}
              </div>
            </div>

            {/* Public Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 24px',
                backgroundColor: OG_COLORS.glassBackground,
                borderRadius: 12,
                fontSize: 18,
                color: OG_COLORS.success,
                fontWeight: 600,
                border: `1px solid ${OG_COLORS.glassBorder}`,
              }}
            >
              PUBLIC
            </div>
          </div>

          {/* Thread Title */}
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: OG_COLORS.textPrimary,
              lineHeight: 1.2,
              marginBottom: 20,
              maxHeight: 130,
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            {thread.title}
          </div>

          {/* Message Preview */}
          {messagePreview && (
            <div
              style={{
                fontSize: 22,
                color: OG_COLORS.textSecondary,
                lineHeight: 1.4,
                marginBottom: 30,
                maxHeight: 70,
                overflow: 'hidden',
                zIndex: 1,
              }}
            >
              {messagePreview}
            </div>
          )}

          {/* Model Participants Icons */}
          {participantIcons.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 30,
                zIndex: 1,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  color: OG_COLORS.textMuted,
                  marginRight: 8,
                }}
              >
                AI Models:
              </div>
              {participantIcons.map((p, idx) => (
                p.icon && (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 48,
                      height: 48,
                      backgroundColor: OG_COLORS.glassBackground,
                      borderRadius: 12,
                      border: `1px solid ${OG_COLORS.glassBorder}`,
                      padding: 8,
                    }}
                  >
                    <img
                      src={p.icon}
                      alt="Model"
                      width={32}
                      height={32}
                      style={{ borderRadius: 6 }}
                    />
                  </div>
                )
              ))}
              {participants.length > 4 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    backgroundColor: OG_COLORS.glassBackground,
                    borderRadius: 12,
                    border: `1px solid ${OG_COLORS.glassBorder}`,
                    fontSize: 18,
                    color: OG_COLORS.textSecondary,
                    fontWeight: 600,
                  }}
                >
                  +
                  {participants.length - 4}
                </div>
              )}
            </div>
          )}

          {/* Stats Bar */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 'auto',
              zIndex: 1,
            }}
          >
            {/* Mode Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 28px',
                backgroundColor: OG_COLORS.glassBackground,
                borderRadius: 12,
                fontSize: 20,
                color: OG_COLORS.textPrimary,
                textTransform: 'capitalize',
                border: `2px solid ${modeColor}`,
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 24 }}>{modeIcon}</span>
              {thread.mode}
            </div>

            {/* Participants Count */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 28px',
                backgroundColor: OG_COLORS.glassBackground,
                borderRadius: 12,
                fontSize: 20,
                color: OG_COLORS.textSecondary,
                border: `1px solid ${OG_COLORS.glassBorder}`,
              }}
            >
              <span style={{ fontSize: 22 }}>🤖</span>
              {participants.length}
              {' '}
              {participants.length === 1 ? 'Model' : 'Models'}
            </div>

            {/* Messages Count */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 28px',
                backgroundColor: OG_COLORS.glassBackground,
                borderRadius: 12,
                fontSize: 20,
                color: OG_COLORS.textSecondary,
                border: `1px solid ${OG_COLORS.glassBorder}`,
              }}
            >
              <span style={{ fontSize: 22 }}>💬</span>
              {messages.length}
              {' '}
              {messages.length === 1 ? 'Message' : 'Messages'}
            </div>
          </div>

          {/* Bottom gradient orb */}
          <div
            style={{
              position: 'absolute',
              bottom: -150,
              left: -150,
              width: 500,
              height: 500,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${OG_COLORS.primary}30 0%, transparent 70%)`,
              filter: 'blur(80px)',
            }}
          />

          {/* Preview watermark */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              padding: '8px 16px',
              backgroundColor: OG_COLORS.warning,
              color: '#000',
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 6,
              opacity: 0.9,
            }}
          >
            PREVIEW
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (error) {
    console.error('Error in OG preview:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to generate OG image preview',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
