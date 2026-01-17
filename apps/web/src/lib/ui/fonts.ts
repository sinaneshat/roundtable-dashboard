/**
 * Font Configuration for TanStack Start
 *
 * Using CSS @font-face with Google Fonts CDN instead of next/font.
 * Add the font import in the root HTML or CSS file.
 *
 * Add this to your CSS:
 * @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
 *
 * Or add this to your HTML <head>:
 * <link rel="preconnect" href="https://fonts.googleapis.com" />
 * <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
 * <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
 */

/**
 * Space Grotesk - Modern geometric sans-serif for display text
 * Perfect for tech/AI branding with its clean, minimalist aesthetic
 * Used for: Brand name, headings on marketing/auth pages
 */
export const spaceGrotesk = {
  className: 'font-space-grotesk',
  variable: '--font-space-grotesk',
  style: {
    fontFamily: '\'Space Grotesk\', sans-serif',
  },
};

/**
 * Font CSS variable for use in Tailwind config
 */
export const FONT_FAMILY_SPACE_GROTESK = '\'Space Grotesk\', sans-serif';
