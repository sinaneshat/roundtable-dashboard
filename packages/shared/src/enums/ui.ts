/**
 * UI Component Enums
 *
 * Enums for UI component variants, sizes, and styling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// BADGE VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const BADGE_VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'success', 'warning', 'glass'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_BADGE_VARIANT: BadgeVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const BadgeVariantSchema = z.enum(BADGE_VARIANTS).openapi({
  description: 'Badge component visual variant',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type BadgeVariant = z.infer<typeof BadgeVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const BadgeVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  GLASS: 'glass' as const,
  OUTLINE: 'outline' as const,
  SECONDARY: 'secondary' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
} as const;

export function isValidBadgeVariant(value: unknown): value is BadgeVariant {
  return BadgeVariantSchema.safeParse(value).success;
}

// ============================================================================
// CARD VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const CARD_VARIANTS = ['default', 'glass', 'glass-subtle', 'glass-strong'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CARD_VARIANT: CardVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const CardVariantSchema = z.enum(CARD_VARIANTS).openapi({
  description: 'Card component visual variant',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type CardVariant = z.infer<typeof CardVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const CardVariants = {
  DEFAULT: 'default' as const,
  GLASS: 'glass' as const,
  GLASS_STRONG: 'glass-strong' as const,
  GLASS_SUBTLE: 'glass-subtle' as const,
} as const;

// ============================================================================
// COMPONENT VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const COMPONENT_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'white', 'success', 'warning', 'glass'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_COMPONENT_VARIANT: ComponentVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const ComponentVariantSchema = z.enum(COMPONENT_VARIANTS).openapi({
  description: 'UI component visual variant',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const ComponentVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  GHOST: 'ghost' as const,
  GLASS: 'glass' as const,
  LINK: 'link' as const,
  OUTLINE: 'outline' as const,
  SECONDARY: 'secondary' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  WHITE: 'white' as const,
} as const;

// ============================================================================
// COMPONENT SIZE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const COMPONENT_SIZES = ['sm', 'md', 'lg', 'xl', 'icon', 'default'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_COMPONENT_SIZE: ComponentSize = 'default';

// 3️⃣ ZOD SCHEMA
export const ComponentSizeSchema = z.enum(COMPONENT_SIZES).openapi({
  description: 'UI component size',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type ComponentSize = z.infer<typeof ComponentSizeSchema>;

// 5️⃣ CONSTANT OBJECT
export const ComponentSizes = {
  DEFAULT: 'default' as const,
  ICON: 'icon' as const,
  LG: 'lg' as const,
  MD: 'md' as const,
  SM: 'sm' as const,
  XL: 'xl' as const,
} as const;

// ============================================================================
// TEXT ALIGNMENT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_TEXT_ALIGNMENT: TextAlignment = 'left';

// 3️⃣ ZOD SCHEMA
export const TextAlignmentSchema = z.enum(TEXT_ALIGNMENTS).openapi({
  description: 'Text alignment direction',
  example: 'left',
});

// 4️⃣ TYPESCRIPT TYPE
export type TextAlignment = z.infer<typeof TextAlignmentSchema>;

// 5️⃣ CONSTANT OBJECT
export const TextAlignments = {
  CENTER: 'center' as const,
  JUSTIFY: 'justify' as const,
  LEFT: 'left' as const,
  RIGHT: 'right' as const,
} as const;

// ============================================================================
// TOAST VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const TOAST_VARIANTS = ['default', 'destructive', 'success', 'warning', 'info', 'loading'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_TOAST_VARIANT: ToastVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const ToastVariantSchema = z.enum(TOAST_VARIANTS).openapi({
  description: 'Toast notification variant',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type ToastVariant = z.infer<typeof ToastVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const ToastVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  INFO: 'info' as const,
  LOADING: 'loading' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
} as const;

// ============================================================================
// REASONING STATE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const REASONING_STATES = ['idle', 'thinking', 'complete'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_REASONING_STATE: ReasoningState = 'idle';

// 3️⃣ ZOD SCHEMA
export const ReasoningStateSchema = z.enum(REASONING_STATES).openapi({
  description: 'Reasoning animation state',
  example: 'thinking',
});

// 4️⃣ TYPESCRIPT TYPE
export type ReasoningState = z.infer<typeof ReasoningStateSchema>;

// 5️⃣ CONSTANT OBJECT
export const ReasoningStates = {
  COMPLETE: 'complete' as const,
  IDLE: 'idle' as const,
  THINKING: 'thinking' as const,
} as const;

// ============================================================================
// STATUS VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const STATUS_VARIANTS = ['loading', 'success', 'error'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_STATUS_VARIANT: StatusVariant = 'loading';

// 3️⃣ ZOD SCHEMA
export const StatusVariantSchema = z.enum(STATUS_VARIANTS).openapi({
  description: 'Status page variant',
  example: 'loading',
});

// 4️⃣ TYPESCRIPT TYPE
export type StatusVariant = z.infer<typeof StatusVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const StatusVariants = {
  ERROR: 'error' as const,
  LOADING: 'loading' as const,
  SUCCESS: 'success' as const,
} as const;

// ============================================================================
// BORDER VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const BORDER_VARIANTS = ['default', 'success', 'warning', 'error'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_BORDER_VARIANT: BorderVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const BorderVariantSchema = z.enum(BORDER_VARIANTS).openapi({
  description: 'Border styling variant for input components',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type BorderVariant = z.infer<typeof BorderVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const BorderVariants = {
  DEFAULT: 'default' as const,
  ERROR: 'error' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
} as const;

export function isValidBorderVariant(value: unknown): value is BorderVariant {
  return BorderVariantSchema.safeParse(value).success;
}

// ============================================================================
// NETWORK ERROR TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const NETWORK_ERROR_TYPES = ['offline', 'timeout', 'connection'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_NETWORK_ERROR_TYPE: NetworkErrorType = 'offline';

// 3️⃣ ZOD SCHEMA
export const NetworkErrorTypeSchema = z.enum(NETWORK_ERROR_TYPES).openapi({
  description: 'Network error type',
  example: 'offline',
});

// 4️⃣ TYPESCRIPT TYPE
export type NetworkErrorType = z.infer<typeof NetworkErrorTypeSchema>;

// 5️⃣ CONSTANT OBJECT
export const NetworkErrorTypes = {
  CONNECTION: 'connection' as const,
  OFFLINE: 'offline' as const,
  TIMEOUT: 'timeout' as const,
} as const;

// ============================================================================
// ERROR SEVERITY
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const ERROR_SEVERITIES = ['failed', 'warning', 'info'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_ERROR_SEVERITY: ErrorSeverity = 'failed';

// 3️⃣ ZOD SCHEMA
export const ErrorSeveritySchema = z.enum(ERROR_SEVERITIES).openapi({
  description: 'Error severity level',
  example: 'failed',
});

// 4️⃣ TYPESCRIPT TYPE
export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

// 5️⃣ CONSTANT OBJECT
export const ErrorSeverities = {
  FAILED: 'failed' as const,
  INFO: 'info' as const,
  WARNING: 'warning' as const,
} as const;

// ============================================================================
// IMAGE STATE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const IMAGE_STATES = ['loading', 'loaded', 'error'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_IMAGE_STATE: ImageState = 'loading';

// 3️⃣ ZOD SCHEMA
export const ImageStateSchema = z.enum(IMAGE_STATES).openapi({
  description: 'Image loading state',
  example: 'loading',
});

// 4️⃣ TYPESCRIPT TYPE
export type ImageState = z.infer<typeof ImageStateSchema>;

// 5️⃣ CONSTANT OBJECT
export const ImageStates = {
  ERROR: 'error' as const,
  LOADED: 'loaded' as const,
  LOADING: 'loading' as const,
} as const;

// ============================================================================
// MARKDOWN PRESET
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const MARKDOWN_PRESETS = ['default', 'compact', 'web-content'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_MARKDOWN_PRESET: MarkdownPreset = 'default';

// 3️⃣ ZOD SCHEMA
export const MarkdownPresetSchema = z.enum(MARKDOWN_PRESETS).openapi({
  description: 'Markdown rendering preset',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type MarkdownPreset = z.infer<typeof MarkdownPresetSchema>;

// 5️⃣ CONSTANT OBJECT
export const MarkdownPresets = {
  COMPACT: 'compact' as const,
  DEFAULT: 'default' as const,
  WEB_CONTENT: 'web-content' as const,
} as const;

// ============================================================================
// CONFIRMATION DIALOG VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const CONFIRMATION_DIALOG_VARIANTS = ['default', 'destructive', 'warning'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CONFIRMATION_DIALOG_VARIANT: ConfirmationDialogVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const ConfirmationDialogVariantSchema = z.enum(CONFIRMATION_DIALOG_VARIANTS).openapi({
  description: 'Confirmation dialog visual variant',
  example: 'destructive',
});

// 4️⃣ TYPESCRIPT TYPE
export type ConfirmationDialogVariant = z.infer<typeof ConfirmationDialogVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const ConfirmationDialogVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  WARNING: 'warning' as const,
} as const;

// ============================================================================
// ERROR BOUNDARY CONTEXT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const ERROR_BOUNDARY_CONTEXTS = ['chat', 'message-list', 'configuration', 'pre-search', 'general'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_ERROR_BOUNDARY_CONTEXT: ErrorBoundaryContext = 'general';

// 3️⃣ ZOD SCHEMA
export const ErrorBoundaryContextSchema = z.enum(ERROR_BOUNDARY_CONTEXTS).openapi({
  description: 'Error boundary context',
  example: 'chat',
});

// 4️⃣ TYPESCRIPT TYPE
export type ErrorBoundaryContext = z.infer<typeof ErrorBoundaryContextSchema>;

// 5️⃣ CONSTANT OBJECT
export const ErrorBoundaryContexts = {
  CHAT: 'chat' as const,
  CONFIGURATION: 'configuration' as const,
  GENERAL: 'general' as const,
  MESSAGE_LIST: 'message-list' as const,
  PRE_SEARCH: 'pre-search' as const,
} as const;

// ============================================================================
// ICON TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const ICON_TYPES = ['image', 'code', 'text', 'file'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_ICON_TYPE: IconType = 'file';

// 3️⃣ ZOD SCHEMA
export const IconTypeSchema = z.enum(ICON_TYPES).openapi({
  description: 'Attachment icon type',
  example: 'image',
});

// 4️⃣ TYPESCRIPT TYPE
export type IconType = z.infer<typeof IconTypeSchema>;

// 5️⃣ CONSTANT OBJECT
export const IconTypes = {
  CODE: 'code' as const,
  FILE: 'file' as const,
  IMAGE: 'image' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// BORDER GRADIENT DIRECTION
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const BORDER_GRADIENT_DIRECTIONS = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_BORDER_GRADIENT_DIRECTION: BorderGradientDirection = 'TOP';

// 3️⃣ ZOD SCHEMA
export const BorderGradientDirectionSchema = z.enum(BORDER_GRADIENT_DIRECTIONS).openapi({
  description: 'Border gradient animation direction',
  example: 'TOP',
});

// 4️⃣ TYPESCRIPT TYPE
export type BorderGradientDirection = z.infer<typeof BorderGradientDirectionSchema>;

// 5️⃣ CONSTANT OBJECT
export const BorderGradientDirections = {
  BOTTOM: 'BOTTOM' as const,
  LEFT: 'LEFT' as const,
  RIGHT: 'RIGHT' as const,
  TOP: 'TOP' as const,
} as const;

// ============================================================================
// LOGO SIZE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const LOGO_SIZES = ['sm', 'md', 'lg'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_LOGO_SIZE: LogoSize = 'sm';

// 3️⃣ ZOD SCHEMA
export const LogoSizeSchema = z.enum(LOGO_SIZES).openapi({
  description: 'Logo component size variant',
  example: 'md',
});

// 4️⃣ TYPESCRIPT TYPE
export type LogoSize = z.infer<typeof LogoSizeSchema>;

// 5️⃣ CONSTANT OBJECT
export const LogoSizes = {
  LG: 'lg' as const,
  MD: 'md' as const,
  SM: 'sm' as const,
} as const;

export const LogoSizeMetadata: Record<LogoSize, { width: number; height: number; widthFull: number; heightFull: number }> = {
  [LogoSizes.LG]: {
    height: 80,
    heightFull: 240,
    width: 80,
    widthFull: 240,
  },
  [LogoSizes.MD]: {
    height: 60,
    heightFull: 160,
    width: 60,
    widthFull: 160,
  },
  [LogoSizes.SM]: {
    height: 40,
    heightFull: 100,
    width: 40,
    widthFull: 100,
  },
} as const;

// ============================================================================
// LOGO VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const LOGO_VARIANTS = ['icon', 'full'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_LOGO_VARIANT: LogoVariant = 'icon';

// 3️⃣ ZOD SCHEMA
export const LogoVariantSchema = z.enum(LOGO_VARIANTS).openapi({
  description: 'Logo display variant (icon only or full logo)',
  example: 'icon',
});

// 4️⃣ TYPESCRIPT TYPE
export type LogoVariant = z.infer<typeof LogoVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const LogoVariants = {
  FULL: 'full' as const,
  ICON: 'icon' as const,
} as const;

// ============================================================================
// LOADING STATE VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const LOADING_STATE_VARIANTS = ['inline', 'centered', 'card'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_LOADING_STATE_VARIANT: LoadingStateVariant = 'centered';

// 3️⃣ ZOD SCHEMA
export const LoadingStateVariantSchema = z.enum(LOADING_STATE_VARIANTS).openapi({
  description: 'Loading state display variant',
  example: 'centered',
});

// 4️⃣ TYPESCRIPT TYPE
export type LoadingStateVariant = z.infer<typeof LoadingStateVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const LoadingStateVariants = {
  CARD: 'card' as const,
  CENTERED: 'centered' as const,
  INLINE: 'inline' as const,
} as const;

// ============================================================================
// ERROR STATE VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const ERROR_STATE_VARIANTS = ['alert', 'card', 'network', 'boundary'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_ERROR_STATE_VARIANT: ErrorStateVariant = 'card';

// 3️⃣ ZOD SCHEMA
export const ErrorStateVariantSchema = z.enum(ERROR_STATE_VARIANTS).openapi({
  description: 'Error state display variant',
  example: 'card',
});

// 4️⃣ TYPESCRIPT TYPE
export type ErrorStateVariant = z.infer<typeof ErrorStateVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const ErrorStateVariants = {
  ALERT: 'alert' as const,
  BOUNDARY: 'boundary' as const,
  CARD: 'card' as const,
  NETWORK: 'network' as const,
} as const;

// ============================================================================
// EMPTY STATE VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const EMPTY_STATE_VARIANTS = ['general', 'custom'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_EMPTY_STATE_VARIANT: EmptyStateVariant = 'general';

// 3️⃣ ZOD SCHEMA
export const EmptyStateVariantSchema = z.enum(EMPTY_STATE_VARIANTS).openapi({
  description: 'Empty state display variant',
  example: 'general',
});

// 4️⃣ TYPESCRIPT TYPE
export type EmptyStateVariant = z.infer<typeof EmptyStateVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const EmptyStateVariants = {
  CUSTOM: 'custom' as const,
  GENERAL: 'general' as const,
} as const;

// ============================================================================
// SUCCESS STATE VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const SUCCESS_STATE_VARIANTS = ['alert', 'card'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SUCCESS_STATE_VARIANT: SuccessStateVariant = 'alert';

// 3️⃣ ZOD SCHEMA
export const SuccessStateVariantSchema = z.enum(SUCCESS_STATE_VARIANTS).openapi({
  description: 'Success state display variant',
  example: 'alert',
});

// 4️⃣ TYPESCRIPT TYPE
export type SuccessStateVariant = z.infer<typeof SuccessStateVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const SuccessStateVariants = {
  ALERT: 'alert' as const,
  CARD: 'card' as const,
} as const;

// ============================================================================
// GLOWING EFFECT VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const GLOWING_EFFECT_VARIANTS = ['default', 'white'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_GLOWING_EFFECT_VARIANT: GlowingEffectVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const GlowingEffectVariantSchema = z.enum(GLOWING_EFFECT_VARIANTS).openapi({
  description: 'Glowing effect color variant',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type GlowingEffectVariant = z.infer<typeof GlowingEffectVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const GlowingEffectVariants = {
  DEFAULT: 'default' as const,
  WHITE: 'white' as const,
} as const;

// ============================================================================
// CITATION SEGMENT TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const CITATION_SEGMENT_TYPES = ['text', 'citation'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CITATION_SEGMENT_TYPE: CitationSegmentType = 'text';

// 3️⃣ ZOD SCHEMA
export const CitationSegmentTypeSchema = z.enum(CITATION_SEGMENT_TYPES).openapi({
  description: 'Citation segment type',
  example: 'text',
});

// 4️⃣ TYPESCRIPT TYPE
export type CitationSegmentType = z.infer<typeof CitationSegmentTypeSchema>;

// 5️⃣ CONSTANT OBJECT
export const CitationSegmentTypes = {
  CITATION: 'citation' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// SPACING VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const SPACING_VARIANTS = ['tight', 'default', 'loose'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SPACING_VARIANT: SpacingVariant = 'default';

// 3️⃣ ZOD SCHEMA
export const SpacingVariantSchema = z.enum(SPACING_VARIANTS).openapi({
  description: 'Spacing variant for layout components',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type SpacingVariant = z.infer<typeof SpacingVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const SpacingVariants = {
  DEFAULT: 'default' as const,
  LOOSE: 'loose' as const,
  TIGHT: 'tight' as const,
} as const;

// ============================================================================
// EMPTY STATE STYLE
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const EMPTY_STATE_STYLES = ['default', 'dashed', 'gradient'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_EMPTY_STATE_STYLE: EmptyStateStyle = 'default';

// 3️⃣ ZOD SCHEMA
export const EmptyStateStyleSchema = z.enum(EMPTY_STATE_STYLES).openapi({
  description: 'Empty state card styling',
  example: 'default',
});

// 4️⃣ TYPESCRIPT TYPE
export type EmptyStateStyle = z.infer<typeof EmptyStateStyleSchema>;

// 5️⃣ CONSTANT OBJECT
export const EmptyStateStyles = {
  DASHED: 'dashed' as const,
  DEFAULT: 'default' as const,
  GRADIENT: 'gradient' as const,
} as const;

// ============================================================================
// SCROLL BUTTON VARIANT
// ============================================================================

// 1️⃣ ARRAY CONSTANT
export const SCROLL_BUTTON_VARIANTS = ['floating', 'header', 'input'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_SCROLL_BUTTON_VARIANT: ScrollButtonVariant = 'floating';

// 3️⃣ ZOD SCHEMA
export const ScrollButtonVariantSchema = z.enum(SCROLL_BUTTON_VARIANTS).openapi({
  description: 'Scroll button placement variant',
  example: 'floating',
});

// 4️⃣ TYPESCRIPT TYPE
export type ScrollButtonVariant = z.infer<typeof ScrollButtonVariantSchema>;

// 5️⃣ CONSTANT OBJECT
export const ScrollButtonVariants = {
  FLOATING: 'floating' as const,
  HEADER: 'header' as const,
  INPUT: 'input' as const,
} as const;

// ============================================================================
// AVATAR SIZE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const AVATAR_SIZES = ['sm', 'base', 'md'] as const;

// 2️⃣ DEFAULT VALUE (if applicable)
export const DEFAULT_AVATAR_SIZE: AvatarSize = 'sm';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const AvatarSizeSchema = z.enum(AVATAR_SIZES).openapi({
  description: 'Avatar component size',
  example: 'sm',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type AvatarSize = z.infer<typeof AvatarSizeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const AvatarSizes = {
  BASE: 'base' as const,
  MD: 'md' as const,
  SM: 'sm' as const,
} as const;

export const AvatarSizeMetadata: Record<AvatarSize, { container: string; text: string; overlapOffset: number; gapSize: number }> = {
  [AvatarSizes.BASE]: {
    container: 'size-8',
    gapSize: 10,
    overlapOffset: -10,
    text: 'text-[11px]',
  },
  [AvatarSizes.MD]: {
    container: 'size-10',
    gapSize: 12,
    overlapOffset: -12,
    text: 'text-xs',
  },
  [AvatarSizes.SM]: {
    container: 'size-6',
    gapSize: 8,
    overlapOffset: -8,
    text: 'text-[10px]',
  },
} as const;

// ============================================================================
// MODEL SELECTION TAB
// ============================================================================

export const MODEL_SELECTION_TABS = ['presets', 'custom'] as const;

export const DEFAULT_MODEL_SELECTION_TAB: ModelSelectionTab = 'presets';

export const ModelSelectionTabSchema = z.enum(MODEL_SELECTION_TABS).openapi({
  description: 'Model selection modal tab',
  example: 'presets',
});

export type ModelSelectionTab = z.infer<typeof ModelSelectionTabSchema>;

export const ModelSelectionTabs = {
  CUSTOM: 'custom' as const,
  PRESETS: 'presets' as const,
} as const;

// ============================================================================
// LABELS (UI Display)
// ============================================================================

export const COMPONENT_SIZE_LABELS: Record<ComponentSize, string> = {
  [ComponentSizes.DEFAULT]: 'Default',
  [ComponentSizes.ICON]: 'Icon',
  [ComponentSizes.LG]: 'Large',
  [ComponentSizes.MD]: 'Medium',
  [ComponentSizes.SM]: 'Small',
  [ComponentSizes.XL]: 'Extra Large',
} as const;

export const IMAGE_STATE_LABELS: Record<ImageState, string> = {
  [ImageStates.ERROR]: 'Error',
  [ImageStates.LOADED]: 'Loaded',
  [ImageStates.LOADING]: 'Loading',
} as const;

export const MARKDOWN_PRESET_LABELS: Record<MarkdownPreset, string> = {
  [MarkdownPresets.COMPACT]: 'Compact',
  [MarkdownPresets.DEFAULT]: 'Default',
  [MarkdownPresets.WEB_CONTENT]: 'Web Content',
} as const;

export const AVATAR_SIZE_LABELS: Record<AvatarSize, string> = {
  [AvatarSizes.BASE]: 'Base',
  [AvatarSizes.MD]: 'Medium',
  [AvatarSizes.SM]: 'Small',
} as const;

export const MODEL_SELECTION_TAB_LABELS: Record<ModelSelectionTab, string> = {
  [ModelSelectionTabs.CUSTOM]: 'Build Custom',
  [ModelSelectionTabs.PRESETS]: 'Presets',
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidComponentVariant(value: unknown): value is ComponentVariant {
  return ComponentVariantSchema.safeParse(value).success;
}

export function isValidComponentSize(value: unknown): value is ComponentSize {
  return ComponentSizeSchema.safeParse(value).success;
}

export function isValidTextAlignment(value: unknown): value is TextAlignment {
  return TextAlignmentSchema.safeParse(value).success;
}

export function isValidToastVariant(value: unknown): value is ToastVariant {
  return ToastVariantSchema.safeParse(value).success;
}

export function isValidReasoningState(value: unknown): value is ReasoningState {
  return ReasoningStateSchema.safeParse(value).success;
}

export function isValidStatusVariant(value: unknown): value is StatusVariant {
  return StatusVariantSchema.safeParse(value).success;
}

export function isValidNetworkErrorType(value: unknown): value is NetworkErrorType {
  return NetworkErrorTypeSchema.safeParse(value).success;
}

export function isValidErrorSeverity(value: unknown): value is ErrorSeverity {
  return ErrorSeveritySchema.safeParse(value).success;
}

export function isValidImageState(value: unknown): value is ImageState {
  return ImageStateSchema.safeParse(value).success;
}

export function isValidMarkdownPreset(value: unknown): value is MarkdownPreset {
  return MarkdownPresetSchema.safeParse(value).success;
}

export function isValidConfirmationDialogVariant(value: unknown): value is ConfirmationDialogVariant {
  return ConfirmationDialogVariantSchema.safeParse(value).success;
}

export function isValidErrorBoundaryContext(value: unknown): value is ErrorBoundaryContext {
  return ErrorBoundaryContextSchema.safeParse(value).success;
}

export function isValidIconType(value: unknown): value is IconType {
  return IconTypeSchema.safeParse(value).success;
}

export function isValidBorderGradientDirection(value: unknown): value is BorderGradientDirection {
  return BorderGradientDirectionSchema.safeParse(value).success;
}

export function isValidLogoSize(value: unknown): value is LogoSize {
  return LogoSizeSchema.safeParse(value).success;
}

export function isValidLogoVariant(value: unknown): value is LogoVariant {
  return LogoVariantSchema.safeParse(value).success;
}

export function isValidLoadingStateVariant(value: unknown): value is LoadingStateVariant {
  return LoadingStateVariantSchema.safeParse(value).success;
}

export function isValidErrorStateVariant(value: unknown): value is ErrorStateVariant {
  return ErrorStateVariantSchema.safeParse(value).success;
}

export function isValidEmptyStateVariant(value: unknown): value is EmptyStateVariant {
  return EmptyStateVariantSchema.safeParse(value).success;
}

export function isValidSuccessStateVariant(value: unknown): value is SuccessStateVariant {
  return SuccessStateVariantSchema.safeParse(value).success;
}

export function isValidGlowingEffectVariant(value: unknown): value is GlowingEffectVariant {
  return GlowingEffectVariantSchema.safeParse(value).success;
}

export function isValidCitationSegmentType(value: unknown): value is CitationSegmentType {
  return CitationSegmentTypeSchema.safeParse(value).success;
}

export function isValidSpacingVariant(value: unknown): value is SpacingVariant {
  return SpacingVariantSchema.safeParse(value).success;
}

export function isValidEmptyStateStyle(value: unknown): value is EmptyStateStyle {
  return EmptyStateStyleSchema.safeParse(value).success;
}

export function isValidScrollButtonVariant(value: unknown): value is ScrollButtonVariant {
  return ScrollButtonVariantSchema.safeParse(value).success;
}

export function isValidAvatarSize(value: unknown): value is AvatarSize {
  return AvatarSizeSchema.safeParse(value).success;
}

export function isValidModelSelectionTab(value: unknown): value is ModelSelectionTab {
  return ModelSelectionTabSchema.safeParse(value).success;
}

export function isValidCardVariant(value: unknown): value is CardVariant {
  return CardVariantSchema.safeParse(value).success;
}

// ============================================================================
// TOAST POSITION
// ============================================================================

export const TOAST_POSITIONS = ['top-center', 'top-right', 'bottom-center', 'bottom-right'] as const;

export const DEFAULT_TOAST_POSITION: ToastPosition = 'bottom-right';

export const ToastPositionSchema = z.enum(TOAST_POSITIONS).openapi({
  description: 'Toast notification position on screen',
  example: 'bottom-right',
});

export type ToastPosition = z.infer<typeof ToastPositionSchema>;

export const ToastPositions = {
  BOTTOM_CENTER: 'bottom-center' as const,
  BOTTOM_RIGHT: 'bottom-right' as const,
  TOP_CENTER: 'top-center' as const,
  TOP_RIGHT: 'top-right' as const,
} as const;

export function isValidToastPosition(value: unknown): value is ToastPosition {
  return ToastPositionSchema.safeParse(value).success;
}

// ============================================================================
// BASE TOAST VARIANT (Subset of ToastVariant supported by base toast component)
// ============================================================================

export const BASE_TOAST_VARIANTS = ['default', 'destructive', 'success', 'warning', 'info'] as const;

export const DEFAULT_BASE_TOAST_VARIANT: BaseToastVariant = 'default';

export const BaseToastVariantSchema = z.enum(BASE_TOAST_VARIANTS).openapi({
  description: 'Base toast variant (supported by shadcn toast component)',
  example: 'default',
});

export type BaseToastVariant = z.infer<typeof BaseToastVariantSchema>;

export const BaseToastVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  INFO: 'info' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
} as const;

export function isValidBaseToastVariant(value: unknown): value is BaseToastVariant {
  return BaseToastVariantSchema.safeParse(value).success;
}

// ============================================================================
// SIDEBAR STATE
// ============================================================================

export const SIDEBAR_STATES = ['expanded', 'collapsed'] as const;

export const DEFAULT_SIDEBAR_STATE: SidebarState = 'expanded';

export const SidebarStateSchema = z.enum(SIDEBAR_STATES).openapi({
  description: 'Sidebar expansion state',
  example: 'expanded',
});

export type SidebarState = z.infer<typeof SidebarStateSchema>;

export const SidebarStates = {
  COLLAPSED: 'collapsed' as const,
  EXPANDED: 'expanded' as const,
} as const;

export function isValidSidebarState(value: unknown): value is SidebarState {
  return SidebarStateSchema.safeParse(value).success;
}

// ============================================================================
// SERVICE WORKER STATE
// ============================================================================

export const SERVICE_WORKER_STATES = ['installing', 'installed', 'activating', 'activated', 'redundant'] as const;

export const DEFAULT_SERVICE_WORKER_STATE: ServiceWorkerState = 'installing';

export const ServiceWorkerStateSchema = z.enum(SERVICE_WORKER_STATES).openapi({
  description: 'Service worker lifecycle state',
  example: 'activated',
});

export type ServiceWorkerState = z.infer<typeof ServiceWorkerStateSchema>;

export const ServiceWorkerStates = {
  ACTIVATED: 'activated' as const,
  ACTIVATING: 'activating' as const,
  INSTALLED: 'installed' as const,
  INSTALLING: 'installing' as const,
  REDUNDANT: 'redundant' as const,
} as const;

export function isValidServiceWorkerState(value: unknown): value is ServiceWorkerState {
  return ServiceWorkerStateSchema.safeParse(value).success;
}

// ============================================================================
// SERVICE WORKER MESSAGE TYPE
// ============================================================================

export const SERVICE_WORKER_MESSAGE_TYPES = ['SKIP_WAITING'] as const;

export const DEFAULT_SERVICE_WORKER_MESSAGE_TYPE: ServiceWorkerMessageType = 'SKIP_WAITING';

export const ServiceWorkerMessageTypeSchema = z.enum(SERVICE_WORKER_MESSAGE_TYPES).openapi({
  description: 'Service worker message type',
  example: 'SKIP_WAITING',
});

export type ServiceWorkerMessageType = z.infer<typeof ServiceWorkerMessageTypeSchema>;

export const ServiceWorkerMessageTypes = {
  SKIP_WAITING: 'SKIP_WAITING' as const,
} as const;

export function isValidServiceWorkerMessageType(value: unknown): value is ServiceWorkerMessageType {
  return ServiceWorkerMessageTypeSchema.safeParse(value).success;
}

// ============================================================================
// KEYBOARD KEY
// ============================================================================

export const KEYBOARD_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete'] as const;

export const DEFAULT_KEYBOARD_KEY: KeyboardKey = 'Enter';

export const KeyboardKeySchema = z.enum(KEYBOARD_KEYS).openapi({
  description: 'Keyboard key for event handling',
  example: 'Enter',
});

export type KeyboardKey = z.infer<typeof KeyboardKeySchema>;

export const KeyboardKeys = {
  ARROW_DOWN: 'ArrowDown' as const,
  ARROW_LEFT: 'ArrowLeft' as const,
  ARROW_RIGHT: 'ArrowRight' as const,
  ARROW_UP: 'ArrowUp' as const,
  BACKSPACE: 'Backspace' as const,
  DELETE: 'Delete' as const,
  ENTER: 'Enter' as const,
  ESCAPE: 'Escape' as const,
  SPACE: 'Space' as const,
  TAB: 'Tab' as const,
} as const;

export function isValidKeyboardKey(value: unknown): value is KeyboardKey {
  return KeyboardKeySchema.safeParse(value).success;
}

// ============================================================================
// SEO CONTENT TYPE (for AEO meta tags)
// ============================================================================

export const SEO_CONTENT_TYPES = ['how-to', 'comparison', 'review', 'guide', 'faq', 'tutorial'] as const;

export const DEFAULT_SEO_CONTENT_TYPE: SeoContentType = 'guide';

export const SeoContentTypeSchema = z.enum(SEO_CONTENT_TYPES).openapi({
  description: 'SEO content type for AI search optimization',
  example: 'how-to',
});

export type SeoContentType = z.infer<typeof SeoContentTypeSchema>;

export const SeoContentTypes = {
  COMPARISON: 'comparison' as const,
  FAQ: 'faq' as const,
  GUIDE: 'guide' as const,
  HOW_TO: 'how-to' as const,
  REVIEW: 'review' as const,
  TUTORIAL: 'tutorial' as const,
} as const;

export function isValidSeoContentType(value: unknown): value is SeoContentType {
  return SeoContentTypeSchema.safeParse(value).success;
}

// ============================================================================
// SEO CONTENT LEVEL (for AEO meta tags)
// ============================================================================

export const SEO_CONTENT_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

export const DEFAULT_SEO_CONTENT_LEVEL: SeoContentLevel = 'beginner';

export const SeoContentLevelSchema = z.enum(SEO_CONTENT_LEVELS).openapi({
  description: 'Content difficulty level for audience matching',
  example: 'intermediate',
});

export type SeoContentLevel = z.infer<typeof SeoContentLevelSchema>;

export const SeoContentLevels = {
  ADVANCED: 'advanced' as const,
  BEGINNER: 'beginner' as const,
  INTERMEDIATE: 'intermediate' as const,
} as const;

export function isValidSeoContentLevel(value: unknown): value is SeoContentLevel {
  return SeoContentLevelSchema.safeParse(value).success;
}

// ============================================================================
// SIDEBAR SIDE (for Sidebar component)
// ============================================================================

export const SIDEBAR_SIDES = ['start', 'end'] as const;

export const DEFAULT_SIDEBAR_SIDE: SidebarSide = 'start';

export const SidebarSideSchema = z.enum(SIDEBAR_SIDES).openapi({
  description: 'Sidebar position side',
  example: 'start',
});

export type SidebarSide = z.infer<typeof SidebarSideSchema>;

export const SidebarSides = {
  END: 'end' as const,
  START: 'start' as const,
} as const;

export function isValidSidebarSide(value: unknown): value is SidebarSide {
  return SidebarSideSchema.safeParse(value).success;
}

// ============================================================================
// SIDEBAR VARIANT (for Sidebar component)
// ============================================================================

export const SIDEBAR_VARIANTS = ['sidebar', 'floating', 'inset'] as const;

export const DEFAULT_SIDEBAR_VARIANT: SidebarVariant = 'sidebar';

export const SidebarVariantSchema = z.enum(SIDEBAR_VARIANTS).openapi({
  description: 'Sidebar visual variant',
  example: 'sidebar',
});

export type SidebarVariant = z.infer<typeof SidebarVariantSchema>;

export const SidebarVariants = {
  FLOATING: 'floating' as const,
  INSET: 'inset' as const,
  SIDEBAR: 'sidebar' as const,
} as const;

export function isValidSidebarVariant(value: unknown): value is SidebarVariant {
  return SidebarVariantSchema.safeParse(value).success;
}

// ============================================================================
// SIDEBAR COLLAPSIBLE (for Sidebar component)
// ============================================================================

export const SIDEBAR_COLLAPSIBLES = ['offcanvas', 'icon', 'none'] as const;

export const DEFAULT_SIDEBAR_COLLAPSIBLE: SidebarCollapsible = 'offcanvas';

export const SidebarCollapsibleSchema = z.enum(SIDEBAR_COLLAPSIBLES).openapi({
  description: 'Sidebar collapse behavior',
  example: 'offcanvas',
});

export type SidebarCollapsible = z.infer<typeof SidebarCollapsibleSchema>;

export const SidebarCollapsibles = {
  ICON: 'icon' as const,
  NONE: 'none' as const,
  OFFCANVAS: 'offcanvas' as const,
} as const;

export function isValidSidebarCollapsible(value: unknown): value is SidebarCollapsible {
  return SidebarCollapsibleSchema.safeParse(value).success;
}

// ============================================================================
// SIDEBAR MENU BUTTON SIZE
// ============================================================================

export const SIDEBAR_MENU_BUTTON_SIZES = ['sm', 'md'] as const;

export const DEFAULT_SIDEBAR_MENU_BUTTON_SIZE: SidebarMenuButtonSize = 'md';

export const SidebarMenuButtonSizeSchema = z.enum(SIDEBAR_MENU_BUTTON_SIZES).openapi({
  description: 'Sidebar menu button size',
  example: 'md',
});

export type SidebarMenuButtonSize = z.infer<typeof SidebarMenuButtonSizeSchema>;

export const SidebarMenuButtonSizes = {
  MD: 'md' as const,
  SM: 'sm' as const,
} as const;

export function isValidSidebarMenuButtonSize(value: unknown): value is SidebarMenuButtonSize {
  return SidebarMenuButtonSizeSchema.safeParse(value).success;
}

// ============================================================================
// DROPDOWN MENU VARIANT
// ============================================================================

export const DROPDOWN_MENU_VARIANTS = ['default', 'destructive'] as const;

export const DEFAULT_DROPDOWN_MENU_VARIANT: DropdownMenuVariant = 'default';

export const DropdownMenuVariantSchema = z.enum(DROPDOWN_MENU_VARIANTS).openapi({
  description: 'Dropdown menu item variant',
  example: 'default',
});

export type DropdownMenuVariant = z.infer<typeof DropdownMenuVariantSchema>;

export const DropdownMenuVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
} as const;

export function isValidDropdownMenuVariant(value: unknown): value is DropdownMenuVariant {
  return DropdownMenuVariantSchema.safeParse(value).success;
}

// ============================================================================
// IMAGE LOADING (for img element)
// ============================================================================

export const IMAGE_LOADINGS = ['lazy', 'eager'] as const;

export const DEFAULT_IMAGE_LOADING: ImageLoading = 'lazy';

export const ImageLoadingSchema = z.enum(IMAGE_LOADINGS).openapi({
  description: 'Image loading strategy',
  example: 'lazy',
});

export type ImageLoading = z.infer<typeof ImageLoadingSchema>;

export const ImageLoadings = {
  EAGER: 'eager' as const,
  LAZY: 'lazy' as const,
} as const;

export function isValidImageLoading(value: unknown): value is ImageLoading {
  return ImageLoadingSchema.safeParse(value).success;
}

// ============================================================================
// FIELD TYPE (for form inputs)
// ============================================================================

export const FIELD_TYPES = ['text', 'number', 'email', 'password'] as const;

export const DEFAULT_FIELD_TYPE: FieldType = 'text';

export const FieldTypeSchema = z.enum(FIELD_TYPES).openapi({
  description: 'Form input field type',
  example: 'text',
});

export type FieldType = z.infer<typeof FieldTypeSchema>;

export const FieldTypes = {
  EMAIL: 'email' as const,
  NUMBER: 'number' as const,
  PASSWORD: 'password' as const,
  TEXT: 'text' as const,
} as const;

export function isValidFieldType(value: unknown): value is FieldType {
  return FieldTypeSchema.safeParse(value).success;
}

// ============================================================================
// SCROLL BEHAVIOR
// ============================================================================

export const SCROLL_BEHAVIORS = ['auto', 'smooth'] as const;

export const DEFAULT_SCROLL_BEHAVIOR: ScrollBehavior = 'auto';

export const ScrollBehaviorSchema = z.enum(SCROLL_BEHAVIORS).openapi({
  description: 'Scroll animation behavior',
  example: 'smooth',
});

export type ScrollBehavior = z.infer<typeof ScrollBehaviorSchema>;

export const ScrollBehaviors = {
  AUTO: 'auto' as const,
  SMOOTH: 'smooth' as const,
} as const;

export function isValidScrollBehavior(value: unknown): value is ScrollBehavior {
  return ScrollBehaviorSchema.safeParse(value).success;
}

// ============================================================================
// SCROLL ALIGN
// ============================================================================

export const SCROLL_ALIGNS = ['start', 'center', 'end', 'auto'] as const;

export const DEFAULT_SCROLL_ALIGN: ScrollAlign = 'auto';

export const ScrollAlignSchema = z.enum(SCROLL_ALIGNS).openapi({
  description: 'Scroll alignment position',
  example: 'center',
});

export type ScrollAlign = z.infer<typeof ScrollAlignSchema>;

export const ScrollAligns = {
  AUTO: 'auto' as const,
  CENTER: 'center' as const,
  END: 'end' as const,
  START: 'start' as const,
} as const;

export function isValidScrollAlign(value: unknown): value is ScrollAlign {
  return ScrollAlignSchema.safeParse(value).success;
}

// ============================================================================
// API KEYS MODAL TAB
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const API_KEYS_MODAL_TABS = ['list', 'create'] as const;

// 2️⃣ DEFAULT VALUE (if applicable)
export const DEFAULT_API_KEYS_MODAL_TAB: ApiKeysModalTab = 'list';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ApiKeysModalTabSchema = z.enum(API_KEYS_MODAL_TABS).openapi({
  description: 'API keys modal tab selection',
  example: 'list',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ApiKeysModalTab = z.infer<typeof ApiKeysModalTabSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ApiKeysModalTabs = {
  CREATE: 'create' as const,
  LIST: 'list' as const,
} as const;

export function isValidApiKeysModalTab(value: unknown): value is ApiKeysModalTab {
  return ApiKeysModalTabSchema.safeParse(value).success;
}

// ============================================================================
// SKELETON USECASE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const SKELETON_USECASES = ['chat', 'demo'] as const;

// 2️⃣ DEFAULT VALUE (if applicable)
export const DEFAULT_SKELETON_USECASE: SkeletonUsecase = 'chat';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const SkeletonUsecaseSchema = z.enum(SKELETON_USECASES).openapi({
  description: 'Skeleton component usecase variant',
  example: 'chat',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type SkeletonUsecase = z.infer<typeof SkeletonUsecaseSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const SkeletonUsecases = {
  CHAT: 'chat' as const,
  DEMO: 'demo' as const,
} as const;

export function isValidSkeletonUsecase(value: unknown): value is SkeletonUsecase {
  return SkeletonUsecaseSchema.safeParse(value).success;
}

// ============================================================================
// USER FEEDBACK TYPE (for feedback modal - captured via PostHog)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const USER_FEEDBACK_TYPES = ['bug', 'feature_request', 'general', 'other'] as const;

// 2️⃣ DEFAULT VALUE (if applicable)
export const DEFAULT_USER_FEEDBACK_TYPE: UserFeedbackType = 'general';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const UserFeedbackTypeSchema = z.enum(USER_FEEDBACK_TYPES).openapi({
  description: 'User feedback submission type',
  example: 'general',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UserFeedbackType = z.infer<typeof UserFeedbackTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const UserFeedbackTypes = {
  BUG: 'bug' as const,
  FEATURE_REQUEST: 'feature_request' as const,
  GENERAL: 'general' as const,
  OTHER: 'other' as const,
} as const;

export function isValidUserFeedbackType(value: unknown): value is UserFeedbackType {
  return UserFeedbackTypeSchema.safeParse(value).success;
}

// ============================================================================
// OG IMAGE TYPE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const OG_IMAGE_TYPES = ['public-thread', 'thread', 'page'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_OG_IMAGE_TYPE: OgImageType = 'page';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const OgImageTypeSchema = z.enum(OG_IMAGE_TYPES).openapi({
  description: 'Open Graph image type for cache key generation',
  example: 'public-thread',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type OgImageType = z.infer<typeof OgImageTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const OgImageTypes = {
  PAGE: 'page' as const,
  PUBLIC_THREAD: 'public-thread' as const,
  THREAD: 'thread' as const,
} as const;

export function isValidOgImageType(value: unknown): value is OgImageType {
  return OgImageTypeSchema.safeParse(value).success;
}

// ============================================================================
// COPY ICON VARIANT (for copy action button icon display)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const COPY_ICON_VARIANTS = ['copy', 'stack'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_COPY_ICON_VARIANT: CopyIconVariant = 'copy';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CopyIconVariantSchema = z.enum(COPY_ICON_VARIANTS).openapi({
  description: 'Icon variant for copy action button',
  example: 'copy',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CopyIconVariant = z.infer<typeof CopyIconVariantSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const CopyIconVariants = {
  COPY: 'copy' as const,
  STACK: 'stack' as const,
} as const;

export function isValidCopyIconVariant(value: unknown): value is CopyIconVariant {
  return CopyIconVariantSchema.safeParse(value).success;
}

// ============================================================================
// IMAGE PLACEHOLDER TYPE (for Image component loading strategy)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const IMAGE_PLACEHOLDER_TYPES = ['blur', 'empty'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_IMAGE_PLACEHOLDER_TYPE: ImagePlaceholderType = 'empty';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ImagePlaceholderTypeSchema = z.enum(IMAGE_PLACEHOLDER_TYPES).openapi({
  description: 'Image placeholder display strategy during loading',
  example: 'blur',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ImagePlaceholderType = z.infer<typeof ImagePlaceholderTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ImagePlaceholderTypes = {
  BLUR: 'blur' as const,
  EMPTY: 'empty' as const,
} as const;

export function isValidImagePlaceholderType(value: unknown): value is ImagePlaceholderType {
  return ImagePlaceholderTypeSchema.safeParse(value).success;
}
