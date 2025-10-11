// File: src/app/layout.tsx
import './global.css';

import type { Metadata, Viewport } from 'next';
import { getMessages } from 'next-intl/server';
import React from 'react';

import {
  AeoMetaTags,
  SoftwareApplicationSchema,
  StructuredData,
} from '@/components/seo';
import { BRAND } from '@/constants/brand';
import { RootLayout } from '@/containers/layouts/root';
import { createMetadata } from '@/utils/metadata';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: 'black', // Dark theme only
};

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: BRAND.fullName,
    description: BRAND.description,
    keywords: [
      'AI collaboration',
      'multiple AI models',
      'brainstorming',
      'ChatGPT',
      'Claude',
      'Gemini',
      `${BRAND.displayName} discussion`,
      'AI chat',
      'collaborative AI',
      'team productivity',
    ],
  });
}

type RootLayoutProps = {
  children: React.ReactNode;
  modal: React.ReactNode;
};

export default async function Layout({ children, modal }: RootLayoutProps) {
  const translations = await getMessages();
  const env = process.env;

  return (
    <html
      lang="en"
      dir="ltr"
      className="dark"
    >
      <head>
        {/* 2025 AI Search Optimization - Answer Engine Optimization */}
        <AeoMetaTags
          primaryQuestion={`What is ${BRAND.displayName}?`}
          primaryAnswer="A collaborative AI platform where multiple AI models work together to brainstorm, solve problems, and generate ideas in real-time conversations."
          contentType="guide"
          entities={[
            'AI collaboration',
            'ChatGPT',
            'Claude',
            'Gemini',
            'artificial intelligence',
            'brainstorming',
            'productivity',
          ]}
          relatedQuestions={[
            'How does AI collaboration work?',
            'What are the benefits of multiple AI models?',
            `How to use ${BRAND.displayName} for brainstorming?`,
          ]}
        />
      </head>
      <body>
        {/* Core structured data for web application */}
        <StructuredData type="WebApplication" />

        {/* Enhanced SoftwareApplication schema for AI search engines */}
        <SoftwareApplicationSchema
          features={[
            'Multi-model AI collaboration',
            'Real-time chat interface',
            'Session management',
            'Public sharing capabilities',
            'Usage tracking and analytics',
            'Multiple AI participants per conversation',
          ]}
        />

        <RootLayout
          locale="en"
          translations={translations as Record<string, unknown>}
          modal={modal}
          env={{
            NEXT_PUBLIC_WEBAPP_ENV: env.NEXT_PUBLIC_WEBAPP_ENV,
            NEXT_PUBLIC_MAINTENANCE: env.NEXT_PUBLIC_MAINTENANCE,
          }}
        >
          {children}
        </RootLayout>
      </body>
    </html>
  );
}
