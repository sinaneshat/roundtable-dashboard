/**
 * Analytics Hook - Type-Safe Event Tracking
 *
 * Provides type-safe methods for capturing analytics events with PostHog.
 * Centralizes event naming and property structure for consistency.
 *
 * Location: /src/hooks/utils/use-analytics.ts
 *
 * @example
 * ```typescript
 * import { useAnalytics } from '@/hooks';
 *
 * function ChatComponent() {
 *   const analytics = useAnalytics();
 *
 *   const handleSendMessage = () => {
 *     analytics.trackChatMessageSent({
 *       threadId: thread.id,
 *       messageLength: message.length,
 *       hasAttachments: attachments.length > 0,
 *     });
 *   };
 * }
 * ```
 */

import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';

type BaseEventProperties = Record<string, string | number | boolean | undefined | null>;

export type AnalyticsHook = {
  // Generic event tracking
  trackAction: (action: string, properties?: BaseEventProperties) => void;

  // UI Interactions
  trackButtonClick: (buttonName: string, context?: BaseEventProperties) => void;
  trackLinkClick: (linkHref: string, linkText: string, context?: BaseEventProperties) => void;
  trackModalOpen: (modalName: string, context?: BaseEventProperties) => void;
  trackModalClose: (modalName: string, context?: BaseEventProperties) => void;

  // Chat Events
  trackChatMessageSent: (properties: {
    threadId: string;
    messageLength: number;
    hasAttachments?: boolean;
    participantCount?: number;
  }) => void;
  trackChatThreadCreated: (properties: { threadId: string; initialParticipants?: number }) => void;
  trackChatThreadDeleted: (properties: { threadId: string }) => void;
  trackChatFeedback: (properties: {
    messageId: string;
    feedback: 'positive' | 'negative';
    hasComment?: boolean;
  }) => void;

  // Project Events
  trackProjectCreated: (properties: { projectId: string; hasDescription?: boolean }) => void;
  trackProjectUpdated: (properties: { projectId: string; updatedFieldsCount: number; updatedFieldsList?: string }) => void;
  trackProjectDeleted: (properties: { projectId: string }) => void;
  trackProjectAttachmentAdded: (properties: {
    projectId: string;
    fileType: string;
    fileSize: number;
  }) => void;

  // Upload Events
  trackFileUploadStarted: (properties: { fileType: string; fileSize: number; context?: string }) => void;
  trackFileUploadCompleted: (properties: {
    fileType: string;
    fileSize: number;
    duration: number;
    context?: string;
  }) => void;
  trackFileUploadFailed: (properties: {
    fileType: string;
    fileSize: number;
    errorType: string;
    context?: string;
  }) => void;

  // Authentication Events
  trackSignIn: (method: 'email' | 'google' | 'github') => void;
  trackSignOut: () => void;
  trackSignUpStarted: (method: 'email' | 'google' | 'github') => void;
  trackSignUpCompleted: (method: 'email' | 'google' | 'github') => void;

  // Feature Usage
  trackFeatureUsed: (featureName: string, context?: BaseEventProperties) => void;
  trackSearchPerformed: (properties: { query: string; resultCount?: number; context?: string }) => void;

  // Errors
  trackError: (properties: {
    errorType: string;
    errorMessage: string;
    errorContext?: string;
    errorStack?: string;
  }) => void;

  // Settings
  trackSettingsChanged: (properties: { setting: string; oldValue?: string; newValue?: string }) => void;
};

/**
 * Hook for type-safe analytics event tracking
 */
