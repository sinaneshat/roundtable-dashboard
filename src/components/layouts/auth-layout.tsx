'use client';

import { useTranslations } from 'next-intl';

import { Logo } from '@/components/logo';
import { RadialGlow } from '@/components/ui/radial-glow';
import { BRAND } from '@/constants/brand';

type AuthLayoutProps = {
  children: React.ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  const t = useTranslations();

  return (
    <div className="relative min-h-svh">
      {/* Pulsating radial glow background - full screen coverage */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Mobile portrait (<640px wide) - 2.5x coverage */}
          <div className="block sm:hidden">
            <RadialGlow
              size={1600}
              offsetY={0}
              duration={18}
              animate={true}
              useLogoColors={true}
            />
          </div>
          {/* Tablet (640px-1024px) - 2x coverage */}
          <div className="hidden sm:block lg:hidden">
            <RadialGlow
              size={2200}
              offsetY={0}
              duration={18}
              animate={true}
              useLogoColors={true}
            />
          </div>
          {/* Desktop (1024px-1920px) - 1.8x coverage */}
          <div className="hidden lg:block 2xl:hidden">
            <RadialGlow
              size={3200}
              offsetY={0}
              duration={18}
              animate={true}
              useLogoColors={true}
            />
          </div>
          {/* Large desktop (>1920px) - 1.5x coverage */}
          <div className="hidden 2xl:block">
            <RadialGlow
              size={4500}
              offsetY={0}
              duration={18}
              animate={true}
              useLogoColors={true}
            />
          </div>
        </div>
      </div>

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
