/**
 * Dynamic Open Graph Image for Public Chat Threads
 * Enhanced with design system colors, actual model icons, and glass-morphism
 *
 * Features:
 * - Uses actual Roundtable logo (base64 encoded)
 * - Shows real AI model icons for participants
 * - Glass-morphism design matching the app
 * - Chat mode with color coding
 * - ISR with 24-hour revalidation
 * - Proper error handling and fallbacks
 *
 * Best Practices (Next.js Official):
 * - Uses ImageResponse from 'next/og'
 * - Base64 encoding for local images
 * - Proper size and contentType exports
 * - ISR configuration matching page
 * - Dynamic params from route
 *
 * Note: This file uses Next.js Metadata API which requires named exports.
 * The react-refresh warning is disabled as this is not a React component file.
 */
/* eslint-disable react-refresh/only-export-components */
import { ImageResponse } from 'next/og';

import { MessageRoles } from '@/api/core/enums';
import { BRAND } from '@/constants/brand';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import {
  createGradient,
  getLogoBase64,
  getModeColor,
  getModeIconBase64,
  getModelIconBase64,
  getUIIconBase64,
  OG_COLORS,
  truncateText,
} from '@/lib/ui';
import { getPublicThreadService } from '@/services/api';

// Open Graph Image metadata - must be direct exports (not re-exported)
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = 'Public AI Chat Thread';

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Load all icons and assets
  let logoBase64: string;
  let robotIconBase64: string;
  let messageIconBase64: string;

  try {
    logoBase64 = await getLogoBase64();
  } catch {
    logoBase64 = '';
  }

  try {
    robotIconBase64 = await getUIIconBase64('robot');
  } catch {
    robotIconBase64 = '';
  }

  try {
    messageIconBase64 = await getUIIconBase64('message');
  } catch {
    messageIconBase64 = '';
  }

  try {
    // Fetch thread data for OG image generation
    const response = await getPublicThreadService({ param: { slug } });

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
                maxWidth: '80%',
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
          ...size,
        },
      );
    }

    const { thread, participants = [], messages = [] } = response.data;

    // Get first user message preview
    const firstUserMessage = messages?.find(m => m.role === MessageRoles.USER);
    const firstUserText = extractTextFromMessage(firstUserMessage);
    const messagePreview = firstUserText
      ? truncateText(firstUserText, 120)
      : 'View this AI conversation';

    // Load mode icon
    let modeIconBase64: string;
    try {
      modeIconBase64 = await getModeIconBase64(thread.mode);
    } catch {
      modeIconBase64 = '';
    }

    // Load model icons for participants (up to 4 to avoid clutter)
    // ✅ DYNAMIC: Uses modelId to resolve provider icon automatically
    const participantIcons = await Promise.all(
      participants.slice(0, 4).map(async (p) => {
        try {
          const icon = await getModelIconBase64(p.modelId); // ✅ Use modelId, not role
          return { modelId: p.modelId, role: p.role, icon };
        } catch {
          return { modelId: p.modelId, role: p.role, icon: '' };
        }
      }),
    );

    const modeColor = getModeColor(thread.mode);

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
                {BRAND.displayName}
              </div>
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
              display: '-webkit-box',
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

          {/* Model Participants Icons Row */}
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
              {participantIcons.map((p: { modelId: string; role: string | null; icon: string }) => (
                p.icon && (
                  <div
                    key={p.modelId}
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

          {/* Stats Bar - Glass morphism */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 'auto',
              zIndex: 1,
            }}
          >
            {/* Mode Badge with Color */}
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
              {modeIconBase64 && (
                <img
                  src={modeIconBase64}
                  alt="Mode"
                  width={24}
                  height={24}
                  style={{ filter: `drop-shadow(0 0 8px ${modeColor})` }}
                />
              )}
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
              {robotIconBase64 && (
                <img
                  src={robotIconBase64}
                  alt="Models"
                  width={22}
                  height={22}
                />
              )}
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
              {messageIconBase64 && (
                <img
                  src={messageIconBase64}
                  alt="Messages"
                  width={22}
                  height={22}
                />
              )}
              {messages.length}
              {' '}
              {messages.length === 1 ? 'Message' : 'Messages'}
            </div>
          </div>

          {/* Bottom decorative gradient orb */}
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
        </div>
      ),
      {
        ...size,
      },
    );
  } catch {
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
            Public AI Chat
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
        ...size,
      },
    );
  }
}
