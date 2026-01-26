import type { EmailTextWeight } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { colors, typography } from '@/emails/design-tokens';

type EmailHighlightProps = {
  children: ReactNode;
  color?: 'brand' | 'accent' | 'destructive' | 'secondary';
  weight?: Exclude<EmailTextWeight, 'normal'>;
  style?: CSSProperties;
};

const colorStyles: Record<NonNullable<EmailHighlightProps['color']>, string> = {
  accent: colors.accent,
  brand: colors.primary,
  destructive: colors.destructive,
  secondary: colors.textSecondary,
};

export function EmailHighlight({
  children,
  color = 'brand',
  style,
  weight = 'semibold',
}: EmailHighlightProps) {
  const weightMap: Record<string, string> = {
    bold: typography.fontWeight.bold,
    medium: typography.fontWeight.medium,
    semibold: typography.fontWeight.semibold,
  };

  const highlightStyle: CSSProperties = {
    color: colorStyles[color as NonNullable<EmailHighlightProps['color']>],
    fontWeight: weightMap[weight] ?? typography.fontWeight.semibold,
    ...style,
  };

  return <span style={highlightStyle}>{children}</span>;
}

export default EmailHighlight;
