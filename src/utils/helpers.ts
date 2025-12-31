/**
 * Get the base URL dynamically based on environment
 */
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
