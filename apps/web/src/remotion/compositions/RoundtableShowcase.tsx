/**
 * RoundtableShowcase - Product Video (~51 seconds)
 *
 * Streamlined production video with unified scenes:
 * - 7 scenes using TransitionSeries
 * - Exact component replicas from the app
 * - Simple fade transitions between scenes
 * - Enhanced chromatic aberration at transition peaks
 * - Background music support
 *
 * Scene Structure:
 * 01 Intro (3s)        - Logo reveal
 * 02 Homepage (3s)     - Hero section
 * 03 Sidebar (2.5s)    - Navigation
 * 04 ChatInput (10s)   - Unified: auto mode, models, files, voice, typing
 * 05 ModelModal (10s)  - Tabs, presets, custom, drag reorder
 * 06 ChatThread (24s)  - Unified: user msg → web search → placeholders → streaming → moderator
 * 07 Finale (5s)       - Grand finale with CTA
 */

import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { ChromaticAberration } from '../components/ChromaticAberration';
import { VideoProgressIndicator } from '../components/VideoProgressIndicator';
// Scene imports
import { Scene01Intro } from './showcase-scenes/Scene01Intro';
import { Scene02Homepage } from './showcase-scenes/Scene02Homepage';
import { Scene03Sidebar } from './showcase-scenes/Scene03Sidebar';
import { Scene17Finale } from './showcase-scenes/Scene17Finale';
import { SceneChatInput } from './showcase-scenes/SceneChatInput';
import { SceneChatThread } from './showcase-scenes/SceneChatThread';
import { SceneModelModal } from './showcase-scenes/SceneModelModal';

// Transition timing presets
const FAST_TRANSITION = linearTiming({ durationInFrames: 15 });
const NORMAL_TRANSITION = linearTiming({ durationInFrames: 24 });
const SLOW_TRANSITION = linearTiming({ durationInFrames: 36 });

// Transition frame positions for chromatic aberration
const TRANSITION_FRAMES = [90, 165, 231, 531, 813, 1521];

/**
 * Scene durations in frames at 30fps
 *
 * Total: ~1645 frames (~54.8 seconds)
 */
const SCENE_DURATIONS = {
  // === INTRO & NAVIGATION (8.5s) ===
  intro: 90, // 3s - Logo reveal with depth effects
  homepage: 90, // 3s - Hero section showcase
  sidebar: 75, // 2.5s - Navigation and thread list

  // === UNIFIED INPUT FEATURES (10s) ===
  chatInput: 300, // 10s - Auto mode, models, files, voice, typing - ALL IN ONE

  // === MODEL SELECTION (10s) ===
  modelModal: 300, // 10s - Tabs, presets, custom, drag reorder

  // === THE CONVERSATION - CORE FEATURE (24s) ===
  chatThread: 720, // 24s - Full roundtable conversation with all participants and moderator

  // === FINALE (5s) ===
  finale: 150, // 5s - Grand finale with CTA
} as const;

/**
 * Audio component for ODESZA "A Moment Apart"
 * Trims the song to start at the melodic build (~1:00) and syncs
 * key musical moments with scene transitions
 */
