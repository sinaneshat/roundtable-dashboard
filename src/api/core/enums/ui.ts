/**
 * UI Component Enums
 *
 * Enums for UI component variants, sizes, and styling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// CARD VARIANT
// ============================================================================

export const CARD_VARIANTS = ['default', 'glass', 'glass-subtle', 'glass-strong'] as const;

export const DEFAULT_CARD_VARIANT: CardVariant = 'default';

export const CardVariantSchema = z.enum(CARD_VARIANTS).openapi({
  description: 'Card component visual variant',
  example: 'default',
});

export type CardVariant = z.infer<typeof CardVariantSchema>;

export const CardVariants = {
  DEFAULT: 'default' as const,
  GLASS: 'glass' as const,
  GLASS_SUBTLE: 'glass-subtle' as const,
  GLASS_STRONG: 'glass-strong' as const,
} as const;

// ============================================================================
// COMPONENT VARIANT
// ============================================================================

export const COMPONENT_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'white', 'success', 'warning', 'glass'] as const;

export const DEFAULT_COMPONENT_VARIANT: ComponentVariant = 'default';

export const ComponentVariantSchema = z.enum(COMPONENT_VARIANTS).openapi({
  description: 'UI component visual variant',
  example: 'default',
});

export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;

export const ComponentVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  OUTLINE: 'outline' as const,
  SECONDARY: 'secondary' as const,
  GHOST: 'ghost' as const,
  LINK: 'link' as const,
  WHITE: 'white' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  GLASS: 'glass' as const,
} as const;

// ============================================================================
// COMPONENT SIZE
// ============================================================================

export const COMPONENT_SIZES = ['sm', 'md', 'lg', 'xl', 'icon', 'default'] as const;

export const DEFAULT_COMPONENT_SIZE: ComponentSize = 'default';

export const ComponentSizeSchema = z.enum(COMPONENT_SIZES).openapi({
  description: 'UI component size',
  example: 'default',
});

export type ComponentSize = z.infer<typeof ComponentSizeSchema>;

export const ComponentSizes = {
  SM: 'sm' as const,
  MD: 'md' as const,
  LG: 'lg' as const,
  XL: 'xl' as const,
  ICON: 'icon' as const,
  DEFAULT: 'default' as const,
} as const;

// ============================================================================
// TEXT ALIGNMENT
// ============================================================================

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

export const DEFAULT_TEXT_ALIGNMENT: TextAlignment = 'left';

export const TextAlignmentSchema = z.enum(TEXT_ALIGNMENTS).openapi({
  description: 'Text alignment direction',
  example: 'left',
});

export type TextAlignment = z.infer<typeof TextAlignmentSchema>;

export const TextAlignments = {
  LEFT: 'left' as const,
  CENTER: 'center' as const,
  RIGHT: 'right' as const,
  JUSTIFY: 'justify' as const,
} as const;

// ============================================================================
// TOAST VARIANT
// ============================================================================

export const TOAST_VARIANTS = ['default', 'destructive', 'success', 'warning', 'info', 'loading'] as const;

export const DEFAULT_TOAST_VARIANT: ToastVariant = 'default';

export const ToastVariantSchema = z.enum(TOAST_VARIANTS).openapi({
  description: 'Toast notification variant',
  example: 'default',
});

export type ToastVariant = z.infer<typeof ToastVariantSchema>;

export const ToastVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
  LOADING: 'loading' as const,
} as const;

// ============================================================================
// REASONING STATE
// ============================================================================

export const REASONING_STATES = ['idle', 'thinking', 'complete'] as const;

export const DEFAULT_REASONING_STATE: ReasoningState = 'idle';

export const ReasoningStateSchema = z.enum(REASONING_STATES).openapi({
  description: 'Reasoning animation state',
  example: 'thinking',
});

export type ReasoningState = z.infer<typeof ReasoningStateSchema>;

export const ReasoningStates = {
  IDLE: 'idle' as const,
  THINKING: 'thinking' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// STATUS VARIANT
// ============================================================================

export const STATUS_VARIANTS = ['loading', 'success', 'error'] as const;

export const DEFAULT_STATUS_VARIANT: StatusVariant = 'loading';

export const StatusVariantSchema = z.enum(STATUS_VARIANTS).openapi({
  description: 'Status page variant',
  example: 'loading',
});

export type StatusVariant = z.infer<typeof StatusVariantSchema>;

export const StatusVariants = {
  LOADING: 'loading' as const,
  SUCCESS: 'success' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// NETWORK ERROR TYPE
// ============================================================================

export const NETWORK_ERROR_TYPES = ['offline', 'timeout', 'connection'] as const;

export const DEFAULT_NETWORK_ERROR_TYPE: NetworkErrorType = 'offline';

export const NetworkErrorTypeSchema = z.enum(NETWORK_ERROR_TYPES).openapi({
  description: 'Network error type',
  example: 'offline',
});

export type NetworkErrorType = z.infer<typeof NetworkErrorTypeSchema>;

export const NetworkErrorTypes = {
  OFFLINE: 'offline' as const,
  TIMEOUT: 'timeout' as const,
  CONNECTION: 'connection' as const,
} as const;

// ============================================================================
// ERROR SEVERITY
// ============================================================================

export const ERROR_SEVERITIES = ['failed', 'warning', 'info'] as const;

export const DEFAULT_ERROR_SEVERITY: ErrorSeverity = 'failed';

export const ErrorSeveritySchema = z.enum(ERROR_SEVERITIES).openapi({
  description: 'Error severity level',
  example: 'failed',
});

export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

export const ErrorSeverities = {
  FAILED: 'failed' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
} as const;

// ============================================================================
// IMAGE STATE (for SmartImage component)
// ============================================================================

export const IMAGE_STATES = ['loading', 'loaded', 'error'] as const;

export const DEFAULT_IMAGE_STATE: ImageState = 'loading';

export const ImageStateSchema = z.enum(IMAGE_STATES).openapi({
  description: 'Image loading state',
  example: 'loading',
});

export type ImageState = z.infer<typeof ImageStateSchema>;

export const ImageStates = {
  LOADING: 'loading' as const,
  LOADED: 'loaded' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// MARKDOWN PRESET (for Markdown component)
// ============================================================================

export const MARKDOWN_PRESETS = ['default', 'compact', 'web-content'] as const;

export const DEFAULT_MARKDOWN_PRESET: MarkdownPreset = 'default';

export const MarkdownPresetSchema = z.enum(MARKDOWN_PRESETS).openapi({
  description: 'Markdown rendering preset',
  example: 'default',
});

export type MarkdownPreset = z.infer<typeof MarkdownPresetSchema>;

export const MarkdownPresets = {
  DEFAULT: 'default' as const,
  COMPACT: 'compact' as const,
  WEB_CONTENT: 'web-content' as const,
} as const;

// ============================================================================
// CONFIRMATION DIALOG VARIANT
// ============================================================================

export const CONFIRMATION_DIALOG_VARIANTS = ['default', 'destructive', 'warning'] as const;

export const DEFAULT_CONFIRMATION_DIALOG_VARIANT: ConfirmationDialogVariant = 'default';

export const ConfirmationDialogVariantSchema = z.enum(CONFIRMATION_DIALOG_VARIANTS).openapi({
  description: 'Confirmation dialog visual variant',
  example: 'destructive',
});

export type ConfirmationDialogVariant = z.infer<typeof ConfirmationDialogVariantSchema>;

export const ConfirmationDialogVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  WARNING: 'warning' as const,
} as const;

// ============================================================================
// ERROR BOUNDARY CONTEXT (for Error Boundary components)
// ============================================================================

export const ERROR_BOUNDARY_CONTEXTS = ['chat', 'message-list', 'configuration', 'pre-search', 'general'] as const;

export const DEFAULT_ERROR_BOUNDARY_CONTEXT: ErrorBoundaryContext = 'general';

export const ErrorBoundaryContextSchema = z.enum(ERROR_BOUNDARY_CONTEXTS).openapi({
  description: 'Error boundary context',
  example: 'chat',
});

export type ErrorBoundaryContext = z.infer<typeof ErrorBoundaryContextSchema>;

export const ErrorBoundaryContexts = {
  CHAT: 'chat' as const,
  MESSAGE_LIST: 'message-list' as const,
  CONFIGURATION: 'configuration' as const,
  PRE_SEARCH: 'pre-search' as const,
  GENERAL: 'general' as const,
} as const;

// ============================================================================
// ICON TYPE (for attachment preview)
// ============================================================================

export const ICON_TYPES = ['image', 'code', 'text', 'file'] as const;

export const DEFAULT_ICON_TYPE: IconType = 'file';

export const IconTypeSchema = z.enum(ICON_TYPES).openapi({
  description: 'Attachment icon type',
  example: 'image',
});

export type IconType = z.infer<typeof IconTypeSchema>;

export const IconTypes = {
  IMAGE: 'image' as const,
  CODE: 'code' as const,
  TEXT: 'text' as const,
  FILE: 'file' as const,
} as const;

// ============================================================================
// BORDER GRADIENT DIRECTION
// ============================================================================

export const BORDER_GRADIENT_DIRECTIONS = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'] as const;

export const DEFAULT_BORDER_GRADIENT_DIRECTION: BorderGradientDirection = 'TOP';

export const BorderGradientDirectionSchema = z.enum(BORDER_GRADIENT_DIRECTIONS).openapi({
  description: 'Border gradient animation direction',
  example: 'TOP',
});

export type BorderGradientDirection = z.infer<typeof BorderGradientDirectionSchema>;

export const BorderGradientDirections = {
  TOP: 'TOP' as const,
  LEFT: 'LEFT' as const,
  BOTTOM: 'BOTTOM' as const,
  RIGHT: 'RIGHT' as const,
} as const;

// ============================================================================
// LOGO SIZE
// ============================================================================

export const LOGO_SIZES = ['sm', 'md', 'lg'] as const;

export const DEFAULT_LOGO_SIZE: LogoSize = 'sm';

export const LogoSizeSchema = z.enum(LOGO_SIZES).openapi({
  description: 'Logo component size variant',
  example: 'md',
});

export type LogoSize = z.infer<typeof LogoSizeSchema>;

export const LogoSizes = {
  SM: 'sm' as const,
  MD: 'md' as const,
  LG: 'lg' as const,
} as const;

export const LogoSizeMetadata: Record<LogoSize, { width: number; height: number; widthFull: number; heightFull: number }> = {
  [LogoSizes.SM]: {
    width: 40,
    height: 40,
    widthFull: 100,
    heightFull: 100,
  },
  [LogoSizes.MD]: {
    width: 60,
    height: 60,
    widthFull: 160,
    heightFull: 160,
  },
  [LogoSizes.LG]: {
    width: 80,
    height: 80,
    widthFull: 240,
    heightFull: 240,
  },
} as const;

// ============================================================================
// LOGO VARIANT
// ============================================================================

export const LOGO_VARIANTS = ['icon', 'full'] as const;

export const DEFAULT_LOGO_VARIANT: LogoVariant = 'icon';

export const LogoVariantSchema = z.enum(LOGO_VARIANTS).openapi({
  description: 'Logo display variant (icon only or full logo)',
  example: 'icon',
});

export type LogoVariant = z.infer<typeof LogoVariantSchema>;

export const LogoVariants = {
  ICON: 'icon' as const,
  FULL: 'full' as const,
} as const;

// ============================================================================
// LOADING STATE VARIANT
// ============================================================================

export const LOADING_STATE_VARIANTS = ['inline', 'centered', 'card'] as const;

export const DEFAULT_LOADING_STATE_VARIANT: LoadingStateVariant = 'centered';

export const LoadingStateVariantSchema = z.enum(LOADING_STATE_VARIANTS).openapi({
  description: 'Loading state display variant',
  example: 'centered',
});

export type LoadingStateVariant = z.infer<typeof LoadingStateVariantSchema>;

export const LoadingStateVariants = {
  INLINE: 'inline' as const,
  CENTERED: 'centered' as const,
  CARD: 'card' as const,
} as const;

// ============================================================================
// ERROR STATE VARIANT
// ============================================================================

export const ERROR_STATE_VARIANTS = ['alert', 'card', 'network', 'boundary'] as const;

export const DEFAULT_ERROR_STATE_VARIANT: ErrorStateVariant = 'card';

export const ErrorStateVariantSchema = z.enum(ERROR_STATE_VARIANTS).openapi({
  description: 'Error state display variant',
  example: 'card',
});

export type ErrorStateVariant = z.infer<typeof ErrorStateVariantSchema>;

export const ErrorStateVariants = {
  ALERT: 'alert' as const,
  CARD: 'card' as const,
  NETWORK: 'network' as const,
  BOUNDARY: 'boundary' as const,
} as const;

// ============================================================================
// EMPTY STATE VARIANT
// ============================================================================

export const EMPTY_STATE_VARIANTS = ['general', 'custom'] as const;

export const DEFAULT_EMPTY_STATE_VARIANT: EmptyStateVariant = 'general';

export const EmptyStateVariantSchema = z.enum(EMPTY_STATE_VARIANTS).openapi({
  description: 'Empty state display variant',
  example: 'general',
});

export type EmptyStateVariant = z.infer<typeof EmptyStateVariantSchema>;

export const EmptyStateVariants = {
  GENERAL: 'general' as const,
  CUSTOM: 'custom' as const,
} as const;

// ============================================================================
// SUCCESS STATE VARIANT
// ============================================================================

export const SUCCESS_STATE_VARIANTS = ['alert', 'card'] as const;

export const DEFAULT_SUCCESS_STATE_VARIANT: SuccessStateVariant = 'alert';

export const SuccessStateVariantSchema = z.enum(SUCCESS_STATE_VARIANTS).openapi({
  description: 'Success state display variant',
  example: 'alert',
});

export type SuccessStateVariant = z.infer<typeof SuccessStateVariantSchema>;

export const SuccessStateVariants = {
  ALERT: 'alert' as const,
  CARD: 'card' as const,
} as const;

// ============================================================================
// GLOWING EFFECT VARIANT
// ============================================================================

export const GLOWING_EFFECT_VARIANTS = ['default', 'white'] as const;

export const DEFAULT_GLOWING_EFFECT_VARIANT: GlowingEffectVariant = 'default';

export const GlowingEffectVariantSchema = z.enum(GLOWING_EFFECT_VARIANTS).openapi({
  description: 'Glowing effect color variant',
  example: 'default',
});

export type GlowingEffectVariant = z.infer<typeof GlowingEffectVariantSchema>;

export const GlowingEffectVariants = {
  DEFAULT: 'default' as const,
  WHITE: 'white' as const,
} as const;

// ============================================================================
// CITATION SEGMENT TYPE
// ============================================================================

export const CITATION_SEGMENT_TYPES = ['text', 'citation'] as const;

export const DEFAULT_CITATION_SEGMENT_TYPE: CitationSegmentType = 'text';

export const CitationSegmentTypeSchema = z.enum(CITATION_SEGMENT_TYPES).openapi({
  description: 'Citation segment type',
  example: 'text',
});

export type CitationSegmentType = z.infer<typeof CitationSegmentTypeSchema>;

export const CitationSegmentTypes = {
  TEXT: 'text' as const,
  CITATION: 'citation' as const,
} as const;

// ============================================================================
// SPACING VARIANT
// ============================================================================

export const SPACING_VARIANTS = ['tight', 'default', 'loose'] as const;

export const DEFAULT_SPACING_VARIANT: SpacingVariant = 'default';

export const SpacingVariantSchema = z.enum(SPACING_VARIANTS).openapi({
  description: 'Spacing variant for layout components',
  example: 'default',
});

export type SpacingVariant = z.infer<typeof SpacingVariantSchema>;

export const SpacingVariants = {
  TIGHT: 'tight' as const,
  DEFAULT: 'default' as const,
  LOOSE: 'loose' as const,
} as const;

// ============================================================================
// EMPTY STATE STYLE
// ============================================================================

export const EMPTY_STATE_STYLES = ['default', 'dashed', 'gradient'] as const;

export const DEFAULT_EMPTY_STATE_STYLE: EmptyStateStyle = 'default';

export const EmptyStateStyleSchema = z.enum(EMPTY_STATE_STYLES).openapi({
  description: 'Empty state card styling',
  example: 'default',
});

export type EmptyStateStyle = z.infer<typeof EmptyStateStyleSchema>;

export const EmptyStateStyles = {
  DEFAULT: 'default' as const,
  DASHED: 'dashed' as const,
  GRADIENT: 'gradient' as const,
} as const;

// ============================================================================
// SCROLL BUTTON VARIANT
// ============================================================================

export const SCROLL_BUTTON_VARIANTS = ['floating', 'header', 'input'] as const;

export const DEFAULT_SCROLL_BUTTON_VARIANT: ScrollButtonVariant = 'floating';

export const ScrollButtonVariantSchema = z.enum(SCROLL_BUTTON_VARIANTS).openapi({
  description: 'Scroll button placement variant',
  example: 'floating',
});

export type ScrollButtonVariant = z.infer<typeof ScrollButtonVariantSchema>;

export const ScrollButtonVariants = {
  FLOATING: 'floating' as const,
  HEADER: 'header' as const,
  INPUT: 'input' as const,
} as const;

// ============================================================================
// AVATAR SIZE
// ============================================================================

export const AVATAR_SIZES = ['sm', 'md'] as const;

export const DEFAULT_AVATAR_SIZE: AvatarSize = 'sm';

export const AvatarSizeSchema = z.enum(AVATAR_SIZES).openapi({
  description: 'Avatar component size',
  example: 'sm',
});

export type AvatarSize = z.infer<typeof AvatarSizeSchema>;

export const AvatarSizes = {
  SM: 'sm' as const,
  MD: 'md' as const,
} as const;

export const AvatarSizeMetadata: Record<AvatarSize, { container: string; text: string; overlapOffset: number; gapSize: number }> = {
  [AvatarSizes.SM]: {
    container: 'size-6',
    text: 'text-[10px]',
    overlapOffset: -8,
    gapSize: 8,
  },
  [AvatarSizes.MD]: {
    container: 'size-10',
    text: 'text-xs',
    overlapOffset: -12,
    gapSize: 12,
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
  PRESETS: 'presets' as const,
  CUSTOM: 'custom' as const,
} as const;

// ============================================================================
// LABELS (UI Display)
// ============================================================================

export const COMPONENT_SIZE_LABELS: Record<ComponentSize, string> = {
  [ComponentSizes.SM]: 'Small',
  [ComponentSizes.MD]: 'Medium',
  [ComponentSizes.LG]: 'Large',
  [ComponentSizes.XL]: 'Extra Large',
  [ComponentSizes.ICON]: 'Icon',
  [ComponentSizes.DEFAULT]: 'Default',
} as const;

export const IMAGE_STATE_LABELS: Record<ImageState, string> = {
  [ImageStates.LOADING]: 'Loading',
  [ImageStates.LOADED]: 'Loaded',
  [ImageStates.ERROR]: 'Error',
} as const;

export const MARKDOWN_PRESET_LABELS: Record<MarkdownPreset, string> = {
  [MarkdownPresets.DEFAULT]: 'Default',
  [MarkdownPresets.COMPACT]: 'Compact',
  [MarkdownPresets.WEB_CONTENT]: 'Web Content',
} as const;

export const AVATAR_SIZE_LABELS: Record<AvatarSize, string> = {
  [AvatarSizes.SM]: 'Small',
  [AvatarSizes.MD]: 'Medium',
} as const;

export const MODEL_SELECTION_TAB_LABELS: Record<ModelSelectionTab, string> = {
  [ModelSelectionTabs.PRESETS]: 'Presets',
  [ModelSelectionTabs.CUSTOM]: 'Build Custom',
} as const;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidComponentVariant(value: unknown): value is ComponentVariant {
  return typeof value === 'string' && COMPONENT_VARIANTS.includes(value as ComponentVariant);
}

export function isValidComponentSize(value: unknown): value is ComponentSize {
  return typeof value === 'string' && COMPONENT_SIZES.includes(value as ComponentSize);
}

export function isValidTextAlignment(value: unknown): value is TextAlignment {
  return typeof value === 'string' && TEXT_ALIGNMENTS.includes(value as TextAlignment);
}

export function isValidToastVariant(value: unknown): value is ToastVariant {
  return typeof value === 'string' && TOAST_VARIANTS.includes(value as ToastVariant);
}

export function isValidReasoningState(value: unknown): value is ReasoningState {
  return typeof value === 'string' && REASONING_STATES.includes(value as ReasoningState);
}

export function isValidStatusVariant(value: unknown): value is StatusVariant {
  return typeof value === 'string' && STATUS_VARIANTS.includes(value as StatusVariant);
}

export function isValidNetworkErrorType(value: unknown): value is NetworkErrorType {
  return typeof value === 'string' && NETWORK_ERROR_TYPES.includes(value as NetworkErrorType);
}

export function isValidErrorSeverity(value: unknown): value is ErrorSeverity {
  return typeof value === 'string' && ERROR_SEVERITIES.includes(value as ErrorSeverity);
}

export function isValidImageState(value: unknown): value is ImageState {
  return typeof value === 'string' && IMAGE_STATES.includes(value as ImageState);
}

export function isValidMarkdownPreset(value: unknown): value is MarkdownPreset {
  return typeof value === 'string' && MARKDOWN_PRESETS.includes(value as MarkdownPreset);
}

export function isValidConfirmationDialogVariant(value: unknown): value is ConfirmationDialogVariant {
  return typeof value === 'string' && CONFIRMATION_DIALOG_VARIANTS.includes(value as ConfirmationDialogVariant);
}

export function isValidErrorBoundaryContext(value: unknown): value is ErrorBoundaryContext {
  return typeof value === 'string' && ERROR_BOUNDARY_CONTEXTS.includes(value as ErrorBoundaryContext);
}

export function isValidIconType(value: unknown): value is IconType {
  return typeof value === 'string' && ICON_TYPES.includes(value as IconType);
}

export function isValidBorderGradientDirection(value: unknown): value is BorderGradientDirection {
  return typeof value === 'string' && BORDER_GRADIENT_DIRECTIONS.includes(value as BorderGradientDirection);
}

export function isValidLogoSize(value: unknown): value is LogoSize {
  return typeof value === 'string' && LOGO_SIZES.includes(value as LogoSize);
}

export function isValidLogoVariant(value: unknown): value is LogoVariant {
  return typeof value === 'string' && LOGO_VARIANTS.includes(value as LogoVariant);
}

export function isValidLoadingStateVariant(value: unknown): value is LoadingStateVariant {
  return typeof value === 'string' && LOADING_STATE_VARIANTS.includes(value as LoadingStateVariant);
}

export function isValidErrorStateVariant(value: unknown): value is ErrorStateVariant {
  return typeof value === 'string' && ERROR_STATE_VARIANTS.includes(value as ErrorStateVariant);
}

export function isValidEmptyStateVariant(value: unknown): value is EmptyStateVariant {
  return typeof value === 'string' && EMPTY_STATE_VARIANTS.includes(value as EmptyStateVariant);
}

export function isValidSuccessStateVariant(value: unknown): value is SuccessStateVariant {
  return typeof value === 'string' && SUCCESS_STATE_VARIANTS.includes(value as SuccessStateVariant);
}

export function isValidGlowingEffectVariant(value: unknown): value is GlowingEffectVariant {
  return typeof value === 'string' && GLOWING_EFFECT_VARIANTS.includes(value as GlowingEffectVariant);
}

export function isValidCitationSegmentType(value: unknown): value is CitationSegmentType {
  return typeof value === 'string' && CITATION_SEGMENT_TYPES.includes(value as CitationSegmentType);
}

export function isValidSpacingVariant(value: unknown): value is SpacingVariant {
  return typeof value === 'string' && SPACING_VARIANTS.includes(value as SpacingVariant);
}

export function isValidEmptyStateStyle(value: unknown): value is EmptyStateStyle {
  return typeof value === 'string' && EMPTY_STATE_STYLES.includes(value as EmptyStateStyle);
}

export function isValidScrollButtonVariant(value: unknown): value is ScrollButtonVariant {
  return typeof value === 'string' && SCROLL_BUTTON_VARIANTS.includes(value as ScrollButtonVariant);
}

export function isValidAvatarSize(value: unknown): value is AvatarSize {
  return typeof value === 'string' && AVATAR_SIZES.includes(value as AvatarSize);
}

export function isValidModelSelectionTab(value: unknown): value is ModelSelectionTab {
  return typeof value === 'string' && MODEL_SELECTION_TABS.includes(value as ModelSelectionTab);
}

export function isValidCardVariant(value: unknown): value is CardVariant {
  return typeof value === 'string' && CARD_VARIANTS.includes(value as CardVariant);
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
  TOP_CENTER: 'top-center' as const,
  TOP_RIGHT: 'top-right' as const,
  BOTTOM_CENTER: 'bottom-center' as const,
  BOTTOM_RIGHT: 'bottom-right' as const,
} as const;

export function isValidToastPosition(value: unknown): value is ToastPosition {
  return typeof value === 'string' && TOAST_POSITIONS.includes(value as ToastPosition);
}

// ============================================================================
// BASE TOAST VARIANT (Subset of ToastVariant supported by base toast component)
// ============================================================================

export const BASE_TOAST_VARIANTS = ['default', 'destructive', 'success'] as const;

export const DEFAULT_BASE_TOAST_VARIANT: BaseToastVariant = 'default';

export const BaseToastVariantSchema = z.enum(BASE_TOAST_VARIANTS).openapi({
  description: 'Base toast variant (supported by shadcn toast component)',
  example: 'default',
});

export type BaseToastVariant = z.infer<typeof BaseToastVariantSchema>;

export const BaseToastVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  SUCCESS: 'success' as const,
} as const;

export function isValidBaseToastVariant(value: unknown): value is BaseToastVariant {
  return typeof value === 'string' && BASE_TOAST_VARIANTS.includes(value as BaseToastVariant);
}
