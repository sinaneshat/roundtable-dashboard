import { getShortRoleName } from '@/api/core/enums';
import type { AvatarSize } from '@/api/core/enums/ui';
import { AvatarSizeMetadata, DEFAULT_AVATAR_SIZE } from '@/api/core/enums/ui';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  const roleColors = getRoleColors(shortRole);
  const sizeMetadata = AvatarSizeMetadata[size];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Avatar className={`${sizeMetadata.container} bg-card`}>
        <AvatarImage
          src={getProviderIcon(model.provider)}
          alt={model.name}
          className="object-contain p-1"
        />
        <AvatarFallback className={`${sizeMetadata.text} bg-card font-semibold`}>
          {model.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span
        className={`${sizeMetadata.text} font-medium leading-none`}
        style={{ color: roleColors.iconColor }}
      >
        {shortRole}
      </span>
    </div>
  );
}
