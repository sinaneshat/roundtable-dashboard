import { zodResolver } from '@hookform/resolvers/zod';
import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { ComponentVariants } from '@roundtable/shared';
import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { FormProvider } from '@/components/forms';
import type { ProjectFormValues } from '@/components/projects/project-form-fields';
import {
  getProjectFormDefaults,
  PROJECT_FORM_DEFAULTS,
  ProjectFormFields,
  ProjectFormSchema,
} from '@/components/projects/project-form-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateProjectMutation, useUpdateProjectMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';

type ProjectCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: {
    id: string;
    name: string;
    description?: string | null;
    color?: ProjectColor | null;
    icon?: ProjectIcon | null;
    customInstructions?: string | null;
  };
};

export function ProjectCreateDialog({ open, onOpenChange, editProject }: ProjectCreateDialogProps) {
  const t = useTranslations();
  const isEdit = !!editProject;

  const createMutation = useCreateProjectMutation();
  const updateMutation = useUpdateProjectMutation();

  const methods = useForm<ProjectFormValues>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: PROJECT_FORM_DEFAULTS,
    mode: 'onChange',
  });

  const {
    handleSubmit,
    reset,
    control,
    formState: { isDirty, isValid, isSubmitting },
  } = methods;

  useEffect(() => {
    if (open) {
      reset(getProjectFormDefaults(editProject ?? undefined));
    }
  }, [open, editProject, reset]);

  const onSubmit = useCallback(
    async (values: ProjectFormValues) => {
      // Trim values before sending
      const trimmedValues = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        color: values.color,
        icon: values.icon,
        customInstructions: values.customInstructions?.trim() || undefined,
      };

      try {
        if (isEdit && editProject) {
          await updateMutation.mutateAsync({
            param: { id: editProject.id },
            json: trimmedValues,
          });
        } else {
          await createMutation.mutateAsync({
            json: trimmedValues,
          });
        }
        onOpenChange(false);
      } catch {
        // Error handled by mutation
      }
    },
    [isEdit, editProject, createMutation, updateMutation, onOpenChange],
  );

  const handleClose = useCallback(() => {
    if (createMutation.isPending || updateMutation.isPending)
      return;
    onOpenChange(false);
  }, [createMutation.isPending, updateMutation.isPending, onOpenChange]);

  const isPending = createMutation.isPending || updateMutation.isPending || isSubmitting;
  const canSubmit = isValid && (isEdit ? true : isDirty) && !isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('projects.edit') : t('projects.create')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('projects.editDescription')
              : t('projects.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <FormProvider methods={methods} onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <DialogBody>
            <ProjectFormFields
              control={control}
              disabled={isPending}
              variant="dialog"
            />
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant={ComponentVariants.OUTLINE}
              onClick={handleClose}
              disabled={isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="submit"
              loading={isPending}
              disabled={!canSubmit}
            >
              {isEdit ? t('actions.save') : t('projects.create')}
            </Button>
          </DialogFooter>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export type { ProjectCreateDialogProps };
