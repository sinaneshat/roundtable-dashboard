import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import { BRAND } from '@/constants';
import { Logo } from '@/emails/components/header/logo';
import { colors, spacing, typography } from '@/emails/design-tokens';

type MagicLinkProps = {
  userName?: string;
  loginUrl: string;
  expirationTime?: string;
};

// Vercel-style email styling
const main = {
  backgroundColor: colors.background,
  fontFamily: typography.fontFamily,
  padding: spacing[4],
};

const container = {
  backgroundColor: colors.white,
  margin: '0 auto',
  maxWidth: '465px',
  padding: `${spacing[10]} ${spacing[5]} ${spacing[10]} ${spacing[5]}`,
};

const logoContainer = {
  margin: `0 0 ${spacing[6]} 0`,
  textAlign: 'center' as const,
};

const h1 = {
  color: colors.foreground,
  fontSize: typography.fontSize['2xl'],
  fontWeight: typography.fontWeight.bold,
  lineHeight: '1.25',
  margin: `0 0 ${spacing[6]} 0`,
  padding: '0',
};

const text = {
  color: colors.foreground,
  fontSize: typography.fontSize.sm,
  lineHeight: '1.5',
  margin: `0 0 ${spacing[4]} 0`,
};

const textSmall = {
  color: colors.mutedForeground,
  fontSize: typography.fontSize.xs,
  lineHeight: '1.5',
  margin: `${spacing[4]} 0`,
};

const buttonContainer = {
  margin: `${spacing[6]} 0`,
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#000000',
  borderRadius: '6px',
  color: '#FFFFFF',
  display: 'inline-block',
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.medium,
  padding: `${spacing[3]} ${spacing[6]}`,
  textAlign: 'center' as const,
  textDecoration: 'none',
};

const hr = {
  borderColor: colors.border,
  margin: `${spacing[6]} 0`,
};

const footer = {
  color: colors.mutedForeground,
  fontSize: typography.fontSize.xs,
  lineHeight: '1.5',
  margin: `${spacing[2]} 0`,
};

const link = {
  color: '#000000',
  textDecoration: 'underline',
};

export function MagicLink({
  expirationTime = '15 minutes',
  loginUrl,
  userName,
}: MagicLinkProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your secure login link for
        {' '}
        {BRAND.displayName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo centered at the top */}
          <Section style={logoContainer}>
            <Logo size={64} />
          </Section>

          <Heading style={h1}>
            Sign in to
            {' '}
            {BRAND.displayName}
          </Heading>

          <Text style={text}>
            {userName ? `Hi ${userName},` : 'Hi there,'}
          </Text>

          <Text style={text}>
            Click the button below to securely sign in to your account. No password required.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={loginUrl}>
              Sign In Securely
            </Button>
          </Section>

          <Text style={textSmall}>
            This link will expire in
            {' '}
            {expirationTime}
            {' '}
            for your security.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            Or copy and paste this URL into your browser:
            {' '}
            <Link href={loginUrl} style={link}>
              {loginUrl}
            </Link>
          </Text>

          <Text style={footer}>
            If you didn't request this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

MagicLink.PreviewProps = {
  expirationTime: '15 minutes',
  loginUrl: 'https://example.com/magic-link?token=magic123',
  userName: 'Alex Morgan',
} as MagicLinkProps;
