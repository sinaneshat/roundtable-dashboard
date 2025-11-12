'use client';

import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/**
 * Internal component that uses useSearchParams
 * Separated to allow Suspense wrapping per Next.js 15 requirements
 */
function AuthErrorContent() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams?.get('failed') || 'Default';

  const getErrorInfo = (errorType: string) => {
    const errorKey = errorType.toLowerCase();
    switch (errorKey) {
      case 'configuration':
        return {
          title: t('auth.errors.configuration'),
          description: t('auth.errors.configurationDesc'),
        };
      case 'accessdenied':
        return {
          title: t('auth.errors.accessDenied'),
          description: t('auth.errors.accessDeniedDesc'),
        };
      case 'verification':
        return {
          title: t('auth.errors.verification'),
          description: t('auth.errors.verificationDesc'),
        };
      case 'oauthsignin':
        return {
          title: t('auth.errors.oauthSignin'),
          description: t('auth.errors.oauthSigninDesc'),
        };
      case 'oauthcallback':
        return {
          title: t('auth.errors.oauthCallback'),
          description: t('auth.errors.oauthCallbackDesc'),
        };
      case 'oauthcreateaccount':
        return {
          title: t('auth.errors.oauthCreateAccount'),
          description: t('auth.errors.oauthCreateAccountDesc'),
        };
      case 'emailcreateaccount':
        return {
          title: t('auth.errors.emailCreateAccount'),
          description: t('auth.errors.emailCreateAccountDesc'),
        };
      case 'callback':
        return {
          title: t('auth.errors.callback'),
          description: t('auth.errors.callbackDesc'),
        };
      case 'please_restart_the_process':
        return {
          title: t('auth.errors.restartProcess'),
          description: t('auth.errors.restartProcessDesc'),
        };
      default:
        return {
          title: t('auth.errors.default'),
          description: t('auth.errors.defaultDesc'),
        };
    }
  };

  const errorInfo = getErrorInfo(error);

  return (
    <Empty className="w-full max-w-sm border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle className="text-destructive" />
        </EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">
          {errorInfo.title}
        </EmptyTitle>
        <EmptyDescription className="text-base">
          {errorInfo.description}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="space-y-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm text-muted-foreground text-center">
            {t('auth.errors.errorCode')}
            {' '}
            <Badge variant="secondary" className="font-mono text-xs">
              {error}
            </Badge>
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button onClick={() => router.back()} className="w-full">
            <RefreshCw className="me-2 h-4 w-4" />
            {t('auth.errors.tryAgain')}
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/sign-in" className="flex items-center justify-center">
              <ArrowLeft className="me-2 h-4 w-4" />
              {t('auth.errors.backToSignIn')}
            </Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Auth Error Screen wrapper component with Suspense boundary
 * Following Next.js 15 pattern for useSearchParams usage
 */
export default function AuthErrorScreen() {
  return (
    <Suspense
      fallback={(
        <Empty className="w-full max-w-sm border-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">
              Loading...
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    >
      <AuthErrorContent />
    </Suspense>
  );
}
