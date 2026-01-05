'use client';

import { useTranslations } from 'next-intl';

import { Logo } from '@/components/logo';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  const t = useTranslations();

  return (
    <div className="relative min-h-svh">
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="block sm:hidden">
            <RadialGlow
              size={600}
              offsetY={0}
              duration={18}
              animate={true}
            />
          </div>
          <div className="hidden sm:block lg:hidden">
            <RadialGlow
              size={900}
              offsetY={0}
              duration={18}
              animate={true}
            />
          </div>
          <div className="hidden lg:block 2xl:hidden">
            <RadialGlow
              size={1200}
              offsetY={0}
              duration={18}
              animate={true}
            />
          </div>
          <div className="hidden 2xl:block">
            <RadialGlow
              size={1600}
              offsetY={0}
              duration={18}
              animate={true}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center gap-6 sm:gap-8 p-4 sm:p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6 sm:gap-8 animate-fade-in-up">
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <div className="flex items-center gap-3 sm:gap-4">
              <Logo
                size="lg"
                variant="icon"
                className="transition-all duration-500 ease-out w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20"
              />
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <span className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                  {BRAND.displayName}
                </span>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t('auth.layout.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="animate-fade-in-up delay-200">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
