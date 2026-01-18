// IMPORTANT: Import render directly from @react-email/render, NOT from @react-email/components
// The barrel export pulls in shiki (9.8MB) and prettier (256KB) which bloats the bundle
import { render } from '@react-email/render';
import { AwsClient } from 'aws4fetch';
import type { ReactElement } from 'react';

import { BRAND } from '@/constants';

// Cross-package import: Web app imports email templates from API package for SSR email rendering
// Type definition for email template props
type MagicLinkProps = {
  userName?: string;
  loginUrl: string;
  expirationTime?: string;
};

// Lazy-loaded email template - resolved at first use
async function getMagicLinkTemplate(): Promise<(props: MagicLinkProps) => ReactElement> {
  // Dynamic import works at runtime with Vite; TypeScript can't verify cross-package types
  // This path exists at runtime but TypeScript can't resolve it during type checking
  // @ts-expect-error - Cross-package import: works at runtime, TS can't verify path
  const module = await import('../../../api/src/emails/templates');
  return module.MagicLink as (props: MagicLinkProps) => ReactElement;
}

/**
 * Get SES credentials from environment variables.
 *
 * For TanStack Start on Cloudflare Pages:
 * - In Cloudflare runtime: secrets are injected as process.env
 * - In local dev: loaded from .env files by Vite
 */
function getSesCredentials(): {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  fromEmail: string;
  replyToEmail: string;
} {
  return {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_SES_REGION || 'us-east-1',
    fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
    replyToEmail: process.env.SES_REPLY_TO_EMAIL || 'noreply@example.com',
  };
}

/**
 * Email Service using aws4fetch for Cloudflare Pages compatibility
 *
 * This service uses aws4fetch instead of @aws-sdk/client-ses because:
 * - @aws-sdk/client-ses imports node:fs which is incompatible with Cloudflare Pages runtime
 * - aws4fetch uses native Fetch API and SubtleCrypto, which work in Cloudflare Pages
 * - Reduces bundle size and improves cold start performance
 *
 * Credentials are resolved from environment variables at method call time, not module load time.
 * For TanStack Start on Cloudflare Pages: uses process.env which Vite injects from .env files.
 *
 * @see https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
 */
class EmailService {
  private async getAwsClient(): Promise<AwsClient> {
    const { accessKeyId, secretAccessKey } = await getSesCredentials();

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'Email service not configured. Please provide AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY environment variables.',
      );
    }

    return new AwsClient({ accessKeyId, secretAccessKey });
  }

  private async getConfig() {
    return getSesCredentials();
  }

  private async sendEmail({
    to,
    subject,
    html,
    text,
  }: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }) {
    // Get credentials at runtime (not module load)
    // getAwsClient throws if credentials are missing - fail fast
    const awsClient = await this.getAwsClient();
    const config = await this.getConfig();

    const toAddresses = Array.isArray(to) ? to : [to];

    // Construct SES v2 API request body
    // @see https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
    const requestBody = {
      Content: {
        Simple: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: html,
              Charset: 'UTF-8',
            },
            ...(text && {
              Text: {
                Data: text,
                Charset: 'UTF-8',
              },
            }),
          },
        },
      },
      Destination: {
        ToAddresses: toAddresses,
      },
      FromEmailAddress: config.fromEmail,
      ReplyToAddresses: [config.replyToEmail],
    };

    try {
      // Make authenticated request to SES v2 API using aws4fetch
      const response = await awsClient.fetch(
        `https://email.${config.region}.amazonaws.com/v2/email/outbound-emails`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      // Check if the request was successful
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Failed to send email via SES: ${response.status} ${response.statusText}. ${errorBody}`,
        );
      }

      // Parse and return the response
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Email sending failed:', error);
      // Re-throw with more context
      if (error instanceof Error) {
        throw new TypeError(`Email sending failed: ${error.message}`);
      }
      throw new Error('Email sending failed: Unknown error occurred');
    }
  }

  async sendMagicLink(to: string, magicLink: string, expirationMinutes = 15) {
    // Lazy-load email template at first use
    const MagicLinkComponent = await getMagicLinkTemplate();

    // Render React Email template to HTML
    // Note: Using @react-email/render directly (not barrel export from @react-email/components)
    // to avoid importing shiki (9.8MB) and prettier (256KB) - see import comment at top
    const html = await render(MagicLinkComponent({
      loginUrl: magicLink,
      expirationTime: `${expirationMinutes} minutes`,
    }));

    const text = `Sign in to ${BRAND.displayName} using this link: ${magicLink}. This link expires in ${expirationMinutes} minutes.`;

    return this.sendEmail({
      to,
      subject: `Sign in to ${BRAND.displayName}`,
      html,
      text,
    });
  }
}

// Export a singleton instance
export const emailService = new EmailService();

// Also export the class for testing or custom configurations
export { EmailService };
