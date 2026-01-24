/**
 * Video Progress Indicator
 * Shows 7 dots at bottom-center indicating which scene is active.
 */

import { interpolate, useCurrentFrame } from 'remotion';

const SCENE_COUNT = 7;

type VideoProgressIndicatorProps = {
  /** Cumulative frame offsets where each scene starts */
  sceneStarts: number[];
  /** Total duration (for reference) */
  totalDuration: number;
};

export function VideoProgressIndicator({ sceneStarts }: VideoProgressIndicatorProps) {
  const frame = useCurrentFrame();

  // Fade in after frame 10
  const enterOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Determine active scene
  let activeScene = 0;
  for (let i = sceneStarts.length - 1; i >= 0; i--) {
    if (frame >= (sceneStarts[i] ?? 0)) {
      activeScene = i;
      break;
    }
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8,
      opacity: enterOpacity,
      zIndex: 50,
    }}
    >
      {Array.from({ length: SCENE_COUNT }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            opacity: i === activeScene ? 1 : 0.25,
            transition: 'opacity 0.3s',
          }}
        />
      ))}
    </div>
  );
}
