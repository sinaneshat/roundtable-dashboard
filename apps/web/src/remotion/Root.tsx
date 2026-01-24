import { Composition, Folder } from 'remotion';

import { getShowcaseDuration, RoundtableShowcase } from './compositions/RoundtableShowcase';

// Showcase video config - dynamic duration based on scene needs
// No artificial time constraints - video should be as long as needed to show features properly
const SHOWCASE_FPS = 30;

export function RemotionRoot() {
  // Calculate duration dynamically from scene durations
  const durationFrames = getShowcaseDuration();

  return (
    <Folder name="Marketing">
      <Composition
        id="RoundtableShowcase"
        component={RoundtableShowcase}
        durationInFrames={durationFrames}
        fps={SHOWCASE_FPS}
        width={1920}
        height={1080}
      />
    </Folder>
  );
}
