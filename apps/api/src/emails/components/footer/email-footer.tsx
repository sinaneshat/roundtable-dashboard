import { BRAND } from '@/constants';

import { EmailLink } from '../content/email-link';
import { EmailSection } from '../content/email-section';
import { EmailText } from '../content/email-text';
import { EmailDivider } from '../display/email-divider';

type EmailFooterProps = {
  companyName?: string;
  unsubscribeUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  contactEmail?: string;
};

export function EmailFooter({
  companyName = BRAND.displayName,
  unsubscribeUrl,
  privacyUrl,
  termsUrl,
  contactEmail = BRAND.support,
}: EmailFooterProps) {
  return (
    <>
      <EmailDivider />
      <EmailSection align="center" spacing="md">
        <EmailText size="sm" color="muted" align="center">
          © 2025
          {' '}
          {companyName}
          . All rights reserved.
        </EmailText>

        <EmailText size="sm" color="muted" align="center">
          Questions? Contact us at
          {' '}
          <EmailLink href={`mailto:${contactEmail}`} color="muted">
            {contactEmail}
          </EmailLink>
        </EmailText>

        <EmailText size="sm" color="muted" align="center">
          {unsubscribeUrl && (
            <>
              <EmailLink href={unsubscribeUrl} color="muted">
                Unsubscribe
              </EmailLink>
              {' | '}
            </>
          )}
          {privacyUrl && (
            <>
              <EmailLink href={privacyUrl} color="muted">
                Privacy Policy
              </EmailLink>
              {termsUrl && ' | '}
            </>
          )}
          {termsUrl && (
            <EmailLink href={termsUrl} color="muted">
              Terms of Service
            </EmailLink>
          )}
        </EmailText>
      </EmailSection>
    </>
  );
}
