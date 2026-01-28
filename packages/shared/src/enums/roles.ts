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
  ANALYST: 'Analyst' as const,
  BUILDER: 'Builder' as const,
  CRITIC: 'Critic' as const,
  IDEATOR: 'Ideator' as const,
  STRATEGIST: 'Strategist' as const,
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
  BRIEFCASE: 'briefcase' as const,
  GRADUATION_CAP: 'graduationCap' as const,
  HAMMER: 'hammer' as const,
  LIGHTBULB: 'lightbulb' as const,
  MESSAGE_SQUARE: 'messageSquare' as const,
  SPARKLES: 'sparkles' as const,
  TARGET: 'target' as const,
  TRENDING_UP: 'trendingUp' as const,
  USERS: 'users' as const,
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
  Ideator: {
    bgColor: 'rgba(34, 197, 94, 0.2)',
    iconColor: '#4ade80',
  },
  Strategist: {
    bgColor: 'rgba(59, 130, 246, 0.2)',
    iconColor: '#60a5fa',
  },
} as const;

export const ROLE_NAME_MAPPINGS = {
  'Alternative Framer': ShortRoleNames.IDEATOR,
  'Alternative Lens': ShortRoleNames.ANALYST,
  'Assumption Challenger': ShortRoleNames.CRITIC,
  'Assumption Critic': ShortRoleNames.CRITIC,
  // Building/Implementation roles → Builder
  'Builder': ShortRoleNames.BUILDER,
  'Contrarian': ShortRoleNames.CRITIC,

  'Correctness Reviewer': ShortRoleNames.CRITIC,
  'Cross-Checker': ShortRoleNames.ANALYST,
  'Deep Reasoner': ShortRoleNames.STRATEGIST,
  // Critical/Skeptical roles → Critic
  'Devil\'s Advocate': ShortRoleNames.CRITIC,
  'Domain Expert': ShortRoleNames.ANALYST,
  'Evidence Gatherer': ShortRoleNames.ANALYST,

  'Framer': ShortRoleNames.IDEATOR,
  'Grounding Voice': ShortRoleNames.CRITIC,
  'Ideator': ShortRoleNames.IDEATOR,
  'Implementation Strategist': ShortRoleNames.STRATEGIST,
  'Implementer': ShortRoleNames.BUILDER,
  'Lateral Thinker': ShortRoleNames.IDEATOR,
  // Moderation/Support roles
  'Mediator': ShortRoleNames.ANALYST,

  'Nuancer': ShortRoleNames.ANALYST,
  'Position Advocate': ShortRoleNames.STRATEGIST,
  'Practical Evaluator': ShortRoleNames.CRITIC,

  'Proposer': ShortRoleNames.STRATEGIST,
  'Secondary Theorist': ShortRoleNames.ANALYST,
  'Skeptic': ShortRoleNames.CRITIC,
  // Strategy/Reasoning roles → Strategist
  'Structured Reasoner': ShortRoleNames.STRATEGIST,
  'Synthesizer': ShortRoleNames.BUILDER,
  'Systems Thinker': ShortRoleNames.STRATEGIST,
  // Analysis roles → Analyst
  'The Data Analyst': ShortRoleNames.ANALYST,

  // Ideation/Creative roles → Ideator
  'The Ideator': ShortRoleNames.IDEATOR,
  'Trade-Off Analyst': ShortRoleNames.ANALYST,
  'Trade-off Clarifier': ShortRoleNames.ANALYST,
  'User Advocate': ShortRoleNames.ANALYST,
  'Visionary Thinker': ShortRoleNames.IDEATOR,
} as const;

export const PredefinedRoleTemplateSchema = z.object({
  category: ShortRoleNameSchema,
  description: z.string(),
  iconName: RoleIconNameSchema,
  name: z.string(),
}).strict();

export type PredefinedRoleTemplate = z.infer<typeof PredefinedRoleTemplateSchema>;

export const PREDEFINED_ROLE_TEMPLATES: readonly PredefinedRoleTemplate[] = [
  {
    category: ShortRoleNames.IDEATOR,
    description: 'Generate creative ideas and innovative solutions',
    iconName: 'lightbulb',
    name: 'The Ideator',
  },
  {
    category: ShortRoleNames.CRITIC,
    description: 'Challenge assumptions and identify potential issues',
    iconName: 'messageSquare',
    name: 'Devil\'s Advocate',
  },
  {
    category: ShortRoleNames.BUILDER,
    description: 'Focus on practical implementation and execution',
    iconName: 'hammer',
    name: 'Builder',
  },
  {
    category: ShortRoleNames.CRITIC,
    description: 'Assess feasibility and real-world applicability',
    iconName: 'target',
    name: 'Practical Evaluator',
  },
  {
    category: ShortRoleNames.IDEATOR,
    description: 'Think big picture and long-term strategy',
    iconName: 'sparkles',
    name: 'Visionary Thinker',
  },
  {
    category: ShortRoleNames.ANALYST,
    description: 'Provide deep domain-specific knowledge',
    iconName: 'graduationCap',
    name: 'Domain Expert',
  },
  {
    category: ShortRoleNames.ANALYST,
    description: 'Champion user needs and experience',
    iconName: 'users',
    name: 'User Advocate',
  },
  {
    category: ShortRoleNames.STRATEGIST,
    description: 'Plan execution strategy and implementation',
    iconName: 'briefcase',
    name: 'Implementation Strategist',
  },
  {
    category: ShortRoleNames.ANALYST,
    description: 'Analyze data and provide insights',
    iconName: 'trendingUp',
    name: 'The Data Analyst',
  },
] as const;

function isShortRoleName(role: unknown): role is ShortRoleName {
  return ShortRoleNameSchema.safeParse(role).success;
}

export function getShortRoleName(role: string): string {
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
