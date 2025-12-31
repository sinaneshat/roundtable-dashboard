import { z } from 'zod';

import {
  AuthActionSchema,
  DatabaseOperationSchema,
  HttpMethodSchema,
  LogTypes,
  LogTypeSchema,
  ValidationTypeSchema,
} from '@/api/core/enums';

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

type RequestLogData = Omit<z.infer<typeof RequestLogContextSchema>, 'logType'>;
type DatabaseLogData = Omit<z.infer<typeof DatabaseLogContextSchema>, 'logType'>;
type AuthLogData = Omit<z.infer<typeof AuthLogContextSchema>, 'logType'>;
type ValidationLogData = Omit<z.infer<typeof ValidationLogContextSchema>, 'logType'>;
type PerformanceLogData = Omit<z.infer<typeof PerformanceLogContextSchema>, 'logType'>;
type ApiLogData = Omit<z.infer<typeof ApiLogContextSchema>, 'logType'>;
type OperationLogData = Omit<z.infer<typeof OperationLogContextSchema>, 'logType'>;
type SystemLogData = Omit<z.infer<typeof SystemLogContextSchema>, 'logType'>;
type EdgeCaseLogData = Omit<z.infer<typeof EdgeCaseLogContextSchema>, 'logType'>;

export const LogHelpers = {
  request: (data: RequestLogData): LogContext => ({
    logType: LogTypes.REQUEST,
    ...data,
  }),
  database: (data: DatabaseLogData): LogContext => ({
    logType: LogTypes.DATABASE,
    ...data,
  }),
  auth: (data: AuthLogData): LogContext => ({
    logType: LogTypes.AUTH,
    ...data,
  }),
  validation: (data: ValidationLogData): LogContext => ({
    logType: LogTypes.VALIDATION,
    ...data,
  }),
  performance: (data: PerformanceLogData): LogContext => ({
    logType: LogTypes.PERFORMANCE,
    ...data,
  }),
  api: (data: ApiLogData): LogContext => ({
    logType: LogTypes.API,
    ...data,
  }),
  operation: (data: OperationLogData): LogContext => ({
    logType: LogTypes.OPERATION,
    ...data,
  }),
  system: (data: SystemLogData): LogContext => ({
    logType: LogTypes.SYSTEM,
    ...data,
  }),
  edgeCase: (data: EdgeCaseLogData): LogContext => ({
    logType: LogTypes.EDGE_CASE,
    ...data,
  }),
};

export { LogTypeSchema };

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
