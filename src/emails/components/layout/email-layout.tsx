/* eslint-disable simple-import-sort/imports */

import { Html as EmailHtml, Head, pixelBasedPreset, Tailwind } from '@react-email/components';
import type { ReactNode } from 'react';

type EmailLayoutProps = {
  children: ReactNode;
  lang?: string;
  dir?: 'ltr' | 'rtl';
};

export function EmailLayout({
  children,
  lang = 'en',
  dir = 'ltr',
}: EmailLayoutProps) {
  return (
    <EmailHtml lang={lang} dir={dir}>
      <Head />
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                'brand-primary': '#22D3EE',
                'brand-primary-hover': '#0FBCDB',
                'brand-secondary': '#14B8A6',
                'brand-secondary-hover': '#0D9488',
                'brand-dark': '#1F2937',
                'brand-light': '#F9FAFB',
              },
              fontFamily: {
                system: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
              },
            },
          },
        }}
      >
        {children}
      </Tailwind>
    </EmailHtml>
  );
}
