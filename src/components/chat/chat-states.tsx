'use client';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
  Package,
  RefreshCw,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FadeIn, PageTransition } from '@/components/ui/motion';
import { cn } from '@/lib/ui/cn';

type LoadingStateProps = {
  title?: string;
  message?: string;
  variant?: 'spinner' | 'page' | 'inline' | 'card' | 'skeleton';
  className?: string;
  style?: 'default' | 'dashed' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
};
export function LoadingState({
  title,
  message,
  variant = 'page',
  className,
  style = 'default',
  size = 'md',
}: LoadingStateProps) {
  const t = useTranslations();
  const defaultTitle = title || t('states.loading.default');
  const defaultMessage = message || t('states.loading.please_wait');
  if (variant === 'spinner') {
    return <LoadingSpinner className={cn('h-6 w-6', className)} />;
  }
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <LoadingSpinner className="h-4 w-4" />
        <span>{defaultTitle}</span>
      </div>
    );
  }
  if (variant === 'skeleton') {
    const sizeConfig = {
      sm: { container: 'py-6', cards: 2, height: 'h-24' },
      md: { container: 'py-8', cards: 3, height: 'h-32' },
      lg: { container: 'py-12', cards: 4, height: 'h-40' },
    };
    const config = sizeConfig[size];
    return (
      <div className={cn('space-y-4', config.container, className)}>
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: config.cards }, (_, i) => (
            <div key={i} className={cn('animate-pulse rounded-lg bg-muted', config.height)} />
          ))}
        </div>
      </div>
    );
  }
  if (variant === 'card') {
    const styleConfig = {
      default: 'border bg-card',
      dashed: 'border-2 border-dashed border-border/50 bg-gradient-to-br from-muted/30 to-background',
      gradient: 'bg-gradient-to-br from-card to-card/50 shadow-lg border-dashed border-2',
    };
    const sizeConfig = {
      sm: { container: 'py-6', iconContainer: 'w-12 h-12', iconSize: 'h-6 w-6', title: 'text-base' },
      md: { container: 'py-8', iconContainer: 'w-16 h-16', iconSize: 'h-8 w-8', title: 'text-lg' },
      lg: { container: 'py-12', iconContainer: 'w-24 h-24', iconSize: 'h-12 w-12', title: 'text-2xl' },
    };
    const config = sizeConfig[size];
    return (
      <Card className={cn(styleConfig[style], className)}>
        <CardContent className={config.container}>
          <div className="text-center space-y-6">
            <div className={cn(
              config.iconContainer,
              'rounded-full flex items-center justify-center mx-auto',
              size === 'lg'
                ? 'rounded-2xl bg-primary/10 border-2 border-dashed border-primary/20'
                : 'bg-muted',
            )}
            >
              <LoadingSpinner className={cn(
                config.iconSize,
                size === 'lg' ? 'text-primary/60' : 'text-muted-foreground',
              )}
              />
            </div>
            <div className="space-y-3">
              <h3 className={cn(config.title, 'font-medium')}>
                {defaultTitle}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {defaultMessage}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <PageTransition>
      <FadeIn delay={0.05} className={className}>
        <div className="text-center py-12">
          <div className="flex items-center justify-center mb-4">
            <LoadingSpinner className="h-8 w-8 me-2" />
            <span className="text-xl font-medium">{defaultTitle}</span>
          </div>
          <p className="text-muted-foreground">{defaultMessage}</p>
        </div>
      </FadeIn>
    </PageTransition>
  );
}
type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: 'alert' | 'card' | 'network' | 'boundary';
  severity?: 'error' | 'warning' | 'info';
  networkType?: 'offline' | 'timeout' | 'connection';
  className?: string;
  icon?: ReactNode;
};
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  variant = 'card',
  severity = 'error',
  networkType = 'connection',
  className,
  icon,
}: ErrorStateProps) {
  const t = useTranslations();
  const defaultRetryLabel = retryLabel || t('actions.tryAgain');
  const networkConfig = {
    offline: {
      icon: WifiOff,
      title: t('states.error.offline'),
      description: t('states.error.offlineDescription'),
      badge: t('networkStatus.offline'),
      badgeVariant: 'destructive' as const,
    },
    timeout: {
      icon: Clock,
      title: t('states.error.timeout'),
      description: t('states.error.timeoutDescription'),
      badge: t('networkStatus.timeout'),
      badgeVariant: 'secondary' as const,
    },
    connection: {
      icon: Wifi,
      title: t('states.error.network'),
      description: t('states.error.networkDescription'),
      badge: t('networkStatus.connectionError'),
      badgeVariant: 'destructive' as const,
    },
  };
  const severityConfig = {
    error: {
      icon: XCircle,
      title: t('states.error.default'),
      description: t('states.error.description'),
      alertVariant: 'destructive' as const,
      iconColor: 'text-destructive',
    },
    warning: {
      icon: AlertTriangle,
      title: t('status.warning'),
      description: t('states.error.description'),
      alertVariant: 'default' as const,
      iconColor: 'text-chart-2',
    },
    info: {
      icon: Info,
      title: t('status.info'),
      description: t('states.error.description'),
      alertVariant: 'default' as const,
      iconColor: 'text-primary',
    },
  };
  if (variant === 'network') {
    const config = networkConfig[networkType];
    const Icon = config.icon;
    return (
      <Alert variant="destructive" className={cn('border-dashed', className)}>
        <Icon className="h-4 w-4" />
        <div className="flex items-center justify-between w-full">
          <div className="space-y-1">
            <AlertTitle className="flex items-center gap-2">
              {title || config.title}
              <Badge variant={config.badgeVariant} className="text-xs">
                {config.badge}
              </Badge>
            </AlertTitle>
            <AlertDescription>
              {description || config.description}
              {onRetry && (
                <Button
                  variant="link"
                  className="h-auto p-0 ms-1 text-inherit underline"
                  onClick={onRetry}
                >
                  {defaultRetryLabel}
                </Button>
              )}
            </AlertDescription>
          </div>
        </div>
      </Alert>
    );
  }
  if (variant === 'alert') {
    const config = severityConfig[severity];
    const IconComponent = (icon || config.icon) as React.ComponentType<{ className?: string }>;
    return (
      <Alert variant={config.alertVariant} className={className}>
        <IconComponent className={cn('h-4 w-4', config.iconColor)} />
        <AlertTitle>{title || config.title}</AlertTitle>
        <AlertDescription>
          {description || config.description}
          {onRetry && (
            <Button
              variant="link"
              className="h-auto p-0 ms-2 text-inherit underline"
              onClick={onRetry}
            >
              {defaultRetryLabel}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (variant === 'boundary') {
    return (
      <Card className={cn('border-destructive/50', className)}>
        <CardContent className="text-center py-12 space-y-6">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-destructive">
              {title || t('states.error.boundary')}
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {description || t('states.error.boundaryDescription')}
            </p>
          </div>
          {onRetry && (
            <Button onClick={onRetry} variant="outline">
              <RefreshCw className="h-4 w-4 me-2" />
              {retryLabel}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
  const Icon = icon || AlertCircle;
  return (
    <PageTransition>
      <FadeIn delay={0.05} className={className}>
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                {typeof Icon === 'function' ? <Icon className="h-8 w-8 text-destructive" /> : Icon}
              </div>
              <h3 className="text-lg font-semibold mb-2 text-destructive">
                {title || t('states.error.default')}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {description || t('states.error.description')}
              </p>
              {onRetry && (
                <Button variant="outline" onClick={onRetry}>
                  <RefreshCw className="h-4 w-4 me-2" />
                  {retryLabel}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </FadeIn>
    </PageTransition>
  );
}
type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  variant?: 'general' | 'custom';
  size?: 'sm' | 'md' | 'lg';
  style?: 'default' | 'dashed' | 'gradient';
  className?: string;
  icon?: ReactNode;
};
export function EmptyState({
  title,
  description,
  action,
  variant = 'general',
  size = 'md',
  style = 'default',
  className,
  icon,
}: EmptyStateProps) {
  const t = useTranslations();
  const emptyStateConfig = {
    general: {
      icon: Package,
      title: t('states.empty.default'),
      description: t('states.empty.description'),
    },
    custom: {
      icon: AlertCircle,
      title: t('states.empty.default'),
      description: t('states.empty.description'),
    },
  };
  const config = emptyStateConfig[variant];
  const Icon = icon || config.icon;
  const sizeConfig = {
    sm: {
      container: 'py-6',
      iconContainer: 'w-12 h-12',
      iconSize: 'h-6 w-6',
      title: 'text-base font-semibold',
      description: 'text-sm',
    },
    md: {
      container: 'py-8',
      iconContainer: 'w-16 h-16',
      iconSize: 'h-8 w-8',
      title: 'text-lg font-semibold',
      description: 'text-sm',
    },
    lg: {
      container: 'py-12',
      iconContainer: 'w-24 h-24',
      iconSize: 'h-12 w-12',
      title: 'text-2xl font-bold',
      description: 'text-base',
    },
  };
  const styleConfig = {
    default: 'border bg-card',
    dashed: 'border-2 border-dashed border-border/50 bg-gradient-to-br from-muted/30 to-background',
    gradient: 'border bg-gradient-to-br from-card to-card/50 shadow-lg',
  };
  const sizeSettings = sizeConfig[size];
  return (
    <Card className={cn(styleConfig[style], className)}>
      <CardContent className={sizeSettings.container}>
        <div className="text-center space-y-6">
          <div className={cn(
            sizeSettings.iconContainer,
            'bg-muted rounded-full flex items-center justify-center mx-auto',
            size === 'lg' && 'rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-dashed border-primary/20',
          )}
          >
            {React.isValidElement(Icon)
              ? Icon
              : Icon && typeof Icon === 'function'
                ? (
                    <Icon className={cn(
                      sizeSettings.iconSize,
                      size === 'lg' ? 'text-primary/60' : 'text-muted-foreground',
                    )}
                    />
                  )
                : null}
          </div>
          <div className="space-y-3">
            <h3 className={sizeSettings.title}>
              {title || config.title}
            </h3>
            <p className={cn(
              sizeSettings.description,
              'text-muted-foreground max-w-md mx-auto',
              size === 'lg' && 'max-w-lg leading-relaxed',
            )}
            >
              {description || config.description}
            </p>
          </div>
          {action && (
            <div className="pt-4">
              {action}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
type SuccessStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: 'alert' | 'card';
  className?: string;
};
export function SuccessState({
  title,
  description,
  action,
  variant = 'alert',
  className,
}: SuccessStateProps) {
  if (variant === 'card') {
    return (
      <Card className={cn('border-chart-3/20 bg-chart-3/10', className)}>
        <CardContent className="text-center py-8 space-y-4">
          <div className="w-16 h-16 bg-chart-3/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-chart-3" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-chart-3">{title}</h3>
            {description && (
              <p className="text-chart-3/80">{description}</p>
            )}
          </div>
          {action && <div className="pt-2">{action}</div>}
        </CardContent>
      </Card>
    );
  }
  return (
    <Alert className={cn('border-chart-3/20 bg-chart-3/10', className)}>
      <CheckCircle className="h-4 w-4 text-chart-3" />
      <AlertTitle className="text-chart-3">{title}</AlertTitle>
      {description && (
        <AlertDescription className="text-chart-3/80">
          {description}
        </AlertDescription>
      )}
      {action && <div className="mt-3">{action}</div>}
    </Alert>
  );
}
type ChatPageProps = {
  children: ReactNode;
  className?: string;
};
export function ChatPage({ children, className }: ChatPageProps) {
  return (
    <PageTransition>
      <div className={cn('space-y-6', className)}>
        {children}
      </div>
    </PageTransition>
  );
}
type ChatSectionProps = {
  children: ReactNode;
  delay?: number;
  spacing?: 'tight' | 'default' | 'loose';
  className?: string;
};
export function ChatSection({
  children,
  delay = 0.05,
  spacing = 'default',
  className,
}: ChatSectionProps) {
  const spacingConfig = {
    tight: 'space-y-4',
    default: 'space-y-6',
    loose: 'space-y-8',
  };
  return (
    <FadeIn delay={delay} className={cn(spacingConfig[spacing], className)}>
      {children}
    </FadeIn>
  );
}