export function useAnalytics(): AnalyticsHook {
  const posthog = usePostHog();

  const trackAction = useCallback(
    (action: string, properties?: BaseEventProperties) => {
      if (!posthog) {
        return;
      }
      posthog.capture(action, properties);
    },
    [posthog],
  );

  // UI Interactions
  const trackButtonClick = useCallback(
    (buttonName: string, context?: BaseEventProperties) => {
      trackAction('button_clicked', { button: buttonName, ...context });
    },
    [trackAction],
  );

  const trackLinkClick = useCallback(
    (linkHref: string, linkText: string, context?: BaseEventProperties) => {
      trackAction('link_clicked', { href: linkHref, text: linkText, ...context });
    },
    [trackAction],
  );

  const trackModalOpen = useCallback(
    (modalName: string, context?: BaseEventProperties) => {
      trackAction('modal_opened', { modal: modalName, ...context });
    },
    [trackAction],
  );

  const trackModalClose = useCallback(
    (modalName: string, context?: BaseEventProperties) => {
      trackAction('modal_closed', { modal: modalName, ...context });
    },
    [trackAction],
  );

  // Chat Events
  const trackChatMessageSent = useCallback(
    (properties: {
      threadId: string;
      messageLength: number;
      hasAttachments?: boolean;
      participantCount?: number;
    }) => {
      trackAction('chat_message_sent', properties);
    },
    [trackAction],
  );

  const trackChatThreadCreated = useCallback(
    (properties: { threadId: string; initialParticipants?: number }) => {
      trackAction('chat_thread_created', properties);
    },
    [trackAction],
  );

  const trackChatThreadDeleted = useCallback(
    (properties: { threadId: string }) => {
      trackAction('chat_thread_deleted', properties);
    },
    [trackAction],
  );

  const trackChatFeedback = useCallback(
    (properties: { messageId: string; feedback: 'positive' | 'negative'; hasComment?: boolean }) => {
      trackAction('chat_feedback_submitted', properties);
    },
    [trackAction],
  );

  // Project Events
  const trackProjectCreated = useCallback(
    (properties: { projectId: string; hasDescription?: boolean }) => {
      trackAction('project_created', properties);
    },
    [trackAction],
  );

  const trackProjectUpdated = useCallback(
    (properties: { projectId: string; updatedFieldsCount: number; updatedFieldsList?: string }) => {
      trackAction('project_updated', properties);
    },
    [trackAction],
  );

  const trackProjectDeleted = useCallback(
    (properties: { projectId: string }) => {
      trackAction('project_deleted', properties);
    },
    [trackAction],
  );

  const trackProjectAttachmentAdded = useCallback(
    (properties: { projectId: string; fileType: string; fileSize: number }) => {
      trackAction('project_attachment_added', properties);
    },
    [trackAction],
  );

  // Upload Events
  const trackFileUploadStarted = useCallback(
    (properties: { fileType: string; fileSize: number; context?: string }) => {
      trackAction('file_upload_started', properties);
    },
    [trackAction],
  );

  const trackFileUploadCompleted = useCallback(
    (properties: { fileType: string; fileSize: number; duration: number; context?: string }) => {
      trackAction('file_upload_completed', properties);
    },
    [trackAction],
  );

  const trackFileUploadFailed = useCallback(
    (properties: { fileType: string; fileSize: number; errorType: string; context?: string }) => {
      trackAction('file_upload_failed', properties);
    },
    [trackAction],
  );

  // Authentication Events
  const trackSignIn = useCallback(
    (method: 'email' | 'google' | 'github') => {
      trackAction('sign_in', { method });
    },
    [trackAction],
  );

  const trackSignOut = useCallback(() => {
    trackAction('sign_out');
  }, [trackAction]);

  const trackSignUpStarted = useCallback(
    (method: 'email' | 'google' | 'github') => {
      trackAction('sign_up_started', { method });
    },
    [trackAction],
  );

  const trackSignUpCompleted = useCallback(
    (method: 'email' | 'google' | 'github') => {
      trackAction('sign_up_completed', { method });
    },
    [trackAction],
  );

  // Feature Usage
  const trackFeatureUsed = useCallback(
    (featureName: string, context?: BaseEventProperties) => {
      trackAction('feature_used', { feature: featureName, ...context });
    },
    [trackAction],
  );

  const trackSearchPerformed = useCallback(
    (properties: { query: string; resultCount?: number; context?: string }) => {
      trackAction('search_performed', properties);
    },
    [trackAction],
  );

  // Errors
  const trackError = useCallback(
    (properties: {
      errorType: string;
      errorMessage: string;
      errorContext?: string;
      errorStack?: string;
    }) => {
      trackAction('error_occurred', properties);
    },
    [trackAction],
  );

  // Settings
  const trackSettingsChanged = useCallback(
    (properties: { setting: string; oldValue?: string; newValue?: string }) => {
      trackAction('settings_changed', properties);
    },
    [trackAction],
  );

  return {
    trackAction,
    trackButtonClick,
    trackChatFeedback,
    trackChatMessageSent,
    trackChatThreadCreated,
    trackChatThreadDeleted,
    trackError,
    trackFeatureUsed,
    trackFileUploadCompleted,
    trackFileUploadFailed,
    trackFileUploadStarted,
    trackLinkClick,
    trackModalClose,
    trackModalOpen,
    trackProjectAttachmentAdded,
    trackProjectCreated,
    trackProjectDeleted,
    trackProjectUpdated,
    trackSearchPerformed,
    trackSettingsChanged,
    trackSignIn,
    trackSignOut,
    trackSignUpCompleted,
    trackSignUpStarted,
  };
}
