import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ImageResponse } from 'next/og';

import type { ChatMode } from '@/api/core/enums';
import { MessageRoles } from '@/api/core/enums';
import {
  createCachedImageResponse,
  generateOgCacheKey,
  generateOgVersionHash,
  getOgImageFromCache,
  imageResponseToArrayBuffer,
  storeOgImageInCache,
} from '@/api/services/og-cache';
import { BRAND } from '@/constants';
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
import { getOGFonts } from '@/lib/ui/og-fonts.server';
import { getPublicThreadService } from '@/services/api';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = 'Public AI Chat Thread';
export const dynamic = 'force-dynamic';

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let r2Bucket: R2Bucket | undefined;
  try {
    const { env } = getCloudflareContext();
    r2Bucket = env.UPLOADS_R2_BUCKET as R2Bucket | undefined;
  } catch {
  }

  let threadData: Awaited<ReturnType<typeof getPublicThreadService>> | null = null;
  try {
    threadData = await getPublicThreadService({ param: { slug } });
  } catch {
  }

  if (threadData?.success && threadData.data?.thread) {
    const { thread, participants = [], messages = [] } = threadData.data;
    const versionHash = generateOgVersionHash({
      title: thread.title,
      mode: thread.mode,
      participantCount: participants.length,
      messageCount: messages.length,
      updatedAt: thread.updatedAt,
    });
    const cacheKey = generateOgCacheKey('public-thread', slug, versionHash);

    const cached = await getOgImageFromCache(r2Bucket, cacheKey);
    if (cached.found && cached.data) {
      return createCachedImageResponse(cached.data);
    }

    const imageResponse = await generateThreadOgImage(thread, participants, messages);

    if (r2Bucket) {
      imageResponseToArrayBuffer(imageResponse.clone())
        .then(buffer => storeOgImageInCache(r2Bucket, cacheKey, buffer))
        .catch(() => {});
    }

    return imageResponse;
  }

  return generateFallbackImage();
}

async function generateThreadOgImage(
  thread: { title: string; mode: string; updatedAt?: Date | string },
  participants: Array<{ modelId: string; role: string | null }>,
  messages: Array<{ role: string; content?: unknown; parts?: unknown[] }>,
) {
  const [fonts, logoBase64, robotIconBase64, messageIconBase64] = await Promise.all([
    getOGFonts(),
    getLogoBase64().catch(() => ''),
    getUIIconBase64('robot').catch(() => ''),
    getUIIconBase64('message').catch(() => ''),
  ]);

  const firstUserMessage = messages?.find(m => m.role === MessageRoles.USER);
  const firstUserText = extractTextFromMessage(firstUserMessage);
  const messagePreview = firstUserText
    ? truncateText(firstUserText, 120)
    : 'View this AI conversation';

  let modeIconBase64: string;
  try {
    modeIconBase64 = await getModeIconBase64(thread.mode);
  } catch {
    modeIconBase64 = '';
  }

  const participantIcons = await Promise.all(
    participants.slice(0, 4).map(async (p) => {
      try {
        const icon = await getModelIconBase64(p.modelId);
        return { modelId: p.modelId, role: p.role, icon };
      } catch {
        return { modelId: p.modelId, role: p.role, icon: '' };
      }
    }),
  );

  const modeColor = getModeColor(thread.mode as ChatMode);

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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 40,
            zIndex: 1,
          }}
        >
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

        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 'auto',
            zIndex: 1,
          }}
        >
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
      fonts,
    },
  );
}

async function generateFallbackImage() {
  const [fonts, logoBase64] = await Promise.all([
    getOGFonts(),
    getLogoBase64().catch(() => ''),
  ]);

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
      fonts,
    },
  );
}
