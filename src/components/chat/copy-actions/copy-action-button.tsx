'use client';

import { memo } from 'react';

import type { CopyIconVariant } from '@/api/core/enums';
import { CopyIconVariants, DEFAULT_COPY_ICON_VARIANT } from '@/api/core/enums';
import { Action } from '@/components/ai-elements/actions';
import { Icons } from '@/components/icons';

type CopyActionButtonProps = {
  copied: boolean;
  onClick: () => void;
  tooltip: string;
  label: string;
  className?: string;
  variant?: CopyIconVariant;
};

function CopyActionButtonComponent({
  copied,
  onClick,
  tooltip,
  label,
  className,
  variant = DEFAULT_COPY_ICON_VARIANT,
}: CopyActionButtonProps) {
  const CopyIcon = variant === CopyIconVariants.STACK ? Icons.squareStack : Icons.copy;

  return (
    <Action
      tooltip={tooltip}
      label={label}
      onClick={onClick}
      className={className}
    >
      {copied
        ? <Icons.check className="size-5" />
        : <CopyIcon className="size-5" />}
    </Action>
  );
}

export const CopyActionButton = memo(CopyActionButtonComponent);

CopyActionButton.displayName = 'CopyActionButton';
