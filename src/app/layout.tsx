// File: src/app/layout.tsx
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
import { spaceGrotesk } from '@/lib/fonts';
import { parsePreferencesCookie, PREFERENCES_COOKIE_NAME } from '@/stores/preferences';
import { createMetadata } from '@/utils/metadata';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // iOS safe area support
  themeColor: '#111113', // Blue-tinted zinc dark theme
  interactiveWidget: 'resizes-content', // Mobile keyboard handling
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

  // Get all messages for client components
  const messages = await getMessages();

  // Static locale configuration (English-only app)
  const locale = 'en';
  const timeZone = 'UTC';
  // ✅ FIX: Use undefined instead of new Date() to prevent hydration mismatch
  // Server and client will have different Date() values, causing hydration error
  // next-intl handles undefined gracefully
  const now = undefined;

  // ✅ FIX: Get base URL once for SEO components to ensure consistency
  // This prevents hydration mismatch from getBaseUrl() using window.location on client
  const baseUrl = env.NEXT_PUBLIC_APP_URL || 'https://app.roundtable.now';

  // ✅ SSR HYDRATION: Parse preferences cookie for instant store hydration
  // This prevents flash of default state on initial page load
  // Cookie is read server-side and parsed, then passed to client providers
  const cookieStore = await cookies();
  const preferencesCookie = cookieStore.get(PREFERENCES_COOKIE_NAME);
  const initialPreferences = parsePreferencesCookie(preferencesCookie?.value);

  return (
    <html
      lang="en"
      dir="ltr"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        {/* 2025 AI Search Optimization - Answer Engine Optimization */}
        <AeoMetaTags
          primaryQuestion={tAeo('primaryQuestion', { brand: BRAND.displayName })}
          primaryAnswer={tAeo('primaryAnswer')}
          contentType={tAeo('contentType') as 'guide'}
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

        {/* Core structured data for web application */}
        <StructuredData type="WebApplication" baseUrl={baseUrl} />

        {/* Enhanced SoftwareApplication schema for AI search engines */}
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
        {/* Production: PWA update detection and prompt */}
        <PWAUpdatePrompt
          messages={messages}
          locale={locale}
          timeZone={timeZone}
          now={now}
        />

        {/* Liquid Glass SVG Filter Definitions (Apple WWDC 2025) */}
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
