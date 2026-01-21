import type { AvatarSize } from '@roundtable/shared';
import { AvatarSizeMetadata, DEFAULT_AVATAR_SIZE, getShortRoleName } from '@roundtable/shared';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon, getRoleColors } from '@/lib/utils';
import type { Model } from '@/services/api';

type ModelAvatarWithRoleProps = {
  model: Model;
  role?: string | null;
  size?: AvatarSize;
  isIncompatible?: boolean;
};

export function ModelAvatarWithRole({
  model,
  role,
  size = DEFAULT_AVATAR_SIZE,
  isIncompatible = false,
}: ModelAvatarWithRoleProps) {
  const shortRole = role ? getShortRoleName(role) : null;
  const roleColors = useMemo(() => getRoleColors(shortRole ?? ''), [shortRole]);
  const sizeMetadata = AvatarSizeMetadata[size];

  const cssVars = useMemo(() => ({
    '--role-icon-color': roleColors.iconColor,
  } as CSSProperties), [roleColors]);

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5',
        isIncompatible && 'opacity-30',
      )}
      style={cssVars}
    >
      <Avatar className={cn(sizeMetadata.container, 'bg-card')}>
        <AvatarImage
          src={getProviderIcon(model.provider)}
          alt={`${model.name} provider icon`}
          className={cn('object-contain p-1', isIncompatible && 'grayscale')}
        />
        <AvatarFallback className={cn(sizeMetadata.text, 'bg-card font-semibold')}>
          {model.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {shortRole && (
        <span
          className={cn(sizeMetadata.text, 'font-medium leading-none text-[var(--role-icon-color)]')}
        >
          {shortRole}
        </span>
      )}
    </div>
  );
}
