'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'full';
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
};

function Logo(props: Props) {
  const { size = 'sm', variant = 'icon', theme = 'auto', className } = props;
  const { theme: systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const t = useTranslations('common');

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const logoSize = (() => {
    if (variant === 'icon') {
      switch (size) {
        case 'sm':
          return { width: 40, height: 40 };
        case 'md':
          return { width: 60, height: 60 };
        case 'lg':
          return { width: 80, height: 80 };
        default:
          return { width: 40, height: 40 };
      }
    } else {
      switch (size) {
        case 'sm':
          return { width: 100, height: 100 };
        case 'md':
          return { width: 160, height: 160 };
        case 'lg':
          return { width: 240, height: 240 };
        default:
          return { width: 100, height: 100 };
      }
    }
  })();

  // Determine which logo to use based on theme
  const getLogoSrc = () => {
    const isDark = theme === 'dark' || (theme === 'auto' && systemTheme === 'dark');

    if (variant === 'icon') {
      return isDark ? BRAND.logos.iconDark : BRAND.logos.iconLight;
    } else {
      // For full variant, use the round PNG logo
      return BRAND.logos.round;
    }
  };

  // Use a default logo before mounting to prevent hydration mismatch
  const logoSrc = mounted ? getLogoSrc() : BRAND.logos.round;

  return (
    <Image
      src={logoSrc}
      className={cn('object-contain', className)}
      alt={t('logo')}
      width={logoSize.width}
      height={logoSize.height}
      priority
    />
  );
}

export { Logo };
