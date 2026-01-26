import { Heading } from '@react-email/components';
import type { TextAlignment } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { colors, spacing, typography } from '@/emails/design-tokens';

type EmailHeadingProps = {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4;
  align?: Exclude<TextAlignment, 'justify'>;
  style?: CSSProperties;
};

const headingStyles: Record<number, CSSProperties> = {
  1: {
    color: colors.foreground,
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: '36px',
  },
  2: {
    color: colors.foreground,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: '30px',
  },
  3: {
    color: colors.foreground,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: '26px',
  },
  4: {
    color: colors.foreground,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.normal,
  },
};

const alignStyles: Record<string, CSSProperties> = {
  center: { textAlign: 'center' },
  left: { textAlign: 'left' },
  right: { textAlign: 'right' },
};

export function EmailHeading({
  align = 'center',
  children,
  level = 1,
  style,
}: EmailHeadingProps) {
  const combinedStyle: CSSProperties = {
    fontFamily: typography.fontFamily,
    margin: `${spacing[8]} 0`,
    padding: '0',
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
