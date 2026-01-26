import { useCallback, useRef, useState } from 'react';

import { toastManager } from '@/lib/toast';
import { copyToClipboard } from '@/lib/utils';

const COPIED_RESET_DELAY = 2000;

type CopyToClipboardMessages = {
  successTitle: string;
  successDescription?: string;
  errorTitle: string;
  errorDescription?: string;
};

export type UseCopyToClipboardOptions = {
  messages: CopyToClipboardMessages;
  onSuccess?: () => void;
  onError?: () => void;
};

export type UseCopyToClipboardReturn = {
  copied: boolean;
  isCopying: boolean;
  copy: (text: string) => Promise<boolean>;
};

export function useCopyToClipboard({
  messages,
  onError,
  onSuccess,
}: UseCopyToClipboardOptions): UseCopyToClipboardReturn {
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (isCopying) {
      return false;
    }

    setIsCopying(true);

    try {
      const success = await copyToClipboard(text);

      if (success) {
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setCopied(true);
        toastManager.success(messages.successTitle, messages.successDescription);

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, COPIED_RESET_DELAY);

        onSuccess?.();
        return true;
      } else {
        toastManager.error(messages.errorTitle, messages.errorDescription);
        onError?.();
        return false;
      }
    } finally {
      setIsCopying(false);
    }
  }, [isCopying, messages, onSuccess, onError]);

  return { copied, copy, isCopying };
}
