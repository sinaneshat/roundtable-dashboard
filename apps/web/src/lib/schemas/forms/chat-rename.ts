import { STRING_LIMITS } from '@roundtable/shared';
import { z } from 'zod';

export const ChatRenameFormSchema = z.object({
  title: z.string().min(STRING_LIMITS.CHAT_TITLE_MIN).max(STRING_LIMITS.CHAT_TITLE_MAX),
});

export type ChatRenameFormValues = z.infer<typeof ChatRenameFormSchema>;
