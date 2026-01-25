/**
 * RoundtableShowcase - Product Video (~95 seconds)
 *
 * Streamlined production video with unified scenes:
 * - 7 scenes using TransitionSeries
 * - Exact component replicas from the app
 * - Simple fade transitions between scenes
 * - Enhanced chromatic aberration at transition peaks
 * - Background music support
 * - J-cut technique: captions lead visual changes by ~15 frames
 *
 * Scene Structure:
 * 01 Intro (5s)        - Logo reveal (extended for impact)
 * 02 Homepage (5s)     - Meet the AI Council
 * 03 Sidebar (4s)      - Choose Your Workspace
 * 04 ChatInput (36s)   - Unified: auto mode, models, files, voice, typing (5-6s per feature)
 * 05 ModelModal (13s)  - Tabs, presets, custom, drag reorder
 * 06 ChatThread (21s)  - Unified: user msg → web search → placeholders → streaming → moderator
 * 07 Finale (5s)       - Grand finale with CTA
 */

import { springTiming, TransitionSeries } from '@remotion/transitions';
import { Audio, interpolate, staticFile, useCurrentFrame } from 'remotion';

import { ChromaticAberration } from '../components/ChromaticAberration';
import { CINEMATIC_SPRINGS, TRANSITION_SPRINGS } from '../lib/cinematic-springs';
import {
  chromaticZoom,
  depthFade,
  depthZoom,
  parallaxPush,
  spatialCameraOrbit,
  zoomThrough,
} from '../transitions';
// Scene imports
import { Scene01Intro } from './showcase-scenes/Scene01Intro';
import { Scene02Homepage } from './showcase-scenes/Scene02Homepage';
import { Scene03Sidebar } from './showcase-scenes/Scene03Sidebar';
import { Scene17Finale } from './showcase-scenes/Scene17Finale';
import { SceneChatInput } from './showcase-scenes/SceneChatInput';
import { SceneChatThread } from './showcase-scenes/SceneChatThread';
import { SceneModelModal } from './showcase-scenes/SceneModelModal';

// Transition timing presets - using spring timing for cinematic feel
const FAST_TRANSITION = springTiming({
  config: TRANSITION_SPRINGS.depthFade,
  durationInFrames: 18,
});
const NORMAL_TRANSITION = springTiming({
  config: TRANSITION_SPRINGS.depthZoom,
  durationInFrames: 28,
});
const SLOW_TRANSITION = springTiming({
  config: TRANSITION_SPRINGS.chromaticZoom,
  durationInFrames: 36,
});
// Special transitions for key moments
const ORBIT_TRANSITION = springTiming({
  config: TRANSITION_SPRINGS.cameraOrbit,
  durationInFrames: 30,
});
const DRAMATIC_TRANSITION = springTiming({
  config: CINEMATIC_SPRINGS.impactMoment,
  durationInFrames: 32,
});

// Transition frame positions for chromatic aberration
// Updated: intro extended to 150 frames (5s), chatInput to 1080 frames (36s)
const TRANSITION_FRAMES = [150, 276, 381, 1446, 1812, 2418];

/**
 * Scene durations in frames at 30fps
 *
 * Total: ~2590 frames (~86 seconds)
 */
const SCENE_DURATIONS = {
  // === INTRO & NAVIGATION (14s) ===
  intro: 150, // 5s - Logo reveal with depth effects (extended for impact)
  homepage: 150, // 5s - Meet the AI Council - more time to see model cards
  sidebar: 120, // 4s - Choose Your Workspace - more time to see options

  // === UNIFIED INPUT FEATURES (36s) ===
  chatInput: 1080, // 36s - Auto mode, models, files, voice, typing - 5-6s per feature

  // === MODEL SELECTION (13s) ===
  modelModal: 390, // 13s - Tabs, presets, custom, drag reorder - more time for each tab

  // === THE CONVERSATION - CORE FEATURE (21s) ===
  chatThread: 630, // 21s - Full roundtable conversation, ends 3s after moderator finishes streaming

  // === FINALE (5s) ===
  finale: 150, // 5s - Grand finale with CTA
} as const;

/**
 * Audio - Minimal Cut Splice at Natural Phrase Boundaries
 *
 * Structure (ONE crossfade at ~64s):
 *   0-64s:  Building energy (track 16.6s-82.8s, phrases 2-5)
 *   64-87s: THE DROP! Peak energy (track 165.5s-199s, phrases 11-12)
 *
 * The audio has natural dynamics - minimal volume automation needed.
 * Crossfade at 64s is at phrase boundary where patterns align.
 */
