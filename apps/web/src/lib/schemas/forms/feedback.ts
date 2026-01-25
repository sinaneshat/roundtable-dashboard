import { UserFeedbackTypeSchema } from '@roundtable/shared';
import { z } from 'zod';

// TODO: Import FEEDBACK_MESSAGE_MIN from @roundtable/shared when available
const FEEDBACK_MESSAGE_MIN = 10;

export const FeedbackFormSchema = z.object({
  feedbackType: UserFeedbackTypeSchema,
  message: z.string().min(FEEDBACK_MESSAGE_MIN),
});

export type FeedbackFormValues = z.infer<typeof FeedbackFormSchema>;
