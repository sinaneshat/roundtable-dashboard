import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_COLORS, PROJECT_ICONS, STRING_LIMITS } from '@roundtable/shared';
import { z } from 'zod';

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
