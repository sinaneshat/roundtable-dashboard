import { Link } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

import { colors } from '@/emails/design-tokens';

type EmailLinkProps = {
  children: ReactNode;
  href: string;
  target?: '_blank' | '_self';
  color?: 'primary' | 'secondary' | 'dark' | 'muted';
  style?: CSSProperties;
};

const colorStyles: Record<string, CSSProperties> = {
  primary: { color: colors.primary },
  secondary: { color: colors.secondary },
  dark: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
};

export function EmailLink({
  children,
  href,
  target = '_blank',
  color = 'primary',
  style,
}: EmailLinkProps) {
  const combinedStyle: CSSProperties = {
    textDecoration: 'underline',
    ...colorStyles[color],
    ...style,
  };

  return (
    <Link href={href} target={target} style={combinedStyle}>
      {children}
    </Link>
  );
}

export default EmailLink;
