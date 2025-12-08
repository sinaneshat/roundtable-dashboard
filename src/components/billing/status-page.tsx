'use client';

import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type StatusVariant = 'loading' | 'success' | 'error';

type StatusPageProps = {
  variant: StatusVariant;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

const statusConfig = {
  loading: {
    icon: Loader2,
    iconClass: 'text-blue-500 animate-spin',
    ringClass: 'bg-blue-500/10 ring-blue-500/20',
  },
  success: {
    icon: CheckCircle,
    iconClass: 'text-green-500',
    ringClass: 'bg-green-500/10 ring-green-500/20',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-destructive',
    ringClass: 'bg-destructive/10 ring-destructive/20',
  },
} as const;

export function StatusPage({ variant, title, description, children, actions }: StatusPageProps) {
  const config = statusConfig[variant];
  const Icon = config.icon;

  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <div className={`flex size-16 items-center justify-center rounded-full ring-4 ${config.ringClass}`}>
          <Icon className={`size-8 ${config.iconClass}`} strokeWidth={2} />
        </div>

        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {children}

        {actions && (
          <div className="flex flex-col gap-2 w-full">{actions}</div>
        )}
      </div>
    </div>
  );
}

type StatusPageActionsProps = {
  primaryLabel: string;
  primaryOnClick: () => void;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
};

export function StatusPageActions({
  primaryLabel,
  primaryOnClick,
  secondaryLabel,
  secondaryOnClick,
}: StatusPageActionsProps) {
  return (
    <>
      <Button onClick={primaryOnClick} className="w-full">
        {primaryLabel}
      </Button>
      {secondaryLabel && secondaryOnClick && (
        <Button
          onClick={secondaryOnClick}
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          {secondaryLabel}
        </Button>
      )}
    </>
  );
}
