import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { LogoSize, LogoVariant } from '@/api/core/enums';
import { LogoSizeMetadata, LogoSizes, LogoVariants } from '@/api/core/enums';
import { BRAND } from '@/constants';
import { cn } from '@/lib/ui/cn';

type Props = {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
};

/**
 * Logo Component - Simplified (React 19 Pattern)
 *
 * ✅ No useEffect - eliminates lifecycle unpredictability
 * ✅ No state - pure render from props
 * ✅ Single logo variant - no theme switching needed
 * ✅ Server and client render identically - no hydration issues
 * ✅ Enum-based sizing - type-safe, metadata-driven dimensions
 */
function Logo(props: Props) {
  const { size = LogoSizes.SM, variant = LogoVariants.ICON, className } = props;
  const t = useTranslations();

  // ✅ Get dimensions from metadata (enum-driven, no switch statements)
  const metadata = LogoSizeMetadata[size];
  const logoSize = variant === LogoVariants.ICON
    ? { width: metadata.width, height: metadata.height }
    : { width: metadata.widthFull, height: metadata.heightFull };

  // ✅ Single logo source - works universally on light/dark themes
  const logoSrc = BRAND.logos.main;

  return (
    <Image
      src={logoSrc}
      className={cn('object-contain', className)}
      alt={t('common.logo')}
      width={logoSize.width}
      height={logoSize.height}
      priority
    />
  );
}

export { Logo };