function ShowcaseAudio() {
  const { fps } = useVideoConfig();
  const total = getShowcaseDuration();

  // Start at 1:00 (60 seconds) into the song - skip ambient intro
  // This aligns the melodic piano build with our intro
  const AUDIO_START_OFFSET = 60 * fps; // 1800 frames

  return (
    <Audio
      src={staticFile('static/music/showcase-bg.mp3')}
      startFrom={AUDIO_START_OFFSET}
      volume={(f) => {
        // Volume envelope optimized for "A Moment Apart" structure
        // The song builds from piano to full synth around 30s into our clip
        const baseVolume = interpolate(
          f,
          [
            0, // Start
            30, // Quick fade in
            231, // End of navigation scenes
            531, // ChatInput done, about to hit ModelModal
            813, // ChatThread starts - main drop should hit here
            870, // Deep into ChatThread
            total - 120, // Start fade out
            total, // End
          ],
          [0, 0.35, 0.4, 0.45, 0.55, 0.55, 0.45, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        // Boost at scene transitions for impact
        const transitionBoost = TRANSITION_FRAMES.reduce((boost, transFrame) => {
          const dist = Math.abs(f - transFrame);
          if (dist < 20) {
            return Math.max(boost, interpolate(dist, [0, 20], [0.15, 0], { extrapolateRight: 'clamp' }));
          }
          return boost;
        }, 0);

        return Math.min(baseVolume + transitionBoost, 0.65);
      }}
    />
  );
}

export function RoundtableShowcase() {
  useCurrentFrame();

  return (
    <>
      {/* Enhanced chromatic aberration at transitions */}
      <ChromaticAberration
        transitionFrames={TRANSITION_FRAMES}
        maxShift={8}
        duration={15}
        baseOpacity={0.2}
      />

      {/* Progress dots indicator */}
      <VideoProgressIndicator
        sceneStarts={[0, 90, 165, 231, 531, 813, 1521]}
        totalDuration={getShowcaseDuration()}
      />

      {/* Background music - ODESZA "A Moment Apart"
          Trim starts at ~1:00 to skip slow intro, get melodic build
          Scene mapping:
          - 0-8.5s (Intro/Homepage/Sidebar): Melodic piano build
          - 8.5-18.5s (ChatInput): Rising progression
          - 18.5-28.5s (ModelModal): Energy building
          - 28.5-52.5s (ChatThread): Main drop aligned with core feature
          - 52.5-57.5s (Finale): Emotional peak for CTA
      */}
      <ShowcaseAudio />
      <TransitionSeries>
        {/* Scene 1: Epic Intro with Logo */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.intro}>
          <Scene01Intro />
        </TransitionSeries.Sequence>

        {/* Transition 1: Intro → Homepage */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={NORMAL_TRANSITION}
        />

        {/* Scene 2: Homepage Hero */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.homepage}>
          <Scene02Homepage />
        </TransitionSeries.Sequence>

        {/* Transition 2: Homepage → Sidebar */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={FAST_TRANSITION}
        />

        {/* Scene 3: Sidebar Navigation */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.sidebar}>
          <Scene03Sidebar />
        </TransitionSeries.Sequence>

        {/* Transition 3: Sidebar → ChatInput */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={FAST_TRANSITION}
        />

        {/* Scene 4: Unified Chat Input - ALL INPUT FEATURES */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.chatInput}>
          <SceneChatInput />
        </TransitionSeries.Sequence>

        {/* Transition 4: ChatInput → ModelModal */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={NORMAL_TRANSITION}
        />

        {/* Scene 5: Model Selection Modal with Tabs */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.modelModal}>
          <SceneModelModal />
        </TransitionSeries.Sequence>

        {/* Transition 5: ModelModal → ChatThread */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={NORMAL_TRANSITION}
        />

        {/* Scene 6: Unified Chat Thread - THE CORE FEATURE */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.chatThread}>
          <SceneChatThread />
        </TransitionSeries.Sequence>

        {/* Transition 6: ChatThread → Finale */}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={SLOW_TRANSITION}
        />

        {/* Scene 7: Grand Finale */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.finale}>
          <Scene17Finale />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
}

/**
 * Calculate total duration accounting for transitions
 */
export function getShowcaseDuration(): number {
  const sceneDurations = Object.values(SCENE_DURATIONS);
  const totalSceneDuration = sceneDurations.reduce((a, b) => a + b, 0);

  // 6 transitions between 7 scenes (updated for 3D transitions)
  // Transition breakdown:
  // - 2 FAST_TRANSITION (15 frames each) = 30 frames
  // - 3 NORMAL_TRANSITION (24 frames each) = 72 frames
  // - 1 SLOW_TRANSITION (36 frames) = 36 frames
  // Total transition overlap: ~138 frames
  const transitionOverlap = 138;

  return totalSceneDuration - transitionOverlap;
}
