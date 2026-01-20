// Use renderToString from react-dom/server for Cloudflare Workers compatibility
// @react-email/render uses renderToReadableStream which isn't available in Workers runtime
import { AwsClient } from 'aws4fetch';
import { env as workersEnv } from 'cloudflare:workers';
import { renderToString } from 'react-dom/server';

import { BRAND } from '@/constants';
import { MagicLink } from '@/emails/templates';

/**
 * Get SES credentials from Cloudflare Workers bindings
 * Priority: Cloudflare Workers env → process.env fallback
 */
async function getSesCredentials(): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  fromEmail: string;
  replyToEmail: string;
}> {
  // Try Cloudflare Workers bindings first
  try {
    return {
      accessKeyId: workersEnv.AWS_SES_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY_ID || '',
      secretAccessKey: workersEnv.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SES_SECRET_ACCESS_KEY || '',
      region: workersEnv.AWS_SES_REGION || process.env.AWS_SES_REGION || 'us-east-1',
      fromEmail: workersEnv.FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@example.com',
      replyToEmail: workersEnv.SES_REPLY_TO_EMAIL || process.env.SES_REPLY_TO_EMAIL || 'noreply@example.com',
    };
  } catch {
    // Fallback to process.env for local dev
    return {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_SES_REGION || 'us-east-1',
      fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
      replyToEmail: process.env.SES_REPLY_TO_EMAIL || 'noreply@example.com',
    };
  }
}

/**
 * Email Service using aws4fetch for Cloudflare Workers compatibility
 *
 * This service uses aws4fetch instead of @aws-sdk/client-ses because:
 * - @aws-sdk/client-ses imports node:fs which is incompatible with Cloudflare Workers
 * - aws4fetch uses native Fetch API and SubtleCrypto, which work in Cloudflare Workers
 * - Reduces bundle size and improves cold start performance
 *
 * Uses cloudflare:workers env bindings with process.env fallback for local dev.
 * Credentials are resolved at method call time, not module load time.
 *
 * @see https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
 */
class EmailService {
  private async getAwsClient(): Promise<AwsClient> {
    const { accessKeyId, secretAccessKey } = await getSesCredentials();

    if (!accessKeyId || !secretAccessKey) {
      console.error({
        log_type: 'ses_credentials_missing',
        timestamp: new Date().toISOString(),
        has_access_key: Boolean(accessKeyId),
        has_secret_key: Boolean(secretAccessKey),
      });
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
        console.error({
          log_type: 'ses_api_error',
          timestamp: new Date().toISOString(),
          status: response.status,
          statusText: response.statusText,
          error_body: errorBody.slice(0, 500),
          region: config.region,
        });
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
    // Render React Email template to HTML using renderToString (sync)
    // Cloudflare Workers doesn't support renderToReadableStream used by @react-email/render
    const markup = renderToString(MagicLink({
      loginUrl: magicLink,
      expirationTime: `${expirationMinutes} minutes`,
    }));
    // Add DOCTYPE for proper email rendering
    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">${markup}`;

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
