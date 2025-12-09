import randomColor from 'randomcolor';

/**
 * Role Color Assignment Utility
 *
 * Uses muted, desaturated colors for role badges to reduce visual noise.
 * Colors have subtle tints for differentiation while maintaining a calm UI.
 *
 * Features:
 * - Consistent colors for the same role name (seeded generation)
 * - Muted, desaturated colors to avoid visual noise
 * - Subtle tints (warm/cool grays) for role differentiation
 * - Uses inline styles for reliability (no Tailwind purging issues)
 *
 * @see https://github.com/davidmerfield/randomColor
 */

// Predefined role colors - muted, desaturated tints for subtle differentiation
const PREDEFINED_ROLE_COLORS: Record<string, { bgColor: string; iconColor: string }> = {
  'The Ideator': { bgColor: 'rgba(180, 165, 130, 0.1)', iconColor: '#a89880' }, // warm gray
  'Devil\'s Advocate': { bgColor: 'rgba(170, 140, 140, 0.1)', iconColor: '#a08888' }, // muted rose
  'Builder': { bgColor: 'rgba(140, 155, 175, 0.1)', iconColor: '#8898a8' }, // cool gray
  'Practical Evaluator': { bgColor: 'rgba(145, 165, 145, 0.1)', iconColor: '#889888' }, // sage
  'Visionary Thinker': { bgColor: 'rgba(160, 150, 170, 0.1)', iconColor: '#9890a0' }, // muted lavender
  'Domain Expert': { bgColor: 'rgba(150, 150, 165, 0.1)', iconColor: '#909098' }, // slate blue
  'User Advocate': { bgColor: 'rgba(145, 165, 160, 0.1)', iconColor: '#889890' }, // muted teal
  'Implementation Strategist': { bgColor: 'rgba(175, 155, 140, 0.1)', iconColor: '#a09080' }, // warm taupe
  'The Data Analyst': { bgColor: 'rgba(145, 160, 165, 0.1)', iconColor: '#889098' }, // cool slate
} as const;

/**
 * Simple hash function for seeding randomcolor
 * Uses DJB2 hash algorithm - fast and distributes well
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Convert hex color to rgba format with alpha channel
 */
function hexToRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Desaturate a hex color by mixing with gray
 * @param hexColor - The hex color to desaturate
 * @param amount - Amount to desaturate (0 = original, 1 = fully gray)
 */
function desaturateColor(hexColor: string, amount: number): string {
  const hex = hexColor.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  // Calculate grayscale value
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

  // Mix original color with gray
  const newR = Math.round(r + (gray - r) * amount);
  const newG = Math.round(g + (gray - g) * amount);
  const newB = Math.round(b + (gray - b) * amount);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Get colors for a role name using randomcolor library
 * Always returns the same colors for the same role name (deterministic via seed)
 *
 * @param roleName - The name of the role
 * @returns Object with bgColor (hex with alpha) and iconColor (hex) for inline styles
 *
 * @example
 * const colors = getRoleColors('The Ideator');
 * // Returns: { bgColor: '#eab30833', iconColor: '#facc15' }
 */
export function getRoleColors(roleName: string): {
  bgColor: string;
  iconColor: string;
} {
  // Check if it's a predefined role first
  const predefinedColor = PREDEFINED_ROLE_COLORS[roleName];
  if (predefinedColor) {
    return predefinedColor;
  }

  // For custom roles, generate muted color using randomcolor with seed
  const seed = hashString(roleName);

  // Generate a light, desaturated color using randomcolor
  const hexColor = randomColor({
    luminosity: 'light',
    seed,
    format: 'hex',
  });

  // Desaturate the color further for subtle tints
  const desaturatedColor = desaturateColor(hexColor, 0.6);

  // Return colors for inline styles
  return {
    bgColor: hexToRgba(desaturatedColor, 0.1), // 10% opacity for subtle background
    iconColor: desaturatedColor, // Muted color for text/icon
  };
}

/**
 * Default color for "No role" option
 */
export const NO_ROLE_COLOR = {
  bgColor: 'rgba(150, 155, 160, 0.1)', // neutral gray with 10% opacity
  iconColor: '#909498', // muted gray
} as const;

/**
 * Lighten a hex color by a percentage
 */
function lightenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);

  const newR = Math.min(255, Math.round(r + (255 - r) * percent));
  const newG = Math.min(255, Math.round(g + (255 - g) * percent));
  const newB = Math.min(255, Math.round(b + (255 - b) * percent));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Get badge style object for a role name
 * Badge colors have a different pattern than icon colors (border, background, text)
 *
 * @param roleName - The name of the role
 * @returns Style object for inline badge styling
 *
 * @example
 * const badgeStyle = getRoleBadgeStyle('The Ideator');
 * // Returns: { backgroundColor: '#eab30833', color: '#fde047', borderColor: '#eab3084d' }
 */
export function getRoleBadgeStyle(roleName: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  const colors = getRoleColors(roleName);
  const baseColor = colors.iconColor;

  return {
    backgroundColor: colors.bgColor,
    color: lightenColor(baseColor, 0.15), // Slightly lighter for text readability
    borderColor: hexToRgba(baseColor, 0.2), // 20% opacity for subtle border
  };
}
