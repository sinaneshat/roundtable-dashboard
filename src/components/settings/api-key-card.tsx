/**
 * API Key Card Component
 *
 * Reusable card component for displaying API key details
 * Following patterns from chat-cards.tsx and existing card design system
 * Compact, consistent design with built-in delete action
 */

'use client';

import { format } from 'date-fns';
import { Key, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ApiKeyResponse } from '@/api/routes/api-keys/schema';
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

// ============================================================================
// Types
// ============================================================================

type ApiKeyCardProps = {
  apiKey: ApiKeyResponse;
  onDelete: (keyId: string) => void;
  isDeleting?: boolean;
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Compact API Key Card
 * Displays key details with status badge and delete action
 * Follows chat-cards.tsx patterns for consistency
 */
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
          {/* Left: Icon + Title + Description */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
              isDisabled || isExpired
                ? 'bg-muted'
                : 'bg-primary/10',
            )}
            >
              <Key className={cn(
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

          {/* Right: Delete Action */}
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
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <Trash2 className="size-4" />
                  )}
            </Button>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent>
        {/* Compact Metadata Grid */}
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
