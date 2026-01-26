/* eslint-disable no-console */
/**
 * Audio Analyzer Script
 *
 * Analyzes showcase-bg.mp3 to find energy levels throughout the track.
 * Outputs a chart showing where peaks, drops, and quiet sections are.
 *
 * Run with: bun run scripts/analyze-audio.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getAudioData, getWaveformPortion } from '@remotion/media-utils';

const AUDIO_PATH = path.join(__dirname, '../public/static/music/showcase-bg.mp3');
const SAMPLE_RATE = 10; // Samples per second
const OUTPUT_PATH = path.join(__dirname, '../src/remotion/lib/audio-analysis.json');

type EnergySegment = {
  startSeconds: number;
  endSeconds: number;
  avgEnergy: number;
  peakEnergy: number;
  label: 'quiet' | 'low' | 'medium' | 'building' | 'high' | 'peak';
};

function classifyEnergy(energy: number, maxEnergy: number): EnergySegment['label'] {
  const normalized = energy / maxEnergy;
  if (normalized < 0.15) {
    return 'quiet';
  }
  if (normalized < 0.3) {
    return 'low';
  }
  if (normalized < 0.5) {
    return 'medium';
  }
  if (normalized < 0.7) {
    return 'building';
  }
  if (normalized < 0.85) {
    return 'high';
  }
  return 'peak';
}

async function analyzeAudio() {
  console.log('Loading audio file...');
  console.log('Path:', AUDIO_PATH);

  // Check if file exists
  if (!fs.existsSync(AUDIO_PATH)) {
    console.error('Audio file not found at:', AUDIO_PATH);
    console.log('\nTrying alternative path...');
    const altPath = path.join(process.cwd(), 'public/static/music/showcase-bg.mp3');
    if (fs.existsSync(altPath)) {
      console.log('Found at:', altPath);
    } else {
      console.error('Audio file not found. Please check the path.');
      process.exit(1);
    }
  }

  // Read audio file as base64 data URL for getAudioData
  const audioBuffer = fs.readFileSync(AUDIO_PATH);
  const base64 = audioBuffer.toString('base64');
  const dataUrl = `data:audio/mp3;base64,${base64}`;

  console.log('Analyzing audio data...');
  const audioData = await getAudioData(dataUrl);

  console.log(`Duration: ${audioData.durationInSeconds.toFixed(2)}s`);
  console.log(`Sample rate: ${audioData.sampleRate}Hz`);
  console.log(`Channels: ${audioData.numberOfChannels}`);

  const duration = audioData.durationInSeconds;
  const samples: { time: number; energy: number }[] = [];

  // Sample energy at regular intervals
  console.log('\nSampling energy levels...');
  for (let t = 0; t < duration; t += 1 / SAMPLE_RATE) {
    const portion = getWaveformPortion({
      audioData,
      startTimeInSeconds: Math.max(0, t - 0.1),
      durationInSeconds: 0.2,
      numberOfSamples: 64,
    });

    // Calculate RMS energy
    const energy = Math.sqrt(
      portion.reduce((sum, bar) => sum + bar.amplitude * bar.amplitude, 0) / portion.length,
    );

    samples.push({ time: t, energy });
  }

  // Find max energy for normalization
  const maxEnergy = Math.max(...samples.map(s => s.energy));

  // Group into segments (every 5 seconds)
  const SEGMENT_DURATION = 5;
  const segments: EnergySegment[] = [];

  for (let start = 0; start < duration; start += SEGMENT_DURATION) {
    const end = Math.min(start + SEGMENT_DURATION, duration);
    const segmentSamples = samples.filter(s => s.time >= start && s.time < end);

    if (segmentSamples.length === 0) {
      continue;
    }

    const avgEnergy = segmentSamples.reduce((sum, s) => sum + s.energy, 0) / segmentSamples.length;
    const peakEnergy = Math.max(...segmentSamples.map(s => s.energy));

    segments.push({
      startSeconds: start,
      endSeconds: end,
      avgEnergy,
      peakEnergy,
      label: classifyEnergy(avgEnergy, maxEnergy),
    });
  }

  // Print visual chart
  console.log(`\n${'='.repeat(80)}`);
  console.log('AUDIO ENERGY ANALYSIS');
  console.log('='.repeat(80));
  console.log('\nEnergy levels by 5-second segments:\n');

  const barWidth = 40;
  segments.forEach((seg, _i) => {
    const normalized = seg.avgEnergy / maxEnergy;
    const bars = Math.round(normalized * barWidth);
    const bar = '█'.repeat(bars) + '░'.repeat(barWidth - bars);
    const timeStr = `${formatTime(seg.startSeconds)}-${formatTime(seg.endSeconds)}`;
    const labelPad = seg.label.padEnd(8);
    console.log(`${timeStr} [${bar}] ${labelPad} (${(normalized * 100).toFixed(0)}%)`);
  });

  // Find best sections for each energy level
  console.log(`\n${'='.repeat(80)}`);
  console.log('RECOMMENDED SECTIONS FOR VIDEO');
  console.log('='.repeat(80));

  const quietSections = segments.filter(s => s.label === 'quiet' || s.label === 'low');
  const buildingSections = segments.filter(s => s.label === 'building' || s.label === 'medium');
  const peakSections = segments.filter(s => s.label === 'peak' || s.label === 'high');

  console.log('\n🔇 QUIET/LOW (for Intro, Fade outs):');
  quietSections.slice(0, 3).forEach((s) => {
    console.log(`   ${formatTime(s.startSeconds)}-${formatTime(s.endSeconds)}`);
  });

  console.log('\n📈 BUILDING/MEDIUM (for Features, Navigation):');
  buildingSections.slice(0, 5).forEach((s) => {
    console.log(`   ${formatTime(s.startSeconds)}-${formatTime(s.endSeconds)}`);
  });

  console.log('\n🔥 HIGH/PEAK (for THE DROP, Core Features):');
  peakSections.forEach((s) => {
    console.log(`   ${formatTime(s.startSeconds)}-${formatTime(s.endSeconds)}`);
  });

  // Save analysis to JSON
  const analysis = {
    duration,
    maxEnergy,
    segments,
    recommendations: {
      intro: quietSections[0] || segments[0],
      features: buildingSections.slice(0, 3),
      peak: peakSections[0] || segments[segments.length - 1],
      outro: quietSections[quietSections.length - 1] || segments[segments.length - 1],
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Analysis saved to: ${OUTPUT_PATH}`);

  // Generate splice recommendations
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUGGESTED AUDIO SPLICE MAP');
  console.log('='.repeat(80));
  console.log('\nVideo Scene → Recommended Audio Section:');
  console.log('');

  const videoScenes = [
    { name: 'Intro', frames: '0-150', seconds: 5, energy: 'low' },
    { name: 'Homepage', frames: '150-276', seconds: 4.2, energy: 'building' },
    { name: 'Sidebar', frames: '276-381', seconds: 3.5, energy: 'medium' },
    { name: 'ChatInput', frames: '381-1446', seconds: 35.5, energy: 'building' },
    { name: 'ModelModal', frames: '1446-1812', seconds: 12.2, energy: 'high' },
    { name: 'ChatThread', frames: '1812-2418', seconds: 20.2, energy: 'peak' },
    { name: 'Finale', frames: '2418-2532', seconds: 3.8, energy: 'low' },
  ];

  videoScenes.forEach((scene) => {
    const matchingSegments = segments.filter(s =>
      s.label === scene.energy
      || (scene.energy === 'building' && (s.label === 'building' || s.label === 'medium'))
      || (scene.energy === 'peak' && (s.label === 'peak' || s.label === 'high')),
    );
    const best = matchingSegments[0];
    if (best) {
      console.log(`${scene.name.padEnd(12)} (${scene.seconds}s) → Use audio ${formatTime(best.startSeconds)}-${formatTime(best.endSeconds)} [${best.label}]`);
    }
  });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

analyzeAudio().catch(console.error);
