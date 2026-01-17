import { zodResolver } from '@hookform/resolvers/zod';
import { memo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useTranslations } from '@/lib/compat';

const customRoleSchema = z.object({
  roleName: z.string().min(1).max(100),
});

type CustomRoleFormValues = z.infer<typeof customRoleSchema>;

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
    resolver: zodResolver(customRoleSchema),
    defaultValues: { roleName: '' },
  });

  const handleSubmit = async (values: CustomRoleFormValues) => {
    await onSubmit(values.roleName);
    form.reset();
  };

  // Focus input when mounted
  useEffect(() => {
    if (!disabled) {
      form.setFocus('roleName');
    }
  }, [form, disabled]);

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
                  {...field as any}
                  placeholder={t('chat.models.modal.customRolePlaceholder')}
                  disabled={isPending || disabled}
                  className="h-8 text-sm"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button
          type="submit"
          variant="white"
          size="sm"
          disabled={!form.formState.isValid || disabled}
          loading={isPending}
          className="h-8 shrink-0"
        >
          {t('chat.models.modal.saveRole')}
        </Button>
      </form>
    </Form>
  );
});

CustomRoleForm.displayName = 'CustomRoleForm';
