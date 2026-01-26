import { Body } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

import { colors, spacing, typography } from '@/emails/design-tokens';

type EmailBodyProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function EmailBody({ children, style }: EmailBodyProps) {
  const bodyStyle: CSSProperties = {
    backgroundColor: colors.white,
    fontFamily: typography.fontFamily,
    margin: '0 auto',
    padding: spacing[2],
    ...style,
  };

  return <Body style={bodyStyle}>{children}</Body>;
}
