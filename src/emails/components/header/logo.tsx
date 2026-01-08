import { Img } from '@react-email/img';

import { BRAND } from '@/constants';
import { assets } from '@/emails/design-tokens';

type LogoProps = {
  size?: number;
};

/**
 * Logo Component for Email Templates
 *
 * Loads the logo from URL. The logo PNG must be hosted and accessible
 * for email clients to display it properly.
 */
export function Logo({ size = 60 }: LogoProps) {
  return (
    <Img
      src={assets.logo}
      width={size}
      height={size}
      alt={`${BRAND.displayName} Logo`}
      style={{
        display: 'block',
        margin: '0 auto',
        borderRadius: '50%',
      }}
    />
  );
}
