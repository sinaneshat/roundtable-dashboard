/**
 * Shared skeleton utilities - single source of truth for skeleton patterns
 */

/**
 * Preset width values for sidebar thread list skeletons
 * Used to create visual variety in loading states
 */
export const SIDEBAR_SKELETON_WIDTHS = [
  '70%',
  '55%',
  '85%',
  '45%',
  '65%',
  '78%',
  '52%',
  '62%',
  '48%',
  '73%',
  '58%',
  '80%',
  '42%',
  '67%',
  '54%',
] as const;

/**
 * Calculate opacity for skeleton items based on index
 * Creates a fade-out effect for items further down the list
 */
export function getSkeletonOpacity(index: number): number {
  if (index < 4)
    return 1;
  if (index < 5)
    return 0.7;
  if (index < 6)
    return 0.5;
  return 0.3;
}

/**
 * Get width value from preset array for a given index
 */
export function getSkeletonWidth(index: number): string {
  return SIDEBAR_SKELETON_WIDTHS[index % SIDEBAR_SKELETON_WIDTHS.length];
}
