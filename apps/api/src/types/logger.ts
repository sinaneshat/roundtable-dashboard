import {
  AuthActionSchema,
  DatabaseOperationSchema,
  HttpMethodSchema,
  LogTypes,
  ValidationTypeSchema,
} from '@roundtable/shared/enums';
import * as z from 'zod';

// ============================================================================
// REUSABLE SCHEMAS
// ============================================================================

const ValidationErrorSchema = z.object({
  code: z.string().optional(),
  field: z.string(),
  message: z.string(),
});

const PerformanceMarkSchema = z.object({
  name: z.string(),
  timestamp: z.number(),
});

const OperationStatsSchema = z.object({
  failed: z.number().optional(),
  loaded: z.number().optional(),
  skipped: z.number().optional(),
  total: z.number().optional(),
  totalAttachments: z.number().optional(),
  totalMemories: z.number().optional(),
  totalModerators: z.number().optional(),
  totalSearches: z.number().optional(),
  totalThreads: z.number().optional(),
  withContent: z.number().optional(),
});

const AttachmentStatsSchema = z.object({
  failed: z.number().optional(),
  loaded: z.number().optional(),
  messagesWithAttachments: z.number().optional(),
  skipped: z.number().optional(),
  total: z.number().optional(),
  totalUploads: z.number().optional(),
  withContent: z.number().optional(),
});

// ============================================================================
// INDIVIDUAL LOG CONTEXT SCHEMAS
// ============================================================================

const RequestLogContextSchema = z.object({
  duration: z.number().positive().optional(),
  logType: z.literal(LogTypes.REQUEST),
  method: HttpMethodSchema,
  operation: z.string().optional(),
  path: z.string(),
  requestId: z.string(),
  statusCode: z.number().int().optional(),
  userAgent: z.string().optional(),
  userId: z.string().optional(),
});

const DatabaseLogContextSchema = z.object({
  affectedRows: z.number().int().nonnegative().optional(),
  connectionPool: z.string().optional(),
  duration: z.number().positive().optional(),
  logType: z.literal(LogTypes.DATABASE),
  operation: DatabaseOperationSchema,
  queryId: z.string().optional(),
  table: z.string().optional(),
});

const AuthLogContextSchema = z.object({
  action: AuthActionSchema,
  failureReason: z.string().optional(),
  ipAddress: z.string().optional(),
  logType: z.literal(LogTypes.AUTH),
  sessionId: z.string().optional(),
  success: z.boolean(),
  userId: z.string(),
});

const ValidationLogContextSchema = z.object({
  errors: z.array(ValidationErrorSchema).optional(),
  fieldCount: z.number().int().nonnegative(),
  logType: z.literal(LogTypes.VALIDATION),
  schemaName: z.string().optional(),
  validationDuration: z.number().positive().optional(),
  validationType: ValidationTypeSchema,
});

const PerformanceLogContextSchema = z.object({
  cacheAge: z.number().nonnegative().optional(),
  cacheHit: z.boolean().optional(),
  component: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  expiresIn: z.number().int().optional(),
  itemCount: z.number().int().nonnegative().optional(),
  logType: z.literal(LogTypes.PERFORMANCE),
  marks: z.array(PerformanceMarkSchema).optional(),
  memoryUsage: z.number().positive().optional(),
  query: z.string().optional(),
  resultCount: z.number().int().nonnegative().optional(),
  ttl: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
});

const ApiLogContextSchema = z.object({
  duration: z.number().positive().optional(),
  logType: z.literal(LogTypes.API),
  method: HttpMethodSchema,
  path: z.string(),
  requestId: z.string().optional(),
  responseSize: z.number().int().nonnegative().optional(),
  statusCode: z.number().int().optional(),
});

