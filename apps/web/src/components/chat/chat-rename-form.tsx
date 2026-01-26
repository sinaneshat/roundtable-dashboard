import { zodResolver } from '@hookform/resolvers/zod';
import { memo, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';

import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/forms';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from '@/lib/i18n';
import type { ChatRenameFormValues } from '@/lib/schemas/forms';
import { ChatRenameFormSchema } from '@/lib/schemas/forms';
import { cn } from '@/lib/ui/cn';

type ChatRenameFormProps = {
  initialTitle: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
  isPending?: boolean;
  isMobile?: boolean;
};

export const ChatRenameForm = memo(({
  initialTitle,
  isMobile = false,
  isPending = false,
  onCancel,
  onSubmit,
}: ChatRenameFormProps) => {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<ChatRenameFormValues>({
    defaultValues: { title: initialTitle },
    mode: 'onChange',
    resolver: zodResolver(ChatRenameFormSchema),
  });

  const { isDirty, isValid } = form.formState;

  const handleFormSubmit = form.handleSubmit((values) => {
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
    <Form {...form}>
      <form
        onSubmit={handleFormSubmit}
        className={cn(
          'flex w-full min-w-0 items-center rounded-full bg-accent transition-all duration-200',
          'focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring',
          isMobile ? 'h-10 gap-1.5 pl-3 pr-1.5 py-2' : 'h-9 gap-1.5 pl-4 pr-1.5 py-2',
        )}
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="flex-1 min-w-0">
              <FormControl>
                <Input
                  {...field}
                  ref={(e) => {
                    field.ref(e);
                    inputRef.current = e;
                  }}
                  type="text"
                  disabled={isPending}
                  onKeyDown={handleKeyDown}
                  className="w-full min-w-0 bg-transparent text-sm outline-none border-0 p-0 truncate caret-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                  aria-label={t('chat.renameConversation')}
                  data-testid="chat-rename-input"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
    </Form>
  );
});

ChatRenameForm.displayName = 'ChatRenameForm';
