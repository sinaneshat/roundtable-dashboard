/**
 * Font Configuration
 *
 * Using system font stack for optimal performance and native feel.
 * No custom fonts loaded - uses the same approach as ChatGPT.
 */

/**
 * System font stack - uses native OS fonts for best performance
 */
export const systemFonts = {
  className: 'font-sans',
  style: {
    fontFamily: '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif',
  },
  variable: '--font-sans',
};

/**
 * System font family string for use in Tailwind config or inline styles
 */
export const FONT_FAMILY_SYSTEM = '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif';
