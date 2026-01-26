import type { LogoSize, LogoVariant } from '@roundtable/shared';
import { LogoSizeMetadata, LogoSizes, LogoVariants } from '@roundtable/shared';

import Image from '@/components/ui/image';
import { BRAND } from '@/constants';
import { useTranslations } from '@/lib/i18n';
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
  const { className, size = LogoSizes.SM, variant = LogoVariants.ICON } = props;
  const t = useTranslations();

  // ✅ Get dimensions from metadata (enum-driven, no switch statements)
  const metadata = LogoSizeMetadata[size];
  const logoSize = variant === LogoVariants.ICON
    ? { height: metadata.height, width: metadata.width }
    : { height: metadata.heightFull, width: metadata.widthFull };

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
