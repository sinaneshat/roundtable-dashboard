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

export function AuthShowcaseLayout({ children }: AuthShowcaseLayoutProps) {
  const t = useTranslations();

  return (
    <div className="relative grid h-svh lg:grid-cols-2 overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="block sm:hidden">
          <RadialGlow size={1200} offsetY={0} duration={18} animate />
        </div>
        <div className="hidden sm:block lg:hidden">
          <RadialGlow size={1800} offsetY={0} duration={18} animate />
        </div>
        <div className="hidden lg:block">
          <RadialGlow size={2400} offsetY={0} duration={18} animate />
        </div>
      </div>

      <div className="relative flex flex-col gap-4 p-6 md:p-10 overflow-y-auto">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm flex flex-col gap-6">
            <Logo
              size="lg"
              variant="icon"
              className="size-28 mx-auto"
            />

            <div className="flex flex-col gap-3 text-left">
              <div className="space-y-1">
                <span className="text-xs font-normal tracking-[0.2em] uppercase text-muted-foreground/50">
                  {t('auth.layout.welcomeTo', { brand: BRAND.displayName })}
                </span>
              </div>
              <p className="text-sm text-muted-foreground/80 font-light leading-relaxed max-w-[280px]">
                {t('auth.layout.subtitle')}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>

      <div className="relative hidden lg:flex lg:flex-col p-6 max-h-svh">
        <Card className="flex-1 min-h-0 overflow-hidden py-0 bg-card backdrop-blur-sm border-border/50">
          <LiveChatDemo />
        </Card>
      </div>
    </div>
  );
}
