import type { BaseToastVariant, ToastPosition, ToastVariant } from '@roundtable/shared';
import { BaseToastVariants, isValidBaseToastVariant, ToastVariants } from '@roundtable/shared';
import React from 'react';

import type { ToastActionElement } from '@/components/ui/toast';
import { ToastAction } from '@/components/ui/toast';
// Direct import avoids circular dependency through @/hooks/utils barrel
import { toast as baseToast } from '@/hooks/utils/use-toast';

function createToastActionElement(label: string, onClick: () => void): ToastActionElement {
  const element = React.createElement(
    ToastAction,
    {
      altText: label,
      onClick,
    },
    label,
  );

  return element as ToastActionElement;
}

const activeToasts = new Set<string>();
const toastTimeouts = new Map<string, NodeJS.Timeout>();
const progressToasts = new Map<string, { progress: number; callback?: ToastProgressCallback }>();
const toastQueue: ToastOptions[] = [];
let isProcessingQueue = false;
let maxConcurrentToasts = 3;

/**
 * Toast options type (using direct TypeScript type instead of Zod schema
 * to avoid Zod v4 z.function() API complexities)
 */
export type ToastOptions = {
  action?: {
    label: string;
    onClick: () => void;
  };
  description?: string;
  dismissible?: boolean;
  duration?: number;
  icon?: React.ComponentType<{ className?: string }>;
  id?: string;
  position?: ToastPosition;
  preventDuplicates?: boolean;
  title?: string;
  variant?: ToastVariant;
};

type ToastProgressCallback = (progress: number) => void;

/**
 * Progress toast options type - extends ToastOptions without duration
 */
export type ProgressToastOptions = Omit<ToastOptions, 'duration'> & {
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onProgress?: ToastProgressCallback;
};

function createToastId(title: string, description?: string): string {
  return `${title}-${description || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function processToastQueue(): void {
  if (isProcessingQueue || toastQueue.length === 0) {
    return;
  }
  if (activeToasts.size >= maxConcurrentToasts) {
    return;
  }

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

function showToastInternal(options: ToastOptions): void {
  const {
    action,
    description = '',
    variant = ToastVariants.DEFAULT,
    duration = variant === ToastVariants.LOADING ? 0 : 5000,
    id,
    preventDuplicates = true,
    title = '',
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

  // Normalize variant to BaseToastVariant (loading is not supported by base toast)
  const normalizedVariant: BaseToastVariant = variant === ToastVariants.LOADING
    ? BaseToastVariants.DEFAULT
    : isValidBaseToastVariant(variant) ? variant : BaseToastVariants.DEFAULT;

  const toastConfig = {
    description,
    duration,
    title,
    variant: normalizedVariant,
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

  const progressData = { callback: options.onProgress, progress: 0 };
  progressToasts.set(toastId, progressData);

  showToastInternal({
    ...options,
    dismissible: false,
    duration: 0,
    id: toastId,
    variant: ToastVariants.LOADING,
  });

  return {
    complete: () => {
      progressToasts.delete(toastId);
      dismissToast(toastId);
      options.onComplete?.();
      toast({
        description: `${options.description} - Completed`,
        duration: 3000,
        title: options.title,
        variant: ToastVariants.SUCCESS,
      });
    },
    dismiss: () => {
      progressToasts.delete(toastId);
      dismissToast(toastId);
    },
    error: (error: Error) => {
      progressToasts.delete(toastId);
      dismissToast(toastId);
      options.onError?.(error);
      toast({
        description: error.message,
        duration: 5000,
        title: options.title,
        variant: ToastVariants.DESTRUCTIVE,
      });
    },
    updateProgress: (progress: number) => {
      const data = progressToasts.get(toastId);
      if (data) {
        data.progress = progress;
        data.callback?.(progress);
        showToastInternal({
          ...options,
          description: `${options.description} (${Math.round(progress)}%)`,
          dismissible: false,
          duration: 0,
          id: toastId,
          variant: ToastVariants.LOADING,
        });
      }
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
  action: (message: string, actionLabel: string, actionFn: () => void, options?: Partial<ToastOptions>) => {
    return toast({
      action: {
        label: actionLabel,
        onClick: actionFn,
      },
      duration: 10000,
      title: message,
      variant: ToastVariants.INFO,
      ...options,
    });
  },

  clear: () => {
    activeToasts.clear();
    toastTimeouts.forEach(timeout => clearTimeout(timeout));
    toastTimeouts.clear();
    progressToasts.clear();
    toastQueue.length = 0;
  },

  dismiss: (toastId: string) => {
    dismissToast(toastId);
  },

  error: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      description,
      duration: 8000, // Longer duration for errors
      preventDuplicates: true,
      title: message,
      variant: ToastVariants.DESTRUCTIVE,
      ...options,
    });
  },

  force: (options: ToastOptions) => {
    return toast({ ...options, preventDuplicates: false });
  },

  getActiveCount: () => {
    return activeToasts.size;
  },

  getQueueLength: () => {
    return toastQueue.length;
  },

  info: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      description,
      preventDuplicates: true,
      title: message,
      variant: ToastVariants.INFO,
      ...options,
    });
  },

  isActive: (id: string) => {
    return activeToasts.has(id);
  },

  loading: (message = 'Loading...', description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      description,
      dismissible: false,
      duration: 0,
      preventDuplicates: true,
      title: message,
      variant: ToastVariants.LOADING,
      ...options,
    });
  },

  persistent: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      description,
      dismissible: true,
      duration: 0,
      title: message,
      variant: ToastVariants.INFO,
      ...options,
    });
  },

  progress: (options: ProgressToastOptions) => {
    return createProgressToast(options);
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
      description: 'Processing...',
      title: messages.loading,
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

  retry: (message: string, retryFn: () => void, options?: Partial<ToastOptions>) => {
    return toastManager.action(message, 'Retry', retryFn, {
      variant: ToastVariants.DESTRUCTIVE,
      ...options,
    });
  },

  setMaxConcurrent: (max: number) => {
    maxConcurrentToasts = Math.max(1, max);
    processToastQueue();
  },

  success: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      description,
      preventDuplicates: true,
      title: message,
      variant: ToastVariants.SUCCESS,
      ...options,
    });
  },

  undo: (message: string, undoFn: () => void, options?: Partial<ToastOptions>) => {
    return toastManager.action(message, 'Undo', undoFn, {
      variant: ToastVariants.WARNING,
      ...options,
    });
  },

  update: (toastId: string, options: Partial<ToastOptions>) => {
    if (activeToasts.has(toastId)) {
      toast({ ...options, id: toastId, preventDuplicates: false });
    }
  },

  warning: (message: string, description?: string, options?: Partial<ToastOptions>) => {
    return toast({
      description,
      preventDuplicates: true,
      title: message,
      variant: ToastVariants.WARNING,
      ...options,
    });
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
