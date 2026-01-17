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
  primary: {
    backgroundColor: colors.primary,
    color: colors.primaryForeground,
    border: `1px solid ${colors.primary}`,
  },
  secondary: {
    backgroundColor: colors.secondary,
    color: colors.secondaryForeground,
    border: `1px solid ${colors.border}`,
  },
  outline: {
    backgroundColor: 'transparent',
    color: colors.foreground,
    border: `1px solid ${colors.border}`,
  },
};

const sizeStyles: Record<string, CSSProperties> = {
  sm: {
    padding: `${spacing[2]} ${spacing[3]}`,
    fontSize: typography.fontSize.xs,
  },
  md: {
    padding: `${spacing[3]} ${spacing[5]}`,
    fontSize: typography.fontSize.sm,
  },
  lg: {
    padding: `${spacing[4]} ${spacing[6]}`,
    fontSize: typography.fontSize.base,
  },
};

export function EmailButton({
  children,
  href,
  variant = 'primary',
  size = 'md',
  style,
  target = '_blank',
}: EmailButtonProps) {
  const baseStyle: CSSProperties = {
    borderRadius: borderRadius.md,
    fontFamily: typography.fontFamily,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    textDecoration: 'none',
    display: 'inline-block',
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
