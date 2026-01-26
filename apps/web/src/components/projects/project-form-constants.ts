import type { ProjectColor, ProjectIcon } from '@roundtable/shared';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_COLORS, PROJECT_ICONS, STRING_LIMITS } from '@roundtable/shared';
import { z } from 'zod';

// Unified schema for project forms
export const ProjectFormSchema = z.object({
  color: z.enum(PROJECT_COLORS),
  customInstructions: z.string().max(STRING_LIMITS.CUSTOM_INSTRUCTIONS_MAX).optional(),
  description: z.string().max(STRING_LIMITS.PROJECT_DESCRIPTION_MAX).optional(),
  icon: z.enum(PROJECT_ICONS),
  name: z.string().min(STRING_LIMITS.PROJECT_NAME_MIN, 'Name is required').max(STRING_LIMITS.PROJECT_NAME_MAX),
});

export type ProjectFormValues = z.infer<typeof ProjectFormSchema>;

export const PROJECT_FORM_DEFAULTS: ProjectFormValues = {
  color: DEFAULT_PROJECT_COLOR,
  customInstructions: '',
  description: '',
  icon: DEFAULT_PROJECT_ICON,
  name: '',
};

export function getProjectFormDefaults(project?: {
  name: string;
  description?: string | null;
  color?: ProjectColor | null;
  icon?: ProjectIcon | null;
  customInstructions?: string | null;
}): ProjectFormValues {
  if (!project) {
    return PROJECT_FORM_DEFAULTS;
  }
  return {
    color: project.color ?? DEFAULT_PROJECT_COLOR,
    customInstructions: project.customInstructions ?? '',
    description: project.description ?? '',
    icon: project.icon ?? DEFAULT_PROJECT_ICON,
    name: project.name,
  };
}
