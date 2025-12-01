/**
 * Project Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic validations
 *
 * For API-specific validations, see: @/api/routes/project/schema.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import { chatProject, projectAttachment, projectMemory } from '@/db/tables/project';

import { Refinements } from './refinements';

// ============================================================================
// PROJECT METADATA SCHEMAS - Single Source of Truth
// ============================================================================

/**
 * Project Settings Zod schema
 *
 * SINGLE SOURCE OF TRUTH for project settings type
 * Used by chatProject.settings column via $type<>
 */
export const ProjectSettingsSchema = z.object({
  autoIndexing: z.boolean().optional(),
  maxFileSize: z.number().int().positive().optional(),
  allowedFileTypes: z.array(z.string()).optional(),
}).passthrough();

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

/**
 * Project Metadata Zod schema
 *
 * SINGLE SOURCE OF TRUTH for project metadata type
 * Used by chatProject.metadata column via $type<>
 */
export const ProjectMetadataSchema = z.object({
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
}).passthrough();

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

/**
 * Project Attachment RAG Metadata Zod schema
 *
 * SINGLE SOURCE OF TRUTH for project attachment RAG metadata type
 * Used by projectAttachment.ragMetadata column via $type<>
 */
export const ProjectAttachmentRagMetadataSchema = z.object({
  context: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  indexedAt: z.string().optional(),
  errorMessage: z.string().optional(),
}).strict();

export type ProjectAttachmentRagMetadata = z.infer<typeof ProjectAttachmentRagMetadataSchema>;

/**
 * Project Memory Metadata Zod schema
 *
 * SINGLE SOURCE OF TRUTH for project memory metadata type
 * Used by projectMemory.metadata column via $type<>
 */
export const ProjectMemoryMetadataSchema = z.object({
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  extractedAt: z.string().optional(),
  modelUsed: z.string().optional(),
}).passthrough();

export type ProjectMemoryMetadata = z.infer<typeof ProjectMemoryMetadataSchema>;

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
 * Type exports (inferred from Zod schemas)
 */
export type ChatProject = z.infer<typeof chatProjectSelectSchema>;
export type ChatProjectInsert = z.infer<typeof chatProjectInsertSchema>;
export type ChatProjectUpdate = z.infer<typeof chatProjectUpdateSchema>;

/**
 * Project Attachment Schemas (Reference to centralized uploads)
 */
export const projectAttachmentSelectSchema = createSelectSchema(projectAttachment);
export const projectAttachmentInsertSchema = createInsertSchema(projectAttachment);
export const projectAttachmentUpdateSchema = createUpdateSchema(projectAttachment);

export type ProjectAttachment = z.infer<typeof projectAttachmentSelectSchema>;
export type ProjectAttachmentInsert = z.infer<typeof projectAttachmentInsertSchema>;
export type ProjectAttachmentUpdate = z.infer<typeof projectAttachmentUpdateSchema>;

/**
 * Project Memory Schemas
 */
export const projectMemorySelectSchema = createSelectSchema(projectMemory);
export const projectMemoryInsertSchema = createInsertSchema(projectMemory, {
  content: Refinements.content(), // Memory content (required)
  summary: Refinements.contentOptional(), // Optional short summary
});
export const projectMemoryUpdateSchema = createUpdateSchema(projectMemory, {
  content: Refinements.contentOptional(),
  summary: Refinements.contentOptional(),
});

export type ProjectMemory = z.infer<typeof projectMemorySelectSchema>;
export type ProjectMemoryInsert = z.infer<typeof projectMemoryInsertSchema>;
export type ProjectMemoryUpdate = z.infer<typeof projectMemoryUpdateSchema>;
