// Inspired by react-hot-toast library
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import type {
  ToastActionElement,
  ToastProps,
} from '@/components/ui/toast';

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 5000;

/**
 * ToasterToast schema - extends ToastProps with required toast fields
 */
const _ToasterToastSchema = z.custom<ToastProps>().and(
  z.object({
    action: z.custom<ToastActionElement>().optional(),
    description: z.custom<ReactNode>().optional(),
    id: z.string(),
    title: z.custom<ReactNode>().optional(),
  }),
);
type ToasterToast = z.infer<typeof _ToasterToastSchema>;

// ============================================================================
// TOAST ACTION TYPE ENUM (Simplified - internal use only)
// ============================================================================

// CONSTANT OBJECT - For usage in code
const ToastActionTypes = {
  ADD_TOAST: 'ADD_TOAST' as const,
  DISMISS_TOAST: 'DISMISS_TOAST' as const,
  REMOVE_TOAST: 'REMOVE_TOAST' as const,
  UPDATE_TOAST: 'UPDATE_TOAST' as const,
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type Action
  = | {
    type: typeof ToastActionTypes.ADD_TOAST;
    toast: ToasterToast;
  }
  | {
    type: typeof ToastActionTypes.UPDATE_TOAST;
    toast: Partial<ToasterToast>;
  }
  | {
    type: typeof ToastActionTypes.DISMISS_TOAST;
    toastId?: ToasterToast['id'];
  }
  | {
    type: typeof ToastActionTypes.REMOVE_TOAST;
    toastId?: ToasterToast['id'];
  };

type State = {
  toasts: ToasterToast[];
};

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      toastId,
      type: ToastActionTypes.REMOVE_TOAST,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case ToastActionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case ToastActionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map(t =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };

    case ToastActionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach(toast => addToRemoveQueue(toast.id));
      }

      return {
        ...state,
        toasts: state.toasts.map(t =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case ToastActionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter(t => t.id !== action.toastId),
      };
  }
}

const listeners: ((state: State) => void)[] = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, 'id'>;

export function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      toast: { ...props, id },
      type: ToastActionTypes.UPDATE_TOAST,
    });
  const dismiss = () => dispatch({ toastId: id, type: ToastActionTypes.DISMISS_TOAST });

  dispatch({
    toast: {
      ...props,
      id,
      onOpenChange: (open) => {
        if (!open) {
          dismiss();
        }
      },
      open: true,
    },
    type: ToastActionTypes.ADD_TOAST,
  });

  return {
    dismiss,
    id,
    update,
  };
}

export function useToast() {
  const [state, setState] = useState<State>(memoryState);

  // ✅ REACT 19 FIX: Remove state from dependencies - setState is stable, doesn't change between renders
  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []); // Empty deps - setState is stable

  return {
    ...state,
    dismiss: (toastId?: string) => dispatch({ toastId, type: ToastActionTypes.DISMISS_TOAST }),
    toast,
  };
}
