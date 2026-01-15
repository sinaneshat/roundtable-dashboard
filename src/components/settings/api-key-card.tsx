'use client';

import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/ui/cn';

// Type will be provided by parent component
type ApiKeyItem = {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  remaining: number | null;
  rateLimitMax: number | null;
};

type ApiKeyCardProps = {
  apiKey: ApiKeyItem;
  onDelete: (keyId: string) => void;
  isDeleting?: boolean;
  className?: string;
};

export function ApiKeyCard({
  apiKey,
  onDelete,
  isDeleting = false,
  className,
}: ApiKeyCardProps) {
  const t = useTranslations();

  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();
  const isDisabled = !apiKey.enabled;

  return (
    <Card className={cn('group hover:shadow-sm transition-shadow', className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
              isDisabled || isExpired
                ? 'bg-muted'
                : 'bg-primary/10',
            )}
            >
              <Icons.key className={cn(
                'size-4',
                isDisabled || isExpired
                  ? 'text-muted-foreground'
                  : 'text-primary',
              )}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium truncate">
                  {apiKey.name || t('apiKeys.list.unnamedKey')}
                </CardTitle>
                {(isExpired || isDisabled) && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {isExpired ? t('apiKeys.list.expired') : t('apiKeys.list.disabled')}
                  </Badge>
                )}
                {apiKey.enabled && !isExpired && (
                  <Badge variant="outline" className="text-xs shrink-0 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                    {t('apiKeys.list.active')}
                  </Badge>
                )}
              </div>
              <CardDescription className="font-mono text-xs truncate">
                {apiKey.prefix}
                {apiKey.start}
                ...
              </CardDescription>
            </div>
          </div>

          <CardAction>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(apiKey.id)}
              disabled={isDeleting}
              className="size-8 text-muted-foreground hover:text-destructive transition-colors"
              title={t('apiKeys.list.delete')}
            >
              {isDeleting
                ? (
                    <Icons.loader className="size-4 animate-spin" />
                  )
                : (
                    <Icons.trash className="size-4" />
                  )}
            </Button>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="space-y-0.5">
            <p className="text-muted-foreground">{t('apiKeys.list.createdAt')}</p>
            <p className="font-medium">{format(new Date(apiKey.createdAt), 'PP')}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground">{t('apiKeys.list.expiresAt')}</p>
            <p className="font-medium">
              {apiKey.expiresAt
                ? format(new Date(apiKey.expiresAt), 'PP')
                : t('apiKeys.list.neverExpires')}
            </p>
          </div>
          {apiKey.remaining !== null && (
            <div className="space-y-0.5">
              <p className="text-muted-foreground">{t('apiKeys.list.remainingRequests')}</p>
              <p className="font-medium">{apiKey.remaining.toLocaleString()}</p>
            </div>
          )}
          {apiKey.rateLimitMax !== null && (
            <div className="space-y-0.5">
              <p className="text-muted-foreground">{t('apiKeys.list.rateLimit')}</p>
              <p className="font-medium">
                {apiKey.rateLimitMax.toLocaleString()}
                /
                {t('apiKeys.list.day')}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
