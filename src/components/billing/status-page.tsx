'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import type { StatusVariant } from '@/api/core/enums';
import { StatusVariants } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type StatusPageProps = {
  variant: StatusVariant;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
};

type StatusConfig = {
  icon: typeof Icons.loader | typeof Icons.checkCircle | typeof Icons.alertCircle;
  iconClass: string;
  ringClass: string;
};

const STATUS_CONFIG: Record<StatusVariant, StatusConfig> = {
  [StatusVariants.LOADING]: {
    icon: Icons.loader,
    iconClass: 'text-blue-500 animate-spin',
    ringClass: 'bg-blue-500/10 ring-blue-500/20',
  },
  [StatusVariants.SUCCESS]: {
    icon: Icons.checkCircle,
    iconClass: 'text-green-500',
    ringClass: 'bg-green-500/10 ring-green-500/20',
  },
  [StatusVariants.ERROR]: {
    icon: Icons.alertCircle,
    iconClass: 'text-destructive',
    ringClass: 'bg-destructive/10 ring-destructive/20',
  },
} as const;

export function StatusPage({ variant, title, description, children, actions }: StatusPageProps) {
  const config = STATUS_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center px-4 py-8">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <div className={cn('flex size-16 items-center justify-center rounded-full ring-4', config.ringClass)}>
          <Icon className={cn('size-8', config.iconClass)} strokeWidth={2} />
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
  primaryHref?: string;
  primaryOnClick?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  secondaryOnClick?: () => void;
};

export function StatusPageActions({
  primaryLabel,
  primaryHref,
  primaryOnClick,
  secondaryLabel,
  secondaryHref,
  secondaryOnClick,
}: StatusPageActionsProps) {
  return (
    <>
      {primaryHref
        ? (
            <Button asChild className="w-full">
              <Link href={primaryHref} prefetch={false}>
                {primaryLabel}
              </Link>
            </Button>
          )
        : (
            <Button onClick={primaryOnClick} className="w-full">
              {primaryLabel}
            </Button>
          )}
      {secondaryLabel && (secondaryHref || secondaryOnClick) && (
        secondaryHref
          ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                <Link href={secondaryHref} prefetch={false}>
                  {secondaryLabel}
                </Link>
              </Button>
            )
          : (
              <Button
                onClick={secondaryOnClick}
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                {secondaryLabel}
              </Button>
            )
      )}
    </>
  );
}
