import { zodResolver } from '@hookform/resolvers/zod';
import type { UserFeedbackType } from '@roundtable/shared';
import {
  DEFAULT_USER_FEEDBACK_TYPE,
  USER_FEEDBACK_TYPES,
  UserFeedbackTypeSchema,
} from '@roundtable/shared';
import { usePostHog } from 'posthog-js/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormProvider } from '@/components/forms/form-provider';
import { RHFSelect } from '@/components/forms/rhf-select';
import { RHFTextarea } from '@/components/forms/rhf-textarea';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from '@/lib/compat';
import type { FormOptions } from '@/lib/schemas';

// PostHog survey configuration
// Note: This is a custom survey implementation (not created in PostHog dashboard)
// Using stable UUIDs for consistent tracking across deployments
// To create a managed survey, use PostHog dashboard and replace this ID
const POSTHOG_FEEDBACK_SURVEY_ID = '019432a1-feedback-0000-survey-roundtable';
const POSTHOG_FEEDBACK_SURVEY_NAME = 'Roundtable User Feedback';
const POSTHOG_FEEDBACK_MESSAGE_QUESTION_ID = 'd8462827-1575-4e1e-ab1d-b5fddd9f829c';
const POSTHOG_FEEDBACK_TYPE_QUESTION_ID = 'a3071551-d599-4eeb-9ffe-69e93dc647b6';

const MIN_MESSAGE_LENGTH = 10;

// Zod schema for feedback form
const FeedbackFormSchema = z.object({
  feedbackType: UserFeedbackTypeSchema,
  message: z.string().min(MIN_MESSAGE_LENGTH, 'Message must be at least 10 characters'),
});

type FeedbackFormValues = z.infer<typeof FeedbackFormSchema>;

export type FeedbackModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const t = useTranslations();
  const posthog = usePostHog();

  const [showSuccess, setShowSuccess] = useState(false);
  const hasSubmittedRef = useRef(false);
  const hasCapturedShownRef = useRef(false);

  const methods = useForm<FeedbackFormValues>({
    resolver: zodResolver(FeedbackFormSchema),
    defaultValues: {
      feedbackType: DEFAULT_USER_FEEDBACK_TYPE,
      message: '',
    },
  });

  const { handleSubmit, reset, formState: { isSubmitting } } = methods;

  // Build feedback type options from enum
  const feedbackTypeOptions: FormOptions = useMemo(() =>
    USER_FEEDBACK_TYPES.map((type: UserFeedbackType) => ({
      label: t(`feedback.types.${type}`),
      value: type,
    })), [t]);

  // Capture "survey shown" event when modal opens
  // @see https://posthog.com/docs/surveys/implementing-custom-surveys
  useEffect(() => {
    if (open && posthog && !hasCapturedShownRef.current) {
      posthog.capture('survey shown', {
        $survey_id: POSTHOG_FEEDBACK_SURVEY_ID,
        $survey_name: POSTHOG_FEEDBACK_SURVEY_NAME,
      });
      hasCapturedShownRef.current = true;
    }

    if (!open) {
      hasCapturedShownRef.current = false;
      hasSubmittedRef.current = false;
    }
  }, [open, posthog]);

  const onSubmit = useCallback((values: FeedbackFormValues) => {
    if (!posthog)
      return;

    hasSubmittedRef.current = true;

    // PostHog survey sent event with proper response format
    // @see https://posthog.com/docs/surveys/implementing-custom-surveys
    posthog.capture('survey sent', {
      $survey_id: POSTHOG_FEEDBACK_SURVEY_ID,
      $survey_name: POSTHOG_FEEDBACK_SURVEY_NAME,
      $survey_questions: [
        {
          id: POSTHOG_FEEDBACK_MESSAGE_QUESTION_ID,
          question: 'Share your thoughts, report bugs, or request features',
          type: 'open_text',
        },
        {
          id: POSTHOG_FEEDBACK_TYPE_QUESTION_ID,
          question: 'What type of feedback is this?',
          type: 'multiple_choice',
        },
      ],
      // Response values keyed by question ID (required format)
      [`$survey_response_${POSTHOG_FEEDBACK_MESSAGE_QUESTION_ID}`]: values.message,
      [`$survey_response_${POSTHOG_FEEDBACK_TYPE_QUESTION_ID}`]: values.feedbackType,
    });

    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      reset();
      onOpenChange(false);
    }, 2000);
  }, [posthog, reset, onOpenChange]);

  const handleClose = useCallback(() => {
    if (isSubmitting)
      return;

    // Capture "survey dismissed" if closed without submitting
    // @see https://posthog.com/docs/surveys/implementing-custom-surveys
    if (posthog && !hasSubmittedRef.current && !showSuccess) {
      posthog.capture('survey dismissed', {
        $survey_id: POSTHOG_FEEDBACK_SURVEY_ID,
        $survey_name: POSTHOG_FEEDBACK_SURVEY_NAME,
      });
    }

    reset();
    setShowSuccess(false);
    onOpenChange(false);
  }, [isSubmitting, posthog, showSuccess, reset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Icons.messageSquare className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {t('feedback.title')}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t('feedback.description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {showSuccess
          ? (
              <DialogBody className="py-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-green-500/10 mb-4">
                    <Icons.checkCircle className="size-6 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold">{t('feedback.success.title')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('feedback.success.message')}
                  </p>
                </div>
              </DialogBody>
            )
          : (
              <FormProvider methods={methods} onSubmit={handleSubmit(onSubmit)}>
                <DialogBody className="space-y-4 py-4">
                  <RHFSelect
                    name="feedbackType"
                    title={t('feedback.typeLabel')}
                    options={feedbackTypeOptions}
                  />
                  <RHFTextarea
                    name="message"
                    title={t('feedback.messageLabel')}
                    placeholder={t('feedback.messagePlaceholder')}
                    rows={5}
                  />
                </DialogBody>

                <DialogFooter className="border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    loading={isSubmitting}
                  >
                    {t('feedback.submit')}
                  </Button>
                </DialogFooter>
              </FormProvider>
            )}
      </DialogContent>
    </Dialog>
  );
}
