/**
 * Role Enums and Mappings
 *
 * Single source of truth for AI participant roles in roundtable discussions.
 * Follows the 5-part enum pattern for maximum type safety and code reduction.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  GraduationCap,
  Hammer,
  Lightbulb,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { z } from 'zod';

// ============================================================================
// SHORT ROLE NAMES (Display Categories) - 5-Part Pattern
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth
export const SHORT_ROLE_NAMES = ['Ideator', 'Strategist', 'Analyst', 'Builder', 'Critic'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SHORT_ROLE_NAME: ShortRoleName = 'Analyst';

// 3️⃣ ZOD SCHEMA - Runtime validation
export const ShortRoleNameSchema = z.enum(SHORT_ROLE_NAMES);

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod
export type ShortRoleName = z.infer<typeof ShortRoleNameSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ShortRoleNames = {
  IDEATOR: 'Ideator' as const,
  STRATEGIST: 'Strategist' as const,
  ANALYST: 'Analyst' as const,
  BUILDER: 'Builder' as const,
  CRITIC: 'Critic' as const,
} as const;

// ============================================================================
// ROLE CATEGORY METADATA
// ============================================================================

type RoleCategoryMetadata = {
  bgColor: string;
  iconColor: string;
};

export const ROLE_CATEGORY_METADATA: Record<ShortRoleName, RoleCategoryMetadata> = {
  Ideator: {
    bgColor: 'rgba(34, 197, 94, 0.2)',
    iconColor: '#4ade80',
  },
  Strategist: {
    bgColor: 'rgba(59, 130, 246, 0.2)',
    iconColor: '#60a5fa',
  },
  Analyst: {
    bgColor: 'rgba(6, 182, 212, 0.2)',
    iconColor: '#22d3ee',
  },
  Builder: {
    bgColor: 'rgba(249, 115, 22, 0.2)',
    iconColor: '#fb923c',
  },
  Critic: {
    bgColor: 'rgba(236, 72, 153, 0.2)',
    iconColor: '#f472b6',
  },
} as const;

// ============================================================================
// ROLE MAPPINGS - Full role names → Short category names
// ============================================================================

/**
 * Maps verbose role names to single-word category labels.
 * This is the single source of truth for role name conversions.
 */
export const ROLE_NAME_MAPPINGS: Record<string, ShortRoleName> = {
  // Ideation/Creative roles → Ideator
  'The Ideator': ShortRoleNames.IDEATOR,
  'Ideator': ShortRoleNames.IDEATOR,
  'Lateral Thinker': ShortRoleNames.IDEATOR,
  'Visionary Thinker': ShortRoleNames.IDEATOR,
  'Framer': ShortRoleNames.IDEATOR,
  'Alternative Framer': ShortRoleNames.IDEATOR,

  // Strategy/Reasoning roles → Strategist
  'Structured Reasoner': ShortRoleNames.STRATEGIST,
  'Deep Reasoner': ShortRoleNames.STRATEGIST,
  'Systems Thinker': ShortRoleNames.STRATEGIST,
  'Position Advocate': ShortRoleNames.STRATEGIST,
  'Proposer': ShortRoleNames.STRATEGIST,
  'Implementation Strategist': ShortRoleNames.STRATEGIST,

  // Analysis roles → Analyst
  'The Data Analyst': ShortRoleNames.ANALYST,
  'Trade-Off Analyst': ShortRoleNames.ANALYST,
  'Trade-off Clarifier': ShortRoleNames.ANALYST,
  'Evidence Gatherer': ShortRoleNames.ANALYST,
  'Cross-Checker': ShortRoleNames.ANALYST,
  'Alternative Lens': ShortRoleNames.ANALYST,
  'Nuancer': ShortRoleNames.ANALYST,

  // Building/Implementation roles → Builder
  'Builder': ShortRoleNames.BUILDER,
  'Implementer': ShortRoleNames.BUILDER,
  'Synthesizer': ShortRoleNames.BUILDER,

  // Critical/Skeptical roles → Critic
  'Devil\'s Advocate': ShortRoleNames.CRITIC,
  'Assumption Challenger': ShortRoleNames.CRITIC,
  'Assumption Critic': ShortRoleNames.CRITIC,
  'Skeptic': ShortRoleNames.CRITIC,
  'Contrarian': ShortRoleNames.CRITIC,
  'Correctness Reviewer': ShortRoleNames.CRITIC,
  'Practical Evaluator': ShortRoleNames.CRITIC,

  // Moderation/Support roles
  'Mediator': ShortRoleNames.ANALYST,
  'Grounding Voice': ShortRoleNames.CRITIC,
  'User Advocate': ShortRoleNames.ANALYST,
  'Domain Expert': ShortRoleNames.ANALYST,
  'Secondary Theorist': ShortRoleNames.ANALYST,
} as const;

