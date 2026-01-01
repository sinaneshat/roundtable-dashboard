import './global.css';

import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AppProviders } from '@/components/providers';
import { PWAUpdatePrompt } from '@/components/pwa/pwa-update-prompt';
import {
  AeoMetaTags,
  SoftwareApplicationSchema,
  StructuredData,
} from '@/components/seo';
import { LiquidGlassFilters } from '@/components/ui/liquid-glass-filters';
import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';
import { spaceGrotesk } from '@/lib/ui/fonts';
import { parsePreferencesCookie, PREFERENCES_COOKIE_NAME } from '@/stores/preferences';
import { createMetadata } from '@/utils';

const VALID_CONTENT_TYPES = ['how-to', 'comparison', 'review', 'guide', 'faq', 'tutorial'] as const;
type ContentType = (typeof VALID_CONTENT_TYPES)[number];

function isValidContentType(value: string): value is ContentType {
  return (VALID_CONTENT_TYPES as readonly string[]).includes(value);
}

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
    title: BRAND.fullName,
    description: BRAND.description,
    keywords: [
      t('aiCollaboration'),
      t('multipleAiModels'),
      t('brainstorming'),
      t('chatgpt'),
      t('claude'),
      t('gemini'),
      `${BRAND.displayName} discussion`,
      t('aiChat'),
      t('collaborativeAi'),
      t('teamProductivity'),
    ],
  });
}

type RootLayoutProps = {
  children: ReactNode;
  modal: ReactNode;
};

export default async function Layout({ children, modal }: RootLayoutProps) {
  const env = process.env;
  const tAeo = await getTranslations('seo.aeo');
  const tFeatures = await getTranslations('seo.features');

  const messages = await getMessages();
  const locale = 'en';
  const timeZone = 'UTC';
  const now = undefined;
  const baseUrl = env.NEXT_PUBLIC_APP_URL || 'https://app.roundtable.now';

  const cookieStore = await cookies();
  const preferencesCookie = cookieStore.get(PREFERENCES_COOKIE_NAME);
  const initialPreferences = parsePreferencesCookie(preferencesCookie?.value);

  const contentTypeValue = tAeo('contentType');
  const contentType = isValidContentType(contentTypeValue) ? contentTypeValue : 'guide';

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
      </head>
      <body>
        <PWAUpdatePrompt
          messages={messages}
          locale={locale}
          timeZone={timeZone}
          now={now}
        />
        <LiquidGlassFilters />

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
          initialPreferences={initialPreferences}
        >
          <main>{children}</main>
          {modal}
        </AppProviders>
      </body>
    </html>
  );
}
