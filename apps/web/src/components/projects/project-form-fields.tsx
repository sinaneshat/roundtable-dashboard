import type { Control } from 'react-hook-form';

import { RHFTextarea, RHFTextField } from '@/components/forms';
import type { ProjectFormValues } from '@/components/projects/project-form-constants';
import { ProjectIconColorPicker } from '@/components/projects/project-icon-color-picker';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

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