// ============================================================================
// PREDEFINED ROLE TEMPLATES
// ============================================================================

export type PredefinedRoleTemplate = {
  name: string;
  icon: LucideIcon;
  description: string;
  category: ShortRoleName;
};

/**
 * Predefined role templates for the role selection UI.
 * These are default role templates that users can select and customize.
 */
export const PREDEFINED_ROLE_TEMPLATES: readonly PredefinedRoleTemplate[] = [
  {
    name: 'The Ideator',
    icon: Lightbulb,
    description: 'Generate creative ideas and innovative solutions',
    category: ShortRoleNames.IDEATOR,
  },
  {
    name: 'Devil\'s Advocate',
    icon: MessageSquare,
    description: 'Challenge assumptions and identify potential issues',
    category: ShortRoleNames.CRITIC,
  },
  {
    name: 'Builder',
    icon: Hammer,
    description: 'Focus on practical implementation and execution',
    category: ShortRoleNames.BUILDER,
  },
  {
    name: 'Practical Evaluator',
    icon: Target,
    description: 'Assess feasibility and real-world applicability',
    category: ShortRoleNames.CRITIC,
  },
  {
    name: 'Visionary Thinker',
    icon: Sparkles,
    description: 'Think big picture and long-term strategy',
    category: ShortRoleNames.IDEATOR,
  },
  {
    name: 'Domain Expert',
    icon: GraduationCap,
    description: 'Provide deep domain-specific knowledge',
    category: ShortRoleNames.ANALYST,
  },
  {
    name: 'User Advocate',
    icon: Users,
    description: 'Champion user needs and experience',
    category: ShortRoleNames.ANALYST,
  },
  {
    name: 'Implementation Strategist',
    icon: Briefcase,
    description: 'Plan execution strategy and implementation',
    category: ShortRoleNames.STRATEGIST,
  },
  {
    name: 'The Data Analyst',
    icon: TrendingUp,
    description: 'Analyze data and provide insights',
    category: ShortRoleNames.ANALYST,
  },
] as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get short role name (category) from full role name.
 * Returns the original role name if no mapping exists.
 *
 * @param role - Full role name
 * @returns Short category name or original name if not found
 */
export function getShortRoleName(role: string): string {
  return ROLE_NAME_MAPPINGS[role] ?? role;
}

/**
 * Get role category metadata (colors) from full role name.
 *
 * @param role - Full role name
 * @returns Role category metadata with colors
 */
export function getRoleCategoryMetadata(role: string): RoleCategoryMetadata {
  const shortRole = getShortRoleName(role);

  if (shortRole in ROLE_CATEGORY_METADATA) {
    return ROLE_CATEGORY_METADATA[shortRole as ShortRoleName];
  }

  return ROLE_CATEGORY_METADATA[ShortRoleNames.ANALYST];
}

/**
 * Get predefined role template by name.
 *
 * @param name - Role template name
 * @returns Role template or undefined
 */
export function getPredefinedRoleTemplate(name: string): PredefinedRoleTemplate | undefined {
  return PREDEFINED_ROLE_TEMPLATES.find(t => t.name === name);
}

/**
 * Check if a role name matches a predefined role template.
 *
 * @param name - Role name to check
 * @returns True if the name matches a predefined role template
 */
export function isPredefinedRole(name: string): boolean {
  return PREDEFINED_ROLE_TEMPLATES.some(t => t.name === name);
}
