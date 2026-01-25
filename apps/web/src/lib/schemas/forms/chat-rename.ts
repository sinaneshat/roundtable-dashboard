import { z } from 'zod';

// TODO: Import CHAT_TITLE_MAX from @roundtable/shared when available
const CHAT_TITLE_MIN = 1;
const CHAT_TITLE_MAX = 255;

export const ChatRenameFormSchema = z.object({
  title: z.string().min(CHAT_TITLE_MIN).max(CHAT_TITLE_MAX),
});

export type ChatRenameFormValues = z.infer<typeof ChatRenameFormSchema>;
