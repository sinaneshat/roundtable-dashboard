import { Button } from '@react-email/components';
import type { ComponentSize } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { borderRadius, colors, spacing, typography } from '@/emails/design-tokens';

type EmailButtonProps = {
  children: ReactNode;
  href: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: Extract<ComponentSize, 'sm' | 'md' | 'lg'>;
  style?: CSSProperties;
  target?: '_blank' | '_self';
};

const variantStyles: Record<string, CSSProperties> = {
  outline: {
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.foreground,
  },
  primary: {
    backgroundColor: colors.primary,
    border: `1px solid ${colors.primary}`,
    color: colors.primaryForeground,
  },
  secondary: {
    backgroundColor: colors.secondary,
    border: `1px solid ${colors.border}`,
    color: colors.secondaryForeground,
  },
};

const sizeStyles: Record<string, CSSProperties> = {
  lg: {
    fontSize: typography.fontSize.base,
    padding: `${spacing[4]} ${spacing[6]}`,
  },
  md: {
    fontSize: typography.fontSize.sm,
    padding: `${spacing[3]} ${spacing[5]}`,
  },
  sm: {
    fontSize: typography.fontSize.xs,
    padding: `${spacing[2]} ${spacing[3]}`,
  },
};

export function EmailButton({
  children,
  href,
  size = 'md',
  style,
  target = '_blank',
  variant = 'primary',
}: EmailButtonProps) {
  const baseStyle: CSSProperties = {
    borderRadius: borderRadius.md,
    display: 'inline-block',
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    textDecoration: 'none',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  };

  return (
    <Button
      style={baseStyle}
      href={href}
      target={target}
    >
      {children}
    </Button>
  );
}

export default EmailButton;
