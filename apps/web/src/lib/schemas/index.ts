/**
 * Schemas Barrel Export
 *
 * Centralized exports for all Zod schemas and type utilities.
 */

// Data part schema (custom AI message parts)
export type { DataPart } from './data-part-schema';
export { DataPartSchema, isDataPart } from './data-part-schema';

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

// Form option schemas
export type { FormOption, FormOptions, NavItem } from './form-option-schemas';
export {
  FormOptionSchema,
  FormOptionsSchema,
  isFormOption,
  isFormOptions,
  NavItemBaseSchema,
} from './form-option-schemas';

// Message metadata schemas
export type {
  PartialAssistantMetadata,
  PartialMessageMetadata,
  PartialUserMetadata,
  PreSearchQueryMetadata,
  PreSearchQueryState,
  PreSearchResult,
  PreSearchResultItem,
} from './message-metadata';
export {
  messageHasError,
  PartialAssistantMetadataSchema,
  PartialMessageMetadataSchema,
  PartialUserMetadataSchema,
  PreSearchQueryMetadataSchema,
  PreSearchQueryStateSchema,
  PreSearchResultItemSchema,
  PreSearchResultItemSchemaEnhanced,
  PreSearchResultSchema,
} from './message-metadata';

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
export type {
  OrderedModel,
} from './model-schemas';
export {
  isOrderedModel,
  isOrderedModelArray,
  ModelSchema,
  OrderedModelSchema,
} from './model-schemas';
// Participant schemas
export type {
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
// Model schemas
// Note: Model type is imported from @/services/api in model-schemas.ts
// Re-export it here for convenience (RPC-derived type)
export type { Model } from '@/services/api';
