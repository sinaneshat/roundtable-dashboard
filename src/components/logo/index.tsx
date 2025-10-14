import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'full';
  className?: string;
};

/**
 * Logo Component - Simplified (React 19 Pattern)
 *
 * ✅ No useEffect - eliminates lifecycle unpredictability
 * ✅ No state - pure render from props
 * ✅ Single logo variant - no theme switching needed
 * ✅ Server and client render identically - no hydration issues
 */
function Logo(props: Props) {
  const { size = 'sm', variant = 'icon', className } = props;
  const t = useTranslations('common');

  // ✅ Compute dimensions during render (no useEffect needed)
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

  // ✅ Single logo source - works universally on light/dark themes
  const logoSrc = BRAND.logos.main;

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
