import { zodResolver } from '@hookform/resolvers/zod';
import { memo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/compat';
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
        isMobile ? 'h-10 gap-1.5 pl-3 pr-1.5 py-2' : 'h-9 gap-1.5 pl-4 pr-1.5 py-2',
      )}
    >
      <input
        {...registerProps}
        ref={(e) => {
          registerRef(e);
          if (inputRef.current !== undefined) {
            inputRef.current = e;
          }
        }}
        type="text"
        disabled={isPending}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none border-0 p-0 truncate caret-foreground placeholder:text-muted-foreground"
        aria-label={t('chat.renameConversation')}
        data-testid="chat-rename-input"
      />

      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={isPending || !isValid || !isDirty}
        className={cn('shrink-0 rounded-full', isMobile ? 'size-6' : 'size-5')}
        aria-label={t('actions.save')}
      >
        {isPending
          ? <Icons.loader className={cn('animate-spin', isMobile ? 'size-3.5' : 'size-3')} />
          : <Icons.check className={isMobile ? 'size-3.5' : 'size-3'} />}
      </Button>
    </form>
  );
});

ChatRenameForm.displayName = 'ChatRenameForm';
