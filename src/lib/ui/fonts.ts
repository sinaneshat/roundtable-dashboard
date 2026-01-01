import localFont from 'next/font/local';

/**
 * Space Grotesk - Modern geometric sans-serif for display text
 * Perfect for tech/AI branding with its clean, minimalist aesthetic
 * Used for: Brand name, headings on marketing/auth pages
 * Note: Using local font to fix OpenNext/Cloudflare esbuild woff2 loader issue
 */
export const spaceGrotesk = localFont({
  src: '../../../public/fonts/space-grotesk/SpaceGrotesk-Variable.woff2',
  display: 'swap',
  variable: '--font-space-grotesk',
  weight: '300 700',
});
