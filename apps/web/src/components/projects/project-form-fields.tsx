import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_COLORS, PROJECT_ICONS, STRING_LIMITS } from '@roundtable/shared';
import type { Control } from 'react-hook-form';
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

type ProjectFormFieldsProps = {
  control: Control<ProjectFormValues>;
  disabled?: boolean;
  variant?: 'dialog' | 'page';
};

export function ProjectFormFields({
  control,
  disabled,
  variant = 'dialog',
}: ProjectFormFieldsProps) {
  const t = useTranslations();

  const isPage = variant === 'page';
  const descriptionRows = isPage ? 2 : 2;
  const instructionsRows = isPage ? 6 : 3;

  return (
    <div className={cn(isPage ? 'space-y-6' : 'space-y-4')}>
      <RHFTextField<ProjectFormValues>
        name="name"
        title={t('projects.name')}
        placeholder={t('projects.namePlaceholder')}
        disabled={disabled}
      />

      <RHFTextarea<ProjectFormValues>
        name="description"
        title={t('projects.description')}
        placeholder={t('projects.descriptionPlaceholder')}
        rows={descriptionRows}
      />

      <FormField
        control={control}
        name="icon"
        render={({ field: iconField }) => (
          <FormField
            control={control}
            name="color"
            render={({ field: colorField }) => (
              <FormItem>
                <FormLabel>{t('projects.appearance')}</FormLabel>
                <FormControl>
                  <ProjectIconColorPicker
                    icon={iconField.value}
                    color={colorField.value}
                    onIconChange={iconField.onChange}
                    onColorChange={colorField.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}
      />

      <RHFTextarea<ProjectFormValues>
        name="customInstructions"
        title={t('projects.customInstructions')}
        placeholder={t('projects.customInstructionsPlaceholder')}
        description={t('projects.customInstructionsHint')}
        rows={instructionsRows}
      />
    </div>
  );
}
