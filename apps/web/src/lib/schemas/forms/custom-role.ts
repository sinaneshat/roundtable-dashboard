import { z } from 'zod';

// TODO: Import STRING_LIMITS from @roundtable/shared when available
const ROLE_NAME_MIN = 1;
const ROLE_NAME_MAX = 100;

export const CustomRoleFormSchema = z.object({
  roleName: z.string().min(ROLE_NAME_MIN).max(ROLE_NAME_MAX),
});

export type CustomRoleFormValues = z.infer<typeof CustomRoleFormSchema>;
