'use client';

import { useTranslations } from 'next-intl';

import { Logo } from '@/components/logo';
import { BRAND } from '@/constants/brand';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  const t = useTranslations();

  return (
    <div className="relative min-h-svh">

      {/* Main content container */}
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center gap-6 sm:gap-8 p-4 sm:p-6 md:p-10">
        {/* Animated content wrapper */}
        <div className="flex w-full max-w-sm flex-col gap-6 sm:gap-8 animate-fade-in-up">
          {/* Logo section with animation */}
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

          {/* Auth form content */}
          <div className="animate-fade-in-up delay-200">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
