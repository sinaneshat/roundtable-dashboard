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
 * Left: Auth form
 * Right: Live chat demo (desktop only)
 * Radial glow spans entire page behind both columns
 */
export function AuthShowcaseLayout({ children }: AuthShowcaseLayoutProps) {
  const t = useTranslations();

  return (
    <div className="relative grid min-h-svh lg:grid-cols-2">
      {/* Radial glow background - spans entire page */}
      <div className="absolute inset-0 -z-10 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="block sm:hidden">
          <RadialGlow size={1200} offsetY={0} duration={18} animate useLogoColors />
        </div>
        <div className="hidden sm:block lg:hidden">
          <RadialGlow size={1800} offsetY={0} duration={18} animate useLogoColors />
        </div>
        <div className="hidden lg:block">
          <RadialGlow size={2400} offsetY={0} duration={18} animate useLogoColors />
        </div>
      </div>

      {/* Left Column - Auth Form */}
      <div className="relative flex flex-col gap-4 p-6 md:p-10">
        {/* Centered content wrapper */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm flex flex-col gap-6">
            {/* Logo */}
            <Logo
              size="lg"
              variant="icon"
              className="size-28 mx-auto"
            />

            {/* Welcome Header - Dual font system: Display (Space Grotesk) + Body (Geist) */}
            <div className="flex flex-col gap-3 text-center sm:text-left">
              <div className="space-y-1">
                <span className="text-xs font-normal tracking-[0.2em] uppercase text-muted-foreground/50">
                  Welcome to
                </span>
                <h1 className="text-4xl sm:text-5xl font-[family-name:var(--font-display)] font-bold tracking-[-0.02em]">
                  {BRAND.displayName}
                </h1>
              </div>
              <p className="text-sm text-muted-foreground/80 font-light leading-relaxed max-w-[280px]">
                {t('auth.layout.subtitle')}
              </p>
            </div>

            {/* Auth Form */}
            {children}
          </div>
        </div>
      </div>

      {/* Right Column - Chat Showcase (Desktop only) */}
      <div className="relative hidden lg:block p-4">
        <Card className="h-full overflow-hidden py-0 bg-card backdrop-blur-sm border-border/50">
          <LiveChatDemo />
        </Card>
      </div>
    </div>
  );
}
