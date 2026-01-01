/**
 * Model Preset Configuration
 *
 * Predefined model combinations and configurations for different use cases.
 * Follows Zod-first pattern with schema validation and type inference.
 */

import { z } from '@hono/zod-openapi';

import type { SubscriptionTier } from '@/api/core/enums';
import { ChatModeSchema, SUBSCRIPTION_TIERS, SubscriptionTierSchema } from '@/api/core/enums';
import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';

// ============================================================================
// PRESET MODEL ROLE (5-part enum pattern for preset IDs)
// ============================================================================

export const PresetModelRoleSchema = z.object({
  modelId: z.string().min(1),
  role: z.string().min(1),
});

export type PresetModelRole = z.infer<typeof PresetModelRoleSchema>;

// ============================================================================
// MODEL PRESET SCHEMA
// ============================================================================

export const ModelPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.custom<Icon>(),
  requiredTier: SubscriptionTierSchema,
  order: z.number().int().nonnegative(),
  mode: ChatModeSchema,
  searchEnabled: z.union([z.boolean(), z.literal('conditional')]),
  modelRoles: z.array(PresetModelRoleSchema),
});

export type ModelPreset = z.infer<typeof ModelPresetSchema>;

// ============================================================================
// PRESET IDS (5-part enum pattern)
// ============================================================================

export const MODEL_PRESET_IDS = [
  'quick-perspectives',
  'balanced-discussion',
  'creative-exploration',
  'critical-debate',
  'devils-advocate',
  'deep-analysis',
  'research-evidence',
  'technical-review',
] as const;

export const ModelPresetIdSchema = z.enum(MODEL_PRESET_IDS).openapi({
  description: 'Model preset identifier for predefined AI configurations',
  example: 'quick-perspectives',
});

export type ModelPresetId = z.infer<typeof ModelPresetIdSchema>;

export const DEFAULT_MODEL_PRESET_ID: ModelPresetId = 'quick-perspectives';

export const ModelPresetIds = {
  QUICK_PERSPECTIVES: 'quick-perspectives' as const,
  BALANCED_DISCUSSION: 'balanced-discussion' as const,
  CREATIVE_EXPLORATION: 'creative-exploration' as const,
  CRITICAL_DEBATE: 'critical-debate' as const,
  DEVILS_ADVOCATE: 'devils-advocate' as const,
  DEEP_ANALYSIS: 'deep-analysis' as const,
  RESEARCH_EVIDENCE: 'research-evidence' as const,
  TECHNICAL_REVIEW: 'technical-review' as const,
} as const;

// ============================================================================
// MODEL PRESET CONFIGURATIONS
// ============================================================================

export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: ModelPresetIds.QUICK_PERSPECTIVES,
    name: 'Quick Perspectives',
    description: 'Fast framing and contrasting viewpoints for early exploration',
    icon: Icons.messagesSquare,
    requiredTier: 'free',
    order: 1,
    mode: 'analyzing',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'google/gemini-2.5-flash', role: 'Structured Reasoner' },
      { modelId: 'deepseek/deepseek-r1-0528', role: 'Deep Reasoner' },
      { modelId: 'google/gemini-2.0-flash-001', role: 'Alternative Lens' },
    ],
  },
  {
    id: ModelPresetIds.BALANCED_DISCUSSION,
    name: 'Balanced Discussion',
    description: 'Well-rounded conversation with reasoning and alternative framing',
    icon: Icons.scale,
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
    id: ModelPresetIds.CREATIVE_EXPLORATION,
    name: 'Creative Exploration',
    description: 'Ideation and conceptual exploration with grounded creativity',
    icon: Icons.lightbulb,
    requiredTier: 'pro',
    order: 3,
    mode: 'brainstorming',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'anthropic/claude-sonnet-4', role: 'Ideator' },
      { modelId: 'google/gemini-3-flash-preview', role: 'Lateral Thinker' },
      { modelId: 'openai/gpt-5-mini', role: 'Synthesizer' },
    ],
  },
  {
    id: ModelPresetIds.CRITICAL_DEBATE,
    name: 'Critical Debate',
    description: 'Stress-testing ideas with real disagreement and trade-offs',
    icon: Icons.swords,
    requiredTier: 'pro',
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
    id: ModelPresetIds.DEVILS_ADVOCATE,
    name: 'Devil\'s Advocate Panel',
    description: 'Challenge decisions with opposing viewpoints to stress-test your thinking',
    icon: Icons.shieldAlert,
    requiredTier: 'pro',
    order: 5,
    mode: 'debating',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/gpt-5.1', role: 'Proposer' },
      { modelId: 'anthropic/claude-sonnet-4.5', role: 'Skeptic' },
      { modelId: 'google/gemini-2.5-pro', role: 'Trade-Off Analyst' },
    ],
  },
  {
    id: ModelPresetIds.DEEP_ANALYSIS,
    name: 'Deep Analysis',
    description: 'Maximum reasoning depth for complex, ambiguous problems',
    icon: Icons.brain,
    requiredTier: 'pro',
    order: 6,
    mode: 'analyzing',
    searchEnabled: false,
    modelRoles: [
      { modelId: 'openai/o1', role: 'Deep Reasoner' },
      { modelId: 'anthropic/claude-opus-4', role: 'Systems Thinker' },
      { modelId: 'deepseek/deepseek-r1-0528', role: 'Alternative Lens' },
    ],
  },
  {
    id: ModelPresetIds.RESEARCH_EVIDENCE,
    name: 'Research & Evidence Review',
    description: 'Fact-finding with source comparison and synthesis',
    icon: Icons.fileSearch,
    requiredTier: 'pro',
    order: 7,
    mode: 'analyzing',
    searchEnabled: true,
    modelRoles: [
      { modelId: 'openai/gpt-4.1', role: 'Evidence Gatherer' },
      { modelId: 'google/gemini-2.5-pro', role: 'Cross-Checker' },
      { modelId: 'anthropic/claude-sonnet-4.5', role: 'Synthesizer' },
    ],
  },
  {
    id: ModelPresetIds.TECHNICAL_REVIEW,
    name: 'Technical Review',
    description: 'Architecture, correctness, and implementation trade-offs',
    icon: Icons.wrench,
    requiredTier: 'pro',
    order: 8,
    mode: 'solving',
    searchEnabled: 'conditional',
    modelRoles: [
      { modelId: 'anthropic/claude-opus-4.5', role: 'Implementer' },
      { modelId: 'anthropic/claude-sonnet-4', role: 'Correctness Reviewer' },
      { modelId: 'google/gemini-2.5-flash', role: 'Trade-Off Analyst' },
    ],
  },
] as const;

