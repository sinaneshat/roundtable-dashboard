import { z } from '@hono/zod-openapi';

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

// ============================================================================
// ROLE ICON NAME (string literals - frontend maps to actual icon components)
// ============================================================================

export const ROLE_ICON_NAMES = [
  'lightbulb',
  'messageSquare',
  'hammer',
  'target',
  'sparkles',
  'graduationCap',
  'users',
  'briefcase',
  'trendingUp',
] as const;

export const RoleIconNameSchema = z.enum(ROLE_ICON_NAMES).openapi({
  description: 'Icon name for role template (maps to frontend icon component)',
  example: 'lightbulb',
});

export type RoleIconName = z.infer<typeof RoleIconNameSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_ROLE_ICON_NAME: RoleIconName = 'lightbulb';

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const RoleIconNames = {
  LIGHTBULB: 'lightbulb' as const,
  MESSAGE_SQUARE: 'messageSquare' as const,
  HAMMER: 'hammer' as const,
  TARGET: 'target' as const,
  SPARKLES: 'sparkles' as const,
  GRADUATION_CAP: 'graduationCap' as const,
  USERS: 'users' as const,
  BRIEFCASE: 'briefcase' as const,
  TRENDING_UP: 'trendingUp' as const,
} as const;

// ============================================================================
// ROLE CATEGORY METADATA
// ============================================================================

export const RoleCategoryMetadataSchema = z.object({
  bgColor: z.string(),
  iconColor: z.string(),
}).strict();

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
  iconName: RoleIconName;
  description: string;
  category: ShortRoleName;
};

export const PREDEFINED_ROLE_TEMPLATES: readonly PredefinedRoleTemplate[] = [
  {
    name: 'The Ideator',
    iconName: 'lightbulb',
    description: 'Generate creative ideas and innovative solutions',
    category: ShortRoleNames.IDEATOR,
  },
  {
    name: 'Devil\'s Advocate',
    iconName: 'messageSquare',
    description: 'Challenge assumptions and identify potential issues',
    category: ShortRoleNames.CRITIC,
  },
  {
    name: 'Builder',
    iconName: 'hammer',
    description: 'Focus on practical implementation and execution',
    category: ShortRoleNames.BUILDER,
  },
  {
    name: 'Practical Evaluator',
    iconName: 'target',
    description: 'Assess feasibility and real-world applicability',
    category: ShortRoleNames.CRITIC,
  },
  {
    name: 'Visionary Thinker',
    iconName: 'sparkles',
    description: 'Think big picture and long-term strategy',
    category: ShortRoleNames.IDEATOR,
  },
  {
    name: 'Domain Expert',
    iconName: 'graduationCap',
    description: 'Provide deep domain-specific knowledge',
    category: ShortRoleNames.ANALYST,
  },
  {
    name: 'User Advocate',
    iconName: 'users',
    description: 'Champion user needs and experience',
    category: ShortRoleNames.ANALYST,
  },
  {
    name: 'Implementation Strategist',
    iconName: 'briefcase',
    description: 'Plan execution strategy and implementation',
    category: ShortRoleNames.STRATEGIST,
  },
  {
    name: 'The Data Analyst',
    iconName: 'trendingUp',
    description: 'Analyze data and provide insights',
    category: ShortRoleNames.ANALYST,
  },
] as const;

function isShortRoleName(role: unknown): role is ShortRoleName {
  return ShortRoleNameSchema.safeParse(role).success;
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
