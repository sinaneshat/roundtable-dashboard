import { Section } from '@react-email/section';
import type { ReactNode } from 'react';

import { Logo } from './logo';

type EmailHeaderProps = {
  children?: ReactNode;
  className?: string;
  showLogo?: boolean;
  logoSize?: number;
};

export function EmailHeader({
  children,
  className = 'mt-[32px]',
  showLogo = true,
  logoSize = 80,
}: EmailHeaderProps) {
  return (
    <Section className={className}>
      {showLogo && (
        <Logo size={logoSize} />
      )}
      {children}
    </Section>
  );
}
