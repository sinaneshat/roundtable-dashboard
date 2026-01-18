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
  brand: colors.primary,
  accent: colors.accent,
  destructive: colors.destructive,
  secondary: colors.textSecondary,
};

export function EmailHighlight({
  children,
  color = 'brand',
  weight = 'semibold',
  style,
}: EmailHighlightProps) {
  const weightMap: Record<string, string> = {
    medium: typography.fontWeight.medium,
    semibold: typography.fontWeight.semibold,
    bold: typography.fontWeight.bold,
  };

  const highlightStyle: CSSProperties = {
    color: colorStyles[color as NonNullable<EmailHighlightProps['color']>],
    fontWeight: weightMap[weight] ?? typography.fontWeight.semibold,
    ...style,
  };

  return <span style={highlightStyle}>{children}</span>;
}

export default EmailHighlight;