function ShowcaseAudio() {
  const total = getShowcaseDuration();

  return (
    <Audio
      src={staticFile('static/music/showcase-spliced.mp3')}
      volume={(f: number) => {
        // Minimal volume automation - let the spliced audio's natural dynamics shine
        // Quick fade in, late gentle fade out
        const baseVolume = interpolate(
          f,
          [
            0, // Start
            45, // Fade in done (1.5s)
            total - 45, // Begin fade (last 1.5s only)
            total, // End
          ],
          [
            0, // Silence
            0.65, // Full volume
            0.65, // Full volume
            0, // Silence
          ],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        return baseVolume;
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

      {/* Progress dots indicator removed per user request */}

      {/* Background music with cinematic volume automation
          Emotional arc:
          - Intro (0-5s): Gentle fade in, soft and inviting (0.30-0.35)
          - Homepage/Sidebar (5-13s): Building anticipation (0.38-0.40)
          - ChatInput (13-48s): Steady showcase with dynamics (0.42-0.52)
          - ModelModal (48-60s): Rising energy (0.55)
          - ChatThread (60-80s): PEAK ENERGY - core feature (0.60-0.65)
          - Finale (80-86s): Powerful resolution (0.55 → fade)

          Techniques applied:
          - Caption ducking (-0.08 when captions appear)
          - Transition boosts (+0.12 at scene changes)
          - Key moment accents (send, moderator, CTA)
      */}
      <ShowcaseAudio />
      <TransitionSeries>
        {/* Scene 1: Epic Intro with Logo */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.intro}>
          <Scene01Intro />
        </TransitionSeries.Sequence>

        {/* Transition 1: Intro → Homepage - Depth zoom with 3D perspective */}
        <TransitionSeries.Transition
          presentation={depthZoom({ perspective: 1400, maxDepth: 350 })}
          timing={NORMAL_TRANSITION}
        />

        {/* Scene 2: Homepage Hero */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.homepage}>
          <Scene02Homepage />
        </TransitionSeries.Sequence>

        {/* Transition 2: Homepage → Sidebar - Camera orbits left */}
        <TransitionSeries.Transition
          presentation={spatialCameraOrbit({ direction: 'counterclockwise', rotationDegrees: 35 })}
          timing={ORBIT_TRANSITION}
        />

        {/* Scene 3: Sidebar Navigation */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.sidebar}>
          <Scene03Sidebar />
        </TransitionSeries.Sequence>

        {/* Transition 3: Sidebar → ChatInput - Subtle depth fade */}
        <TransitionSeries.Transition
          presentation={depthFade({ depth: 250 })}
          timing={FAST_TRANSITION}
        />

        {/* Scene 4: Unified Chat Input - ALL INPUT FEATURES */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.chatInput}>
          <SceneChatInput />
        </TransitionSeries.Sequence>

        {/* Transition 4: ChatInput → ModelModal - Zoom through */}
        <TransitionSeries.Transition
          presentation={zoomThrough({ maxZoom: 450 })}
          timing={NORMAL_TRANSITION}
        />

        {/* Scene 5: Model Selection Modal with Tabs */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.modelModal}>
          <SceneModelModal />
        </TransitionSeries.Sequence>

        {/* Transition 5: ModelModal → ChatThread - THE DROP! Parallax push */}
        <TransitionSeries.Transition
          presentation={parallaxPush({ layers: 5, maxDepth: 500, aperture: 2.0 })}
          timing={DRAMATIC_TRANSITION}
        />

        {/* Scene 6: Unified Chat Thread - THE CORE FEATURE */}
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.chatThread}>
          <SceneChatThread />
        </TransitionSeries.Sequence>

        {/* Transition 6: ChatThread → Finale - Chromatic zoom for finale */}
        <TransitionSeries.Transition
          presentation={chromaticZoom({ maxZoom: 1.8, maxRgbSeparation: 12 })}
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

  // 6 transitions between 7 scenes (cinematic 3D transitions)
  // Transition breakdown:
  // - 1 FAST_TRANSITION (18 frames) = 18 frames
  // - 2 NORMAL_TRANSITION (28 frames each) = 56 frames
  // - 1 ORBIT_TRANSITION (30 frames) = 30 frames
  // - 1 DRAMATIC_TRANSITION (32 frames) = 32 frames
  // - 1 SLOW_TRANSITION (36 frames) = 36 frames
  // Total transition overlap: ~172 frames
  const transitionOverlap = 172;

  return totalSceneDuration - transitionOverlap;
}
