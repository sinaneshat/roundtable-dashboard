import { Section } from '@react-email/components';
import type { EmailSpacing, TextAlignment } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { spacing } from '@/emails/design-tokens';

type EmailSectionProps = {
  children: ReactNode;
  spacing?: EmailSpacing;
  align?: Exclude<TextAlignment, 'justify'>;
  style?: CSSProperties;
};

const spacingStyles: Record<string, CSSProperties> = {
  lg: {
    marginBottom: spacing[8],
    marginTop: spacing[8],
  },
  md: {
    marginBottom: spacing[6],
    marginTop: spacing[6],
  },
  sm: {
    marginBottom: spacing[4],
    marginTop: spacing[4],
  },
};

const alignStyles: Record<string, CSSProperties> = {
  center: { textAlign: 'center' },
  left: { textAlign: 'left' },
  right: { textAlign: 'right' },
};

export function EmailSection({
  align = 'left',
  children,
  spacing: spacingProp = 'md',
  style,
}: EmailSectionProps) {
  const combinedStyle: CSSProperties = {
    ...spacingStyles[spacingProp],
    ...alignStyles[align],
    ...style,
  };

  return <Section style={combinedStyle}>{children}</Section>;
}

export default EmailSection;
