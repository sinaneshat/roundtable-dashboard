import { render } from '@react-email/components';
import { AwsClient } from 'aws4fetch';

import { BRAND } from '@/constants';

type EmailConfig = {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  fromEmail?: string;
  replyToEmail?: string;
};

/**
 * Email Service using aws4fetch for Cloudflare Workers compatibility
 *
 * This service uses aws4fetch instead of @aws-sdk/client-ses because:
 * - @aws-sdk/client-ses imports node:fs which is incompatible with Cloudflare Workers edge runtime
 * - aws4fetch uses native Fetch API and SubtleCrypto, which work in edge environments
 * - Reduces bundle size and improves cold start performance
 *
 * @see https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
 */
class EmailService {
  private awsClient: AwsClient | null = null;
  private fromEmail: string;
  private replyToEmail: string;
  private region: string;

  constructor(config?: EmailConfig) {
    const accessKeyId = config?.accessKeyId || process.env.AWS_SES_ACCESS_KEY_ID;
    const secretAccessKey = config?.secretAccessKey || process.env.AWS_SES_SECRET_ACCESS_KEY;
    this.region = config?.region || process.env.NEXT_PUBLIC_AWS_SES_REGION || 'us-east-1';

    if (accessKeyId && secretAccessKey) {
      this.awsClient = new AwsClient({
        accessKeyId,
        secretAccessKey,
      });
    }

    this.fromEmail = config?.fromEmail || process.env.NEXT_PUBLIC_FROM_EMAIL || 'noreply@example.com';
    this.replyToEmail = config?.replyToEmail || process.env.NEXT_PUBLIC_SES_REPLY_TO_EMAIL || this.fromEmail;
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
    // Validate AWS client is configured
    if (!this.awsClient) {
      throw new Error(
        'Email service not configured. Please provide AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY environment variables.',
      );
    }

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
      FromEmailAddress: this.fromEmail,
      ReplyToAddresses: [this.replyToEmail],
    };

    try {
      // Make authenticated request to SES v2 API using aws4fetch
      const response = await this.awsClient.fetch(
        `https://email.${this.region}.amazonaws.com/v2/email/outbound-emails`,
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
      // Re-throw with more context
      if (error instanceof Error) {
        throw new TypeError(`Email sending failed: ${error.message}`);
      }
      throw new Error('Email sending failed: Unknown error occurred');
    }
  }

  async sendMagicLink(to: string, magicLink: string, expirationMinutes = 15) {
    // Dynamic import to avoid Next.js build issues with React Email components
    // Works with Cloudflare Workers when serverExternalPackages is configured in next.config.ts
    const { LoginEmail } = await import('@/emails/templates');

    // Render React Email template to HTML
    // Note: Using @react-email/components instead of @react-email/render
    // to avoid edge runtime export resolution issues in Cloudflare Workers
    const html = await render(LoginEmail({
      loginUrl: magicLink,
      expirationMinutes,
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
