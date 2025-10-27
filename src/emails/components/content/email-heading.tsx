import { Heading } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

import { colors, spacing, typography } from '@/emails/design-tokens';

type EmailHeadingProps = {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4;
  align?: 'left' | 'center' | 'right';
  style?: CSSProperties;
};

const headingStyles: Record<number, CSSProperties> = {
  1: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: '36px',
    color: colors.foreground,
  },
  2: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: '30px',
    color: colors.foreground,
  },
  3: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: '26px',
    color: colors.foreground,
  },
  4: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.normal,
    color: colors.foreground,
  },
};

const alignStyles: Record<string, CSSProperties> = {
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
};

export function EmailHeading({
  children,
  level = 1,
  align = 'center',
  style,
}: EmailHeadingProps) {
  const combinedStyle: CSSProperties = {
    margin: `${spacing[8]} 0`,
    padding: '0',
    fontFamily: typography.fontFamily,
    ...headingStyles[level],
    ...alignStyles[align],
    ...style,
  };

  return (
    <Heading as={`h${level}` as const} style={combinedStyle}>
      {children}
    </Heading>
  );
}

export default EmailHeading;
