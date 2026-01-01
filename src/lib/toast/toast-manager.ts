import type { ReactElement } from 'react';
import React from 'react';

import type { BaseToastVariant, ToastPosition, ToastVariant } from '@/api/core/enums';
import { BaseToastVariants, ToastVariants } from '@/api/core/enums';
import type { ToastActionElement } from '@/components/ui/toast';
import { ToastAction } from '@/components/ui/toast';
import { toast as baseToast } from '@/hooks/utils/use-toast';

function createToastActionElement(label: string, onClick: () => void): ToastActionElement {
  return React.createElement(
    ToastAction,
    {
      altText: label,
      onClick,
    },
    label,
  ) as unknown as ReactElement<typeof ToastAction>;
}

// Global toast tracking and management
const activeToasts = new Set<string>();
const toastTimeouts = new Map<string, NodeJS.Timeout>();
const progressToasts = new Map<string, { progress: number; callback?: ToastProgressCallback }>();
const toastQueue: ToastOptions[] = [];
let isProcessingQueue = false;
let maxConcurrentToasts = 3;

export type ToastOptions = {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  preventDuplicates?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ComponentType<{ className?: string }>;
  dismissible?: boolean;
  position?: ToastPosition;
};

type ToastProgressCallback = (progress: number) => void;

export type ProgressToastOptions = Omit<ToastOptions, 'duration'> & {
  onProgress?: ToastProgressCallback;
  onComplete?: () => void;
  onError?: (error: Error) => void;
};

/**
 * Create a unique toast identifier based on content
 */