const OperationLogContextSchema = z.object({
  activeIndices: z.array(z.number()).optional(),
  addedCount: z.number().int().nonnegative().optional(),
  allParticipantsComplete: z.boolean().optional(),
  attachmentCount: z.number().int().nonnegative().optional(),
  attachmentId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  attachmentIdsCount: z.number().int().nonnegative().optional(),
  attachmentStats: AttachmentStatsSchema.optional(),
  availableInstances: z.array(z.string()).optional(),
  changelogCount: z.number().int().nonnegative().optional(),
  chunkCount: z.number().int().nonnegative().optional(),
  chunkDataLength: z.number().int().nonnegative().optional(),
  citableSourcesAdded: z.number().int().nonnegative().optional(),
  completedIndices: z.array(z.number()).optional(),
  // Round orchestration properties
  completedParticipants: z.number().int().nonnegative().optional(),
  count: z.number().int().nonnegative().optional(),
  currentAttachmentCount: z.number().int().nonnegative().optional(),
  currentAttachmentIds: z.array(z.string()).optional(),
  disabledCount: z.number().int().nonnegative().optional(),
  edgeCase: z.string().optional(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
  errors: z.union([z.array(z.string()), z.array(z.record(z.string(), z.unknown()))]).optional(),
  errorStack: z.string().optional(),
  // Round execution tracking
  executionId: z.string().optional(),
  expectedPrefix: z.string().optional(),
  failedParticipants: z.number().int().nonnegative().optional(),
  fileCount: z.number().int().nonnegative().optional(),
  filename: z.string().optional(),
  filenames: z.array(z.string()).optional(),
  filePartsCount: z.number().int().nonnegative().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  finishedCount: z.number().int().nonnegative().optional(),
  foundUploads: z.number().int().nonnegative().optional(),
  hasAiResponse: z.boolean().optional(),
  incompleteIndices: z.array(z.number()).optional(),
  incorrectCount: z.number().int().nonnegative().optional(),
  instanceId: z.string().optional(),
  isDuplicateUserMessage: z.boolean().optional(),
  loadedCount: z.number().int().nonnegative().optional(),
  logType: z.literal(LogTypes.OPERATION),
  maxSize: z.number().int().nonnegative().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  messageId: z.string().optional(),
  // Streaming orchestration properties
  messageIdsToCheck: z.array(z.string()).optional(),
  messagesConverted: z.number().int().nonnegative().optional(),
  messagesWithAttachments: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
  operationName: z.string(),
  participantIndex: z.number().int().nonnegative().optional(),
  participantStatuses: z.record(z.string(), z.string()).optional(),
  processedMessageCount: z.number().int().nonnegative().optional(),
  // RAG indexing properties
  projectAttachmentId: z.string().optional(),
  projectId: z.string().optional(),
  query: z.string().optional(),
  r2Key: z.string().optional(),
  reason: z.string().optional(),
  reenabledCount: z.number().int().nonnegative().optional(),
  resultCount: z.number().int().nonnegative().optional(),
  retriesAttempted: z.number().int().nonnegative().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  role: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),
  sizeKB: z.number().nonnegative().optional(),
  sourceCount: z.number().int().nonnegative().optional(),
  stats: OperationStatsSchema.optional(),
  status: z.string().optional(),
  streamId: z.string().optional(),
  synced: z.number().int().nonnegative().optional(),
  threadId: z.string().optional(),
  // KV stream tracking properties
  totalParticipants: z.number().int().nonnegative().optional(),
  totalPreviousMessages: z.number().int().nonnegative().optional(),
  totalUploads: z.number().int().nonnegative().optional(),
  updated: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  uploadId: z.string().optional(),
  uploadIds: z.array(z.string()).optional(),
  uploadIdsCount: z.number().int().nonnegative().optional(),
  userId: z.string().optional(),
  userMessages: z.number().int().nonnegative().optional(),
});

const SystemLogContextSchema = z.object({
  component: z.string(),
  error: z.string().optional(),
  logType: z.literal(LogTypes.SYSTEM),
  message: z.string().optional(),
});

const EdgeCaseLogContextSchema = z.object({
  context: z.string().optional(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
  logType: z.literal(LogTypes.EDGE_CASE),
  participantIndex: z.number().int().nonnegative().optional(),
  query: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),
  scenario: z.string(),
  streamId: z.string().optional(),
  threadId: z.string().optional(),
  totalParticipants: z.number().int().nonnegative().optional(),
});

// ============================================================================
// DISCRIMINATED UNION
// ============================================================================

export const LogContextSchema = z.discriminatedUnion('logType', [
  RequestLogContextSchema,
  DatabaseLogContextSchema,
  AuthLogContextSchema,
  ValidationLogContextSchema,
  PerformanceLogContextSchema,
  ApiLogContextSchema,
  OperationLogContextSchema,
  SystemLogContextSchema,
  EdgeCaseLogContextSchema,
]);

export type LogContext = z.infer<typeof LogContextSchema>;

// ============================================================================
// TYPED LOGGER INTERFACE
// ============================================================================

export type TypedLogger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, contextOrError?: Error | LogContext, context?: LogContext) => void;
};

// ============================================================================
// VALIDATION HELPER
// ============================================================================

export function validateLogContext(context: unknown): LogContext | null {
  const result = LogContextSchema.safeParse(context);
  return result.success ? result.data : null;
}

// ============================================================================
// TYPE-SAFE LOG CONTEXT FACTORIES
// ============================================================================

