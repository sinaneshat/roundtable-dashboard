/**
 * Project Types
 *
 * Frontend type definitions for project-related query parameters.
 * These types match the API schema structure from apps/api/src/routes/project/schema.ts
 * but are defined locally for the web app to avoid coupling to backend implementation.
 */

import type { ProjectMemorySource } from '@roundtable/shared';

/**
 * Query parameters for listing project attachments
 */
export type ListProjectAttachmentsQuery = {
  cursor?: string;
  limit?: number;
};

/**
 * Query parameters for listing project memories
 */
export type ListProjectMemoriesQuery = {
  cursor?: string;
  limit?: number;
  source?: ProjectMemorySource;
  indexedOnly?: boolean;
};
