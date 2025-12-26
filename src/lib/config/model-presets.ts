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
import { z } from 'zod';

import type { ChatMode, SubscriptionTier } from '@/api/core/enums';
import { SUBSCRIPTION_TIERS } from '@/api/core/enums';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';

// ============================================================================
// Preset Types (Zod-first pattern)
// ============================================================================

export const PresetModelRoleSchema = z.object({
  modelId: z.string().min(1),
  role: z.string().min(1),
});

export type PresetModelRole = z.infer<typeof PresetModelRoleSchema>;

export const ModelPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.custom<LucideIcon>(),
  requiredTier: z.string() as z.ZodType<SubscriptionTier>,
  order: z.number().int().nonnegative(),
  mode: z.string() as z.ZodType<ChatMode>,
  searchEnabled: z.union([z.boolean(), z.literal('conditional')]),
  modelRoles: z.array(PresetModelRoleSchema),
});

export type ModelPreset = z.infer<typeof ModelPresetSchema>;

export const PresetSelectionResultSchema = z.object({
  preset: ModelPresetSchema,
});

export type PresetSelectionResult = z.infer<typeof PresetSelectionResultSchema>;

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
      { modelId: 'google/gemini-2.5-flash', role: 'Structured Reasoner' },
      { modelId: 'deepseek/deepseek-r1-0528', role: 'Deep Reasoner' },
      { modelId: 'google/gemini-2.0-flash-001', role: 'Alternative Lens' },
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
      { modelId: 'openai/gpt-5-mini', role: 'Synthesizer' },
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
      { modelId: 'google/gemini-2.5-pro', role: 'Trade-Off Analyst' },
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
      { modelId: 'deepseek/deepseek-r1-0528', role: 'Alternative Lens' },
    ],
  },
  {
    id: 'research-evidence',
    name: 'Research & Evidence Review',
    description: 'Fact-finding with source comparison and synthesis',
    icon: FileSearch,
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
// 5-Part Enum Pattern for Model Preset IDs
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for preset IDs
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

// 2️⃣ ZOD SCHEMA - Runtime validation (no type cast needed)
export const ModelPresetIdSchema = z.enum(MODEL_PRESET_IDS);

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ModelPresetId = z.infer<typeof ModelPresetIdSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_MODEL_PRESET_ID: ModelPresetId = 'quick-perspectives';

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ModelPresetIds = {
  QUICK_PERSPECTIVES: 'quick-perspectives',
  BALANCED_DISCUSSION: 'balanced-discussion',
  CREATIVE_EXPLORATION: 'creative-exploration',
  CRITICAL_DEBATE: 'critical-debate',
  DEVILS_ADVOCATE: 'devils-advocate',
  DEEP_ANALYSIS: 'deep-analysis',
  RESEARCH_EVIDENCE: 'research-evidence',
  TECHNICAL_REVIEW: 'technical-review',
} as const satisfies Record<string, ModelPresetId>;

// ============================================================================
// Utility Functions
// ============================================================================

export function getPresetById(id: ModelPresetId): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === id);
}

export const PresetWithLockStatusSchema = ModelPresetSchema.extend({
  isLocked: z.boolean(),
});

export type PresetWithLockStatus = z.infer<typeof PresetWithLockStatusSchema>;

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

// ============================================================================
// Preset Participant Filtering (Incompatibility Handling)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for toast namespace values
export const TOAST_NAMESPACES = ['chat.models', 'models'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation
export const ToastNamespaceSchema = z.enum(TOAST_NAMESPACES);

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ToastNamespace = z.infer<typeof ToastNamespaceSchema>;

// 4️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ToastNamespaces = {
  CHAT_MODELS: 'chat.models' as const,
  MODELS: 'models' as const,
} as const;

// 5️⃣ DEFAULT VALUE
export const DEFAULT_TOAST_NAMESPACE: ToastNamespace = 'chat.models';

export const PresetFilterResultSchema = z.object({
  participants: z.array(ParticipantConfigSchema),
  success: z.boolean(),
});

export type PresetFilterResult = z.infer<typeof PresetFilterResultSchema>;

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
