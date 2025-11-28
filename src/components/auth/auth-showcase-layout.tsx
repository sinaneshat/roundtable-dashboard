'use client';

import { useTranslations } from 'next-intl';

import { Logo } from '@/components/logo';
import { Card } from '@/components/ui/card';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants/brand';

import { LiveChatDemo } from './live-chat-demo';

type AuthShowcaseLayoutProps = {
  children: React.ReactNode;
};

/**
 * Two-column authentication layout following shadcn login block patterns
 * Left: Auth form with radial glow background
 * Right: Live chat demo (desktop only)
 */
export function AuthShowcaseLayout({ children }: AuthShowcaseLayoutProps) {
  const t = useTranslations();

  return (
    <div className="relative grid h-svh md:grid-cols-2 overflow-hidden">
      {/* Radial glow background - centered on page, projecting outwards */}
      <div className="absolute inset-0 -z-10 pointer-events-none flex items-center justify-center">
        {/* Mobile portrait (<640px wide) */}
        <div className="block sm:hidden">
          <RadialGlow
            size={1200}
            offsetY={0}
            duration={18}
            animate={true}
            useLogoColors={true}
          />
        </div>
        {/* Tablet (640px-1024px) */}
        <div className="hidden sm:block lg:hidden">
          <RadialGlow
            size={1800}
            offsetY={0}
            duration={18}
            animate={true}
            useLogoColors={true}
          />
        </div>
        {/* Desktop (1024px+) */}
        <div className="hidden lg:block">
          <RadialGlow
            size={2400}
            offsetY={0}
            duration={18}
            animate={true}
            useLogoColors={true}
          />
        </div>
      </div>

      {/* Left Column - Auth Form */}
      <div className="relative flex flex-col items-center justify-center gap-6 p-6 md:p-10">

        {/* Content */}
        <div className="flex w-full max-w-sm flex-col gap-6">
          {/* Logo & Brand */}
          <div className="flex flex-col items-center gap-8">
            <Logo
              size="lg"
              variant="icon"
              className="w-16 h-16 sm:w-20 sm:h-20"
            />
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl sm:text-4xl font-bold tracking-tight">
                {BRAND.displayName}
              </span>
              <p className="text-sm sm:text-base text-muted-foreground text-center">
                {t('auth.layout.subtitle')}
              </p>
            </div>
          </div>

          {/* Auth Form */}
          {children}
        </div>
      </div>

      {/* Right Column - Chat Showcase (Tablet & Desktop) */}
      <div className="relative hidden md:flex md:flex-col p-3 lg:p-4 overflow-hidden">
        {/* Floating glass card */}
        <Card
          className="w-full h-full min-h-0 shadow-2xl overflow-hidden py-0"
        >
          <LiveChatDemo />
        </Card>
      </div>
    </div>
  );
}
