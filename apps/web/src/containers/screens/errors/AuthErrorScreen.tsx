import type { AuthErrorType } from '@roundtable/shared';
import { AuthErrorTypes, DEFAULT_AUTH_ERROR_TYPE, isValidAuthErrorType } from '@roundtable/shared';
import { getRouteApi, Link } from '@tanstack/react-router';

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
import { useTranslations } from '@/lib/i18n';

const AUTH_ERROR_I18N_KEYS: Record<AuthErrorType, { title: string; desc: string }> = {
  [AuthErrorTypes.ACCESS_DENIED]: { desc: 'auth.errors.accessDeniedDesc', title: 'auth.errors.accessDenied' },
  [AuthErrorTypes.CALLBACK]: { desc: 'auth.errors.callbackDesc', title: 'auth.errors.callback' },
  [AuthErrorTypes.CONFIGURATION]: { desc: 'auth.errors.configurationDesc', title: 'auth.errors.configuration' },
  [AuthErrorTypes.DEFAULT]: { desc: 'auth.errors.defaultDesc', title: 'auth.errors.default' },
  [AuthErrorTypes.DOMAIN_RESTRICTED]: { desc: 'auth.errors.domainRestrictedDesc', title: 'auth.errors.domainRestricted' },
  [AuthErrorTypes.EMAIL_CREATE_ACCOUNT]: { desc: 'auth.errors.emailCreateAccountDesc', title: 'auth.errors.emailCreateAccount' },
  [AuthErrorTypes.OAUTH_CALLBACK]: { desc: 'auth.errors.oauthCallbackDesc', title: 'auth.errors.oauthCallback' },
  [AuthErrorTypes.OAUTH_CREATE_ACCOUNT]: { desc: 'auth.errors.oauthCreateAccountDesc', title: 'auth.errors.oauthCreateAccount' },
  [AuthErrorTypes.OAUTH_SIGNIN]: { desc: 'auth.errors.oauthSigninDesc', title: 'auth.errors.oauthSignin' },
  [AuthErrorTypes.PLEASE_RESTART_PROCESS]: { desc: 'auth.errors.restartProcessDesc', title: 'auth.errors.restartProcess' },
  [AuthErrorTypes.UNABLE_TO_CREATE_USER]: { desc: 'auth.errors.domainRestrictedDesc', title: 'auth.errors.domainRestricted' },
  [AuthErrorTypes.VERIFICATION]: { desc: 'auth.errors.verificationDesc', title: 'auth.errors.verification' },
};

const routeApi = getRouteApi('/auth/error');

function AuthErrorContent() {
  const t = useTranslations();
  const search = routeApi.useSearch();
  const rawError = (search?.error || search?.failed)?.toLowerCase() ?? DEFAULT_AUTH_ERROR_TYPE;
  const errorType = isValidAuthErrorType(rawError) ? rawError : DEFAULT_AUTH_ERROR_TYPE;

  const errorKeys = AUTH_ERROR_I18N_KEYS[errorType];

  if (!errorKeys) {
    throw new Error(`Missing i18n keys for auth error type: ${errorType}`);
  }

  const errorInfo = {
    description: t(errorKeys.desc),
    title: t(errorKeys.title),
  };

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
            asChild
            startIcon={<Icons.refreshCw />}
            className="w-full"
          >
            <Link to="/auth/sign-in">
              {t('auth.errors.tryAgain')}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            startIcon={<Icons.arrowLeft />}
            className="w-full"
          >
            <Link to="/auth/sign-in">
              {t('auth.errors.backToSignIn')}
            </Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

export function AuthErrorScreen() {
  return <AuthErrorContent />;
}
