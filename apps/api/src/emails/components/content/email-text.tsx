import { Text } from '@react-email/components';
import type { EmailColor, EmailTextWeight, TextAlignment } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { colors, typography } from '@/emails/design-tokens';

type EmailTextProps = {
  children: ReactNode;
  size?: 'sm' | 'base' | 'lg';
  weight?: EmailTextWeight;
  color?: EmailColor;
  align?: TextAlignment;
  style?: CSSProperties;
};

const sizeStyles: Record<string, CSSProperties> = {
  base: {
    fontSize: typography.fontSize.sm,
    lineHeight: '24px',
  },
  lg: {
    fontSize: typography.fontSize.base,
    lineHeight: '26px',
  },
  sm: {
    fontSize: typography.fontSize.xs,
    lineHeight: '16px',
  },
};

const weightStyles: Record<string, CSSProperties> = {
  bold: { fontWeight: typography.fontWeight.bold },
  medium: { fontWeight: typography.fontWeight.medium },
  normal: { fontWeight: typography.fontWeight.normal },
  semibold: { fontWeight: typography.fontWeight.semibold },
};

const colorStyles: Record<string, CSSProperties> = {
  error: { color: colors.destructive },
  muted: { color: colors.textMuted },
  primary: { color: colors.foreground },
  secondary: { color: colors.mutedForeground },
  white: { color: colors.white },
};

const alignStyles: Record<string, CSSProperties> = {
  center: { textAlign: 'center' },
  left: { textAlign: 'left' },
  right: { textAlign: 'right' },
};

export function EmailText({
  align = 'left',
  children,
  color = 'primary',
  size = 'base',
  style,
  weight = 'normal',
}: EmailTextProps) {
  const combinedStyle: CSSProperties = {
    fontFamily: typography.fontFamily,
    margin: '0',
    ...sizeStyles[size],
    ...weightStyles[weight],
    ...colorStyles[color],
    ...alignStyles[align],
    ...style,
  };

  return <Text style={combinedStyle}>{children}</Text>;
}

export default EmailText;
