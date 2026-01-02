'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { AuthErrorTypes, isValidAuthErrorType } from '@/api/core/enums/auth';
import { Icons } from '@/components/icons';
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

const AUTH_ERROR_I18N_KEYS = {
  [AuthErrorTypes.CONFIGURATION]: { title: 'auth.errors.configuration', desc: 'auth.errors.configurationDesc' },
  [AuthErrorTypes.ACCESS_DENIED]: { title: 'auth.errors.accessDenied', desc: 'auth.errors.accessDeniedDesc' },
  [AuthErrorTypes.VERIFICATION]: { title: 'auth.errors.verification', desc: 'auth.errors.verificationDesc' },
  [AuthErrorTypes.OAUTH_SIGNIN]: { title: 'auth.errors.oauthSignin', desc: 'auth.errors.oauthSigninDesc' },
  [AuthErrorTypes.OAUTH_CALLBACK]: { title: 'auth.errors.oauthCallback', desc: 'auth.errors.oauthCallbackDesc' },
  [AuthErrorTypes.OAUTH_CREATE_ACCOUNT]: { title: 'auth.errors.oauthCreateAccount', desc: 'auth.errors.oauthCreateAccountDesc' },
  [AuthErrorTypes.EMAIL_CREATE_ACCOUNT]: { title: 'auth.errors.emailCreateAccount', desc: 'auth.errors.emailCreateAccountDesc' },
  [AuthErrorTypes.CALLBACK]: { title: 'auth.errors.callback', desc: 'auth.errors.callbackDesc' },
  [AuthErrorTypes.PLEASE_RESTART_PROCESS]: { title: 'auth.errors.restartProcess', desc: 'auth.errors.restartProcessDesc' },
  [AuthErrorTypes.DEFAULT]: { title: 'auth.errors.default', desc: 'auth.errors.defaultDesc' },
} as const;

function AuthErrorContent() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawError = searchParams?.get('failed')?.toLowerCase() ?? AuthErrorTypes.DEFAULT;
  const errorType = isValidAuthErrorType(rawError) ? rawError : AuthErrorTypes.DEFAULT;

  const errorKeys = AUTH_ERROR_I18N_KEYS[errorType];
  const errorInfo = {
    title: t(errorKeys.title),
    description: t(errorKeys.desc),
  };

  const handleRetry = () => router.push('/auth/sign-in');

  return (
    <Empty className="w-full max-w-sm border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icons.alertCircle className="text-destructive" />
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
              {errorType}
            </Badge>
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={handleRetry}
            startIcon={<Icons.refreshCw />}
            className="w-full"
          >
            {t('auth.errors.tryAgain')}
          </Button>
          <Button
            onClick={handleRetry}
            variant="outline"
            startIcon={<Icons.arrowLeft />}
            className="w-full"
          >
            {t('auth.errors.backToSignIn')}
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

function AuthErrorFallback() {
  const t = useTranslations();
  return (
    <Empty className="w-full max-w-sm border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icons.alertCircle className="text-destructive" />
        </EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">
          {t('states.loading.default')}
        </EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

export default function AuthErrorScreen() {
  return (
    <Suspense fallback={<AuthErrorFallback />}>
      <AuthErrorContent />
    </Suspense>
  );
}
