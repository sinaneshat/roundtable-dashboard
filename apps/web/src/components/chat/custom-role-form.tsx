import { zodResolver } from '@hookform/resolvers/zod';
import { memo } from 'react';
import { useForm } from 'react-hook-form';

import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from '@/lib/i18n';
import type { CustomRoleFormValues } from '@/lib/schemas/forms';
import { CustomRoleFormSchema } from '@/lib/schemas/forms';

type CustomRoleFormProps = {
  onSubmit: (roleName: string) => Promise<void>;
  isPending: boolean;
  disabled?: boolean;
};

export const CustomRoleForm = memo(({
  onSubmit,
  isPending,
  disabled = false,
}: CustomRoleFormProps) => {
  const t = useTranslations();

  const form = useForm<CustomRoleFormValues>({
    resolver: zodResolver(CustomRoleFormSchema),
    defaultValues: { roleName: '' },
  });

  const handleSubmit = async (values: CustomRoleFormValues) => {
    await onSubmit(values.roleName);
    form.reset();
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex gap-2 w-full"
      >
        <FormField
          control={form.control}
          name="roleName"
          render={({ field }) => (
            <FormItem className="flex-1 min-w-0">
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('chat.models.modal.customRolePlaceholder')}
                  aria-label={t('chat.models.modal.customRolePlaceholder')}
                  disabled={isPending || disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="white"
          disabled={!form.formState.isValid || disabled}
          loading={isPending}
          className="shrink-0"
        >
          {t('chat.models.modal.saveRole')}
        </Button>
      </form>
    </Form>
  );
});

CustomRoleForm.displayName = 'CustomRoleForm';
