import { Link } from '@react-email/components';
import type { EmailColor } from '@roundtable/shared/enums';
import type { CSSProperties, ReactNode } from 'react';

import { colors } from '@/emails/design-tokens';

type EmailLinkProps = {
  children: ReactNode;
  href: string;
  target?: '_blank' | '_self';
  color?: EmailColor;
  style?: CSSProperties;
};

const colorStyles: Record<string, CSSProperties> = {
  dark: { color: colors.foreground },
  muted: { color: colors.mutedForeground },
  primary: { color: colors.primary },
  secondary: { color: colors.secondary },
};

export function EmailLink({
  children,
  color = 'primary',
  href,
  style,
  target = '_blank',
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
