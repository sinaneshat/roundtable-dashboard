import { Column } from '@react-email/column';
import { Row } from '@react-email/row';
import { Section } from '@react-email/section';
import type { CSSProperties, ReactNode } from 'react';

import { BRAND } from '@/constants';
import { colors, spacing } from '@/emails/design-tokens';

import { EmailLink } from '../content/email-link';
import { EmailText } from '../content/email-text';
import { EmailDivider } from '../display/email-divider';

type EmailBrandFooterProps = {
  companyName?: string;
  unsubscribeUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  contactEmail?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

// Simple minimal footer

export function EmailBrandFooter({
  companyName = BRAND.displayName,
  unsubscribeUrl,
  privacyUrl,
  termsUrl,
  contactEmail = BRAND.support,
  style,
  children,
}: EmailBrandFooterProps) {
  const footerStyle: CSSProperties = {
    padding: `${spacing[6]} ${spacing[4]}`,
    textAlign: 'center',
    ...style,
  };

  return (
    <>
      <EmailDivider />

      <Section style={footerStyle}>

        {children}

        <Row>
          <Column align="center">
            <EmailText size="sm" color="muted" align="center">
              ©
              {' '}
              {new Date().getFullYear()}
              {' '}
              {companyName}
              . All rights reserved.
            </EmailText>

            {contactEmail && (
              <EmailText size="sm" color="muted" align="center" style={{ margin: `${spacing[2]} 0` }}>
                Questions? Contact us at
                {' '}
                <EmailLink
                  href={`mailto:${contactEmail}`}
                  style={{ color: colors.mutedForeground }}
                >
                  {contactEmail}
                </EmailLink>
              </EmailText>
            )}

            <EmailText size="sm" color="muted" align="center">
              {unsubscribeUrl && (
                <>
                  <EmailLink
                    href={unsubscribeUrl}
                    style={{ color: colors.mutedForeground }}
                  >
                    Unsubscribe
                  </EmailLink>
                  {(privacyUrl || termsUrl) && ' • '}
                </>
              )}
              {privacyUrl && (
                <>
                  <EmailLink
                    href={privacyUrl}
                    style={{ color: colors.mutedForeground }}
                  >
                    Privacy Policy
                  </EmailLink>
                  {termsUrl && ' • '}
                </>
              )}
              {termsUrl && (
                <EmailLink
                  href={termsUrl}
                  style={{ color: colors.mutedForeground }}
                >
                  Terms of Service
                </EmailLink>
              )}
            </EmailText>
          </Column>
        </Row>
      </Section>
    </>
  );
}
