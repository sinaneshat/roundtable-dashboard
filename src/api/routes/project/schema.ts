import { z } from '@hono/zod-openapi';

import {
  BooleanStringSchema,
  ProjectColorSchema,
  ProjectIndexStatusSchema,
  ProjectMemorySourceSchema,
} from '@/api/core/enums';
// ✅ IMPORT FIX: Import directly from source files instead of barrel
import { CursorPaginationQuerySchema } from '@/api/core/pagination';
import { CoreSchemas, createApiResponseSchema, createCursorPaginatedResponseSchema } from '@/api/core/schemas';
import {
  chatProjectSelectSchema,
  chatProjectUpdateSchema,
  projectAttachmentSelectSchema,
  projectMemorySelectSchema,
} from '@/db/validation/project';
import { uploadSelectSchema } from '@/db/validation/upload';

/**
 * Create Project Request Schema
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
  color: ProjectColorSchema.optional().default('blue').openapi({
    description: 'Project color for visual identification',
    example: 'blue',
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
    color: true,
    customInstructions: true,
    autoragInstanceId: true,
    settings: true,
    metadata: true,
  })
  .partial()
  .openapi('UpdateProjectRequest');

/**
 * Project Response Schema - includes related data counts
 */
export const ProjectResponseSchema = chatProjectSelectSchema
  .extend({
    attachmentCount: z.number().int().nonnegative().openapi({
      description: 'Number of attachments in project knowledge base',
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
// PROJECT ATTACHMENT SCHEMAS (Reference to centralized uploads)
// ============================================================================

/**
 * Add Upload to Project Request Schema
 *
 * S3/R2 Best Practice: Reference existing uploads instead of direct file upload.
 * Users first upload files via POST /uploads, then reference them here.
 */
export const AddUploadToProjectRequestSchema = z.object({
  uploadId: z.string().openapi({
    description: 'ID of an existing upload (from POST /uploads)',
    example: '01HXYZ123456789ABCDEF',
  }),
  context: z.string().max(1000).optional().openapi({
    description: 'Optional context hint for LLM RAG retrieval',
    example: 'Q1 2025 marketing strategy document',
  }),
  description: z.string().max(500).optional().openapi({
    description: 'Project-specific description',
  }),
  tags: z.array(z.string()).optional().openapi({
    description: 'Project-specific tags for organization',
  }),
}).openapi('AddUploadToProjectRequest');

/**
 * Update Project Attachment Request Schema
 */
export const UpdateProjectAttachmentRequestSchema = z.object({
  context: z.string().max(1000).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
}).openapi('UpdateProjectAttachmentRequest');

/**
 * Project Attachment Response Schema
 * Combines project-specific metadata with underlying upload details
 */
export const ProjectAttachmentResponseSchema = projectAttachmentSelectSchema
  .extend({
    upload: uploadSelectSchema
      .omit({ r2Key: true }) // Don't expose internal R2 keys
      .openapi({
        description: 'The underlying uploaded file details',
      }),
    addedByUser: z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
    }).optional().openapi({
      description: 'User who added this attachment to the project',
    }),
  })
  .openapi('ProjectAttachmentResponse');

/**
 * List Project Attachments Query Schema
 */
export const ListProjectAttachmentsQuerySchema = CursorPaginationQuerySchema.extend({
  indexStatus: ProjectIndexStatusSchema.optional().openapi({
    description: 'Filter by RAG indexing status',
  }),
}).openapi('ListProjectAttachmentsQuery');

// ============================================================================
// PROJECT MEMORY SCHEMAS
// ============================================================================

/**
 * Create Project Memory Request Schema
 */
export const CreateProjectMemoryRequestSchema = z.object({
  content: z.string().min(1).max(10000).openapi({
    description: 'Memory content text',
    example: 'The project focuses on Q1 2025 marketing strategy with emphasis on digital channels.',
  }),
  summary: z.string().max(500).optional().openapi({
    description: 'Optional short summary for display',
    example: 'Q1 marketing focus: digital channels',
  }),
  source: ProjectMemorySourceSchema.optional().default('explicit').openapi({
    description: 'Source of this memory entry',
  }),
  importance: z.number().int().min(1).max(10).optional().default(5).openapi({
    description: 'Importance level (1-10) for retrieval prioritization',
    example: 7,
  }),
  metadata: z.object({
    keywords: z.array(z.string()).optional(),
    category: z.string().optional(),
  }).optional().openapi({
    description: 'Optional metadata for the memory',
  }),
}).openapi('CreateProjectMemoryRequest');

/**
 * Update Project Memory Request Schema
 */
export const UpdateProjectMemoryRequestSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  summary: z.string().max(500).optional().nullable(),
  importance: z.number().int().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  metadata: z.object({
    keywords: z.array(z.string()).optional(),
    category: z.string().optional(),
  }).optional(),
}).openapi('UpdateProjectMemoryRequest');

