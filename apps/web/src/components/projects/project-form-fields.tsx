import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_COLORS, PROJECT_ICONS, STRING_LIMITS } from '@roundtable/shared';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { z } from 'zod';

import { RHFTextarea, RHFTextField } from '@/components/forms';
import { ProjectIconColorPicker } from '@/components/projects/project-icon-color-picker';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

// Unified schema for project forms
export const ProjectFormSchema = z.object({
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN, 'Name is required').max(STRING_LIMITS.PROJECT_NAME_MAX),
  description: z.string().max(STRING_LIMITS.PROJECT_DESCRIPTION_MAX).optional(),
  color: z.enum(PROJECT_COLORS),
  icon: z.enum(PROJECT_ICONS),
  customInstructions: z.string().max(STRING_LIMITS.CUSTOM_INSTRUCTIONS_MAX).optional(),
});

export type ProjectFormValues = z.infer<typeof ProjectFormSchema>;

export const PROJECT_FORM_DEFAULTS: ProjectFormValues = {
  name: '',
  description: '',
  color: DEFAULT_PROJECT_COLOR,
  icon: DEFAULT_PROJECT_ICON,
  customInstructions: '',
};

export function getProjectFormDefaults(project?: {
  name: string;
  description?: string | null;
  color?: ProjectColor | null;
  icon?: ProjectIcon | null;
  customInstructions?: string | null;
}): ProjectFormValues {
  if (!project)
    return PROJECT_FORM_DEFAULTS;
  return {
    name: project.name,
    description: project.description ?? '',
    color: project.color ?? DEFAULT_PROJECT_COLOR,
    icon: project.icon ?? DEFAULT_PROJECT_ICON,
    customInstructions: project.customInstructions ?? '',
  };
}

type ProjectFormFieldsProps<T extends FieldValues> = {
  control: Control<T>;
  disabled?: boolean;
  variant?: 'dialog' | 'page';
};

export function ProjectFormFields<T extends FieldValues = ProjectFormValues>({
  control,
  disabled,
  variant = 'dialog',
}: ProjectFormFieldsProps<T>) {
  const t = useTranslations();

  const isPage = variant === 'page';
  const descriptionRows = isPage ? 2 : 2;
  const instructionsRows = isPage ? 6 : 3;

  return (
    <div className={cn(isPage ? 'space-y-6' : 'space-y-4')}>
      <RHFTextField<T>
        name={'name' as Path<T>}
        title={t('projects.name')}
        placeholder={t('projects.namePlaceholder')}
        disabled={disabled}
      />

      <RHFTextarea<T>
        name={'description' as Path<T>}
        title={t('projects.description')}
        placeholder={t('projects.descriptionPlaceholder')}
        rows={descriptionRows}
      />

      <FormField
        control={control}
        name={'icon' as Path<T>}
        render={({ field: iconField }) => (
          <FormField
            control={control}
            name={'color' as Path<T>}
            render={({ field: colorField }) => (
              <FormItem>
                <FormLabel>{t('projects.appearance')}</FormLabel>
                <FormControl>
                  <ProjectIconColorPicker
                    icon={iconField.value as ProjectIcon}
                    color={colorField.value as ProjectColor}
                    onIconChange={iconField.onChange}
                    onColorChange={colorField.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}
      />

      <RHFTextarea<T>
        name={'customInstructions' as Path<T>}
        title={t('projects.customInstructions')}
        placeholder={t('projects.customInstructionsPlaceholder')}
        description={t('projects.customInstructionsHint')}
        rows={instructionsRows}
      />
    </div>
  );
}
