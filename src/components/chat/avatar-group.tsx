import type { AvatarSize } from '@/api/core/enums';
import { AvatarSizeMetadata, DEFAULT_AVATAR_SIZE } from '@/api/core/enums';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils';

type AvatarGroupProps = {
  participants: ParticipantConfig[];
  allModels: Array<{ id: string; name: string; provider: string }>;
  maxVisible?: number;
  size?: AvatarSize;
  className?: string;
  /** Whether to show the total count badge (default: true) */
  showCount?: boolean;
  /** Whether to overlap avatars (default: true) */
  overlap?: boolean;
  /** Show skeleton loading state for avatars */
  isLoading?: boolean;
  /** Number of skeleton avatars to show when loading */
  skeletonCount?: number;
};

export function AvatarGroup({
  participants,
  allModels,
  maxVisible = 3,
  size = DEFAULT_AVATAR_SIZE,
  className,
  showCount = true,
  overlap = true,
  isLoading = false,
  skeletonCount = 3,
}: AvatarGroupProps) {
  const sizeMetadata = AvatarSizeMetadata[size];

  // Show skeleton avatars while loading
  if (isLoading) {
    return (
      <div className={cn('flex items-center', className)}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div
            key={`skeleton-${index}`}
            className="relative"
            style={{
              zIndex: overlap ? index + 1 : undefined,
              marginLeft: index === 0 ? '0px' : overlap ? `${sizeMetadata.overlapOffset}px` : `${sizeMetadata.gapSize}px`,
            }}
          >
            <Skeleton
              className={cn(
                sizeMetadata.container,
                'rounded-full',
                overlap && 'border-2 border-card',
              )}
            />
          </div>
        ))}
        {showCount && (
          <Skeleton
            className={cn(
              sizeMetadata.container,
              'rounded-full',
              sizeMetadata.gapSize === 8 ? 'ml-2' : 'ml-3',
            )}
          />
        )}
      </div>
    );
  }

  // Store guarantees participants are sorted by priority - just slice
  const visibleParticipants = participants.slice(0, maxVisible);

  const totalCount = participants.length;

  return (
    <div className={cn('flex items-center', className)}>
      {visibleParticipants.map((participant, index) => {
        const model = allModels.find(m => m.id === participant.modelId);
        if (!model)
          return null;

        return (
          <div
            key={participant.id}
            className="relative"
            style={{
              zIndex: overlap ? index + 1 : undefined,
              marginLeft: index === 0 ? '0px' : overlap ? `${sizeMetadata.overlapOffset}px` : `${sizeMetadata.gapSize}px`,
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
      {/* Total count badge */}
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
