/**
 * Analytics Enums
 *
 * Enums specific to project analytics and event tracking.
 */

import { z } from 'zod';

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

// 2. ZOD SCHEMA
export const ProjectAnalyticsEventTypeSchema = z.enum(PROJECT_ANALYTICS_EVENT_TYPES);

// 3. TYPESCRIPT TYPE (inferred from Zod)
export type ProjectAnalyticsEventType = z.infer<typeof ProjectAnalyticsEventTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_PROJECT_ANALYTICS_EVENT_TYPE: ProjectAnalyticsEventType = 'project_action';

// 5. CONSTANT OBJECT
export const ProjectAnalyticsEventTypes = {
  MILESTONE_COMPLETED: 'milestone_completed' as const,
  MEMBER_ADDED: 'member_added' as const,
  STATUS_CHANGED: 'status_changed' as const,
  TASK_CREATED: 'task_created' as const,
  PROJECT_ACTION: 'project_action' as const,
} as const;

// 6. TYPE GUARD (uses Zod safeParse - no type cast)
export function isProjectAnalyticsEventType(value: unknown): value is ProjectAnalyticsEventType {
  return ProjectAnalyticsEventTypeSchema.safeParse(value).success;
}

// 7. PARSE FUNCTION (returns typed value or undefined)
export function parseProjectAnalyticsEventType(value: unknown): ProjectAnalyticsEventType | undefined {
  const result = ProjectAnalyticsEventTypeSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
