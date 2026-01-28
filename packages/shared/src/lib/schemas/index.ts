/**
 * Shared Schemas Barrel Export
 *
 * Centralized exports for all Zod schemas and type utilities.
 * SINGLE SOURCE OF TRUTH for shared validation across API and Web.
 */

// Error schemas
export type { ErrorMetadata } from './error-schemas';
export {
  categorizeErrorMessage,
  createErrorMetadata,
  createPartialErrorMetadata,
  errorCategoryToUIType,
  ErrorMetadataSchema,
  getErrorCategoryMessage,
  isErrorCategory,
  isUIMessageErrorType,
} from './error-schemas';

// Message schemas
export type {
  ExtendedFilePart,
  FilePart,
  MessagePart,
  ReasoningPart,
  StreamingFinishResult,
  StreamingToolCall,
  StreamingUsage,
} from './message-schemas';
export {
  convertUIMessagesToText,
  createReasoningPart,
  createTextPart,
  createToolCallPart,
  createToolResultPart,
  ExtendedFilePartSchema,
  extractAllTextFromParts,
  extractReasoningFromParts,
  extractTextFromMessage,
  extractTextFromParts,
  extractToolCalls,
  extractToolResults,
  extractUploadIdFromUrl,
  extractValidFileParts,
  FilePartSchema,
  filterPartsByType,
  findToolResult,
  getFilenameFromPart,
  getMimeTypeFromPart,
  getPartsByType,
  getUploadIdFromFilePart,
  getUrlFromPart,
  hasReasoning,
  hasRenderableContent,
  hasText,
  hasToolCalls,
  hasToolResults,
  hasUploadId,
  isFilePart,
  isMessagePart,
  isMessageStatus,
  isReasoningPart,
  isReasoningPartArray,
  isRenderableContent,
  isStreamingPart,
  isToolCallPart,
  isToolResultPart,
  isValidFilePartForTransmission,
  MessagePartSchema,
  ReasoningPartSchema,
  StreamingFinishResultSchema,
  StreamingToolCallSchema,
  StreamingUsageSchema,
} from './message-schemas';

// Participant schemas (shared - excludes ChatParticipantSchema which is platform-specific)
export type {
  ComparableParticipant,
  MinimalParticipant,
  ModelReference,
  ParticipantConfig,
  ParticipantConfigInput,
  ParticipantContext,
  ParticipantForValidation,
  ParticipantIndex,
  ParticipantIndexWithSentinel,
  ParticipantUpdatePayload,
  ValidateModelAccessOptions,
} from './participant-schemas';
export {
  ComparableParticipantSchema,
  DEFAULT_PARTICIPANT_INDEX,
  formatParticipantIndex,
  getDisplayParticipantIndex,
  isComparableParticipant,
  isMinimalParticipant,
  isParticipantConfig,
  isParticipantConfigArray,
  isParticipantConfigInput,
  isParticipantContext,
  isParticipantForValidation,
  isParticipantForValidationArray,
  isParticipantUpdatePayload,
  MinimalParticipantSchema,
  ModelIdReferenceSchema,
  ModelReferenceSchema,
  NO_PARTICIPANT_SENTINEL,
  ParticipantConfigInputSchema,
  ParticipantConfigSchema,
  ParticipantContextSchema,
  ParticipantForValidationSchema,
  ParticipantIdSchema,
  ParticipantIndexSchema,
  ParticipantIndexWithSentinelSchema,
  ParticipantRoleSchema,
  ParticipantUpdatePayloadSchema,
  ValidateModelAccessOptionsSchema,
} from './participant-schemas';

// Round schemas
export type { RoundNumber, RoundNumberWithSentinel } from './round-schemas';
export {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  extractRoundNumber,
  formatRoundNumber,
  getDisplayRoundNumber,
  isValidRoundNumber,
  NO_ROUND_SENTINEL,
  NullableRoundNumberSchema,
  OptionalRoundNumberSchema,
  parseRoundNumber,
  RoundNumberSchema,
  RoundNumberWithSentinelSchema,
  safeParseRoundNumber,
} from './round-schemas';
