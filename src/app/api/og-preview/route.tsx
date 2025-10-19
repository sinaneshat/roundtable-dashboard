/**
 * OG Image Preview Route
 * Example/test endpoint to see what your OG images look like
 *
 * Access at: http://localhost:3000/api/og-preview
 *
 * This creates a mock OG image with example data so you can:
 * - Preview the design locally
 * - Test without needing a real public thread
 * - Iterate on styling and layout
 */
/* eslint-disable next/no-img-element */
/* eslint-disable react/no-array-index-key */
import { ImageResponse } from 'next/og';

import { BRAND } from '@/constants/brand';
import {
  createGradient,
  getLogoBase64,
  getModeColor,
  getModeIconBase64,
  getModelIconBase64,
  getUIIconBase64,
  OG_COLORS,
} from '@/lib/utils/og-image-helpers';

// Mock data for preview - Showcasing diverse AI model providers
// ✅ MOCK DATA FOR OG PREVIEW: Example model IDs for preview generation only
// ⚠️ NOT PRODUCTION DATA: Actual models are selected dynamically via OpenRouter API
// This mock uses example model IDs to demonstrate icon resolution across different providers
const MOCK_THREAD = {
  title: 'How to Build a Scalable SaaS Platform',
  mode: 'analyzing' as const,
  messagePreview: 'I\'m looking to understand the best practices for building a modern SaaS application with proper authentication, billing, and scalability...',
  participants: [
    { modelId: 'anthropic/claude-3.5-sonnet', role: 'The Architect' },
    { modelId: 'openai/gpt-4-turbo', role: 'Code Reviewer' },
    { modelId: 'google/gemini-pro', role: 'Security Expert' },
    { modelId: 'x-ai/grok-2', role: 'DevOps Specialist' },
    { modelId: 'deepseek/deepseek-chat', role: 'Performance Optimizer' },
    { modelId: 'perplexity/llama-3.1-sonar-large', role: 'Research Assistant' },
  ],
  messagesCount: 24,
};

export async function GET() {
  // Load assets
  let logoBase64: string;
  let modeIconBase64: string;
  let robotIconBase64: string;
  let messageIconBase64: string;

  try {
    logoBase64 = await getLogoBase64();
  } catch (error) {
    console.error('Failed to load logo:', error);
    logoBase64 = '';
  }

  try {
    modeIconBase64 = await getModeIconBase64(MOCK_THREAD.mode);
  } catch (error) {
    console.error('Failed to load mode icon:', error);
    modeIconBase64 = '';
  }

  try {
    robotIconBase64 = await getUIIconBase64('robot');
  } catch (error) {
    console.error('Failed to load robot icon:', error);
    robotIconBase64 = '';
  }

  try {
    messageIconBase64 = await getUIIconBase64('message');
  } catch (error) {
    console.error('Failed to load message icon:', error);
    messageIconBase64 = '';
  }

  // Load model icons (only first 4 to avoid clutter)
  // ✅ DYNAMIC: Uses modelId to resolve provider icon automatically
  const participantIcons = await Promise.all(
    MOCK_THREAD.participants.slice(0, 4).map(async (p) => {
      try {
        const icon = await getModelIconBase64(p.modelId); // ✅ Use modelId, not role
        return { modelId: p.modelId, role: p.role, icon };
      } catch {
        return { modelId: p.modelId, role: p.role, icon: '' };
      }
    }),
  );

  const modeColor = getModeColor(MOCK_THREAD.mode);

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
              {BRAND.name}
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
          {MOCK_THREAD.title}
        </div>

        {/* Message Preview */}
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
          {MOCK_THREAD.messagePreview}
        </div>

        {/* Model Participants Icons Row */}
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
          {MOCK_THREAD.participants.length > 4 && (
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
              {MOCK_THREAD.participants.length - 4}
            </div>
          )}
        </div>

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
            {MOCK_THREAD.mode}
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
            {MOCK_THREAD.participants.length}
            {' '}
            Models
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
            {MOCK_THREAD.messagesCount}
            {' '}
            Messages
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
      width: 1200,
      height: 630,
    },
  );
}