// ============================================================================
// PRESET WITH LOCK STATUS
// ============================================================================

export const PresetWithLockStatusSchema = ModelPresetSchema.extend({
  isLocked: z.boolean(),
});

export type PresetWithLockStatus = z.infer<typeof PresetWithLockStatusSchema>;

// ============================================================================
// TOAST NAMESPACES (5-part enum pattern)
// ============================================================================

export const TOAST_NAMESPACES = ['chat.models', 'models'] as const;

export const ToastNamespaceSchema = z.enum(TOAST_NAMESPACES).openapi({
  description: 'Toast notification namespace for translation keys',
  example: 'chat.models',
});

export type ToastNamespace = z.infer<typeof ToastNamespaceSchema>;

export const DEFAULT_TOAST_NAMESPACE: ToastNamespace = 'chat.models';

export const ToastNamespaces = {
  CHAT_MODELS: 'chat.models' as const,
  MODELS: 'models' as const,
} as const;

// ============================================================================
// RESULT SCHEMAS
// ============================================================================

export const PresetSelectionResultSchema = z.object({
  preset: ModelPresetSchema,
});

export type PresetSelectionResult = z.infer<typeof PresetSelectionResultSchema>;

export const PresetFilterResultSchema = z.object({
  participants: z.array(ParticipantConfigSchema),
  success: z.boolean(),
});

export type PresetFilterResult = z.infer<typeof PresetFilterResultSchema>;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getPresetById(id: ModelPresetId): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === id);
}

export function getPresetsForTier(userTier: SubscriptionTier): PresetWithLockStatus[] {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);

  return MODEL_PRESETS.map((preset) => {
    const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
    return {
      ...preset,
      isLocked: userTierIndex < requiredIndex,
    };
  }).sort((a, b) => a.order - b.order);
}

export function canAccessPreset(
  preset: ModelPreset,
  userTier: SubscriptionTier,
): boolean {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
  return userTierIndex >= requiredIndex;
}

export function getModelIdsForPreset(preset: ModelPreset): string[] {
  return preset.modelRoles.map(mr => mr.modelId);
}

type TranslationFn = (key: string, values?: { count: number }) => string;

export function filterPresetParticipants(
  preset: ModelPreset,
  incompatibleModelIds: Set<string>,
  t: TranslationFn,
  toastNamespace: ToastNamespace = DEFAULT_TOAST_NAMESPACE,
): PresetFilterResult {
  const presetModelIds = preset.modelRoles.map(mr => mr.modelId);

  const compatibleModelIds = incompatibleModelIds.size > 0
    ? presetModelIds.filter(id => !incompatibleModelIds.has(id))
    : presetModelIds;

  const filteredCount = presetModelIds.length - compatibleModelIds.length;

  if (filteredCount > 0 && compatibleModelIds.length > 0) {
    toastManager.warning(
      t(`${toastNamespace}.presetModelsExcluded`),
      t(`${toastNamespace}.presetModelsExcludedDescription`, { count: filteredCount }),
    );
  }

  if (compatibleModelIds.length === 0) {
    toastManager.error(
      t(`${toastNamespace}.presetIncompatible`),
      t(`${toastNamespace}.presetIncompatibleDescription`),
    );
    return {
      participants: [],
      success: false,
    };
  }

  const participants = preset.modelRoles
    .filter(mr => compatibleModelIds.includes(mr.modelId))
    .map((mr, index) => ({
      id: mr.modelId,
      modelId: mr.modelId,
      role: mr.role,
      priority: index,
    }));

  return {
    participants,
    success: true,
  };
}
