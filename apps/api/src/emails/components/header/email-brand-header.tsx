import { Column, Row, Section } from '@react-email/components';
import type { EmailSpacing } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { spacing } from '@/emails/design-tokens';

import { Logo } from './logo';

type EmailBrandHeaderProps = {
  children?: ReactNode;
  showLogo?: boolean;
  logoSize?: number;
  padding?: EmailSpacing;
  style?: CSSProperties;
};

// Simple header without background colors

const paddingStyles: Record<string, CSSProperties> = {
  sm: {
    padding: `${spacing[6]} ${spacing[4]}`,
  },
  md: {
    padding: `${spacing[8]} ${spacing[6]}`,
  },
  lg: {
    padding: `${spacing[10]} ${spacing[8]}`,
  },
};

export function EmailBrandHeader({
  children,
  showLogo = true,
  logoSize = 60,
  padding = 'md',
  style,
}: EmailBrandHeaderProps) {
  const baseStyle: CSSProperties = {
    textAlign: 'center',
    backgroundColor: 'transparent',
    ...paddingStyles[padding],
    ...style,
  };

  return (
    <Section style={baseStyle}>
      <Row>
        <Column align="center">
          {showLogo && (
            <div style={{ marginBottom: children ? spacing[4] : '0' }}>
              <Logo size={logoSize} />
            </div>
          )}
          {children}
        </Column>
      </Row>
    </Section>
  );
}
