/**
 * Chat Store - Public API
 *
 * Zustand v5 Pattern: Centralized exports for chat store
 * Following Next.js App Router best practices for state management
 *
 * EXPORTED FOR SCREENS:
 * - useScreenInitialization: Unified initialization for all screen modes
 * - useChatFormActions: Form submission and management
 * - useFeedbackActions: Round feedback management
 *
 * INTERNAL (not exported):
 * - useAnalysisCreation, useAnalysisDeduplication, useAnalysisOrchestrator
 * - useChatInitialization, useChatAnalysis
 * These are used internally by useScreenInitialization and other composed hooks
 */

// Primary Screen Hooks
export type { UseFeedbackActionsOptions, UseFeedbackActionsReturn } from './actions/feedback-actions';
export { useFeedbackActions } from './actions/feedback-actions';
export type { UseChatFormActionsReturn } from './actions/form-actions';
export { useChatFormActions } from './actions/form-actions';
export type { ScreenMode, UseScreenInitializationOptions } from './actions/screen-initialization';
export { useScreenInitialization } from './actions/screen-initialization';

// Store
export type { ChatStore, ChatStoreApi } from './store';
export { createChatStore } from './store';
