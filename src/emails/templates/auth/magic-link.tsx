import { BRAND } from '@/constants/brand';
import {
  EmailBody,
  EmailButton,
  EmailContainer,
  EmailFooter,
  EmailHeader,
  EmailHeading,
  EmailLayout,
  EmailLink,
  EmailPreview,
  EmailSection,
  EmailText,
  UnsubscribeFooter,
} from '@/emails/components';

type MagicLinkProps = {
  userName?: string;
  loginUrl: string;
  expirationTime?: string;
  requestIp?: string;
  requestLocation?: string;
};

export function MagicLink({
  userName,
  loginUrl,
  expirationTime = '15 minutes',
  requestIp,
  requestLocation,
}: MagicLinkProps) {
  const previewText = `Your secure login link for ${BRAND.displayName}`;

  return (
    <EmailLayout>
      <EmailBody>
        <EmailPreview text={previewText} />
        <EmailContainer>
          <EmailHeader />

          <EmailHeading level={1}>
            Sign in to
            {' '}
            <strong>{BRAND.displayName}</strong>
          </EmailHeading>

          <EmailText>
            {userName ? `Hello ${userName},` : 'Hello,'}
          </EmailText>

          <EmailText>
            Click the button below to securely sign in to your account. No password required!
          </EmailText>

          <EmailSection align="center">
            <EmailButton href={loginUrl} variant="primary" size="lg">
              Sign In Securely
            </EmailButton>
          </EmailSection>

          <EmailText size="sm" color="secondary">
            This link will expire in
            {' '}
            {expirationTime}
            {' '}
            for your security.
          </EmailText>

          <EmailText>
            Or copy and paste this URL into your browser:
            {' '}
            <EmailLink href={loginUrl}>
              {loginUrl}
            </EmailLink>
          </EmailText>

          <EmailFooter />

          <UnsubscribeFooter
            senderIp={requestIp}
            senderLocation={requestLocation}
          />
        </EmailContainer>
      </EmailBody>
    </EmailLayout>
  );
}

MagicLink.PreviewProps = {
  userName: 'Alex Morgan',
  loginUrl: 'https://example.com/magic-link?token=magic123',
  expirationTime: '15 minutes',
  requestIp: '192.168.1.1',
  requestLocation: 'San Francisco, CA',
} as MagicLinkProps;

export default MagicLink;
