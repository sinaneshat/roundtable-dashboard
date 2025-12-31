import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import type { AvatarSize } from '@/api/core/enums';
import { AvatarSizeMetadata, DEFAULT_AVATAR_SIZE, getShortRoleName } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';
import { getRoleColors } from '@/lib/utils/role-colors';

type ModelAvatarWithRoleProps = {
  model: EnhancedModelResponse;
  role: string;
  size?: AvatarSize;
};

export function ModelAvatarWithRole({
  model,
  role,
  size = DEFAULT_AVATAR_SIZE,
}: ModelAvatarWithRoleProps) {
  const shortRole = getShortRoleName(role);
  const roleColors = useMemo(() => getRoleColors(shortRole), [shortRole]);
  const sizeMetadata = AvatarSizeMetadata[size];

  const cssVars = useMemo(() => ({
    '--role-icon-color': roleColors.iconColor,
  } as CSSProperties), [roleColors]);

  return (
    <div className="flex flex-col items-center gap-1.5" style={cssVars}>
      <Avatar className={cn(sizeMetadata.container, 'bg-card')}>
        <AvatarImage
          src={getProviderIcon(model.provider)}
          alt={model.name}
          className="object-contain p-1"
        />
        <AvatarFallback className={cn(sizeMetadata.text, 'bg-card font-semibold')}>
          {model.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(sizeMetadata.text, 'font-medium leading-none text-[var(--role-icon-color)]')}
      >
        {shortRole}
      </span>
    </div>
  );
}
