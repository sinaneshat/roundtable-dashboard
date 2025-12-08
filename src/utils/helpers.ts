import { getCloudflareContext } from '@opennextjs/cloudflare';

export type EnvVars = Omit<NodeJS.ProcessEnv, 'NODE_ENV'> & CloudflareEnv;

// Get environment variables based on runtime context
// This complex logic is REQUIRED for OpenNext.js + Cloudflare Workers deployment
export function getEnvironmentVariables(): EnvVars {
  // Start with empty object
  let environment: EnvVars = {} as EnvVars;

  // First try globalThis.process.env (set by test setup in Workers)
  if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env) {
    environment = { ...environment, ...globalThis.process.env } as EnvVars;
  }

  // Then merge with process.env (works in Node.js and most environments)
  if (typeof process !== 'undefined' && process.env) {
    // In some environments (like Cloudflare Workers), process.env properties are non-enumerable
    // Try multiple approaches to access environment variables

    // First, try common environment variables by name
    const commonVars = [
      'NODE_ENV',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_WEBAPP_ENV',
      'VERCEL_URL',
      'D1_TOKEN',
      'SIGNED_URL_SECRET',
    ];

    for (const key of commonVars) {
      if (key in process.env && process.env[key] !== undefined) {
        environment[key] = process.env[key];
      }
    }

    // Try Object.getOwnPropertyNames for non-enumerable properties
    const propertyNames = Object.getOwnPropertyNames(process.env);
    for (const key of propertyNames) {
      if (process.env[key] !== undefined) {
        environment[key] = process.env[key];
      }
    }

    // Try for..in iteration as a fallback
    for (const key in process.env) {
      if (process.env[key] !== undefined) {
        environment[key] = process.env[key];
      }
    }
  }

  // If we're in the browser, use window.env if available
  if (typeof window !== 'undefined') {
    const windowWithEnv = window as unknown as { env: EnvVars };
    if ('env' in windowWithEnv && windowWithEnv.env) {
      return { ...environment, ...windowWithEnv.env };
    }
  }

  // For Cloudflare Workers, try to get the Cloudflare environment
  // Only attempt this in production or preview (NOT local development)
  const isLocal = process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';
  const isNextDev = process.env.NODE_ENV === 'development' && !process.env.CLOUDFLARE_ENV;

  if (typeof process !== 'undefined' && !isLocal && !isNextDev) {
    try {
      const ctx = getCloudflareContext();
      if (ctx && ctx.env) {
        // Extract only string environment variables from Cloudflare environment
        // Filter out non-string bindings like KV, R2, etc.
        const cloudflareStringEnv: EnvVars = {} as EnvVars;
        for (const [key, value] of Object.entries(ctx.env)) {
          if (typeof value === 'string' || value === undefined) {
            cloudflareStringEnv[key] = value;
          }
        }
        environment = { ...environment, ...cloudflareStringEnv };
      }
    } catch {
      // Ignore errors if Cloudflare context isn't available
    }
  }

  return environment;
}

// Get the base URL dynamically
export function getBaseUrl(): string {
  // First try configured environment variable
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    return configuredUrl.trim().replace(/\/+$/, ''); // Trim and remove trailing slashes
  }

  // Try VERCEL_URL if available
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // If we're in the browser, use the current location
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    return `${protocol}//${host}`;
  }

  // Default fallback
  return 'https://app.roundtable.now';
}

// Export env as a getter for dynamic environment variables
