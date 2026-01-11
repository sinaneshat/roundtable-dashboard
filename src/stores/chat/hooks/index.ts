/**
 * Shared Chat Store Hooks
 *
 * Minimal set of reusable hooks following React 19 and Zustand v5 patterns.
 * Only includes hooks that provide genuine value over inline code.
 *
 * ⚠️ ANTI-PATTERN WARNING: Do NOT create hooks that wrap useEffect for callbacks.
 * Call functions directly from event handlers instead. See /store-fix command.
 *
 * Location: /src/stores/chat/hooks/
 */

// Config change handlers - factory pattern for consistent config updates
export type { UseConfigChangeHandlersOptions, UseConfigChangeHandlersReturn } from './use-config-change-handlers';
export { useConfigChangeHandlers } from './use-config-change-handlers';
