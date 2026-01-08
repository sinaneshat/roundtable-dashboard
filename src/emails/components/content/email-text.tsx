import { Text } from '@react-email/text';
import type { CSSProperties, ReactNode } from 'react';

import type { EmailColor, EmailTextWeight, TextAlignment } from '@/api/core/enums';
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
  sm: {
    fontSize: typography.fontSize.xs,
    lineHeight: '16px',
  },
  base: {
    fontSize: typography.fontSize.sm,
    lineHeight: '24px',
  },
  lg: {
    fontSize: typography.fontSize.base,
    lineHeight: '26px',
  },
};

const weightStyles: Record<string, CSSProperties> = {
  normal: { fontWeight: typography.fontWeight.normal },
  medium: { fontWeight: typography.fontWeight.medium },
  semibold: { fontWeight: typography.fontWeight.semibold },
  bold: { fontWeight: typography.fontWeight.bold },
};

const colorStyles: Record<string, CSSProperties> = {
  primary: { color: colors.foreground },
  secondary: { color: colors.mutedForeground },
  muted: { color: colors.textMuted },
  white: { color: colors.white },
  error: { color: colors.destructive },
};

const alignStyles: Record<string, CSSProperties> = {
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
};

export function EmailText({
  children,
  size = 'base',
  weight = 'normal',
  color = 'primary',
  align = 'left',
  style,
}: EmailTextProps) {
  const combinedStyle: CSSProperties = {
    margin: '0',
    fontFamily: typography.fontFamily,
    ...sizeStyles[size],
    ...weightStyles[weight],
    ...colorStyles[color],
    ...alignStyles[align],
    ...style,
  };

  return <Text style={combinedStyle}>{children}</Text>;
}

export default EmailText;
