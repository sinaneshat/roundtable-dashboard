import { STRING_LIMITS, UserFeedbackTypeSchema } from '@roundtable/shared';
import { z } from 'zod';

export const FeedbackFormSchema = z.object({
  feedbackType: UserFeedbackTypeSchema,
  message: z.string().min(STRING_LIMITS.FEEDBACK_MESSAGE_MIN),
});

export type FeedbackFormValues = z.infer<typeof FeedbackFormSchema>;
