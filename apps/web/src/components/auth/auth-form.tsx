'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthStep } from '@roundtable/shared';
import { AuthSteps, DEFAULT_AUTH_STEP, ErrorSeverities } from '@roundtable/shared';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Form, RHFTextField } from '@/components/forms';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useBoolean, useIsMounted } from '@/hooks/utils';
import { authClient } from '@/lib/auth/client';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
import { showApiErrorToast, showApiInfoToast } from '@/lib/toast';
import { getApiErrorDetails } from '@/lib/utils';

import { GoogleButton } from './google-button';

const routeApi = getRouteApi('/auth/sign-in');

function AuthFormContent() {
  const t = useTranslations();
  const router = useRouter();
  const search = routeApi.useSearch();
  const isLoading = useBoolean(false);
  const isMounted = useIsMounted();
  const [step, setStep] = useState<AuthStep>(DEFAULT_AUTH_STEP);
  const [sentEmail, setSentEmail] = useState('');

  // SSR-safe: disable animations on server to prevent invisible content
  const isServer = !isMounted;

  const magicLinkSchema = z.object({
    email: z.string().email(t('auth.validation.email')),
  });

  type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

  // Handle toast messages from URL params
  useEffect(() => {
    const toastType = search?.toast;
    const message = search?.message;

    if (toastType && message) {
      if (toastType === ErrorSeverities.FAILED) {
        showApiErrorToast(t('auth.errors.threadNotFound'), new Error(message));
      } else if (toastType === ErrorSeverities.INFO) {
        showApiInfoToast(t('auth.errors.threadUnavailable'), message);
      } else {
        showApiInfoToast(t('auth.errors.notice'), message);
      }

      router.navigate({
        replace: true,
        search: (prev) => {
          const { action: _action, from: _from, message: _message, toast: _toast, ...rest } = prev;
          return rest;
        },
        to: '.',
      });
    }
  }, [search, t, router]);

  const form = useForm<MagicLinkFormData>({
    defaultValues: { email: '' },
    resolver: zodResolver(magicLinkSchema),
  });

  const handleMagicLink = async (data: MagicLinkFormData) => {
    isLoading.onTrue();
    try {
      // Make callback URLs absolute to redirect to web app, not API server
      const appBaseUrl = getAppBaseUrl();
      await authClient.signIn.magicLink({
        callbackURL: `${appBaseUrl}/chat`,
        email: data.email,
        errorCallbackURL: `${appBaseUrl}/auth/error`,
        newUserCallbackURL: `${appBaseUrl}/chat`,
      });
      setSentEmail(data.email);
      setStep(AuthSteps.SENT);
    } catch (error) {
      const errorDetails = getApiErrorDetails(error);
      form.setError('email', {
        message: errorDetails.message || t('auth.magicLink.error'),
        type: 'manual',
      });
    } finally {
      isLoading.onFalse();
    }
  };

  const goBack = () => {
    setStep(DEFAULT_AUTH_STEP);
    form.reset();
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait" initial={false}>
        {/* Step 1: Method Selection - pt-10 compensates for email step's extra height */}
        {step === AuthSteps.METHOD && (
          <motion.div
            key="method"
            initial={isServer ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-4 pt-10"
          >
            <GoogleButton className="w-full h-14" size="lg" />
            <Button
              variant="outline"
              size="lg"
              className="w-full h-14"
              onClick={() => setStep(AuthSteps.EMAIL)}
            >
              {t('auth.continueWithEmail')}
            </Button>
          </motion.div>
        )}

        {/* Step 2: Email Input - pb-5 matches method step total height (152px) */}
        {step === AuthSteps.EMAIL && (
          <motion.div
            key="email"
            initial={isServer ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-3 pb-5"
          >
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto py-1 px-2 text-xs text-muted-foreground"
                onClick={goBack}
                startIcon={<Icons.arrowLeft />}
              >
                {t('actions.back')}
              </Button>
            </div>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleMagicLink)}
                className="flex flex-col gap-3"
              >
                <RHFTextField
                  name="email"
                  title={t('auth.email')}
                  placeholder={t('auth.emailPlaceholder')}
                  fieldType="email"
                  required
                  disabled={isLoading.value}
                  inputClassName="!h-14 sm:!h-14 px-6 text-base"
                />
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14"
                  disabled={isLoading.value}
                  loading={isLoading.value}
                >
                  {t('auth.magicLink.sendButton')}
                </Button>
              </form>
            </Form>
          </motion.div>
        )}

        {/* Step 3: Email Sent Success - pt-3 aligns height with other steps */}
        {step === AuthSteps.SENT && (
          <motion.div
            key="sent"
            initial={isServer ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-4 text-center pt-3"
          >
            <div className="flex items-center gap-3">
              <motion.div
                initial={isServer ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ damping: 25, delay: 0.05, stiffness: 300, type: 'spring' }}
                className="flex size-10 items-center justify-center rounded-full bg-chart-3/20"
              >
                <Icons.mail className="size-5 text-chart-3" />
              </motion.div>
              <h3 className="text-base font-semibold">
                {t('auth.magicLink.title')}
              </h3>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{t('auth.magicLink.emailSentTo', { email: sentEmail })}</p>
              <p>{t('auth.magicLink.clickToSignIn')}</p>
            </div>
            <Button
              variant="outline"
              size="lg"
              className="w-full h-14"
              onClick={goBack}
            >
              {t('auth.magicLink.useDifferentEmail')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AuthForm() {
  return <AuthFormContent />;
}
