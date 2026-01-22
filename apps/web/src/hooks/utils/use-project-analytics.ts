/**
 * Project Analytics Hook - Group Analytics for Projects
 *
 * Provides group analytics for projects, enabling analytics at the project level.
 * This allows tracking events and behaviors across all users within a project.
 *
 * Location: /src/hooks/utils/use-project-analytics.ts
 *
 * @example
 * ```typescript
 * import { useProjectAnalytics } from '@/hooks';
 *
 * function ProjectComponent({ projectId }: { projectId: string }) {
 *   const { identifyProject, trackProjectEvent } = useProjectAnalytics();
 *
 *   useEffect(() => {
 *     if (project) {
 *       identifyProject(project);
 *     }
 *   }, [project, identifyProject]);
 *
 *   const handleAction = () => {
 *     trackProjectEvent('project_action', { eventType: 'milestone_completed', milestoneId: 'abc' });
 *   };
 * }
 * ```
 */

import { TaskPrioritySchema } from '@roundtable/shared';
import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { z } from 'zod';

import { ProjectAnalyticsEventTypes } from '@/lib/enums';

type ProjectInfo = {
  id: string;
  name: string;
  description?: string | null;
  color?: string;
  createdAt: Date | string | number;
  userId: string;
};

type ProjectGroupProperties = {
  name: string;
  description?: string;
  color?: string;
  created_at: string;
  owner_id: string;
};

// ============================================================================
// PROJECT EVENT PROPERTY SCHEMAS - Discriminated Union by eventType
// ============================================================================

const ProjectMilestoneEventPropertiesSchema = z.object({
  eventType: z.literal(ProjectAnalyticsEventTypes.MILESTONE_COMPLETED),
  milestoneId: z.string(),
  milestoneName: z.string().optional(),
  completedAt: z.string().datetime().optional(),
});

const ProjectMemberEventPropertiesSchema = z.object({
  eventType: z.literal(ProjectAnalyticsEventTypes.MEMBER_ADDED),
  memberId: z.string(),
  memberRole: z.string().optional(),
  invitedBy: z.string().optional(),
});

const ProjectStatusEventPropertiesSchema = z.object({
  eventType: z.literal(ProjectAnalyticsEventTypes.STATUS_CHANGED),
  previousStatus: z.string(),
  newStatus: z.string(),
  reason: z.string().optional(),
});

const ProjectTaskEventPropertiesSchema = z.object({
  eventType: z.literal(ProjectAnalyticsEventTypes.TASK_CREATED),
  taskId: z.string(),
  taskTitle: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
});

const ProjectActionEventPropertiesSchema = z.object({
  eventType: z.literal(ProjectAnalyticsEventTypes.PROJECT_ACTION),
  actionType: z.string(),
  actionDetails: z.string().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const ProjectEventPropertiesSchema = z.discriminatedUnion('eventType', [
  ProjectMilestoneEventPropertiesSchema,
  ProjectMemberEventPropertiesSchema,
  ProjectStatusEventPropertiesSchema,
  ProjectTaskEventPropertiesSchema,
  ProjectActionEventPropertiesSchema,
]);

export type ProjectEventProperties = z.infer<typeof ProjectEventPropertiesSchema>;

export type ProjectAnalyticsHook = {
  identifyProject: (project: ProjectInfo) => void;
  trackProjectEvent: <T extends ProjectEventProperties['eventType']>(
    eventName: string,
    properties: Extract<ProjectEventProperties, { eventType: T }>,
  ) => void;
  clearProjectGroup: () => void;
};

/**
 * Hook for project-level group analytics
 *
 * PostHog Group Analytics allows tracking events at the project level,
 * not just at the user level. This enables:
 * - Project-level dashboards and insights
 * - Cross-user project behavior analysis
 * - Project health metrics
 */
export function useProjectAnalytics(): ProjectAnalyticsHook {
  const posthog = usePostHog();

  /**
   * Identify the current project as a group
   * Call this when entering a project context
   */
  const identifyProject = useCallback(
    (project: ProjectInfo) => {
      if (!posthog)
        return;

      const properties: ProjectGroupProperties = {
        name: project.name,
        created_at:
          project.createdAt instanceof Date
            ? project.createdAt.toISOString()
            : typeof project.createdAt === 'number'
              ? new Date(project.createdAt).toISOString()
              : project.createdAt,
        owner_id: project.userId,
        color: project.color || 'blue',
      };

      if (project.description) {
        properties.description = project.description;
      }

      posthog.group('project', project.id, properties);
    },
    [posthog],
  );

  /**
   * Track an event associated with the current project group
   * Events will be linked to both the user and the project
   */
  const trackProjectEvent = useCallback(
    <T extends ProjectEventProperties['eventType']>(
      eventName: string,
      properties: Extract<ProjectEventProperties, { eventType: T }>,
    ) => {
      if (!posthog)
        return;

      const validationResult = ProjectEventPropertiesSchema.safeParse(properties);

      if (!validationResult.success) {
        console.error('Invalid project event properties:', validationResult.error);
        return;
      }

      posthog.capture(eventName, {
        ...validationResult.data,
      });
    },
    [posthog],
  );

  /**
   * Clear project group association
   * Call this when leaving project context
   */
  const clearProjectGroup = useCallback(() => {
    if (!posthog)
      return;

    // Reset group by calling group with null
    posthog.resetGroups();
  }, [posthog]);

  return {
    identifyProject,
    trackProjectEvent,
    clearProjectGroup,
  };
}
