import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/forms';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCreateJobMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';

type JobCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JobCreateDialog({ onOpenChange, open }: JobCreateDialogProps) {
  const t = useTranslations();
  const createMutation = useCreateJobMutation();

  const createJobFormSchema = z.object({
    autoPublish: z.boolean(),
    initialPrompt: z.string().min(10, t('admin.jobs.validation.promptMinLength')).max(2000),
    totalRounds: z.number().int().min(1).max(5),
  });

  type CreateJobFormValues = z.infer<typeof createJobFormSchema>;

  const form = useForm<CreateJobFormValues>({
    defaultValues: {
      autoPublish: false,
      initialPrompt: '',
      totalRounds: 3,
    },
    resolver: zodResolver(createJobFormSchema),
  });

  const onSubmit = (data: CreateJobFormValues) => {
    createMutation.mutate(
      { json: data },
      {
        onSuccess: (response) => {
          if (response.success) {
            toastManager.success(t('admin.jobs.created'));
            form.reset();
            onOpenChange(false);
          }
        },
      },
    );
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.sparkles className="size-5" />
            {t('admin.jobs.new.title')}
          </DialogTitle>
          <DialogDescription>
            {t('admin.jobs.new.description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="initialPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.jobs.new.promptLabel')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('admin.jobs.new.promptPlaceholder')}
                      className="min-h-28 resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t('admin.jobs.new.promptHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalRounds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('admin.jobs.new.roundsLabel')}
                    :
                    {field.value}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={field.value}
                      onChange={e => field.onChange(Number.parseInt(e.target.value, 10) || 1)}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t('admin.jobs.new.roundsHint')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="autoPublish"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5 pr-4">
                    <FormLabel className="text-sm">
                      {t('admin.jobs.new.autoPublishLabel')}
                    </FormLabel>
                    <FormDescription className="text-xs">
                      {t('admin.jobs.new.autoPublishHint')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                loading={createMutation.isPending}
                startIcon={<Icons.sparkles />}
              >
                {t('admin.jobs.new.submit')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
