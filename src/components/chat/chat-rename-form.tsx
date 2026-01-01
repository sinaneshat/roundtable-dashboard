'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

const RenameFormSchema = z.object({
  title: z.string().min(1).max(255),
});

type RenameFormValues = z.infer<typeof RenameFormSchema>;

type ChatRenameFormProps = {
  initialTitle: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
  isPending?: boolean;
  isMobile?: boolean;
};

export const ChatRenameForm = memo(({
  initialTitle,
  onSubmit,
  onCancel,
  isPending = false,
  isMobile = false,
}: ChatRenameFormProps) => {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { isDirty, isValid },
  } = useForm<RenameFormValues>({
    resolver: zodResolver(RenameFormSchema),
    defaultValues: { title: initialTitle },
    mode: 'onChange',
  });

  const { ref: registerRef, ...registerProps } = register('title');

  const handleFormSubmit = handleSubmit((values) => {
    const trimmed = values.title.trim();
    if (trimmed && trimmed !== initialTitle) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // Focus and select on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  return (
    <form
      onSubmit={handleFormSubmit}
      className={cn(
        'flex w-full min-w-0 items-center rounded-full bg-accent transition-all duration-200',
        'focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring',
        isMobile ? 'h-10 gap-1 px-3 py-2' : 'h-9 gap-2.5 px-4 py-2',
      )}
    >
      <input
        {...registerProps}
        ref={(e) => {
          registerRef(e);
          (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = e;
        }}
        type="text"
        disabled={isPending}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none border-0 p-0 truncate caret-foreground placeholder:text-muted-foreground"
        aria-label={t('chat.renameConversation')}
        data-testid="chat-rename-input"
      />

      {/* Action buttons - always visible for accessibility */}
      <div className={cn('flex items-center shrink-0', isMobile ? 'gap-0.5' : 'gap-1')}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          disabled={isPending}
          className={cn('rounded-full', isMobile ? 'size-7' : 'size-6')}
          aria-label={t('actions.cancel')}
        >
          <Icons.x className={isMobile ? 'size-4' : 'size-3.5'} />
        </Button>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={isPending || !isValid || !isDirty}
          className={cn('rounded-full', isMobile ? 'size-7' : 'size-6')}
          aria-label={t('actions.save')}
        >
          <Icons.check className={isMobile ? 'size-4' : 'size-3.5'} />
        </Button>
      </div>
    </form>
  );
});

ChatRenameForm.displayName = 'ChatRenameForm';
