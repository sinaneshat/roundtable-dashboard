'use client';

import { Logo } from '@/components/logo';
import { Card } from '@/components/ui/card';
import { RadialGlow } from '@/components/ui/radial-glow';
import { useTranslations } from '@/lib/i18n';

import { LiveChatDemoLazy } from './live-chat-demo-lazy';

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
          <div className="w-full max-w-md flex flex-col gap-8">
            <Logo
              size="lg"
              variant="icon"
              className="size-32 mx-auto"
            />

            <div className="flex flex-col gap-3">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                {t('auth.layout.headline')}
              </h1>
              <p className="text-base text-muted-foreground/80 font-light leading-relaxed">
                {t('auth.layout.subtitle')}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>

      <div className="relative hidden lg:flex lg:flex-col p-6 max-h-svh">
        <Card className="flex-1 min-h-0 overflow-hidden py-0 bg-card backdrop-blur-sm border-border/50">
          <LiveChatDemoLazy />
        </Card>
      </div>
    </div>
  );
}
