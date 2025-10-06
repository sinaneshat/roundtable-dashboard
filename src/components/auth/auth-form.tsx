'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { authClient } from '@/lib/auth/client';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

import { GoogleButton } from './google-button';

// Zod schema for email validation
const magicLinkSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

export function AuthForm() {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  // Initialize RHF with Zod validation
  const form = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: '',
    },
  });

  const handleMagicLink = async (data: MagicLinkFormData) => {
    setIsLoading(true);
    try {
      await authClient.signIn.magicLink({
        email: data.email,
        callbackURL: '/chat',
        newUserCallbackURL: '/chat',
        errorCallbackURL: '/auth/error',
      });
      setSentEmail(data.email);
      setMagicLinkSent(true);
    } catch (error) {
      console.error('Magic link failed:', error);
      const errorMessage = getApiErrorMessage(error, t('auth.magicLink.error'));
      form.setError('email', {
        type: 'manual',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (magicLinkSent) {
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
                setMagicLinkSent(false);
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
                disabled={isLoading}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('actions.loading') : t('auth.magicLink.sendButton')}
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
