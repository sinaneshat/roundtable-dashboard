// File: src/app/layout.tsx
import './global.css';

import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import React from 'react';

import { AppProviders } from '@/components/providers';
import {
  AeoMetaTags,
  SoftwareApplicationSchema,
  StructuredData,
} from '@/components/seo';
import { LiquidGlassFilters } from '@/components/ui/liquid-glass-filters';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils/metadata';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: 'black', // Dark theme only
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
  children: React.ReactNode;
  modal: React.ReactNode;
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

  return (
    <html
      lang="en"
      dir="ltr"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
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
        <StructuredData type="WebApplication" />

        {/* Enhanced SoftwareApplication schema for AI search engines */}
        <SoftwareApplicationSchema
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
        >
          <main>{children}</main>
          {modal}
        </AppProviders>
      </body>
    </html>
  );
}
