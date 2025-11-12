'use client';

import { EncryptedText } from '@/components/ui/encrypted-text';
import { cn } from '@/lib/ui/cn';

type ChatLoadingProps = {
  text: string;
  className?: string;
  showSpinner?: boolean;
};

/**
 * Reusable loading component for chat operations with matrix text effect
 * Used consistently across: streaming, analysis, pre-search, etc.
 */
export function ChatLoading({
  text,
  className,
  showSpinner = true,
}: ChatLoadingProps) {
  return (
    <div className={cn('flex items-center gap-2 py-4 text-sm', className)}>
      {showSpinner && (
        <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
      )}
      <EncryptedText
        text={text}
        revealDelayMs={30}
        flipDelayMs={40}
        encryptedClassName="text-muted-foreground/40"
        revealedClassName="text-muted-foreground"
        continuous
      />
    </div>
  );
}
