import randomColor from 'randomcolor';

/**
 * Role Color Assignment Utility
 *
 * Uses the randomcolor library to generate visually distinct, attractive colors
 * for AI roles with deterministic seeding based on role names.
 *
 * Features:
 * - Consistent colors for the same role name (seeded generation)
 * - Visually distinct, attractive colors via randomcolor library
 * - Uses inline styles for reliability (no Tailwind purging issues)
 * - Wide variety of distinct hues
 *
 * @see https://github.com/davidmerfield/randomColor
 */

// Predefined role colors - using rgba format for inline styles
// Standard short role names (used in preset cards) - 5 categories
const PREDEFINED_ROLE_COLORS: Record<string, { bgColor: string; iconColor: string }> = {
  // Standard short role names (for preset card display)
  'Ideator': { bgColor: 'rgba(34, 197, 94, 0.2)', iconColor: '#4ade80' }, // green
  'Strategist': { bgColor: 'rgba(59, 130, 246, 0.2)', iconColor: '#60a5fa' }, // blue
  'Analyst': { bgColor: 'rgba(6, 182, 212, 0.2)', iconColor: '#22d3ee' }, // cyan
  'Builder': { bgColor: 'rgba(249, 115, 22, 0.2)', iconColor: '#fb923c' }, // orange
  'Critic': { bgColor: 'rgba(236, 72, 153, 0.2)', iconColor: '#f472b6' }, // pink

  // Legacy full role names (for backwards compatibility)
  'The Ideator': { bgColor: 'rgba(34, 197, 94, 0.2)', iconColor: '#4ade80' }, // green
  'Devil\'s Advocate': { bgColor: 'rgba(236, 72, 153, 0.2)', iconColor: '#f472b6' }, // pink
  'Practical Evaluator': { bgColor: 'rgba(236, 72, 153, 0.2)', iconColor: '#f472b6' }, // pink
  'Visionary Thinker': { bgColor: 'rgba(34, 197, 94, 0.2)', iconColor: '#4ade80' }, // green
  'Domain Expert': { bgColor: 'rgba(6, 182, 212, 0.2)', iconColor: '#22d3ee' }, // cyan
  'User Advocate': { bgColor: 'rgba(6, 182, 212, 0.2)', iconColor: '#22d3ee' }, // cyan
  'Implementation Strategist': { bgColor: 'rgba(59, 130, 246, 0.2)', iconColor: '#60a5fa' }, // blue
  'The Data Analyst': { bgColor: 'rgba(6, 182, 212, 0.2)', iconColor: '#22d3ee' }, // cyan
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

  // For custom roles, generate color using randomcolor with seed
  const seed = hashString(roleName);

  // Generate a bright, vibrant color using randomcolor
  const hexColor = randomColor({
    luminosity: 'bright',
    seed,
    format: 'hex',
  });

  // Return colors for inline styles
  return {
    bgColor: hexToRgba(hexColor, 0.2), // 20% opacity for background
    iconColor: hexColor, // Full opacity for icon
  };
}

/**
 * Default color for "No role" option
 */
export const NO_ROLE_COLOR = {
  bgColor: 'rgba(100, 116, 139, 0.2)', // slate with 20% opacity
  iconColor: '#94a3b8', // slate-400
} as const;

/**
 * Shorten role names for compact display
 * Maps verbose role names to single-word display labels
 */
export function getShortRoleName(role: string): string {
  const roleMap: Record<string, string> = {
    // Ideation/Creative roles → Ideator
    'The Ideator': 'Ideator',
    'Ideator': 'Ideator',
    'Lateral Thinker': 'Ideator',
    'Visionary Thinker': 'Ideator',
    'Framer': 'Ideator',
    'Alternative Framer': 'Ideator',

    // Strategy/Reasoning roles → Strategist
    'Structured Reasoner': 'Strategist',
    'Deep Reasoner': 'Strategist',
    'Systems Thinker': 'Strategist',
    'Position Advocate': 'Strategist',
    'Proposer': 'Strategist',
    'Implementation Strategist': 'Strategist',

    // Analysis roles → Analyst
    'The Data Analyst': 'Analyst',
    'Trade-Off Analyst': 'Analyst',
    'Trade-off Clarifier': 'Analyst',
    'Evidence Gatherer': 'Analyst',
    'Cross-Checker': 'Analyst',
    'Alternative Lens': 'Analyst',
    'Nuancer': 'Analyst',

    // Building/Implementation roles → Builder
    'Builder': 'Builder',
    'Implementer': 'Builder',
    'Synthesizer': 'Builder',

    // Critical/Skeptical roles → Critic
    'Devil\'s Advocate': 'Critic',
    'Assumption Challenger': 'Critic',
    'Assumption Critic': 'Critic',
    'Skeptic': 'Critic',
    'Contrarian': 'Critic',
    'Correctness Reviewer': 'Critic',
    'Practical Evaluator': 'Critic',

    // Legacy moderation roles → redistributed to other categories
    'Mediator': 'Analyst',
    'Grounding Voice': 'Critic',
    'User Advocate': 'Analyst',
    'Domain Expert': 'Analyst',
    'Secondary Theorist': 'Analyst',
  };

  return roleMap[role] || role;
}

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
    color: lightenColor(baseColor, 0.2), // Lighter for text
    borderColor: hexToRgba(baseColor, 0.3), // 30% opacity for border
  };
}
