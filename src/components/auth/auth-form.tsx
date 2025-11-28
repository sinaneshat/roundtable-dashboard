'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import RHFTextField from '@/components/forms/rhf-text-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { useBoolean } from '@/hooks/utils';
import { authClient } from '@/lib/auth/client';
import { showApiErrorToast, showApiInfoToast } from '@/lib/toast';
import { getApiErrorDetails } from '@/lib/utils/error-handling';

import { GoogleButton } from './google-button';

/**
 * ✅ FORM-SPECIFIC: Email validation schema for magic link authentication
 * This is UI/form validation, NOT database validation
 */
const magicLinkSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

/**
 * Internal component that uses useSearchParams
 * Separated to allow Suspense wrapping per Next.js 15 requirements
 */
function AuthFormContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const isLoading = useBoolean(false);
  const magicLinkSent = useBoolean(false);
  const [sentEmail, setSentEmail] = useState('');

  // Display toast message from URL parameters (for redirects from unavailable public threads)
  useEffect(() => {
    const toastType = searchParams.get('toast');
    const message = searchParams.get('message');

    if (toastType && message) {
      // Display appropriate toast based on type
      if (toastType === 'failed') {
        showApiErrorToast(t('auth.errors.threadNotFound'), new Error(message));
      } else if (toastType === 'info') {
        showApiInfoToast(t('auth.errors.threadUnavailable'), message);
      } else {
        // Intentionally empty
        showApiInfoToast(t('auth.errors.notice'), message);
      }

      // Clean up URL parameters after displaying toast
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('toast');
        url.searchParams.delete('message');
        url.searchParams.delete('action');
        url.searchParams.delete('from');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [searchParams, t]);

  // Initialize RHF with Zod validation
  const form = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleMagicLink = async (data: MagicLinkFormData) => {
    isLoading.onTrue();
    try {
      await authClient.signIn.magicLink({
        email: data.email,
        callbackURL: '/chat',
        newUserCallbackURL: '/chat',
        errorCallbackURL: '/auth/error',
      });
      setSentEmail(data.email);
      magicLinkSent.onTrue();
    } catch (error) {
      const errorDetails = getApiErrorDetails(error);
      form.setError('email', {
        type: 'manual',
        message: errorDetails.message || t('auth.magicLink.error'),
      });
    } finally {
      isLoading.onFalse();
    }
  };

  return (
    <div className="w-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {magicLinkSent.value
          ? (
              <motion.div
                key="success"
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <Card className="w-full">
                  <CardHeader className="text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 260,
                        damping: 20,
                        delay: 0.1,
                      }}
                      className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-chart-3/20"
                    >
                      <Mail className="h-6 w-6 text-chart-3" />
                    </motion.div>
                    <CardTitle>{t('auth.magicLink.title')}</CardTitle>
                    <CardDescription>
                      {t('auth.magicLink.emailSentMessage', { email: sentEmail })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        magicLinkSent.onFalse();
                        form.reset();
                      }}
                    >
                      {t('auth.magicLink.useDifferentEmail')}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )
          : (
              <motion.div
                key="form"
                layout
                initial="hidden"
                animate="show"
                exit="exit"
                variants={{
                  hidden: { opacity: 0, x: -20 },
                  show: {
                    opacity: 1,
                    x: 0,
                    transition: {
                      duration: 0.3,
                      ease: 'easeInOut',
                    },
                  },
                  exit: {
                    opacity: 0,
                    x: 20,
                    transition: { duration: 0.2 },
                  },
                }}
              >
                <Card className="w-full">
                  <CardHeader className="text-center">
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        show: {
                          opacity: 1,
                          y: 0,
                          transition: { delay: 0, duration: 0.3 },
                        },
                      }}
                    >
                      <CardTitle>{t('auth.signIn.title')}</CardTitle>
                      <CardDescription>
                        {t('auth.signIn.description')}
                      </CardDescription>
                    </motion.div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit(handleMagicLink)}
                        className="space-y-4"
                      >
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 10 },
                            show: {
                              opacity: 1,
                              y: 0,
                              transition: { delay: 0.15, duration: 0.3 },
                            },
                          }}
                        >
                          <RHFTextField
                            name="email"
                            title={t('auth.email')}
                            placeholder={t('auth.emailPlaceholder')}
                            fieldType="email"
                            required
                            disabled={isLoading.value}
                          />
                        </motion.div>
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 10 },
                            show: {
                              opacity: 1,
                              y: 0,
                              transition: { delay: 0.3, duration: 0.3 },
                            },
                          }}
                        >
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading.value}
                          >
                            {isLoading.value
                              ? t('actions.loading')
                              : t('auth.magicLink.sendButton')}
                          </Button>
                        </motion.div>
                      </form>
                    </Form>

                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        show: {
                          opacity: 1,
                          y: 0,
                          transition: { delay: 0.45, duration: 0.3 },
                        },
                      }}
                      className="relative"
                    >
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          {t('common.or')}
                        </span>
                      </div>
                    </motion.div>

                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        show: {
                          opacity: 1,
                          y: 0,
                          transition: { delay: 0.6, duration: 0.3 },
                        },
                      }}
                    >
                      <GoogleButton className="w-full" />
                    </motion.div>

                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        show: {
                          opacity: 1,
                          y: 0,
                          transition: { delay: 0.75, duration: 0.3 },
                        },
                      }}
                      className="text-center"
                    >
                      <p className="text-sm text-muted-foreground">
                        {t('auth.secureAuthentication')}
                      </p>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Auth Form wrapper component with Suspense boundary
 * Following Next.js 15 pattern for useSearchParams usage
 */
export function AuthForm() {
  return (
    <Suspense
      fallback={(
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
        </Card>
      )}
    >
      <AuthFormContent />
    </Suspense>
  );
}
