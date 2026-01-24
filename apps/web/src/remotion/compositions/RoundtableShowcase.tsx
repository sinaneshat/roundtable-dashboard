/**
 * RoundtableShowcase - Product Video (~44 seconds)
 *
 * Streamlined production video with unified scenes:
 * - 7 scenes using TransitionSeries
 * - Exact component replicas from the app
 * - Cinematic camera movements
 * - Background music support
 *
 * Scene Structure:
 * 01 Intro (3s)        - Logo reveal
 * 02 Homepage (3s)     - Hero section
 * 03 Sidebar (2.5s)    - Navigation
 * 04 ChatInput (10s)   - Unified: auto mode, models, files, voice, typing
 * 05 ModelModal (10s)  - Tabs, presets, custom, drag reorder
 * 06 ChatThread (14s)  - Unified: user msg → web search → placeholders → streaming → moderator
 * 07 Finale (5s)       - Grand finale with CTA
 */

import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';

// Scene imports
import { Scene01Intro } from './showcase-scenes/Scene01Intro';
import { Scene02Homepage } from './showcase-scenes/Scene02Homepage';
import { Scene03Sidebar } from './showcase-scenes/Scene03Sidebar';
import { Scene17Finale } from './showcase-scenes/Scene17Finale';
import { SceneChatInput } from './showcase-scenes/SceneChatInput';
import { SceneChatThread } from './showcase-scenes/SceneChatThread';
import { SceneModelModal } from './showcase-scenes/SceneModelModal';

// Transition timing presets
const FAST_TRANSITION = linearTiming({ durationInFrames: 12 });
const NORMAL_TRANSITION = linearTiming({ durationInFrames: 18 });
const SLOW_TRANSITION = linearTiming({ durationInFrames: 25 });

/**
 * Scene durations in frames at 30fps
 *
 * Total: ~1345 frames (~44.8 seconds)
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

  // === THE CONVERSATION - CORE FEATURE (14s) ===
  chatThread: 420, // 14s - User msg → placeholders → streaming → moderator - ALL IN ONE

  // === FINALE (5s) ===
  finale: 150, // 5s - Grand finale with CTA
} as const;

export function RoundtableShowcase() {
  return (
    <TransitionSeries>
      {/* Scene 1: Epic Intro with Logo */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.intro}>
        <Scene01Intro />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={NORMAL_TRANSITION}
      />

      {/* Scene 2: Homepage Hero */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.homepage}>
        <Scene02Homepage />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: 'from-right' })}
        timing={FAST_TRANSITION}
      />

      {/* Scene 3: Sidebar Navigation */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.sidebar}>
        <Scene03Sidebar />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: 'from-bottom' })}
        timing={FAST_TRANSITION}
      />

      {/* Scene 4: Unified Chat Input - ALL INPUT FEATURES */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.chatInput}>
        <SceneChatInput />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={NORMAL_TRANSITION}
      />

      {/* Scene 5: Model Selection Modal with Tabs */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.modelModal}>
        <SceneModelModal />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={NORMAL_TRANSITION}
      />

      {/* Scene 6: Unified Chat Thread - THE CORE FEATURE */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.chatThread}>
        <SceneChatThread />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={SLOW_TRANSITION}
      />

      {/* Scene 7: Grand Finale */}
      <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.finale}>
        <Scene17Finale />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
}

/**
 * Calculate total duration accounting for transitions
 */
export function getShowcaseDuration(): number {
  const sceneDurations = Object.values(SCENE_DURATIONS);
  const totalSceneDuration = sceneDurations.reduce((a, b) => a + b, 0);

  // 6 transitions between 7 scenes
  // Transition breakdown:
  // - 2 FAST_TRANSITION (12 frames each) = 24 frames
  // - 3 NORMAL_TRANSITION (18 frames each) = 54 frames
  // - 1 SLOW_TRANSITION (25 frames each) = 25 frames
  // Total transition overlap: ~103 frames
  const transitionOverlap = 103;

  return totalSceneDuration - transitionOverlap;
}
