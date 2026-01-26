import { Container } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

import { borderRadius, colors, spacing } from '@/emails/design-tokens';

type EmailContainerProps = {
  children: ReactNode;
  maxWidth?: number;
  style?: CSSProperties;
};

export function EmailContainer({
  children,
  maxWidth = 465,
  style,
}: EmailContainerProps) {
  const containerStyle: CSSProperties = {
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    margin: '40px auto',
    maxWidth: `${maxWidth}px`,
    padding: spacing[5],
    ...style,
  };

  return <Container style={containerStyle}>{children}</Container>;
}
