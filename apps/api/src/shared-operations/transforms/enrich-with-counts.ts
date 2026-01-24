/**
 * Count Enrichment Utilities
 *
 * Transform project/thread data to include computed counts.
 */

import type { ChatProject } from '@/db/validation/project';

/**
 * Project with attachment and thread relation arrays (from relational query)
 */
type ProjectWithRelations = {
  attachments?: Array<{ id: string }>;
  threads?: Array<{ id: string }>;
} & ChatProject;

/**
 * Project with computed counts for API responses
 */
export type EnrichedProjectWithCounts = {
  attachmentCount: number;
  threadCount: number;
} & ChatProject;

/**
 * Enrich project with attachment and thread counts
 *
 * Transforms relational data to computed counts for API responses.
 *
 * @example
 * ```ts
 * const projectsWithRelations = await db.query.chatProject.findMany({
 *   with: { attachments: { columns: { id: true } }, threads: { columns: { id: true } } }
 * });
 * const items = projectsWithRelations.map(enrichProjectWithCounts);
 * ```
 */
export function enrichProjectWithCounts(
  project: ProjectWithRelations,
): EnrichedProjectWithCounts {
  const { attachments, threads, ...projectData } = project;
  return {
    ...projectData,
    attachmentCount: attachments?.length ?? 0,
    threadCount: threads?.length ?? 0,
  };
}

/**
 * Batch enrich projects with counts
 */
export function enrichProjectsWithCounts(
  projects: ProjectWithRelations[],
): EnrichedProjectWithCounts[] {
  return projects.map(enrichProjectWithCounts);
}
