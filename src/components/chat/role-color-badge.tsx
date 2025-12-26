'use client';

import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';

import type { AvatarSize } from '@/api/core/enums';
import { AvatarSizes } from '@/api/core/enums';
import { cn } from '@/lib/ui/cn';
import { getRoleColors } from '@/lib/utils';

type RoleColorBadgeProps = {
  roleName: string;
  icon?: LucideIcon;
  size?: AvatarSize;
  className?: string;
};

/**
 * RoleColorBadge - Displays a colored badge with icon or initial for a role
 * Uses CSS custom properties for dynamic colors to avoid inline style anti-patterns
 */
export const RoleColorBadge = memo(({
  roleName,
  icon: Icon,
  size = AvatarSizes.MD,
  className,
}: RoleColorBadgeProps) => {
  const colors = useMemo(() => getRoleColors(roleName), [roleName]);

  const cssVars = useMemo(() => ({
    '--role-bg': colors.bgColor,
    '--role-icon': colors.iconColor,
  } as CSSProperties), [colors]);

  const sizeClasses = size === AvatarSizes.SM ? 'size-6' : 'size-8';
  const iconSizeClasses = size === AvatarSizes.SM ? 'size-3' : 'size-4';
  const textSizeClasses = size === AvatarSizes.SM ? 'text-[9px]' : 'text-[11px]';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        'bg-[var(--role-bg)]',
        sizeClasses,
        className,
      )}
      style={cssVars}
    >
      {Icon
        ? (
            <Icon
              className={cn(iconSizeClasses, 'text-[var(--role-icon)]')}
            />
          )
        : (
            <span
              className={cn(
                'font-semibold text-[var(--role-icon)]',
                textSizeClasses,
              )}
            >
              {roleName.charAt(0).toUpperCase()}
            </span>
          )}
    </div>
  );
});

RoleColorBadge.displayName = 'RoleColorBadge';
