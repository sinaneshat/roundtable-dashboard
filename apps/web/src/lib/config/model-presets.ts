/**
 * Model Preset Configuration
 *
 * Predefined model combinations and configurations for different use cases.
 * Follows Zod-first pattern with schema validation and type inference.
 */

import { z } from '@hono/zod-openapi';
import type { SubscriptionTier } from '@roundtable/shared';
import { ChatModes, ChatModeSchema, ModelIds, SUBSCRIPTION_TIERS, SubscriptionTiers, SubscriptionTierSchema } from '@roundtable/shared';

import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
import type { TranslationFunction } from '@/lib/i18n/use-translations';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

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
  description: z.string().min(1),
  icon: z.custom<Icon>(),
  id: z.string().min(1),
  mode: ChatModeSchema,
  modelRoles: z.array(PresetModelRoleSchema),
  name: z.string().min(1),
  order: z.number().int().nonnegative(),
  requiredTier: SubscriptionTierSchema,
  searchEnabled: z.union([z.boolean(), z.literal('conditional')]),
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
  // PRO tier presets
  BALANCED_DISCUSSION: 'balanced-discussion' as const,
  BUDGET_BRAINSTORM: 'budget-brainstorm' as const,
  CREATIVE_EXPLORATION: 'creative-exploration' as const,
  CRITICAL_DEBATE: 'critical-debate' as const,
  DEEP_ANALYSIS: 'deep-analysis' as const,
  DEVILS_ADVOCATE: 'devils-advocate' as const,
  FAST_DEBATE: 'fast-debate' as const,
  PROBLEM_SOLVER: 'problem-solver' as const,
  // FREE tier presets
  QUICK_PERSPECTIVES: 'quick-perspectives' as const,
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
    description: 'Fast-moving dialogue to quickly surface different angles on your question',
    icon: Icons.messagesSquare,
    id: ModelPresetIds.QUICK_PERSPECTIVES,
    mode: ChatModes.ANALYZING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_4O_MINI, role: 'Analyst' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: 'Challenger' },
      { modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, role: 'Synthesizer' },
    ],
    name: 'Quick Perspectives',
    order: 1,
    requiredTier: SubscriptionTiers.FREE,
    searchEnabled: false,
  },
  // ============================================================================
  // PRO TIER PRESETS - Budget models with provider diversity (PRO-only access)
  // Uses FREE tier models but requires PRO subscription to unlock preset
  // ============================================================================
  {
    description: 'Creative idea generation with efficient models that spark off each other',
    icon: Icons.lightbulb,
    id: ModelPresetIds.BUDGET_BRAINSTORM,
    mode: ChatModes.BRAINSTORMING,
    modelRoles: [
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: 'Ideator' },
      { modelId: ModelIds.X_AI_GROK_4_FAST, role: 'Builder' },
      { modelId: ModelIds.DEEPSEEK_DEEPSEEK_V3_2, role: 'Wildcard' },
    ],
    name: 'Budget Brainstorm',
    order: 2,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'Efficient models that challenge perspectives and find common ground',
    icon: Icons.swords,
    id: ModelPresetIds.FAST_DEBATE,
    mode: ChatModes.DEBATING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_4_1_NANO, role: 'Advocate' },
      { modelId: ModelIds.X_AI_GROK_4_1_FAST, role: 'Contrarian' },
      { modelId: ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324, role: 'Balancer' },
    ],
    name: 'Fast Debate',
    order: 3,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'Technical models that collaborate to find practical solutions',
    icon: Icons.wrench,
    id: ModelPresetIds.PROBLEM_SOLVER,
    mode: ChatModes.SOLVING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_5_NANO, role: 'Builder' },
      { modelId: ModelIds.X_AI_GROK_CODE_FAST_1, role: 'Reviewer' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_FLASH, role: 'Optimizer' },
    ],
    name: 'Problem Solver',
    order: 4,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  // ============================================================================
  // PRO TIER PRESETS - Premium models with enhanced capabilities
  // ============================================================================
  {
    description: 'Models that challenge and build on each other for thorough exploration',
    icon: Icons.scale,
    id: ModelPresetIds.BALANCED_DISCUSSION,
    mode: ChatModes.ANALYZING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_5_1, role: 'Analyst' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Critic' },
      { modelId: ModelIds.GOOGLE_GEMINI_3_PRO_PREVIEW, role: 'Reframer' },
      { modelId: ModelIds.X_AI_GROK_4, role: 'Challenger' },
    ],
    name: 'Balanced Discussion',
    order: 5,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'Models spark off each other\'s ideas, branching into unexpected territory',
    icon: Icons.sparkles,
    id: ModelPresetIds.CREATIVE_EXPLORATION,
    mode: ChatModes.BRAINSTORMING,
    modelRoles: [
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Ideator' },
      { modelId: ModelIds.GOOGLE_GEMINI_3_PRO_PREVIEW, role: 'Wildcard' },
      { modelId: ModelIds.OPENAI_GPT_5, role: 'Builder' },
      { modelId: ModelIds.MISTRALAI_MISTRAL_LARGE_2512, role: 'Synthesizer' },
    ],
    name: 'Creative Exploration',
    order: 6,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'High-powered models that genuinely disagree—and explain why',
    icon: Icons.swords,
    id: ModelPresetIds.CRITICAL_DEBATE,
    mode: ChatModes.DEBATING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_O3, role: 'Advocate' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5, role: 'Critic' },
      { modelId: ModelIds.X_AI_GROK_4, role: 'Contrarian' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Balancer' },
    ],
    name: 'Critical Debate',
    order: 7,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'Models that push back on your ideas to strengthen your thinking',
    icon: Icons.shieldAlert,
    id: ModelPresetIds.DEVILS_ADVOCATE,
    mode: ChatModes.DEBATING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_5_1, role: 'Proposer' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Skeptic' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Devil\'s Advocate' },
    ],
    name: 'Devil\'s Advocate Panel',
    order: 8,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'Deep reasoners that examine each other\'s assumptions and blind spots',
    icon: Icons.brain,
    id: ModelPresetIds.DEEP_ANALYSIS,
    mode: ChatModes.ANALYZING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_O1, role: 'Reasoner' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4, role: 'Systems Thinker' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Synthesizer' },
    ],
    name: 'Deep Analysis',
    order: 9,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: false,
  },
  {
    description: 'Models cross-check each other\'s sources and synthesize findings',
    icon: Icons.fileSearch,
    id: ModelPresetIds.RESEARCH_EVIDENCE,
    mode: ChatModes.ANALYZING,
    modelRoles: [
      { modelId: ModelIds.OPENAI_GPT_4_1, role: 'Researcher' },
      { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Verifier' },
      { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, role: 'Synthesizer' },
      { modelId: ModelIds.MISTRALAI_MISTRAL_LARGE_2512, role: 'Fact Checker' },
    ],
    name: 'Research & Evidence Review',
    order: 10,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: true,
  },
  {
    description: 'Models challenge each other on architecture, correctness, and trade-offs',
    icon: Icons.wrench,
    id: ModelPresetIds.TECHNICAL_REVIEW,
    mode: ChatModes.SOLVING,
    modelRoles: [
      { modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5, role: 'Architect' },
      { modelId: ModelIds.OPENAI_GPT_5_1, role: 'Code Reviewer' },
      { modelId: ModelIds.GOOGLE_GEMINI_3_PRO_PREVIEW, role: 'Security Reviewer' },
    ],
    name: 'Technical Review',
    order: 11,
    requiredTier: SubscriptionTiers.PRO,
    searchEnabled: 'conditional',
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

/**
 * Filter preset participants by model compatibility
 *
 * NOTE: This function uses dynamic import for toastManager to avoid bundling
 * React into server-side API routes. The @/lib/toast module imports React for
 * toast state management, which causes build errors in API routes.
 */
export async function filterPresetParticipants(
  preset: ModelPreset,
  incompatibleModelIds: Set<string>,
  t: TranslationFunction,
  toastNamespace: ToastNamespace = DEFAULT_TOAST_NAMESPACE,
): Promise<PresetFilterResult> {
  // Dynamic import to avoid bundling React (via toastManager) into API routes
  const { toastManager } = await import('@/lib/toast');

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
      priority: index,
      role: mr.role,
    }));

  return {
    participants,
    success: true,
  };
}
