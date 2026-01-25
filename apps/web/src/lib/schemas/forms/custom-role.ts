import { STRING_LIMITS } from '@roundtable/shared';
import { z } from 'zod';

export const CustomRoleFormSchema = z.object({
  roleName: z.string().min(STRING_LIMITS.ROLE_NAME_MIN).max(STRING_LIMITS.ROLE_NAME_MAX),
});

export type CustomRoleFormValues = z.infer<typeof CustomRoleFormSchema>;
