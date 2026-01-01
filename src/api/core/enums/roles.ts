import { z } from '@hono/zod-openapi';

import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';

// ============================================================================
// SHORT ROLE NAME
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SHORT_ROLE_NAMES = ['Ideator', 'Strategist', 'Analyst', 'Builder', 'Critic'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ShortRoleNameSchema = z.enum(SHORT_ROLE_NAMES).openapi({
  description: 'Short role name category for participant roles',
  example: 'Analyst',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ShortRoleName = z.infer<typeof ShortRoleNameSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_SHORT_ROLE_NAME: ShortRoleName = 'Analyst';

// 5️⃣ CONSTANT OBJECT - For usage in code
export const ShortRoleNames = {
  IDEATOR: 'Ideator' as const,
  STRATEGIST: 'Strategist' as const,
  ANALYST: 'Analyst' as const,
  BUILDER: 'Builder' as const,
  CRITIC: 'Critic' as const,
} as const;

export const RoleCategoryMetadataSchema = z.object({
  bgColor: z.string(),
  iconColor: z.string(),
});

export type RoleCategoryMetadata = z.infer<typeof RoleCategoryMetadataSchema>;

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

export const ROLE_NAME_MAPPINGS = {
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

export type PredefinedRoleTemplate = {
  name: string;
  icon: Icon;
  description: string;
  category: ShortRoleName;
};

export const PREDEFINED_ROLE_TEMPLATES: readonly PredefinedRoleTemplate[] = [
  {
    name: 'The Ideator',
    icon: Icons.lightbulb,
    description: 'Generate creative ideas and innovative solutions',
    category: ShortRoleNames.IDEATOR,
  },
  {
    name: 'Devil\'s Advocate',
    icon: Icons.messageSquare,
    description: 'Challenge assumptions and identify potential issues',
    category: ShortRoleNames.CRITIC,
  },
  {
    name: 'Builder',
    icon: Icons.hammer,
    description: 'Focus on practical implementation and execution',
    category: ShortRoleNames.BUILDER,
  },
  {
    name: 'Practical Evaluator',
    icon: Icons.target,
    description: 'Assess feasibility and real-world applicability',
    category: ShortRoleNames.CRITIC,
  },
  {
    name: 'Visionary Thinker',
    icon: Icons.sparkles,
    description: 'Think big picture and long-term strategy',
    category: ShortRoleNames.IDEATOR,
  },
  {
    name: 'Domain Expert',
    icon: Icons.graduationCap,
    description: 'Provide deep domain-specific knowledge',
    category: ShortRoleNames.ANALYST,
  },
  {
    name: 'User Advocate',
    icon: Icons.users,
    description: 'Champion user needs and experience',
    category: ShortRoleNames.ANALYST,
  },
  {
    name: 'Implementation Strategist',
    icon: Icons.briefcase,
    description: 'Plan execution strategy and implementation',
    category: ShortRoleNames.STRATEGIST,
  },
  {
    name: 'The Data Analyst',
    icon: Icons.trendingUp,
    description: 'Analyze data and provide insights',
    category: ShortRoleNames.ANALYST,
  },
] as const;

function isShortRoleName(role: string): role is ShortRoleName {
  return SHORT_ROLE_NAMES.includes(role as ShortRoleName);
}

export function getShortRoleName(role: string): ShortRoleName | string {
  if (role in ROLE_NAME_MAPPINGS) {
    return ROLE_NAME_MAPPINGS[role as keyof typeof ROLE_NAME_MAPPINGS];
  }
  return role;
}

export function getRoleCategoryMetadata(role: string): RoleCategoryMetadata {
  const shortRole = getShortRoleName(role);

  if (isShortRoleName(shortRole)) {
    return ROLE_CATEGORY_METADATA[shortRole];
  }

  return ROLE_CATEGORY_METADATA[ShortRoleNames.ANALYST];
}

export function getPredefinedRoleTemplate(name: string): PredefinedRoleTemplate | undefined {
  return PREDEFINED_ROLE_TEMPLATES.find(t => t.name === name);
}

export function isPredefinedRole(name: string): boolean {
  return PREDEFINED_ROLE_TEMPLATES.some(t => t.name === name);
}
