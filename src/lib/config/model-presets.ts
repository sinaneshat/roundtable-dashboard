/**
 * Model Presets Configuration
 *
 * Conversation-focused presets that auto-assign:
 * - Specific models with roles
 * - Conversation mode (analyzing, brainstorming, debating, solving)
 * - Web search setting
 *
 * Design principles:
 * - Presets describe conversation TYPE, not model capabilities
 * - Roles are behavioral, not brand-based
 * - Each preset explicitly sets mode and search
 */

import type { LucideIcon } from 'lucide-react';
import {
  Brain,
  FileSearch,
  Lightbulb,
  MessagesSquare,
  Scale,
  ShieldAlert,
  Swords,
  Wrench,
} from 'lucide-react';

import type { ChatMode } from '@/api/core/enums';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { SUBSCRIPTION_TIERS } from '@/api/services/product-logic.service';

// ============================================================================
// Preset Types
// ============================================================================

export type ModelPresetId
  = 'quick-perspectives'
    | 'balanced-discussion'
    | 'creative-exploration'
    | 'critical-debate'
    | 'devils-advocate'
    | 'deep-analysis'
    | 'research-evidence'
    | 'technical-review';

/** Explicit model-role pairing for presets */
export type PresetModelRole = {
  modelId: string;
  role: string;
};

export type ModelPreset = {
  id: ModelPresetId;
  name: string;
  description: string;
  icon: LucideIcon;
  requiredTier: SubscriptionTier;
  order: number;
  /** Conversation mode - required */
  mode: ChatMode;
  /** Web search enabled: true, false, or 'conditional' (default ON, user can toggle) */
  searchEnabled: boolean | 'conditional';
  /** Explicit model-role pairs */
  modelRoles: PresetModelRole[];
};

// ============================================================================
// Preset Configurations
// ============================================================================

export const MODEL_PRESETS: ModelPreset[] = [
  // ============================================================================
  // FREE TIER
  // ============================================================================
  {
    id: 'quick-perspectives',
    name: 'Quick Perspectives',
    description: 'Fast framing and contrasting viewpoints for early exploration',
    icon: MessagesSquare,
    requiredTier: 'free',
    order: 1,
    mode: 'analyzing',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/gpt-5-nano', role: 'Framer' },
      { modelId: 'google/gemini-2.0-flash-001', role: 'Alternative Lens' },
      { modelId: 'openai/gpt-4o-mini', role: 'Nuancer' },
    ],
  },

  // ============================================================================
  // PRO TIER
  // ============================================================================
  {
    id: 'balanced-discussion',
    name: 'Balanced Discussion',
    description: 'Well-rounded conversation with reasoning and alternative framing',
    icon: Scale,
    requiredTier: 'pro',
    order: 2,
    mode: 'analyzing',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/gpt-5.1', role: 'Structured Reasoner' },
      { modelId: 'anthropic/claude-sonnet-4.5', role: 'Assumption Challenger' },
      { modelId: 'google/gemini-3-pro-preview', role: 'Alternative Framer' },
    ],
  },
  {
    id: 'creative-exploration',
    name: 'Creative Exploration',
    description: 'Ideation and conceptual exploration with grounded creativity',
    icon: Lightbulb,
    requiredTier: 'pro',
    order: 3,
    mode: 'brainstorming',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'anthropic/claude-sonnet-4', role: 'Ideator' },
      { modelId: 'google/gemini-3-flash-preview', role: 'Lateral Thinker' },
      { modelId: 'openai/gpt-5-mini', role: 'Grounding Voice' },
    ],
  },

  // ============================================================================
  // POWER TIER
  // ============================================================================
  {
    id: 'critical-debate',
    name: 'Critical Debate',
    description: 'Stress-testing ideas with real disagreement and trade-offs',
    icon: Swords,
    requiredTier: 'power',
    order: 4,
    mode: 'debating',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/o3', role: 'Position Advocate' },
      { modelId: 'anthropic/claude-opus-4.5', role: 'Assumption Critic' },
      { modelId: 'x-ai/grok-4', role: 'Contrarian' },
      { modelId: 'google/gemini-2.5-pro', role: 'Trade-off Clarifier' },
    ],
  },
  {
    id: 'devils-advocate',
    name: 'Devil\'s Advocate Panel',
    description: 'Challenge decisions with opposing viewpoints to stress-test your thinking',
    icon: ShieldAlert,
    requiredTier: 'pro',
    order: 5,
    mode: 'debating',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/gpt-5.1', role: 'Proposer' },
      { modelId: 'anthropic/claude-sonnet-4.5', role: 'Skeptic' },
      { modelId: 'google/gemini-2.5-pro', role: 'Mediator' },
    ],
  },
  {
    id: 'deep-analysis',
    name: 'Deep Analysis',
    description: 'Maximum reasoning depth for complex, ambiguous problems',
    icon: Brain,
    requiredTier: 'power',
    order: 6,
    mode: 'analyzing',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/o1', role: 'Deep Reasoner' },
      { modelId: 'anthropic/claude-opus-4', role: 'Systems Thinker' },
      { modelId: 'deepseek/deepseek-r1-0528', role: 'Secondary Theorist' },
    ],
  },
  {
    id: 'research-evidence',
    name: 'Research & Evidence Review',
    description: 'Fact-finding with source comparison and synthesis',
    icon: FileSearch,
    requiredTier: 'power',
    order: 7,
    mode: 'analyzing',
    searchEnabled: true,
    modelRoles: [
      { modelId: 'openai/gpt-4.1', role: 'Evidence Gatherer' },
      { modelId: 'google/gemini-2.5-pro', role: 'Cross-Checker' },
      { modelId: 'anthropic/claude-opus-4', role: 'Synthesizer' },
    ],
  },
  {
    id: 'technical-review',
    name: 'Technical Review',
    description: 'Architecture, correctness, and implementation trade-offs',
    icon: Wrench,
    requiredTier: 'power',
    order: 8,
    mode: 'solving',
    searchEnabled: 'conditional',
    modelRoles: [
      { modelId: 'anthropic/claude-opus-4.5', role: 'Implementer' },
      { modelId: 'anthropic/claude-sonnet-4', role: 'Correctness Reviewer' },
      { modelId: 'google/gemini-2.5-flash', role: 'Trade-Off Analyst' },
    ],
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get preset by ID
 */
export function getPresetById(id: ModelPresetId): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === id);
}

/**
 * Get presets available to user's tier
 */
export function getPresetsForTier(userTier: SubscriptionTier): ModelPreset[] {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);

  return MODEL_PRESETS.map((preset) => {
    const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
    return {
      ...preset,
      isLocked: userTierIndex < requiredIndex,
    };
  }).sort((a, b) => a.order - b.order);
}

/**
 * Check if user can access a preset
 */
export function canAccessPreset(
  preset: ModelPreset,
  userTier: SubscriptionTier,
): boolean {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
  return userTierIndex >= requiredIndex;
}

/**
 * Get model IDs for a preset
 */
export function getModelIdsForPreset(preset: ModelPreset): string[] {
  return preset.modelRoles.map(mr => mr.modelId);
}
