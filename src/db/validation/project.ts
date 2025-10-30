/**
 * Project Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic validations
 *
 * For API-specific validations, see: @/api/routes/project/schema.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type { z } from 'zod';

import { chatProject, projectKnowledgeFile } from '@/db/tables/project';

import { Refinements } from './refinements';

/**
 * Chat Project Schemas
 */
export const chatProjectSelectSchema = createSelectSchema(chatProject);
export const chatProjectInsertSchema = createInsertSchema(chatProject, {
  name: Refinements.title(), // Reuse title refinement (1-200 chars, trimmed)
  description: Refinements.contentOptional(), // Optional description
  r2FolderPrefix: Refinements.content(), // Required folder prefix
});
export const chatProjectUpdateSchema = createUpdateSchema(chatProject, {
  name: Refinements.titleOptional(),
  description: Refinements.contentOptional(),
});

/**
 * Project Knowledge File Schemas
 */
export const projectKnowledgeFileSelectSchema = createSelectSchema(projectKnowledgeFile);
export const projectKnowledgeFileInsertSchema = createInsertSchema(projectKnowledgeFile, {
  filename: Refinements.title(), // Filename (1-200 chars)
  r2Key: Refinements.content(), // R2 storage key
  fileType: Refinements.content(), // MIME type
});
export const projectKnowledgeFileUpdateSchema = createUpdateSchema(projectKnowledgeFile, {
  // status is enum, no refinement needed - already constrained by schema
});

/**
 * Type exports (inferred from Zod schemas)
 */
export type ChatProject = z.infer<typeof chatProjectSelectSchema>;
export type ChatProjectInsert = z.infer<typeof chatProjectInsertSchema>;
export type ChatProjectUpdate = z.infer<typeof chatProjectUpdateSchema>;

export type ProjectKnowledgeFile = z.infer<typeof projectKnowledgeFileSelectSchema>;
export type ProjectKnowledgeFileInsert = z.infer<typeof projectKnowledgeFileInsertSchema>;
export type ProjectKnowledgeFileUpdate = z.infer<typeof projectKnowledgeFileUpdateSchema>;
