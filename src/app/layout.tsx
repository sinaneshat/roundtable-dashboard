import './global.css';

import { GoogleTagManager } from '@next/third-parties/google';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { DEFAULT_SEO_CONTENT_TYPE, isValidSeoContentType } from '@/api/core/enums';
import { AppProviders } from '@/components/providers';
import {
  AeoMetaTags,
  SoftwareApplicationSchema,
  StructuredData,
} from '@/components/seo';
import { LiquidGlassFilters } from '@/components/ui/liquid-glass-filters';
import { BRAND } from '@/constants';
import { cn, spaceGrotesk } from '@/lib/ui';
import { createMetadata } from '@/utils';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: 'black',
  interactiveWidget: 'resizes-content',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seo.keywords');

  return createMetadata({
    title: `${BRAND.fullName} - ${BRAND.tagline}`,
    description: BRAND.description,
    keywords: [
      t('aiCollaboration'),
      t('multipleAiModels'),
      t('brainstorming'),
      t('chatgpt'),
      t('claude'),
      t('gemini'),
      t('gpt4'),
      t('compareAi'),
      t('multiModelChat'),
      t('aiDebate'),
      t('aiProblemSolving'),
      t('bestAiChat'),
      t('chatWithMultipleAi'),
      t('aiComparisonTool'),
      t('aiChat'),
      t('collaborativeAi'),
      BRAND.name,
    ],
  });
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const env = process.env;
  const tAeo = await getTranslations('seo.aeo');
  const tFeatures = await getTranslations('seo.features');

  const messages = await getMessages();
  const locale = 'en';
  const timeZone = 'UTC';
  const now = undefined;
  const baseUrl = env.NEXT_PUBLIC_APP_URL || 'https://roundtable.now';

  const contentTypeValue = tAeo('contentType');
  const contentType = isValidSeoContentType(contentTypeValue) ? contentTypeValue : DEFAULT_SEO_CONTENT_TYPE;

  return (
    <html
      lang="en"
      dir="ltr"
      className={cn('dark', GeistSans.variable, GeistMono.variable, spaceGrotesk.variable)}
    >
      <head>
        <AeoMetaTags
          primaryQuestion={tAeo('primaryQuestion', { brand: BRAND.displayName })}
          primaryAnswer={tAeo('primaryAnswer')}
          contentType={contentType}
          entities={[
            tAeo('relatedQuestions.howItWorks'),
            tAeo('relatedQuestions.benefits'),
            tAeo('relatedQuestions.howToUse', { brand: BRAND.displayName }),
          ]}
          relatedQuestions={[
            tAeo('relatedQuestions.howItWorks'),
            tAeo('relatedQuestions.benefits'),
            tAeo('relatedQuestions.howToUse', { brand: BRAND.displayName }),
          ]}
        />
      </head>
      <body>
        {/* JSON-LD structured data - placed in body per Next.js App Router best practices */}
        <StructuredData type="WebApplication" baseUrl={baseUrl} />
        <SoftwareApplicationSchema
          baseUrl={baseUrl}
          features={[
            tFeatures('multiModelCollaboration'),
            tFeatures('realtimeChat'),
            tFeatures('sessionManagement'),
            tFeatures('publicSharing'),
            tFeatures('usageTracking'),
            tFeatures('multipleParticipants'),
          ]}
        />
        {env.NEXT_PUBLIC_WEBAPP_ENV !== 'local' && (
          <GoogleTagManager gtmId="GT-WVX5LHTL" />
        )}
        <LiquidGlassFilters />

        <main>
          <AppProviders
            locale={locale}
            messages={messages}
            timeZone={timeZone}
            now={now}
            env={{
              NEXT_PUBLIC_WEBAPP_ENV: env.NEXT_PUBLIC_WEBAPP_ENV,
              NEXT_PUBLIC_MAINTENANCE: env.NEXT_PUBLIC_MAINTENANCE,
              NEXT_PUBLIC_POSTHOG_API_KEY: env.NEXT_PUBLIC_POSTHOG_API_KEY,
              NEXT_PUBLIC_POSTHOG_HOST: env.NEXT_PUBLIC_POSTHOG_HOST,
            }}
          >
            {children}
          </AppProviders>
        </main>
      </body>
    </html>
  );
}
