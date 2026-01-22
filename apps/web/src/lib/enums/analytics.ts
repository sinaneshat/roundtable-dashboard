/**
 * Analytics Enums
 *
 * Enums specific to project analytics and event tracking.
 * Optimized: Zod schemas lazy-loaded to reduce initial bundle size.
 */

// ============================================================================
// PROJECT ANALYTICS EVENT TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const PROJECT_ANALYTICS_EVENT_TYPES = [
  'milestone_completed',
  'member_added',
  'status_changed',
  'task_created',
  'project_action',
] as const;

// 2. TYPESCRIPT TYPE (no Zod dependency)
export type ProjectAnalyticsEventType = (typeof PROJECT_ANALYTICS_EVENT_TYPES)[number];

// 3. DEFAULT VALUE
export const DEFAULT_PROJECT_ANALYTICS_EVENT_TYPE: ProjectAnalyticsEventType = 'project_action';

// 4. CONSTANT OBJECT
export const ProjectAnalyticsEventTypes = {
  MILESTONE_COMPLETED: 'milestone_completed' as const,
  MEMBER_ADDED: 'member_added' as const,
  STATUS_CHANGED: 'status_changed' as const,
  TASK_CREATED: 'task_created' as const,
  PROJECT_ACTION: 'project_action' as const,
} as const;

// 5. TYPE GUARD (no Zod - simple runtime check)
export function isProjectAnalyticsEventType(value: unknown): value is ProjectAnalyticsEventType {
  return typeof value === 'string' && PROJECT_ANALYTICS_EVENT_TYPES.includes(value as ProjectAnalyticsEventType);
}

// 6. ZOD SCHEMA (lazy-loaded only when validation is needed)
export async function getProjectAnalyticsEventTypeSchema() {
  const { z } = await import('zod');
  return z.enum(PROJECT_ANALYTICS_EVENT_TYPES);
}