// Export individual context schemas for direct use
export { AuthLogContextSchema, DatabaseLogContextSchema, RequestLogContextSchema };
export { ApiLogContextSchema, PerformanceLogContextSchema, ValidationLogContextSchema };
export { EdgeCaseLogContextSchema, OperationLogContextSchema, SystemLogContextSchema };

// Schema-specific inferred types for each log context
export type RequestLogContext = z.infer<typeof RequestLogContextSchema>;
export type DatabaseLogContext = z.infer<typeof DatabaseLogContextSchema>;
export type AuthLogContext = z.infer<typeof AuthLogContextSchema>;
export type ValidationLogContext = z.infer<typeof ValidationLogContextSchema>;
export type PerformanceLogContext = z.infer<typeof PerformanceLogContextSchema>;
export type ApiLogContext = z.infer<typeof ApiLogContextSchema>;
export type OperationLogContext = z.infer<typeof OperationLogContextSchema>;
export type SystemLogContext = z.infer<typeof SystemLogContextSchema>;
export type EdgeCaseLogContext = z.infer<typeof EdgeCaseLogContextSchema>;

// Input schemas without the discriminator field (prefixed _ as only used for type inference)
const _RequestLogInputSchema = RequestLogContextSchema.omit({ logType: true });
const _DatabaseLogInputSchema = DatabaseLogContextSchema.omit({ logType: true });
const _AuthLogInputSchema = AuthLogContextSchema.omit({ logType: true });
const _ValidationLogInputSchema = ValidationLogContextSchema.omit({ logType: true });
const _PerformanceLogInputSchema = PerformanceLogContextSchema.omit({ logType: true });
const _ApiLogInputSchema = ApiLogContextSchema.omit({ logType: true });
const _OperationLogInputSchema = OperationLogContextSchema.omit({ logType: true });
const _SystemLogInputSchema = SystemLogContextSchema.omit({ logType: true });
const _EdgeCaseLogInputSchema = EdgeCaseLogContextSchema.omit({ logType: true });

// Input types inferred from schemas
type RequestLogInput = z.input<typeof _RequestLogInputSchema>;
type DatabaseLogInput = z.input<typeof _DatabaseLogInputSchema>;
type AuthLogInput = z.input<typeof _AuthLogInputSchema>;
type ValidationLogInput = z.input<typeof _ValidationLogInputSchema>;
type PerformanceLogInput = z.input<typeof _PerformanceLogInputSchema>;
type ApiLogInput = z.input<typeof _ApiLogInputSchema>;
type OperationLogInput = z.input<typeof _OperationLogInputSchema>;
type SystemLogInput = z.input<typeof _SystemLogInputSchema>;
type EdgeCaseLogInput = z.input<typeof _EdgeCaseLogInputSchema>;

/**
 * Type-safe log context factory using Zod schemas
 * Each helper validates input and returns a properly typed log context
 */
export const LogHelpers = {
  api: (data: ApiLogInput) =>
    ApiLogContextSchema.parse({ logType: LogTypes.API, ...data }),
  auth: (data: AuthLogInput) =>
    AuthLogContextSchema.parse({ logType: LogTypes.AUTH, ...data }),
  database: (data: DatabaseLogInput) =>
    DatabaseLogContextSchema.parse({ logType: LogTypes.DATABASE, ...data }),
  edgeCase: (data: EdgeCaseLogInput) =>
    EdgeCaseLogContextSchema.parse({ logType: LogTypes.EDGE_CASE, ...data }),
  operation: (data: OperationLogInput) =>
    OperationLogContextSchema.parse({ logType: LogTypes.OPERATION, ...data }),
  performance: (data: PerformanceLogInput) =>
    PerformanceLogContextSchema.parse({ logType: LogTypes.PERFORMANCE, ...data }),
  request: (data: RequestLogInput) =>
    RequestLogContextSchema.parse({ logType: LogTypes.REQUEST, ...data }),
  system: (data: SystemLogInput) =>
    SystemLogContextSchema.parse({ logType: LogTypes.SYSTEM, ...data }),
  validation: (data: ValidationLogInput) =>
    ValidationLogContextSchema.parse({ logType: LogTypes.VALIDATION, ...data }),
};

/**
 * Zod schema for TypedLogger interface
 * Used for runtime validation of logger instances in streaming services
 */
export const TypedLoggerSchema = z.custom<TypedLogger>(
  (val): val is TypedLogger => {
    return (
      typeof val === 'object'
      && val !== null
      && 'debug' in val
      && 'info' in val
      && 'warn' in val
      && 'error' in val
      && typeof val.debug === 'function'
      && typeof val.info === 'function'
      && typeof val.warn === 'function'
      && typeof val.error === 'function'
    );
  },
);
