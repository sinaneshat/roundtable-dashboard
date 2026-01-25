/**
 * Chat, Thread, and Message Enums
 *
 * Core enums for chat functionality, thread management, and message handling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// MODERATOR CONSTANTS (5-part pattern)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - N/A for single values, use constant directly
// 2️⃣ DEFAULT VALUE - The main constants
/** Moderator display name shown in UI */
export const MODERATOR_NAME = 'Council Moderator';

/** Sentinel value for moderator (not a real participant, sorts last) */
export const MODERATOR_PARTICIPANT_INDEX = -99;

// 3️⃣ ZOD SCHEMA - For validation when needed
export const ModeratorNameSchema = z.literal(MODERATOR_NAME).openapi({
  description: 'Moderator display name',
  example: MODERATOR_NAME,
});

export const ModeratorParticipantIndexSchema = z.literal(MODERATOR_PARTICIPANT_INDEX).openapi({
  description: 'Sentinel value for moderator participant index',
  example: MODERATOR_PARTICIPANT_INDEX,
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from schema
export type ModeratorName = z.infer<typeof ModeratorNameSchema>;

// 5️⃣ CONSTANT OBJECT - For programmatic access
export const ModeratorConstants = {
  NAME: MODERATOR_NAME,
  PARTICIPANT_INDEX: MODERATOR_PARTICIPANT_INDEX,
} as const;

// ============================================================================
// CHAT MODE
// ============================================================================

export const CHAT_MODES = ['analyzing', 'brainstorming', 'debating', 'solving'] as const;

export const ChatModeSchema = z.enum(CHAT_MODES).openapi({
  description: 'Conversation mode for roundtable discussions',
  example: CHAT_MODES[1], // 'brainstorming'
});

export type ChatMode = z.infer<typeof ChatModeSchema>;

export const DEFAULT_CHAT_MODE: ChatMode = 'debating';

export const ChatModes = {
  ANALYZING: 'analyzing' as const,
  BRAINSTORMING: 'brainstorming' as const,
  DEBATING: 'debating' as const,
  SOLVING: 'solving' as const,
} as const;

// ============================================================================
// THREAD STATUS
// ============================================================================

export const THREAD_STATUSES = ['active', 'archived', 'deleted'] as const;

export const ThreadStatusSchema = z.enum(THREAD_STATUSES).openapi({
  description: 'Thread lifecycle status',
  example: 'active',
});

export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const DEFAULT_THREAD_STATUS: ThreadStatus = 'active';

export const ThreadStatuses = {
  ACTIVE: 'active' as const,
  ARCHIVED: 'archived' as const,
  DELETED: 'deleted' as const,
} as const;

// ============================================================================
// THREAD PUBLISH ACTION
// ============================================================================

// 1. ARRAY CONSTANT
export const THREAD_PUBLISH_ACTIONS = ['publish', 'unpublish'] as const;

// 2. ZOD SCHEMA
export const ThreadPublishActionSchema = z.enum(THREAD_PUBLISH_ACTIONS).openapi({
  description: 'Thread publish/unpublish action for ISR revalidation',
  example: 'publish',
});

// 3. TYPESCRIPT TYPE
export type ThreadPublishAction = z.infer<typeof ThreadPublishActionSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_THREAD_PUBLISH_ACTION: ThreadPublishAction = 'publish';

// 5. CONSTANT OBJECT
export const ThreadPublishActions = {
  PUBLISH: 'publish' as const,
  UNPUBLISH: 'unpublish' as const,
} as const;

// ============================================================================
// MESSAGE STATUS
// ============================================================================

export const MESSAGE_STATUSES = ['pending', 'streaming', 'complete', 'failed'] as const;

export const MessageStatusSchema = z.enum(MESSAGE_STATUSES).openapi({
  description: 'Message status during streaming lifecycle',
  example: 'streaming',
});

export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const DEFAULT_MESSAGE_STATUS: MessageStatus = 'pending';

export const MessageStatuses = {
  PENDING: 'pending' as const,
  STREAMING: 'streaming' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// MESSAGE ROLE (Database - includes 'tool' for tool invocations)
// ============================================================================

export const MESSAGE_ROLES = ['user', 'assistant', 'tool'] as const;

export const MessageRoleSchema = z.enum(MESSAGE_ROLES).openapi({
  description: 'Message role (user input, AI response, or tool result)',
  example: 'assistant',
});

export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const DEFAULT_MESSAGE_ROLE: MessageRole = 'user';

export const MessageRoles = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  TOOL: 'tool' as const,
} as const;

// ============================================================================
// CHANGELOG TYPE (Thread changelog event type)
// ============================================================================

export const CHANGELOG_TYPES = ['added', 'modified', 'removed'] as const;

export const ChangelogTypeSchema = z.enum(CHANGELOG_TYPES).openapi({
  description: 'Type of changelog event',
  example: 'added',
});

export type ChangelogType = z.infer<typeof ChangelogTypeSchema>;

export const DEFAULT_CHANGELOG_TYPE: ChangelogType = 'added';

export const ChangelogTypes = {
  ADDED: 'added' as const,
  MODIFIED: 'modified' as const,
  REMOVED: 'removed' as const,
} as const;

// ============================================================================
// CHANGELOG CHANGE TYPE (Thread changelog discriminator)
// ============================================================================

export const CHANGELOG_CHANGE_TYPES = [
  'participant',
  'participant_role',
  'mode_change',
  'participant_reorder',
  'web_search',
  'memory_created',
] as const;

export const ChangelogChangeTypeSchema = z.enum(CHANGELOG_CHANGE_TYPES).openapi({
  description: 'Type of thread changelog change',
  example: 'participant',
});

export type ChangelogChangeType = z.infer<typeof ChangelogChangeTypeSchema>;

export const DEFAULT_CHANGELOG_CHANGE_TYPE: ChangelogChangeType = 'participant';

export const ChangelogChangeTypes = {
  PARTICIPANT: 'participant' as const,
  PARTICIPANT_ROLE: 'participant_role' as const,
  MODE_CHANGE: 'mode_change' as const,
  PARTICIPANT_REORDER: 'participant_reorder' as const,
  WEB_SEARCH: 'web_search' as const,
  MEMORY_CREATED: 'memory_created' as const,
} as const;

// ============================================================================
// SCREEN MODE
// ============================================================================

// 1. ARRAY CONSTANT
export const SCREEN_MODES = ['overview', 'thread', 'public'] as const;

// 2. ZOD SCHEMA
export const ScreenModeSchema = z.enum(SCREEN_MODES).openapi({
  description: 'Chat interface screen mode',
  example: 'thread',
});

// 3. TYPESCRIPT TYPE
export type ScreenMode = z.infer<typeof ScreenModeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_SCREEN_MODE: ScreenMode = 'overview';

// 5. CONSTANT OBJECT
export const ScreenModes = {
  OVERVIEW: 'overview' as const,
  THREAD: 'thread' as const,
  PUBLIC: 'public' as const,
} as const;

// ============================================================================
// PARTICIPANT COMPARISON MODE
// ============================================================================

// 1. ARRAY CONSTANT
export const PARTICIPANT_COMPARISON_MODES = ['modelIds', 'strict'] as const;

// 2. ZOD SCHEMA
export const ParticipantComparisonModeSchema = z.enum(PARTICIPANT_COMPARISON_MODES).openapi({
  description: 'Strategy for comparing participant configurations',
  example: 'strict',
});

// 3. TYPESCRIPT TYPE
export type ParticipantComparisonMode = z.infer<typeof ParticipantComparisonModeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_PARTICIPANT_COMPARISON_MODE: ParticipantComparisonMode = 'strict';

// 5. CONSTANT OBJECT
export const ParticipantComparisonModes = {
  MODEL_IDS: 'modelIds' as const,
  STRICT: 'strict' as const,
} as const;

// ============================================================================
// TIMELINE ELEMENT TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const TIMELINE_ELEMENT_TYPES = [
  'pre_search',
  'moderator',
  'participant_message',
  'user_message',
] as const;

// 2. ZOD SCHEMA
export const TimelineElementTypeSchema = z.enum(TIMELINE_ELEMENT_TYPES).openapi({
  description: 'Timeline element type for chat UI rendering',
  example: 'participant_message',
});

// 3. TYPESCRIPT TYPE
export type TimelineElementType = z.infer<typeof TimelineElementTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_TIMELINE_ELEMENT_TYPE: TimelineElementType = 'user_message';

// 5. CONSTANT OBJECT
export const TimelineElementTypes = {
  PRE_SEARCH: 'pre_search' as const,
  MODERATOR: 'moderator' as const,
  PARTICIPANT_MESSAGE: 'participant_message' as const,
  USER_MESSAGE: 'user_message' as const,
} as const;

// 6. TYPE GUARD
export function isTimelineElementType(value: unknown): value is TimelineElementType {
  return TimelineElementTypeSchema.safeParse(value).success;
}

// 7. DISPLAY LABELS
export const TIMELINE_ELEMENT_TYPE_LABELS: Record<TimelineElementType, string> = {
  [TimelineElementTypes.PRE_SEARCH]: 'Pre-Search',
  [TimelineElementTypes.MODERATOR]: 'Moderator',
  [TimelineElementTypes.PARTICIPANT_MESSAGE]: 'Participant Message',
  [TimelineElementTypes.USER_MESSAGE]: 'User Message',
} as const;

// ============================================================================
// TIMELINE ITEM TYPE (for useThreadTimeline hook)
// ============================================================================

// 1. ARRAY CONSTANT
export const TIMELINE_ITEM_TYPES = [
  'messages',
  'changelog',
  'pre-search',
] as const;

// 2. ZOD SCHEMA
export const TimelineItemTypeSchema = z.enum(TIMELINE_ITEM_TYPES).openapi({
  description: 'Timeline item type for grouping messages, changelogs, and pre-searches',
  example: 'messages',
});

// 3. TYPESCRIPT TYPE
export type TimelineItemType = z.infer<typeof TimelineItemTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_TIMELINE_ITEM_TYPE: TimelineItemType = 'messages';

// 5. CONSTANT OBJECT
export const TimelineItemTypes = {
  MESSAGES: 'messages' as const,
  CHANGELOG: 'changelog' as const,
  PRE_SEARCH: 'pre-search' as const,
} as const;

// 6. TYPE GUARD
export function isTimelineItemType(value: unknown): value is TimelineItemType {
  return TimelineItemTypeSchema.safeParse(value).success;
}

// 7. DISPLAY LABELS
export const TIMELINE_ITEM_TYPE_LABELS: Record<TimelineItemType, string> = {
  [TimelineItemTypes.MESSAGES]: 'Messages',
  [TimelineItemTypes.CHANGELOG]: 'Changelog',
  [TimelineItemTypes.PRE_SEARCH]: 'Pre-Search',
} as const;

// ============================================================================
// SHARED ASSUMPTION TYPE (Moderator Summary - Areas of Agreement)
// ============================================================================

// 1. ARRAY CONSTANT
export const SHARED_ASSUMPTION_TYPES = [
  'shared assumptions',
  'common objectives',
  'overlapping conclusions',
] as const;

// 2. ZOD SCHEMA
export const SharedAssumptionTypeSchema = z.enum(SHARED_ASSUMPTION_TYPES).openapi({
  description: 'Types of substantive alignment in moderator summaries',
  example: 'shared assumptions',
});

// 3. TYPESCRIPT TYPE
export type SharedAssumptionType = z.infer<typeof SharedAssumptionTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_SHARED_ASSUMPTION_TYPE: SharedAssumptionType = 'shared assumptions';

// 5. CONSTANT OBJECT
export const SharedAssumptionTypes = {
  SHARED_ASSUMPTIONS: 'shared assumptions' as const,
  COMMON_OBJECTIVES: 'common objectives' as const,
  OVERLAPPING_CONCLUSIONS: 'overlapping conclusions' as const,
} as const;

// ============================================================================
// CORE ASSUMPTION FOCUS TYPE (Moderator Summary - Assumptions and Tensions)
// ============================================================================

// 1. ARRAY CONSTANT
export const CORE_ASSUMPTION_FOCUS_TYPES = [
  'foundational assumptions behind each perspective',
  'where assumptions conflict',
  'why disagreements remain unresolved',
] as const;

// 2. ZOD SCHEMA
export const CoreAssumptionFocusTypeSchema = z.enum(CORE_ASSUMPTION_FOCUS_TYPES).openapi({
  description: 'Focus areas for foundational assumptions and conflicts in moderator summaries',
  example: 'foundational assumptions behind each perspective',
});

// 3. TYPESCRIPT TYPE
export type CoreAssumptionFocusType = z.infer<typeof CoreAssumptionFocusTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CORE_ASSUMPTION_FOCUS_TYPE: CoreAssumptionFocusType
  = 'foundational assumptions behind each perspective';

// 5. CONSTANT OBJECT
export const CoreAssumptionFocusTypes = {
  FOUNDATIONAL_ASSUMPTIONS: 'foundational assumptions behind each perspective' as const,
  ASSUMPTION_CONFLICTS: 'where assumptions conflict' as const,
  UNRESOLVED_DISAGREEMENTS: 'why disagreements remain unresolved' as const,
} as const;

// ============================================================================
// CHANGELOG CHANGE TYPE (Configuration change discriminator for tests)
// ============================================================================

export const CHANGELOG_CHANGE_TYPES_EXTENDED = [
  'added',
  'removed',
  'modified',
  'reordered',
  'mode-changed',
] as const;

export const ChangelogChangeTypeExtendedSchema = z.enum(CHANGELOG_CHANGE_TYPES_EXTENDED).openapi({
  description: 'Extended type of thread changelog change (includes test-specific types)',
  example: 'reordered',
});

export type ChangelogChangeTypeExtended = z.infer<typeof ChangelogChangeTypeExtendedSchema>;

export const DEFAULT_CHANGELOG_CHANGE_TYPE_EXTENDED: ChangelogChangeTypeExtended = 'added';

export const ChangelogChangeTypesExtended = {
  ADDED: 'added' as const,
  REMOVED: 'removed' as const,
  MODIFIED: 'modified' as const,
  REORDERED: 'reordered' as const,
  MODE_CHANGED: 'mode-changed' as const,
} as const;

// ============================================================================
// MODERATOR REQUIRED SECTIONS
// ============================================================================

// 1. ARRAY CONSTANT
export const MODERATOR_REQUIRED_SECTIONS = [
  'summaryConclusion',
  'questionOverview',
  'participants',
] as const;

// 2. ZOD SCHEMA
export const ModeratorRequiredSectionSchema = z.enum(MODERATOR_REQUIRED_SECTIONS).openapi({
  description: 'Required council moderator section',
  example: 'summaryConclusion',
});

// 3. TYPESCRIPT TYPE
export type ModeratorRequiredSection = z.infer<typeof ModeratorRequiredSectionSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_MODERATOR_REQUIRED_SECTION: ModeratorRequiredSection = 'summaryConclusion';

// 5. CONSTANT OBJECT
export const ModeratorRequiredSections = {
  SUMMARY_CONCLUSION: 'summaryConclusion' as const,
  QUESTION_OVERVIEW: 'questionOverview' as const,
  PARTICIPANTS: 'participants' as const,
} as const;

// ============================================================================
// MODERATOR OPTIONAL SECTIONS
// ============================================================================

// 1. ARRAY CONSTANT
export const MODERATOR_OPTIONAL_SECTIONS = [
  'primaryPerspectives',
  'areasOfAgreement',
  'coreAssumptionsAndTensions',
  'tradeOffsAndImplications',
  'limitationsAndBlindSpots',
  'consensusStatus',
  'integratedAnalysis',
  'keyExchanges',
  'keyUncertainties',
] as const;

// 2. ZOD SCHEMA
export const ModeratorOptionalSectionSchema = z.enum(MODERATOR_OPTIONAL_SECTIONS).openapi({
  description: 'Optional council moderator section',
  example: 'primaryPerspectives',
});

// 3. TYPESCRIPT TYPE
export type ModeratorOptionalSection = z.infer<typeof ModeratorOptionalSectionSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_MODERATOR_OPTIONAL_SECTION: ModeratorOptionalSection = 'primaryPerspectives';

// 5. CONSTANT OBJECT
export const ModeratorOptionalSections = {
  PRIMARY_PERSPECTIVES: 'primaryPerspectives' as const,
  AREAS_OF_AGREEMENT: 'areasOfAgreement' as const,
  CORE_ASSUMPTIONS_AND_TENSIONS: 'coreAssumptionsAndTensions' as const,
  TRADE_OFFS_AND_IMPLICATIONS: 'tradeOffsAndImplications' as const,
  LIMITATIONS_AND_BLIND_SPOTS: 'limitationsAndBlindSpots' as const,
  CONSENSUS_STATUS: 'consensusStatus' as const,
  INTEGRATED_ANALYSIS: 'integratedAnalysis' as const,
  KEY_EXCHANGES: 'keyExchanges' as const,
  KEY_UNCERTAINTIES: 'keyUncertainties' as const,
} as const;

// ============================================================================
// MODERATOR ALL SECTIONS (Combined)
// ============================================================================

// 1. ARRAY CONSTANT (composed from required + optional)
export const MODERATOR_ALL_SECTIONS = [
  ...MODERATOR_REQUIRED_SECTIONS,
  ...MODERATOR_OPTIONAL_SECTIONS,
] as const;

// 2. ZOD SCHEMA
export const ModeratorSectionSchema = z.enum(MODERATOR_ALL_SECTIONS).openapi({
  description: 'Council moderator section identifier',
});

// 3. TYPESCRIPT TYPE
export type ModeratorSection = z.infer<typeof ModeratorSectionSchema>;

// ============================================================================
// CONSENSUS STATUS
// ============================================================================

// 1. ARRAY CONSTANT
export const CONSENSUS_STATUSES = [
  'clear_consensus',
  'conditional_consensus',
  'multiple_viable_views',
  'no_consensus',
] as const;

// 2. ZOD SCHEMA
export const ConsensusStatusSchema = z.enum(CONSENSUS_STATUSES).openapi({
  description: 'Consensus status of the discussion',
  example: 'conditional_consensus',
});

// 3. TYPESCRIPT TYPE
export type ConsensusStatus = z.infer<typeof ConsensusStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CONSENSUS_STATUS: ConsensusStatus = 'no_consensus';

// 5. CONSTANT OBJECT
export const ConsensusStatuses = {
  CLEAR_CONSENSUS: 'clear_consensus' as const,
  CONDITIONAL_CONSENSUS: 'conditional_consensus' as const,
  MULTIPLE_VIABLE_VIEWS: 'multiple_viable_views' as const,
  NO_CONSENSUS: 'no_consensus' as const,
} as const;

// ============================================================================
// LIMITATION IMPORTANCE
// ============================================================================

// 1. ARRAY CONSTANT
export const LIMITATION_IMPORTANCE_LEVELS = [
  'critical',
  'secondary',
  'out_of_scope',
] as const;

// 2. ZOD SCHEMA
export const LimitationImportanceSchema = z.enum(LIMITATION_IMPORTANCE_LEVELS).openapi({
  description: 'Importance level of a limitation or blind spot',
  example: 'critical',
});

// 3. TYPESCRIPT TYPE
export type LimitationImportance = z.infer<typeof LimitationImportanceSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_LIMITATION_IMPORTANCE: LimitationImportance = 'secondary';

// 5. CONSTANT OBJECT
export const LimitationImportances = {
  CRITICAL: 'critical' as const,
  SECONDARY: 'secondary' as const,
  OUT_OF_SCOPE: 'out_of_scope' as const,
} as const;

// ============================================================================
// CHANGELOG OPERATION (CRUD operation on changelog entries)
// ============================================================================

// 1. ARRAY CONSTANT
export const CHANGELOG_OPERATIONS = ['none', 'delete', 'update', 'insert'] as const;

// 2. ZOD SCHEMA
export const ChangelogOperationSchema = z.enum(CHANGELOG_OPERATIONS).openapi({
  description: 'CRUD operation type for changelog entry management',
  example: 'insert',
});

// 3. TYPESCRIPT TYPE
export type ChangelogOperation = z.infer<typeof ChangelogOperationSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CHANGELOG_OPERATION: ChangelogOperation = 'none';

// 5. CONSTANT OBJECT
export const ChangelogOperations = {
  NONE: 'none' as const,
  DELETE: 'delete' as const,
  UPDATE: 'update' as const,
  INSERT: 'insert' as const,
} as const;

// ============================================================================
// MODERATOR STYLE CONSTRAINTS
// ============================================================================

// 1. ARRAY CONSTANT
export const MODERATOR_STYLE_CONSTRAINTS = [
  'precise_restrained_non_performative',
  'no_emotional_language',
  'no_internal_system_references',
  'no_conversation_narration',
  'treat_cross_model_challenges_as_structural_tensions',
  'omit_empty_sections',
] as const;

// 2. ZOD SCHEMA
export const ModeratorStyleConstraintSchema = z.enum(MODERATOR_STYLE_CONSTRAINTS).openapi({
  description: 'Style constraint for moderator output',
});

// 3. TYPESCRIPT TYPE
export type ModeratorStyleConstraint = z.infer<typeof ModeratorStyleConstraintSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_MODERATOR_STYLE_CONSTRAINT: ModeratorStyleConstraint = 'precise_restrained_non_performative';

// 5. CONSTANT OBJECT
export const ModeratorStyleConstraints = {
  PRECISE_RESTRAINED_NON_PERFORMATIVE: 'precise_restrained_non_performative' as const,
  NO_EMOTIONAL_LANGUAGE: 'no_emotional_language' as const,
  NO_INTERNAL_SYSTEM_REFERENCES: 'no_internal_system_references' as const,
  NO_CONVERSATION_NARRATION: 'no_conversation_narration' as const,
  TREAT_CROSS_MODEL_CHALLENGES_AS_STRUCTURAL_TENSIONS: 'treat_cross_model_challenges_as_structural_tensions' as const,
  OMIT_EMPTY_SECTIONS: 'omit_empty_sections' as const,
} as const;
