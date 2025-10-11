import { Column, Row, Section } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

import { BRAND } from '@/constants/brand';
import { assets, spacing } from '@/emails/design-tokens';

type EmailBrandHeaderProps = {
  children?: ReactNode;
  showLogo?: boolean;
  logoWidth?: number;
  logoHeight?: number;
  padding?: 'sm' | 'md' | 'lg';
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
  logoWidth = 120,
  logoHeight = 40,
  padding = 'md',
  style,
}: EmailBrandHeaderProps) {
  const baseStyle: CSSProperties = {
    textAlign: 'center',
    backgroundColor: 'transparent',
    ...paddingStyles[padding],
    ...style,
  };

  const logoSrc = assets.logo;

  return (
    <Section style={baseStyle}>
      <Row>
        <Column align="center">
          {showLogo && (
            <div style={{ marginBottom: children ? spacing[4] : '0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                width={logoWidth}
                height={logoHeight}
                alt={`${BRAND.displayName} Logo`}
                style={{ display: 'block', margin: '0 auto' }}
              />
            </div>
          )}
          {children}
        </Column>
      </Row>
    </Section>
  );
}
