/**
 * Model Preset Configuration
 *
 * Predefined model combinations and configurations for different use cases.
 * Follows Zod-first pattern with schema validation and type inference.
 */

import { z } from '@hono/zod-openapi';

import type { SubscriptionTier } from '@/api/core/enums';
import { ChatModes, ChatModeSchema, ModelIds, SUBSCRIPTION_TIERS, SubscriptionTiers, SubscriptionTierSchema } from '@/api/core/enums';
import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';

// ============================================================================
// PRESET MODEL ROLE (5-part enum pattern for preset IDs)
// ============================================================================

export const PresetModelRoleSchema = z.object({
  modelId: z.string().min(1),
  role: z.string().nullish(),
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
  // FREE tier presets
  'quick-perspectives',
  'budget-brainstorm',
  'fast-debate',
  'problem-solver',
  // PRO tier presets
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
  // FREE tier presets
  QUICK_PERSPECTIVES: 'quick-perspectives' as const,
  BUDGET_BRAINSTORM: 'budget-brainstorm' as const,
  FAST_DEBATE: 'fast-debate' as const,
  PROBLEM_SOLVER: 'problem-solver' as const,
  // PRO tier presets
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
  // ============================================================================
  // FREE TIER PRESET - Only Quick Perspectives available for free users
  // Uses budget models (<= $0.35/1M) with provider diversity
  // ============================================================================
  {
    id: ModelPresetIds.QUICK_PERSPECTIVES,
    name: 'Quick Perspectives',
    description: 'Fast-moving dialogue to quickly surface different angles on your question',
    icon: Icons.messagesSquare,
    requiredTier: SubscriptionTiers.FREE,
    order: 1,
    mode: ChatModes.ANALYZING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_4O_MINI, role: 'Analyst' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: 'Challenger' },
      { modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, role: 'Synthesizer' },
    ],
  },
  // ============================================================================
  // PRO TIER PRESETS - Budget models with provider diversity (PRO-only access)
  // Uses FREE tier models but requires PRO subscription to unlock preset
  // ============================================================================
  {
    id: ModelPresetIds.BUDGET_BRAINSTORM,
    name: 'Budget Brainstorm',
    description: 'Creative idea generation with efficient models that spark off each other',
    icon: Icons.lightbulb,
    requiredTier: SubscriptionTiers.PRO,
    order: 2,
    mode: ChatModes.BRAINSTORMING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: 'Ideator' },
      { modelId: ModelIds.X_AI_GROK_4_FAST, role: 'Builder' },
      { modelId: ModelIds.DEEPSEEK_DEEPSEEK_V3_2, role: 'Wildcard' },
    ],
  },
  {
    id: ModelPresetIds.FAST_DEBATE,
    name: 'Fast Debate',
    description: 'Efficient models that challenge perspectives and find common ground',
    icon: Icons.swords,
    requiredTier: SubscriptionTiers.PRO,
    order: 3,
    mode: ChatModes.DEBATING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_4_1_NANO, role: 'Advocate' },
      { modelId: ModelIds.X_AI_GROK_4_1_FAST, role: 'Contrarian' },
      { modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, role: 'Balancer' },
    ],
  },
  {
    id: ModelPresetIds.PROBLEM_SOLVER,
    name: 'Problem Solver',
    description: 'Technical models that collaborate to find practical solutions',
    icon: Icons.wrench,
    requiredTier: SubscriptionTiers.PRO,
    order: 4,
    mode: ChatModes.SOLVING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_5_NANO, role: 'Builder' },
      { modelId: ModelIds.X_AI_GROK_CODE_FAST_1, role: 'Reviewer' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: 'Optimizer' },
    ],
  },
  // ============================================================================
  // PRO TIER PRESETS - Premium models with enhanced capabilities
  // ============================================================================
  {
    id: ModelPresetIds.BALANCED_DISCUSSION,
    name: 'Balanced Discussion',
    description: 'Models that challenge and build on each other for thorough exploration',
    icon: Icons.scale,
    requiredTier: SubscriptionTiers.PRO,
    order: 5,
    mode: ChatModes.ANALYZING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_5_1, role: 'Analyst' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Critic' },
      { modelId: ModelIds.GOOGLE_GEMINI_3_PRO_PREVIEW, role: 'Reframer' },
      { modelId: ModelIds.X_AI_GROK_4, role: 'Challenger' },
    ],
  },
  {
    id: ModelPresetIds.CREATIVE_EXPLORATION,
    name: 'Creative Exploration',
    description: 'Models spark off each other\'s ideas, branching into unexpected territory',
    icon: Icons.sparkles,
    requiredTier: SubscriptionTiers.PRO,
    order: 6,
    mode: ChatModes.BRAINSTORMING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Ideator' },
      { modelId: ModelIds.GOOGLE_GEMINI_3_PRO_PREVIEW, role: 'Wildcard' },
      { modelId: ModelIds.OPENAI_GPT_5, role: 'Builder' },
      { modelId: ModelIds.MISTRALAI_MISTRAL_LARGE_2512, role: 'Synthesizer' },
    ],
  },
  {
    id: ModelPresetIds.CRITICAL_DEBATE,
    name: 'Critical Debate',
    description: 'High-powered models that genuinely disagree—and explain why',
    icon: Icons.swords,
    requiredTier: SubscriptionTiers.PRO,
    order: 7,
    mode: ChatModes.DEBATING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_O3, role: 'Advocate' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5, role: 'Critic' },
      { modelId: ModelIds.X_AI_GROK_4, role: 'Contrarian' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Balancer' },
    ],
  },
  {
    id: ModelPresetIds.DEVILS_ADVOCATE,
    name: 'Devil\'s Advocate Panel',
    description: 'Models that push back on your ideas to strengthen your thinking',
    icon: Icons.shieldAlert,
    requiredTier: SubscriptionTiers.PRO,
    order: 8,
    mode: ChatModes.DEBATING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_5_1, role: 'Proposer' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Skeptic' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Devil\'s Advocate' },
    ],
  },
  {
    id: ModelPresetIds.DEEP_ANALYSIS,
    name: 'Deep Analysis',
    description: 'Deep reasoners that examine each other\'s assumptions and blind spots',
    icon: Icons.brain,
    requiredTier: SubscriptionTiers.PRO,
    order: 9,
    mode: ChatModes.ANALYZING,
    searchEnabled: false,
    modelRoles: [
      { modelId: ModelIds.OPENAI_O1, role: 'Reasoner' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4, role: 'Systems Thinker' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Synthesizer' },
    ],
  },
  {
    id: ModelPresetIds.RESEARCH_EVIDENCE,
    name: 'Research & Evidence Review',
    description: 'Models cross-check each other\'s sources and synthesize findings',
    icon: Icons.fileSearch,
    requiredTier: SubscriptionTiers.PRO,
    order: 10,
    mode: ChatModes.ANALYZING,
    searchEnabled: true,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_4_1, role: 'Researcher' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Verifier' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Synthesizer' },
      { modelId: ModelIds.MISTRALAI_MISTRAL_LARGE_2512, role: 'Fact Checker' },
    ],
  },
  {
    id: ModelPresetIds.TECHNICAL_REVIEW,
    name: 'Technical Review',
    description: 'Models challenge each other on architecture, correctness, and trade-offs',
    icon: Icons.wrench,
    requiredTier: SubscriptionTiers.PRO,
    order: 11,
    mode: ChatModes.SOLVING,
    searchEnabled: 'conditional',
    modelRoles: [
      { modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5, role: 'Architect' },
      { modelId: ModelIds.OPENAI_GPT_5_1, role: 'Code Reviewer' },
      { modelId: ModelIds.GOOGLE_GEMINI_3_PRO_PREVIEW, role: 'Security Reviewer' },
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

  const compatibleSet = new Set(compatibleModelIds);
  const participants = preset.modelRoles
    .filter(mr => compatibleSet.has(mr.modelId))
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
