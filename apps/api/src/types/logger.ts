import {
  AuthActionSchema,
  DatabaseOperationSchema,
  HttpMethodSchema,
  LogTypes,
  ValidationTypeSchema,
} from '@roundtable/shared/enums';
import { z } from 'zod';

// ============================================================================
// REUSABLE SCHEMAS
// ============================================================================

const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

const PerformanceMarkSchema = z.object({
  name: z.string(),
  timestamp: z.number(),
});

const OperationStatsSchema = z.object({
  total: z.number().optional(),
  withContent: z.number().optional(),
  skipped: z.number().optional(),
  totalMemories: z.number().optional(),
  totalThreads: z.number().optional(),
  totalSearches: z.number().optional(),
  totalModerators: z.number().optional(),
  totalAttachments: z.number().optional(),
  loaded: z.number().optional(),
  failed: z.number().optional(),
});

const AttachmentStatsSchema = z.object({
  total: z.number().optional(),
  withContent: z.number().optional(),
  skipped: z.number().optional(),
  messagesWithAttachments: z.number().optional(),
  totalUploads: z.number().optional(),
  loaded: z.number().optional(),
  failed: z.number().optional(),
});

// ============================================================================
// INDIVIDUAL LOG CONTEXT SCHEMAS
// ============================================================================

const RequestLogContextSchema = z.object({
  logType: z.literal(LogTypes.REQUEST),
  requestId: z.string(),
  userId: z.string().optional(),
  method: HttpMethodSchema,
  path: z.string(),
  operation: z.string().optional(),
  statusCode: z.number().int().optional(),
  duration: z.number().positive().optional(),
  userAgent: z.string().optional(),
});

const DatabaseLogContextSchema = z.object({
  logType: z.literal(LogTypes.DATABASE),
  table: z.string().optional(),
  operation: DatabaseOperationSchema,
  duration: z.number().positive().optional(),
  affectedRows: z.number().int().nonnegative().optional(),
  queryId: z.string().optional(),
  connectionPool: z.string().optional(),
});

const AuthLogContextSchema = z.object({
  logType: z.literal(LogTypes.AUTH),
  userId: z.string(),
  action: AuthActionSchema,
  success: z.boolean(),
  ipAddress: z.string().optional(),
  sessionId: z.string().optional(),
  failureReason: z.string().optional(),
});

const ValidationLogContextSchema = z.object({
  logType: z.literal(LogTypes.VALIDATION),
  fieldCount: z.number().int().nonnegative(),
  validationType: ValidationTypeSchema,
  schemaName: z.string().optional(),
  errors: z.array(ValidationErrorSchema).optional(),
  validationDuration: z.number().positive().optional(),
});

const PerformanceLogContextSchema = z.object({
  logType: z.literal(LogTypes.PERFORMANCE),
  duration: z.number().nonnegative().optional(),
  memoryUsage: z.number().positive().optional(),
  itemCount: z.number().int().nonnegative().optional(),
  cacheHit: z.boolean().optional(),
  component: z.string().optional(),
  marks: z.array(PerformanceMarkSchema).optional(),
  query: z.string().optional(),
  cacheAge: z.number().nonnegative().optional(),
  ttl: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  expiresIn: z.number().int().optional(),
  resultCount: z.number().int().nonnegative().optional(),
});

const ApiLogContextSchema = z.object({
  logType: z.literal(LogTypes.API),
  method: HttpMethodSchema,
  path: z.string(),
  statusCode: z.number().int().optional(),
  duration: z.number().positive().optional(),
  responseSize: z.number().int().nonnegative().optional(),
  requestId: z.string().optional(),
});

const OperationLogContextSchema = z.object({
  logType: z.literal(LogTypes.OPERATION),
  operationName: z.string(),
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  uploadId: z.string().optional(),
  streamId: z.string().optional(),
  projectId: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),
  participantIndex: z.number().int().nonnegative().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  attachmentCount: z.number().int().nonnegative().optional(),
  currentAttachmentCount: z.number().int().nonnegative().optional(),
  currentAttachmentIds: z.array(z.string()).optional(),
  foundUploads: z.number().int().nonnegative().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  maxSize: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  errors: z.union([z.array(z.string()), z.array(z.record(z.string(), z.unknown()))]).optional(),
  retryCount: z.number().int().nonnegative().optional(),
  retriesAttempted: z.number().int().nonnegative().optional(),
  chunkCount: z.number().int().nonnegative().optional(),
  chunkDataLength: z.number().int().nonnegative().optional(),
  errorStack: z.string().optional(),
  status: z.string().optional(),
  edgeCase: z.string().optional(),
  stats: OperationStatsSchema.optional(),
  attachmentStats: AttachmentStatsSchema.optional(),
  resultCount: z.number().int().nonnegative().optional(),
  hasAiResponse: z.boolean().optional(),
  citableSourcesAdded: z.number().int().nonnegative().optional(),
  sourceCount: z.number().int().nonnegative().optional(),
  filePartsCount: z.number().int().nonnegative().optional(),
  attachmentIds: z.array(z.string()).optional(),
  uploadIds: z.array(z.string()).optional(),
  uploadIdsCount: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  filenames: z.array(z.string()).optional(),
  fileCount: z.number().int().nonnegative().optional(),
  role: z.string().optional(),
  processedMessageCount: z.number().int().nonnegative().optional(),
  loadedCount: z.number().int().nonnegative().optional(),
  addedCount: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  disabledCount: z.number().int().nonnegative().optional(),
  reenabledCount: z.number().int().nonnegative().optional(),
  changelogCount: z.number().int().nonnegative().optional(),
  messagesWithAttachments: z.number().int().nonnegative().optional(),
  totalUploads: z.number().int().nonnegative().optional(),
  mimeType: z.string().optional(),
  r2Key: z.string().optional(),
  filename: z.string().optional(),
  sizeKB: z.number().nonnegative().optional(),
  messagesConverted: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
  isDuplicateUserMessage: z.boolean().optional(),
  attachmentIdsCount: z.number().int().nonnegative().optional(),
  // RAG indexing properties
  projectAttachmentId: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
  instanceId: z.string().optional(),
  availableInstances: z.array(z.string()).optional(),
  expectedPrefix: z.string().optional(),
  incorrectCount: z.number().int().nonnegative().optional(),
  attachmentId: z.string().optional(),
  synced: z.number().int().nonnegative().optional(),
  updated: z.number().int().nonnegative().optional(),
  // KV stream tracking properties
  totalParticipants: z.number().int().nonnegative().optional(),
  participantStatuses: z.record(z.string(), z.string()).optional(),
  finishedCount: z.number().int().nonnegative().optional(),
  // Round orchestration properties
  completedParticipants: z.number().int().nonnegative().optional(),
  failedParticipants: z.number().int().nonnegative().optional(),
  allParticipantsComplete: z.boolean().optional(),
  completedIndices: z.array(z.number()).optional(),
  activeIndices: z.array(z.number()).optional(),
  incompleteIndices: z.array(z.number()).optional(),
  // Streaming orchestration properties
  messageIdsToCheck: z.array(z.string()).optional(),
  totalPreviousMessages: z.number().int().nonnegative().optional(),
  userMessages: z.number().int().nonnegative().optional(),
  query: z.string().optional(),
});

