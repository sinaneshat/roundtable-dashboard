import { Container } from '@react-email/container';
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
    margin: '40px auto',
    maxWidth: `${maxWidth}px`,
    borderRadius: borderRadius.md,
    border: `1px solid ${colors.border}`,
    padding: spacing[5],
    ...style,
  };

  return <Container style={containerStyle}>{children}</Container>;
}
