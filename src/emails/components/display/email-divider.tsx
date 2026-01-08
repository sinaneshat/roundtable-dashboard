import { Hr } from '@react-email/hr';
import type { CSSProperties } from 'react';

import { colors, spacing } from '@/emails/design-tokens';

type EmailDividerProps = {
  style?: CSSProperties;
};

export function EmailDivider({ style }: EmailDividerProps) {
  const dividerStyle: CSSProperties = {
    borderColor: colors.border,
    margin: `${spacing[4]} 0`,
    ...style,
  };

  return <Hr style={dividerStyle} />;
}

export default EmailDivider;
