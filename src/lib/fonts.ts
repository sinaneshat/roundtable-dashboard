import { Space_Grotesk } from 'next/font/google';

/**
 * Space Grotesk - Modern geometric sans-serif for display text
 * Perfect for tech/AI branding with its clean, minimalist aesthetic
 * Used for: Brand name, headings on marketing/auth pages
 */
export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
});
