'use client';

import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ErrorMessageProps = {
  title?: string;
  description?: string;
  showRetry?: boolean;
  onRetry?: () => void;
  className?: string;
  fullPage?: boolean;
};

export function ErrorMessage({
  title,
  description,
  showRetry = false,
  onRetry,
  className,
  fullPage = false,
}: ErrorMessageProps) {
  const router = useRouter();
  const t = useTranslations();
  
  const defaultTitle = title || t('states.error.default');
  const defaultDescription = description || t('states.error.description');
  const ErrorContent = (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="size-4" />
      <AlertTitle>{defaultTitle}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {defaultDescription}
        {showRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onRetry) {
                onRetry();
              } else {
    // Intentionally empty
                router.refresh();
              }
            }}
            className="w-fit"
          >
            {t('actions.tryAgain')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <Card className="w-full max-w-md border-none shadow-none">
          {ErrorContent}
        </Card>
      </div>
    );
  }

  return ErrorContent;
}