/**
 * Project Memory Response Schema
 */
export const ProjectMemoryResponseSchema = projectMemorySelectSchema
  .extend({
    sourceThreadTitle: z.string().nullable().optional().openapi({
      description: 'Title of the source thread (if memory came from a chat)',
    }),
  })
  .openapi('ProjectMemoryResponse');

/**
 * List Project Memories Query Schema
 */
export const ListProjectMemoriesQuerySchema = CursorPaginationQuerySchema.extend({
  source: ProjectMemorySourceSchema.optional().openapi({
    description: 'Filter by memory source',
  }),
  isActive: BooleanStringSchema.optional().openapi({
    description: 'Filter by active status (query param string)',
  }),
}).openapi('ListProjectMemoriesQuery');

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
 * Single Project Attachment Response
 */
export const GetProjectAttachmentResponseSchema = createApiResponseSchema(ProjectAttachmentResponseSchema);

/**
 * Add Attachment Response
 */
export const AddProjectAttachmentResponseSchema = createApiResponseSchema(ProjectAttachmentResponseSchema);

/**
 * List Project Attachments Response
 */
export const ListProjectAttachmentsResponseSchema = createCursorPaginatedResponseSchema(ProjectAttachmentResponseSchema);

/**
 * List Project Memories Response
 */
export const ListProjectMemoriesResponseSchema = createCursorPaginatedResponseSchema(ProjectMemoryResponseSchema);

/**
 * Single Project Memory Response
 */
export const GetProjectMemoryResponseSchema = createApiResponseSchema(ProjectMemoryResponseSchema);

/**
 * Delete Response (generic)
 */
export const DeleteResponseSchema = createApiResponseSchema(
  z.object({
    id: CoreSchemas.id(),
    deleted: z.boolean(),
  }),
);

/**
 * Project Attachment Param Schema - for routes with both id and attachmentId params
 */
export const ProjectAttachmentParamSchema = z.object({
  id: z.string().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Project identifier',
  }),
  attachmentId: z.string().openapi({
    param: { name: 'attachmentId', in: 'path' },
    description: 'Project attachment identifier',
  }),
}).openapi('ProjectAttachmentParam');

/**
 * Project Memory Param Schema - for routes with both id and memoryId params
 */
export const ProjectMemoryParamSchema = z.object({
  id: z.string().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Project identifier',
  }),
  memoryId: z.string().openapi({
    param: { name: 'memoryId', in: 'path' },
    description: 'Memory entry identifier',
  }),
}).openapi('ProjectMemoryParam');

// ============================================================================
// PROJECT CONTEXT SCHEMAS
// ============================================================================

/**
 * Project Context Response Schema
 * Aggregated context from project memories, chats, searches, and analyses
 */
export const ProjectContextResponseSchema = createApiResponseSchema(
  z.object({
    memories: z.object({
      items: z.array(z.object({
        id: z.string(),
        content: z.string(),
        summary: z.string().nullable(),
        source: z.string(),
        importance: z.number(),
      })),
      totalCount: z.number(),
    }),
    recentChats: z.object({
      threads: z.array(z.object({
        id: z.string(),
        title: z.string(),
        messageExcerpt: z.string(),
      })),
      totalCount: z.number(),
    }),
    searches: z.object({
      items: z.array(z.object({
        threadTitle: z.string(),
        userQuery: z.string(),
        analysis: z.string().nullable(),
      })),
      totalCount: z.number(),
    }),
    analyses: z.object({
      items: z.array(z.object({
        threadTitle: z.string(),
        userQuestion: z.string(),
        summary: z.string(),
      })),
      totalCount: z.number(),
    }),
  }),
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// ProjectIndexStatus, ProjectColor, ProjectMemorySource types are exported
// from @/api/core/enums (single source of truth)

export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;
export type ListProjectAttachmentsQuery = z.infer<typeof ListProjectAttachmentsQuerySchema>;
export type ListProjectMemoriesQuery = z.infer<typeof ListProjectMemoriesQuerySchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
export type AddUploadToProjectRequest = z.infer<typeof AddUploadToProjectRequestSchema>;
export type UpdateProjectAttachmentRequest = z.infer<typeof UpdateProjectAttachmentRequestSchema>;
export type CreateProjectMemoryRequest = z.infer<typeof CreateProjectMemoryRequestSchema>;
export type UpdateProjectMemoryRequest = z.infer<typeof UpdateProjectMemoryRequestSchema>;
export type ProjectAttachmentResponse = z.infer<typeof ProjectAttachmentResponseSchema>;
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;
export type ProjectMemoryResponse = z.infer<typeof ProjectMemoryResponseSchema>;