function createToastId(title: string, description?: string): string {
  return `${title}-${description || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/**
 * Process toast queue to respect concurrent limits
 */
function processToastQueue(): void {
  if (isProcessingQueue || toastQueue.length === 0)
    return;
  if (activeToasts.size >= maxConcurrentToasts)
    return;

  isProcessingQueue = true;
  const nextToast = toastQueue.shift();

  if (nextToast) {
    showToastInternal(nextToast);
    // Process next toast after a small delay
    setTimeout(() => {
      isProcessingQueue = false;
      processToastQueue();
    }, 100);
  } else {
    isProcessingQueue = false;
  }
}

/**
 * Internal toast function with queue management
 */
function showToastInternal(options: ToastOptions): void {
  const {
    id,
    title = '',
    description = '',
    variant = ToastVariants.DEFAULT,
    duration = variant === ToastVariants.LOADING ? 0 : 5000,
    preventDuplicates = true,
    action,
  } = options;

  const toastId = id || createToastId(title, description);

  if (preventDuplicates && activeToasts.has(toastId)) {
    return;
  }

  const existingTimeout = toastTimeouts.get(toastId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  activeToasts.add(toastId);

  const actionElement: ToastActionElement | undefined = action
    ? createToastActionElement(action.label, action.onClick)
    : undefined;

  const normalizedVariant: BaseToastVariant = (
    variant === ToastVariants.WARNING
    || variant === ToastVariants.INFO
    || variant === ToastVariants.LOADING
  )
    ? BaseToastVariants.DEFAULT
    : (variant as BaseToastVariant);

  const toastConfig = {
    title,
    description,
    variant: normalizedVariant,
    duration,
    ...(actionElement && { action: actionElement }),
  };

  baseToast(toastConfig);

  if (duration > 0) {
    const timeout = setTimeout(() => {
      activeToasts.delete(toastId);
      toastTimeouts.delete(toastId);
      processToastQueue();
    }, duration);

    toastTimeouts.set(toastId, timeout);
  }
}

export function toast(options: ToastOptions): string {
  const toastId = options.id || createToastId(options.title || '', options.description);

  if (activeToasts.size >= maxConcurrentToasts) {
    toastQueue.push(options);
  } else {
    showToastInternal(options);
  }

  return toastId;
}

export function createProgressToast(options: ProgressToastOptions): {
  updateProgress: (progress: number) => void;
  complete: () => void;
  error: (error: Error) => void;
  dismiss: () => void;
} {
  const toastId = options.id || createToastId(options.title || '', 'progress');

  const progressData = { progress: 0, callback: options.onProgress };
  progressToasts.set(toastId, progressData);

  showToastInternal({
    ...options,
    id: toastId,
    variant: ToastVariants.LOADING,
    duration: 0,
    dismissible: false,
  });

  return {
    updateProgress: (progress: number) => {
      const data = progressToasts.get(toastId);
      if (data) {
        data.progress = progress;
        data.callback?.(progress);
        showToastInternal({
          ...options,
          id: toastId,
          description: `${options.description} (${Math.round(progress)}%)`,
          variant: ToastVariants.LOADING,
          duration: 0,
          dismissible: false,
        });
      }
    },
    complete: () => {
      progressToasts.delete(toastId);
      dismissToast(toastId);
      options.onComplete?.();
      toast({
        title: options.title,
        description: `${options.description} - Completed`,
        variant: ToastVariants.SUCCESS,
        duration: 3000,
      });
    },
    error: (error: Error) => {
      progressToasts.delete(toastId);
      dismissToast(toastId);
      options.onError?.(error);
      toast({
        title: options.title,
        description: error.message,
        variant: ToastVariants.DESTRUCTIVE,
        duration: 5000,
      });
    },
    dismiss: () => {
      progressToasts.delete(toastId);
      dismissToast(toastId);
    },
  };
}

export function dismissToast(toastId: string): void {
  const timeout = toastTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    toastTimeouts.delete(toastId);
  }
  activeToasts.delete(toastId);
  progressToasts.delete(toastId);
  processToastQueue();
}

export const toastManager = {
  success: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      description,
      variant: ToastVariants.SUCCESS,
      preventDuplicates: true,
      ...options,
    });
  },

  error: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      description,
      variant: ToastVariants.DESTRUCTIVE,
      preventDuplicates: true,
      duration: 8000, // Longer duration for errors
      ...options,
    });
  },

  warning: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      description,
      variant: ToastVariants.WARNING,
      preventDuplicates: true,
      ...options,
    });
  },

  info: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      description,
      variant: ToastVariants.INFO,
      preventDuplicates: true,
      ...options,
    });
  },

  loading: (message = 'Loading...', description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      description,
      variant: ToastVariants.LOADING,
      duration: 0,
      dismissible: false,
      preventDuplicates: true,
      ...options,
    });
  },

  promise: async <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: (data: T) => string;
      error: (error: Error) => string;
    },
    options?: Partial<ProgressToastOptions>,
  ): Promise<T> => {
    const progressToast = createProgressToast({
      title: messages.loading,
      description: 'Processing...',
      ...options,
    });

    try {
      const result = await promise;
      progressToast.complete();
      toastManager.success(messages.success(result));
      return result;
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error('An error occurred');
      progressToast.error(errorInstance);
      toastManager.error(messages.error(errorInstance));
      throw error;
    }
  },

  action: (message: string, actionLabel: string, actionFn: () => void, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      variant: ToastVariants.INFO,
      action: {
        label: actionLabel,
        onClick: actionFn,
      },
      duration: 10000,
      ...options,
    });
  },

  undo: (message: string, undoFn: () => void, options?: Partial<ToastOptions>) => {
    return toastManager.action(message, 'Undo', undoFn, {
      variant: ToastVariants.WARNING,
      ...options,
    });
  },

  retry: (message: string, retryFn: () => void, options?: Partial<ToastOptions>) => {
    return toastManager.action(message, 'Retry', retryFn, {
      variant: ToastVariants.DESTRUCTIVE,
      ...options,
    });
  },

  persistent: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      title: message,
      description,
      variant: ToastVariants.INFO,
      duration: 0,
      dismissible: true,
      ...options,
    });
  },

  update: (toastId: string, options: Partial<ToastOptions>) => {
    if (activeToasts.has(toastId)) {
      toast({ ...options, id: toastId, preventDuplicates: false });
    }
  },

  force: (options: ToastOptions) => {
    return toast({ ...options, preventDuplicates: false });
  },

  dismiss: (toastId: string) => {
    dismissToast(toastId);
  },

  clear: () => {
    activeToasts.clear();
    toastTimeouts.forEach(timeout => clearTimeout(timeout));
    toastTimeouts.clear();
    progressToasts.clear();
    toastQueue.length = 0;
  },

  isActive: (id: string) => {
    return activeToasts.has(id);
  },

  getActiveCount: () => {
    return activeToasts.size;
  },

  getQueueLength: () => {
    return toastQueue.length;
  },

  setMaxConcurrent: (max: number) => {
    maxConcurrentToasts = Math.max(1, max);
    processToastQueue();
  },

  progress: (options: ProgressToastOptions) => {
    return createProgressToast(options);
  },
};

let queueProcessingInterval: NodeJS.Timeout | null = null;

function startQueueProcessing() {
  if (queueProcessingInterval) {
    return;
  }
  queueProcessingInterval = setInterval(processToastQueue, 500);
}

function stopQueueProcessing() {
  if (queueProcessingInterval) {
    clearInterval(queueProcessingInterval);
    queueProcessingInterval = null;
  }
}

if (typeof window !== 'undefined') {
  startQueueProcessing();
  window.addEventListener('beforeunload', stopQueueProcessing);
}
