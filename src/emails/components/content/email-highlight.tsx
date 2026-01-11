import type { CSSProperties, ReactNode } from 'react';

import type { EmailTextWeight } from '@/api/core/enums';
import { colors, typography } from '@/emails/design-tokens';

type EmailHighlightProps = {
  children: ReactNode;
  color?: 'brand' | 'accent' | 'destructive' | 'secondary';
  weight?: Exclude<EmailTextWeight, 'normal'>;
  style?: CSSProperties;
};

const colorStyles: Record<string, string> = {
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
  const highlightStyle: CSSProperties = {
    color: colorStyles[color],
    fontWeight: typography.fontWeight[weight],
    ...style,
  };

  return <span style={highlightStyle}>{children}</span>;
}

export default EmailHighlight;
