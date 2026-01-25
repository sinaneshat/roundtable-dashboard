/**
 * Focus Transition Hook
 * Creates blur-to-clear camera focus effect
 */

import { interpolate } from 'remotion';

type FocusTransitionOptions = {
  frame: number;
  startFrame: number;
  duration?: number;
  maxBlur?: number;
};

export function createFocusTransition({
  frame,
  startFrame,
  duration = 30,
  maxBlur = 20,
}: FocusTransitionOptions) {
  const blur = interpolate(
    frame,
    [startFrame, startFrame + duration],
    [maxBlur, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' },
  );

  return {
    filter: blur > 0.5 ? `blur(${blur}px)` : undefined,
    blur,
  };
}
