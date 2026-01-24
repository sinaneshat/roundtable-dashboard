import { zodResolver } from '@hookform/resolvers/zod';
import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { PROJECT_COLORS, PROJECT_ICONS, STRING_LIMITS } from '@roundtable/shared';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Icons } from '@/components/icons';
import { ProjectIconBadge, ProjectIconColorPicker } from '@/components/projects/project-icon-color-picker';
import { ProjectTemplateChips } from '@/components/projects/project-template-chips';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateProjectMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';

const CreateProjectSchema = z.object({
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN, 'Name is required').max(STRING_LIMITS.PROJECT_NAME_MAX),
  color: z.enum(PROJECT_COLORS),
  icon: z.enum(PROJECT_ICONS),
});

type CreateProjectFormValues = z.infer<typeof CreateProjectSchema>;

const DEFAULT_VALUES: CreateProjectFormValues = {
  name: '',
  color: 'gray',
  icon: 'sparkles',
};

type ProjectCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProjectCreateDialog({ open, onOpenChange }: ProjectCreateDialogProps) {
  const t = useTranslations();
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const createMutation = useCreateProjectMutation();

  const form = useForm<CreateProjectFormValues>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isValid, isSubmitting },
  } = form;

  const currentIcon = watch('icon');
  const currentColor = watch('color');

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES);
    }
  }, [open, reset]);

  const onSubmit = useCallback(
    async (values: CreateProjectFormValues) => {
      const trimmedValues = {
        name: values.name.trim(),
        color: values.color,
        icon: values.icon,
      };

      try {
        const result = await createMutation.mutateAsync({
          json: trimmedValues,
        });
        if (result.success) {
          onOpenChange(false);
        }
      } catch {
        // Error handled by mutation
      }
    },
    [createMutation, onOpenChange],
  );

  const handleTemplateSelect = useCallback(
    (template: { name: string; icon: ProjectIcon; color: ProjectColor }) => {
      setValue('name', template.name, { shouldValidate: true });
      setValue('icon', template.icon);
      setValue('color', template.color);
    },
    [setValue],
  );

  const handleClose = useCallback(() => {
    if (createMutation.isPending)
      return;
    onOpenChange(false);
  }, [createMutation.isPending, onOpenChange]);

  const isPending = createMutation.isPending || isSubmitting;
  const canSubmit = isValid && !isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {t('projects.createProject')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <DialogBody>
              <div className="space-y-6 pt-1 pb-2">
                {/* Name input + template chips group */}
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Popover open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                                >
                                  <ProjectIconBadge
                                    icon={currentIcon}
                                    color={currentColor}
                                    size="md"
                                  />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                side="bottom"
                                align="start"
                                className="w-[280px] p-4"
                                sideOffset={8}
                              >
                                <ProjectIconColorPicker
                                  icon={currentIcon}
                                  color={currentColor}
                                  onIconChange={(icon) => {
                                    setValue('icon', icon);
                                  }}
                                  onColorChange={(color) => {
                                    setValue('color', color);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            <Input
                              {...field}
                              placeholder={t('projects.namePlaceholder')}
                              className="pl-11"
                              disabled={isPending}
                            />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <ProjectTemplateChips onSelect={handleTemplateSelect} />
                </div>

                {/* Onboarding text */}
                <div className="flex items-start gap-3 rounded-xl bg-muted/40 p-4">
                  <Icons.lightbulb className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    {t('projects.onboardingText')}
                  </p>
                </div>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                type="submit"
                loading={isPending}
                disabled={!canSubmit}
              >
                {t('projects.createProject')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export type { ProjectCreateDialogProps };
