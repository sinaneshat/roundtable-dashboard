import type { AvatarSize } from '@roundtable/shared';
import { AvatarSizeMetadata, AvatarSizes } from '@roundtable/shared';
import { memo } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ModelReference, ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils';

type AvatarGroupProps = {
  participants: ParticipantConfig[];
  allModels: ModelReference[];
  maxVisible?: number;
  size?: AvatarSize;
  className?: string;
  showCount?: boolean;
  overlap?: boolean;
  showOverflow?: boolean;
};

function AvatarGroupComponent({
  participants,
  allModels,
  maxVisible = 3,
  size = AvatarSizes.SM,
  className,
  showCount = true,
  overlap = true,
  showOverflow = false,
}: AvatarGroupProps) {
  const sizeMetadata = AvatarSizeMetadata[size];
  const visibleParticipants = participants.slice(0, maxVisible);
  const totalCount = participants.length;
  const hasOverflow = totalCount > maxVisible;

  return (
    <div className={cn('flex items-center', className)}>
      {visibleParticipants.map((participant, index) => {
        const model = allModels.find(m => m.id === participant.modelId);
        if (!model)
          return null;

        const marginLeft = index === 0 ? '0px' : overlap ? `${sizeMetadata.overlapOffset}px` : `${sizeMetadata.gapSize}px`;

        return (
          <div
            key={participant.id}
            className="relative"
            style={{
              zIndex: overlap ? index + 1 : undefined,
              marginLeft,
            }}
          >
            <Avatar
              className={cn(
                sizeMetadata.container,
                'relative bg-card',
                overlap && 'border-2 border-card',
              )}
            >
              <AvatarImage
                src={getProviderIcon(model.provider)}
                alt={model.name}
                className="object-contain p-0.5 relative z-10"
              />
              <AvatarFallback className={cn(sizeMetadata.text, 'bg-card font-semibold relative z-10')}>
                {model.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        );
      })}
      {showOverflow && hasOverflow && (
        <div
          className="relative"
          style={{
            zIndex: overlap ? visibleParticipants.length + 1 : undefined,
            marginLeft: overlap ? `${sizeMetadata.overlapOffset}px` : `${sizeMetadata.gapSize}px`,
          }}
        >
          <div
            className={cn(
              sizeMetadata.container,
              'flex items-center justify-center rounded-full bg-card text-muted-foreground',
              overlap && 'border-2 border-card',
            )}
          >
            <span className={cn(sizeMetadata.text, 'font-medium leading-none -translate-y-[2px]')}>…</span>
          </div>
        </div>
      )}
      {showCount && (
        <div
          className={cn(
            sizeMetadata.container,
            'flex items-center justify-center rounded-full bg-white text-black font-bold border-2 border-card',
            sizeMetadata.gapSize === 8 ? 'ml-2' : 'ml-3',
          )}
        >
          <span className={cn(sizeMetadata.text, 'tabular-nums')}>
            {totalCount}
          </span>
        </div>
      )}
    </div>
  );
}

export const AvatarGroup = memo(AvatarGroupComponent);
