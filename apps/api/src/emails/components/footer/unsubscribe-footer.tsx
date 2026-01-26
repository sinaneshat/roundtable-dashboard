import type { CSSProperties } from 'react';

import { colors } from '@/emails/design-tokens';

import { EmailLink } from '../content/email-link';
import { EmailText } from '../content/email-text';

type UnsubscribeFooterProps = {
  recipientEmail?: string;
  unsubscribeUrl?: string;
  senderIp?: string;
  senderLocation?: string;
  style?: CSSProperties;
};

const highlightStyle: CSSProperties = {
  color: colors.foreground,
  fontWeight: '500',
};

export function UnsubscribeFooter({
  recipientEmail,
  senderIp,
  senderLocation,
  style,
  unsubscribeUrl,
}: UnsubscribeFooterProps) {
  return (
    <EmailText size="sm" color="muted" {...(style !== undefined && { style })}>
      {recipientEmail && (
        <>
          This email was intended for
          {' '}
          <span style={highlightStyle}>{recipientEmail}</span>
          .
          {' '}
        </>
      )}

      {senderIp && senderLocation && (
        <>
          This email was sent from
          {' '}
          <span style={highlightStyle}>{senderIp}</span>
          {' '}
          located in
          {' '}
          <span style={highlightStyle}>{senderLocation}</span>
          .
          {' '}
        </>
      )}

      If you were not expecting this email, you can ignore it.
      {' '}

      {unsubscribeUrl && (
        <>
          You can also
          {' '}
          <EmailLink href={unsubscribeUrl} color="muted">
            unsubscribe from these emails
          </EmailLink>
          .
          {' '}
        </>
      )}

      If you are concerned about your account's safety, please reply to this email to get in touch with us.
    </EmailText>
  );
}
