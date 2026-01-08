import { Body } from '@react-email/body';
import type { CSSProperties, ReactNode } from 'react';

import { colors, spacing, typography } from '@/emails/design-tokens';

type EmailBodyProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function EmailBody({ children, style }: EmailBodyProps) {
  const bodyStyle: CSSProperties = {
    margin: '0 auto',
    backgroundColor: colors.white,
    padding: spacing[2],
    fontFamily: typography.fontFamily,
    ...style,
  };

  return <Body style={bodyStyle}>{children}</Body>;
}
