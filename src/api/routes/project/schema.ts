import { z } from '@hono/zod-openapi';

import {
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  CursorPaginationQuerySchema,
} from '@/api/core/schemas';
import { PROJECT_FILE_STATUS_ENUM_VALUES } from '@/db/tables/project';
import {
  chatProjectSelectSchema,
  chatProjectUpdateSchema,
  projectKnowledgeFileSelectSchema,
} from '@/db/validation/project';

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

/**
 * Project file status enum schema
 */
export const ProjectFileStatusSchema = z.enum(PROJECT_FILE_STATUS_ENUM_VALUES).openapi({
  description: 'File processing status',
  example: 'indexed',
});

/**
 * Create Project Request Schema
 * Simplified - server generates IDs and folder prefixes
 */
export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(200).openapi({
    description: 'Project name',
    example: 'Q1 Marketing Strategy',
  }),
  description: z.string().max(1000).optional().openapi({
    description: 'Optional project description',
    example: 'Knowledge base for Q1 2025 marketing planning',
  }),
  customInstructions: z.string().max(4000).optional().openapi({
    description: 'Custom instructions for all threads in this project (OpenAI Projects pattern)',
    example: 'Always format responses in markdown. Focus on actionable insights.',
  }),
  autoragInstanceId: z.string().optional().openapi({
    description: 'Optional AutoRAG instance ID override',
    example: 'roundtable-rag-local',
  }),
  settings: z.object({
    autoIndexing: z.boolean().optional().default(true),
    maxFileSize: z.number().int().positive().optional(),
    allowedFileTypes: z.array(z.string()).optional(),
  }).optional().openapi({
    description: 'Project settings',
  }),
  metadata: z.record(z.string(), z.unknown()).optional().openapi({
    description: 'Custom metadata (tags, category, etc.)',
  }),
}).openapi('CreateProjectRequest');

/**
 * Update Project Request Schema
 */
export const UpdateProjectRequestSchema = chatProjectUpdateSchema
  .pick({
    name: true,
    description: true,
    customInstructions: true,
    autoragInstanceId: true,
    settings: true,
    metadata: true,
  })
  .partial()
  .openapi('UpdateProjectRequest');

/**
 * Project Response Schema - includes related data
 */
export const ProjectResponseSchema = chatProjectSelectSchema
  .extend({
    fileCount: z.number().int().nonnegative().openapi({
      description: 'Number of knowledge files in project',
    }),
    threadCount: z.number().int().nonnegative().openapi({
      description: 'Number of threads associated with project',
    }),
  })
  .openapi('ProjectResponse');

/**
 * List Projects Query Schema
 */
export const ListProjectsQuerySchema = CursorPaginationQuerySchema.extend({
  search: z.string().optional().openapi({
    description: 'Search by project name',
    example: 'marketing',
  }),
}).openapi('ListProjectsQuery');

// ============================================================================
// KNOWLEDGE FILE SCHEMAS
// ============================================================================

/**
 * Upload File Request Schema
 * Multipart form data for file uploads
 */
export const UploadFileRequestSchema = z.object({
  file: z.instanceof(File).openapi({
    description: 'File to upload (multipart/form-data)',
    type: 'string',
    format: 'binary',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Optional file description',
  }),
  context: z.string().max(1000).optional().openapi({
    description: 'Optional context hint for LLM (helps AI interpret content)',
    example: 'Q1 2025 marketing strategy document',
  }),
  tags: z.array(z.string()).optional().openapi({
    description: 'Optional tags for organization',
  }),
}).openapi('UploadFileRequest');

/**
 * Knowledge File Response Schema
 */
export const KnowledgeFileResponseSchema = projectKnowledgeFileSelectSchema
  .omit({ r2Key: true }) // Don't expose internal R2 keys
  .extend({
    uploadedByUser: z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    }).optional().openapi({
      description: 'User who uploaded the file',
    }),
  })
  .openapi('KnowledgeFileResponse');

/**
 * List Knowledge Files Query Schema
 */
export const ListKnowledgeFilesQuerySchema = CursorPaginationQuerySchema.extend({
  status: ProjectFileStatusSchema.optional().openapi({
    description: 'Filter by file status',
  }),
}).openapi('ListKnowledgeFilesQuery');

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

/**
 * Single Project Response
 */
export const GetProjectResponseSchema = createApiResponseSchema(ProjectResponseSchema);

/**
 * List Projects Response
 */
export const ListProjectsResponseSchema = createCursorPaginatedResponseSchema(ProjectResponseSchema);

/**
 * Single Knowledge File Response
 */
export const UploadFileResponseSchema = createApiResponseSchema(KnowledgeFileResponseSchema);

/**
 * List Knowledge Files Response
 */
export const ListKnowledgeFilesResponseSchema = createCursorPaginatedResponseSchema(KnowledgeFileResponseSchema);

/**
 * Delete Response (generic)
 */
export const DeleteResponseSchema = createApiResponseSchema(
  z.object({
    id: CoreSchemas.id(),
    deleted: z.boolean(),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ProjectFileStatus = z.infer<typeof ProjectFileStatusSchema>;
export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;
export type ListKnowledgeFilesQuery = z.infer<typeof ListKnowledgeFilesQuerySchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
export type KnowledgeFileResponse = z.infer<typeof KnowledgeFileResponseSchema>;
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;
