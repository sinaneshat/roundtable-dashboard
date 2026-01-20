/**
 * Schemas Barrel Export
 *
 * Centralized exports for all Zod schemas and type utilities.
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
  isToolCallPart,
  isToolResultPart,
  isValidFilePartForTransmission,
  MessagePartSchema,
  ReasoningPartSchema,
  StreamingFinishResultSchema,
  StreamingToolCallSchema,
  StreamingUsageSchema,
} from './message-schemas';

// Participant schemas
export type {
  ChatParticipantWithSettings,
  MinimalParticipant,
  ModelReference,
  ParticipantConfig,
  ParticipantConfigInput,
  ParticipantContext,
  ParticipantIndex,
  ParticipantIndexWithSentinel,
  ParticipantUpdatePayload,
} from './participant-schemas';
export {
  ChatParticipantSchema,
  DEFAULT_PARTICIPANT_INDEX,
  formatParticipantIndex,
  getDisplayParticipantIndex,
  isChatParticipant,
  isChatParticipantArray,
  isMinimalParticipant,
  isParticipantConfig,
  isParticipantConfigArray,
  isParticipantConfigInput,
  isParticipantContext,
  isParticipantUpdatePayload,
  MinimalParticipantSchema,
  ModelIdReferenceSchema,
  ModelReferenceSchema,
  NO_PARTICIPANT_SENTINEL,
  NonEmptyParticipantsArraySchema,
  ParticipantConfigInputSchema,
  ParticipantConfigSchema,
  ParticipantContextSchema,
  ParticipantIdSchema,
  ParticipantIndexSchema,
  ParticipantIndexWithSentinelSchema,
  ParticipantRoleSchema,
  ParticipantsArraySchema,
  ParticipantUpdatePayloadSchema,
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
