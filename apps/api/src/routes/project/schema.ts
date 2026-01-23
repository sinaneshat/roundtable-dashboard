import { z } from '@hono/zod-openapi';
import { PROJECT_LIMITS, STRING_LIMITS } from '@roundtable/shared';
import {
  BooleanStringSchema,
  ProjectColorSchema,
  ProjectIconSchema,
  ProjectIndexStatusSchema,
  ProjectMemorySourceSchema,
  SubscriptionTierSchema,
} from '@roundtable/shared/enums';

import { CursorPaginationQuerySchema } from '@/core/pagination';
import { CoreSchemas, createApiResponseSchema, createCursorPaginatedResponseSchema } from '@/core/schemas';
import {
  chatProjectSelectSchema,
  chatProjectUpdateSchema,
  projectAttachmentSelectSchema,
  ProjectMemoryMetadataSchema,
  projectMemorySelectSchema,
} from '@/db/validation/project';
import { uploadSelectSchema } from '@/db/validation/upload';

/**
 * Create Project Request Schema
 */
export const CreateProjectRequestSchema = z.object({
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN).max(STRING_LIMITS.PROJECT_NAME_MAX).openapi({
    description: 'Project name',
    example: 'Q1 Marketing Strategy',
  }),
  description: z.string().max(STRING_LIMITS.PROJECT_DESCRIPTION_MAX).optional().openapi({
    description: 'Optional project description',
    example: 'Knowledge base for Q1 2025 marketing planning',
  }),
  color: ProjectColorSchema.optional().default('blue').openapi({
    description: 'Project color for visual identification',
    example: 'blue',
  }),
  icon: ProjectIconSchema.optional().default('briefcase').openapi({
    description: 'Project icon for visual identification',
    example: 'briefcase',
  }),
  customInstructions: z.string().max(STRING_LIMITS.CUSTOM_INSTRUCTIONS_MAX).optional().openapi({
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
}).openapi('CreateProjectRequest');

/**
 * Update Project Request Schema
 */
export const UpdateProjectRequestSchema = chatProjectUpdateSchema
  .pick({
    name: true,
    description: true,
    color: true,
    icon: true,
    customInstructions: true,
    autoragInstanceId: true,
    settings: true,
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
  metadata: ProjectMemoryMetadataSchema.optional().openapi({
    description: 'Optional metadata for categorization and extraction tracking',
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
  metadata: ProjectMemoryMetadataSchema.optional().nullable(),
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
 * Project Thread Response Schema - lightweight thread data for project listing
 * Note: isFavorite/pin is NOT supported for project threads (only standalone threads)
 */
export const ProjectThreadResponseSchema = z.object({
  id: CoreSchemas.id(),
  title: z.string(),
  slug: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi('ProjectThread');

/**
 * List Project Threads Query
 */
export const ListProjectThreadsQuerySchema = CursorPaginationQuerySchema.openapi('ListProjectThreadsQuery');

/**
 * List Project Threads Response
 */
export const ListProjectThreadsResponseSchema = createCursorPaginatedResponseSchema(ProjectThreadResponseSchema);

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
 * Delete Project Response - includes count of deleted threads
 */
export const DeleteProjectResponseSchema = createApiResponseSchema(
  z.object({
    id: CoreSchemas.id(),
    deleted: z.boolean(),
    deletedThreadCount: z.number().int().nonnegative().openapi({
      description: 'Number of threads that were soft-deleted with this project',
    }),
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
// PROJECT LIMITS SCHEMAS
// ============================================================================

/**
 * Project Limits Response Schema
 * Returns user's tier and project limits
 */
export const ProjectLimitsSchema = z.object({
  tier: SubscriptionTierSchema.openapi({
    description: 'User subscription tier',
    example: 'pro',
  }),
  maxProjects: z.number().int().openapi({
    description: 'Maximum projects allowed for tier',
    example: PROJECT_LIMITS.MAX_PROJECTS_PER_USER,
  }),
  currentProjects: z.number().int().openapi({
    description: 'Current number of projects',
    example: 2,
  }),
  maxThreadsPerProject: z.number().int().openapi({
    description: 'Maximum threads per project',
    example: PROJECT_LIMITS.MAX_THREADS_PER_PROJECT,
  }),
  canCreateProject: z.boolean().openapi({
    description: 'Whether user can create more projects',
    example: true,
  }),
}).openapi('ProjectLimits');

export const ProjectLimitsResponseSchema = createApiResponseSchema(ProjectLimitsSchema);

export type ProjectLimits = z.infer<typeof ProjectLimitsSchema>;

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
        summary: z.string().nullable(),
      })),
      totalCount: z.number(),
    }),
    moderators: z.object({
      items: z.array(z.object({
        threadTitle: z.string(),
        userQuestion: z.string(),
        moderator: z.string(),
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
export type ListProjectThreadsQuery = z.infer<typeof ListProjectThreadsQuerySchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
export type AddUploadToProjectRequest = z.infer<typeof AddUploadToProjectRequestSchema>;
export type UpdateProjectAttachmentRequest = z.infer<typeof UpdateProjectAttachmentRequestSchema>;
export type CreateProjectMemoryRequest = z.infer<typeof CreateProjectMemoryRequestSchema>;
export type UpdateProjectMemoryRequest = z.infer<typeof UpdateProjectMemoryRequestSchema>;
export type ProjectAttachmentResponse = z.infer<typeof ProjectAttachmentResponseSchema>;
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;
export type ProjectMemoryResponse = z.infer<typeof ProjectMemoryResponseSchema>;