const SystemLogContextSchema = z.object({
  logType: z.literal(LogTypes.SYSTEM),
  component: z.string(),
  message: z.string().optional(),
  error: z.string().optional(),
});

const EdgeCaseLogContextSchema = z.object({
  logType: z.literal(LogTypes.EDGE_CASE),
  scenario: z.string(),
  context: z.string().optional(),
  error: z.string().optional(),
  streamId: z.string().optional(),
  threadId: z.string().optional(),
  roundNumber: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  totalParticipants: z.number().int().nonnegative().optional(),
  participantIndex: z.number().int().nonnegative().optional(),
  query: z.string().optional(),
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
export { RequestLogContextSchema, DatabaseLogContextSchema, AuthLogContextSchema };
export { ValidationLogContextSchema, PerformanceLogContextSchema, ApiLogContextSchema };
export { OperationLogContextSchema, SystemLogContextSchema, EdgeCaseLogContextSchema };

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

// Input schemas without the discriminator field
const RequestLogInputSchema = RequestLogContextSchema.omit({ logType: true });
const DatabaseLogInputSchema = DatabaseLogContextSchema.omit({ logType: true });
const AuthLogInputSchema = AuthLogContextSchema.omit({ logType: true });
const ValidationLogInputSchema = ValidationLogContextSchema.omit({ logType: true });
const PerformanceLogInputSchema = PerformanceLogContextSchema.omit({ logType: true });
const ApiLogInputSchema = ApiLogContextSchema.omit({ logType: true });
const OperationLogInputSchema = OperationLogContextSchema.omit({ logType: true });
const SystemLogInputSchema = SystemLogContextSchema.omit({ logType: true });
const EdgeCaseLogInputSchema = EdgeCaseLogContextSchema.omit({ logType: true });

// Input types inferred from schemas
type RequestLogInput = z.input<typeof RequestLogInputSchema>;
type DatabaseLogInput = z.input<typeof DatabaseLogInputSchema>;
type AuthLogInput = z.input<typeof AuthLogInputSchema>;
type ValidationLogInput = z.input<typeof ValidationLogInputSchema>;
type PerformanceLogInput = z.input<typeof PerformanceLogInputSchema>;
type ApiLogInput = z.input<typeof ApiLogInputSchema>;
type OperationLogInput = z.input<typeof OperationLogInputSchema>;
type SystemLogInput = z.input<typeof SystemLogInputSchema>;
type EdgeCaseLogInput = z.input<typeof EdgeCaseLogInputSchema>;

/**
 * Type-safe log context factory using Zod schemas
 * Each helper validates input and returns a properly typed log context
 */
export const LogHelpers = {
  request: (data: RequestLogInput) =>
    RequestLogContextSchema.parse({ logType: LogTypes.REQUEST, ...data }),
  database: (data: DatabaseLogInput) =>
    DatabaseLogContextSchema.parse({ logType: LogTypes.DATABASE, ...data }),
  auth: (data: AuthLogInput) =>
    AuthLogContextSchema.parse({ logType: LogTypes.AUTH, ...data }),
  validation: (data: ValidationLogInput) =>
    ValidationLogContextSchema.parse({ logType: LogTypes.VALIDATION, ...data }),
  performance: (data: PerformanceLogInput) =>
    PerformanceLogContextSchema.parse({ logType: LogTypes.PERFORMANCE, ...data }),
  api: (data: ApiLogInput) =>
    ApiLogContextSchema.parse({ logType: LogTypes.API, ...data }),
  operation: (data: OperationLogInput) =>
    OperationLogContextSchema.parse({ logType: LogTypes.OPERATION, ...data }),
  system: (data: SystemLogInput) =>
    SystemLogContextSchema.parse({ logType: LogTypes.SYSTEM, ...data }),
  edgeCase: (data: EdgeCaseLogInput) =>
    EdgeCaseLogContextSchema.parse({ logType: LogTypes.EDGE_CASE, ...data }),
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
