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
  sm: {
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  md: {
    marginTop: spacing[6],
    marginBottom: spacing[6],
  },
  lg: {
    marginTop: spacing[8],
    marginBottom: spacing[8],
  },
};

const alignStyles: Record<string, CSSProperties> = {
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
};

export function EmailSection({
  children,
  spacing: spacingProp = 'md',
  align = 'left',
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
