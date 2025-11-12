'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
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

  if (magicLinkSent.value) {
    return (
      <div className="relative">
        <Card className="w-full max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-chart-3/20 mb-4">
              <Mail className="h-6 w-6 text-chart-3" />
            </div>
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
      </div>
    );
  }

  return (
    <div className="relative">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle>{t('auth.signIn.title')}</CardTitle>
          <CardDescription>
            {t('auth.signIn.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleMagicLink)} className="space-y-4">
              <RHFTextField
                name="email"
                title={t('auth.email')}
                placeholder={t('auth.emailPlaceholder')}
                fieldType="email"
                required
                disabled={isLoading.value}
              />
              <Button type="submit" className="w-full" disabled={isLoading.value}>
                {isLoading.value ? t('actions.loading') : t('auth.magicLink.sendButton')}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {t('common.or')}
              </span>
            </div>
          </div>

          <GoogleButton className="w-full" />

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('auth.secureAuthentication')}
            </p>
          </div>
        </CardContent>
      </Card>
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
        <div className="relative">
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle>Loading...</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}
    >
      <AuthFormContent />
    </Suspense>
  );
}
