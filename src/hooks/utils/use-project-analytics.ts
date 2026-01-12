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
 *     trackProjectEvent('action_performed', { actionType: 'example' });
 *   };
 * }
 * ```
 */

'use client';

import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';

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

export type ProjectAnalyticsHook = {
  identifyProject: (project: ProjectInfo) => void;
  trackProjectEvent: (eventName: string, properties?: Record<string, unknown>) => void;
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
    (eventName: string, properties?: Record<string, unknown>) => {
      if (!posthog)
        return;

      posthog.capture(eventName, {
        ...properties,
        // Group events are automatically associated with the current group(s)
        // via posthog.group() calls
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
