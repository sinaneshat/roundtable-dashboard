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
 * Audio - Single continuous track with volume automation
 *
 * IMPORTANT: This plays ONE continuous audio stream (no cuts/gaps)
 * Volume is automated to match scene energy levels
 *
 * To adjust timing:
 * - Change AUDIO_START_OFFSET to start from a different point in the track
 * - Adjust the volume keyframes below to match your music's energy
 *
 * Scene Timeline (frames @ 30fps):
 * - 0-150: Intro (5s)
 * - 150-276: Homepage (4.2s)
 * - 276-381: Sidebar (3.5s)
 * - 381-1446: ChatInput (35.5s) - longest section
 * - 1446-1812: ModelModal (12.2s)
 * - 1812-2418: ChatThread (20.2s) - PEAK ENERGY
 * - 2418-2532: Finale (3.8s)
 */
function ShowcaseAudio() {
  const { fps } = useVideoConfig();
  const total = getShowcaseDuration();

  // ============================================================================
  // MUSIC START POINT - Change this to start from a different part of the track
  // ============================================================================
  const AUDIO_START_SECONDS = 60; // Start at 1:00 into the track
  const AUDIO_START_OFFSET = AUDIO_START_SECONDS * fps;

  return (
    <Audio
      src={staticFile('static/music/showcase-bg.mp3')}
      startFrom={AUDIO_START_OFFSET}
      volume={(f: number) => {
        // ====================================================================
        // VOLUME KEYFRAMES - Adjust these to match your music's energy!
        // Format: [frame] → [volume]
        // ====================================================================
        const baseVolume = interpolate(
          f,
          [
            // INTRO - Soft fade in
            0, // Start
            45, // Fade in complete
            140, // Before transition

            // HOMEPAGE - Building
            150, // Scene start
            270, // Before transition

            // SIDEBAR - Steady
            276, // Scene start
            375, // Before transition

            // CHAT INPUT - Long section, gradual build
            381, // Scene start - features begin
            600, // Model selection
            800, // File features
            1000, // Voice recording
            1200, // Typing
            1400, // Pre-send buildup
            1440, // Before transition

            // MODEL MODAL - High energy
            1446, // Scene start
            1600, // Tabs shown
            1800, // Before transition

            // CHAT THREAD - PEAK (THE DROP!)
            1812, // THE DROP - scene start
            1900, // First responses
            2100, // All models active - PEAK
            2300, // Moderator synthesis
            2410, // Before transition

            // FINALE - Resolution
            2418, // Scene start
            2480, // CTA moment
            total - 45, // Start fade out
            total, // End - silence
          ],
          [
            // INTRO
            0, // Silence
            0.32, // Soft intro
            0.35, // Established

            // HOMEPAGE
            0.38, // Building energy
            0.40, // Ready for next

            // SIDEBAR
            0.40, // Steady
            0.42, // Ready for features

            // CHAT INPUT - Gradual build through long section
            0.42, // Start
            0.44, // Model selection
            0.46, // Files
            0.50, // Voice - rising
            0.52, // Typing
            0.55, // Building anticipation
            0.58, // Pre-transition peak

            // MODEL MODAL
            0.55, // Scene start
            0.58, // Tabs
            0.60, // Before drop

            // CHAT THREAD - PEAK
            0.62, // THE DROP!
            0.65, // Responses starting
            0.68, // PEAK ENERGY - all models
            0.62, // Moderator - slight pullback
            0.58, // Winding down

            // FINALE
            0.55, // Resolution begins
            0.58, // CTA boost
            0.45, // Fading
            0, // Silence
          ],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        // ====================================================================
        // TRANSITION BOOSTS - Punch at scene changes
        // ====================================================================
        let transitionBoost = 0;
        for (const transFrame of TRANSITION_FRAMES) {
          const dist = Math.abs(f - transFrame);
          if (dist < 12) {
            const boost = interpolate(dist, [0, 6, 12], [0.10, 0.05, 0], {
              extrapolateRight: 'clamp',
            });
            transitionBoost = Math.max(transitionBoost, boost);
          }
        }

        // ====================================================================
        // KEY MOMENT ACCENTS
        // ====================================================================
        // Send button moment (end of ChatInput)
        const sendBoost = f >= 1380 && f < 1420
          ? interpolate(f - 1380, [0, 20, 40], [0, 0.06, 0], { extrapolateRight: 'clamp' })
          : 0;

        // THE DROP moment (ChatThread start)
        const dropBoost = f >= 1812 && f < 1860
          ? interpolate(f - 1812, [0, 24, 48], [0, 0.08, 0], { extrapolateRight: 'clamp' })
          : 0;

        // CTA reveal (Finale)
        const ctaBoost = f >= 2450 && f < 2500
          ? interpolate(f - 2450, [0, 25, 50], [0, 0.06, 0], { extrapolateRight: 'clamp' })
          : 0;

        // Combine and clamp
        const finalVolume = baseVolume + transitionBoost + sendBoost + dropBoost + ctaBoost;
        return Math.max(0, Math.min(finalVolume, 0.72));
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
        sceneStarts={[0, 150, 276, 381, 1446, 1812, 2418]}
        totalDuration={getShowcaseDuration()}
      />

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
